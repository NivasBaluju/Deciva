const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Reusable helper to authorize document access.
 * Ensures user is authenticated, document exists in PostgreSQL, and user is owner or admin.
 * Returns { document, errorStatus, errorMessage }
 */
async function authorizeDocument(documentId, user) {
  if (!documentId) {
    return { errorStatus: 400, errorMessage: 'Document ID is required' };
  }
  const { rows } = await db.query(
    'SELECT id, user_id, filename, original_name FROM documents WHERE id = $1',
    [documentId]
  );
  if (rows.length === 0) {
    return { errorStatus: 404, errorMessage: 'Document not found' };
  }
  const doc = rows[0];
  if (doc.user_id !== user.id && user.role !== 'admin') {
    return { errorStatus: 403, errorMessage: 'Unauthorized access to document' };
  }
  return { document: doc };
}

/**
 * Reusable helper to authorize action access through its parent document.
 * Joins contract_actions and documents to guarantee authorization boundary.
 * Returns { action, errorStatus, errorMessage }
 */
async function authorizeAction(actionId, user) {
  if (!actionId) {
    return { errorStatus: 400, errorMessage: 'Action ID is required' };
  }
  const { rows } = await db.query(
    `SELECT 
       a.id, a.document_id, a.intelligence_snapshot_id, a.source_action_id,
       a.title, a.category, a.priority_score, a.status, a.decision,
       a.owner_id, a.due_date, a.decision_reason, a.resolution_notes,
       a.created_at, a.updated_at, a.resolved_at,
       (SELECT COUNT(*)::int FROM contract_action_comments WHERE action_id = a.id AND deleted_at IS NULL) AS comment_count,
       d.user_id AS doc_owner_id
     FROM contract_actions a
     JOIN documents d ON d.id = a.document_id
     WHERE a.id = $1`,
    [actionId]
  );
  if (rows.length === 0) {
    return { errorStatus: 404, errorMessage: 'Action not found' };
  }
  const action = rows[0];
  if (action.doc_owner_id !== user.id && user.role !== 'admin') {
    return { errorStatus: 403, errorMessage: 'Unauthorized access to action' };
  }
  return { action };
}

/**
 * Handler for GET /api/documents/:documentId/actions
 */
async function getDocumentActions(req, res) {
  try {
    const documentId = req.params.documentId || req.params.id;
    const { document, errorStatus, errorMessage } = await authorizeDocument(documentId, req.user);
    if (errorStatus) {
      return res.status(errorStatus).json({ error: errorMessage });
    }

    const { rows: actions } = await db.query(
      `SELECT 
         id, document_id, intelligence_snapshot_id, source_action_id,
         title, category, priority_score, status, decision,
         owner_id, due_date, decision_reason, resolution_notes,
         created_at, updated_at, resolved_at,
         (SELECT COUNT(*)::int FROM contract_action_comments WHERE action_id = contract_actions.id AND deleted_at IS NULL) AS comment_count
       FROM contract_actions
       WHERE document_id = $1
       ORDER BY priority_score DESC, created_at DESC`,
      [document.id]
    );

    return res.json({ actions });
  } catch (err) {
    console.error('getDocumentActions error:', err);
    return res.status(500).json({ error: 'Failed to retrieve contract actions' });
  }
}

/**
 * Handler for POST /api/documents/:documentId/actions/sync
 * Safely synchronizes prioritized actions from the latest contract_intelligence snapshot
 * into live contract_actions in a transactional, idempotent manner.
 */
async function syncDocumentActions(req, res) {
  try {
    const documentId = req.params.documentId || req.params.id;
    const { document, errorStatus, errorMessage } = await authorizeDocument(documentId, req.user);
    if (errorStatus) {
      return res.status(errorStatus).json({ error: errorMessage });
    }

    const { rows: snapshotRows } = await db.query(
      `SELECT id, document_id, user_id, actions_json, created_at
       FROM contract_intelligence
       WHERE document_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [document.id]
    );

    if (snapshotRows.length === 0) {
      return res.status(404).json({
        error: 'No contract intelligence snapshot found for this document. Please generate intelligence first.'
      });
    }

    const snapshot = snapshotRows[0];
    let rawActions = snapshot.actions_json;
    if (typeof rawActions === 'string') {
      try {
        rawActions = JSON.parse(rawActions);
      } catch (e) {
        rawActions = [];
      }
    }
    if (!Array.isArray(rawActions)) {
      rawActions = [];
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      let createdCount = 0;
      let existingCount = 0;
      let invalidCount = 0;
      const synchronizedActions = [];

      for (const item of rawActions) {
        if (!item || typeof item !== 'object') {
          invalidCount++;
          continue;
        }

        const sourceActionId = item.actionId || item.action_id || item.source_action_id;
        const title = item.title;
        const category = item.category || 'MONITORING';
        const priorityScore = item.priorityScore ?? item.priority_score ?? item.score;

        // Validate required fields
        if (
          !sourceActionId ||
          typeof sourceActionId !== 'string' ||
          !title ||
          typeof title !== 'string' ||
          priorityScore === undefined ||
          priorityScore === null ||
          typeof priorityScore !== 'number' ||
          isNaN(priorityScore) ||
          priorityScore < 0 ||
          priorityScore > 100
        ) {
          invalidCount++;
          continue;
        }

        const actionId = uuidv4();

        // Idempotent insertion using PostgreSQL UNIQUE constraint:
        // (document_id, intelligence_snapshot_id, source_action_id)
        const insertRes = await client.query(
          `INSERT INTO contract_actions (
             id, document_id, intelligence_snapshot_id, source_action_id,
             title, category, priority_score, status
           ) VALUES (
             $1, $2, $3, $4,
             $5, $6, $7, 'OPEN'
           )
           ON CONFLICT (document_id, intelligence_snapshot_id, source_action_id)
           DO NOTHING
           RETURNING 
             id, document_id, intelligence_snapshot_id, source_action_id,
             title, category, priority_score, status, decision,
             owner_id, due_date, decision_reason, resolution_notes,
             created_at, updated_at, resolved_at`,
          [
            actionId,
            document.id,
            snapshot.id,
            sourceActionId,
            title,
            category,
            Math.round(priorityScore)
          ]
        );

        if (insertRes.rows.length > 0) {
          // CASE 1: New action created
          const newAction = insertRes.rows[0];
          createdCount++;
          synchronizedActions.push(newAction);

          // Record ACTION_CREATED in contract_action_activity
          const activityId = uuidv4();
          await client.query(
            `INSERT INTO contract_action_activity (
               id, action_id, event_type, actor_id, metadata
             ) VALUES ($1, $2, 'ACTION_CREATED', $3, $4)`,
            [
              activityId,
              newAction.id,
              req.user.id,
              JSON.stringify({
                source: 'PHASE_6_4_INTELLIGENCE_SYNC',
                intelligenceSnapshotId: snapshot.id,
                sourceActionId: sourceActionId,
                priorityScore: Math.round(priorityScore)
              })
            ]
          );

          if (Math.round(priorityScore) >= 70) {
            try {
              const notificationService = require('../services/notificationService');
              await notificationService.notifyActionHighPriority(newAction, req.user.id, client);
            } catch (notifErr) {
              console.error('Failed to dispatch high priority action notification:', notifErr);
            }
          }
        } else {
          // CASE 2: Matching action already exists for this snapshot — preserve existing human workflow
          existingCount++;
          const { rows: existingRows } = await client.query(
            `SELECT 
               id, document_id, intelligence_snapshot_id, source_action_id,
               title, category, priority_score, status, decision,
               owner_id, due_date, decision_reason, resolution_notes,
               created_at, updated_at, resolved_at
             FROM contract_actions
             WHERE document_id = $1 
               AND intelligence_snapshot_id = $2 
               AND source_action_id = $3`,
            [document.id, snapshot.id, sourceActionId]
          );
          if (existingRows.length > 0) {
            synchronizedActions.push(existingRows[0]);
          }
        }
      }

      await client.query('COMMIT');

      return res.json({
        success: true,
        documentId: document.id,
        intelligenceSnapshotId: snapshot.id,
        summary: {
          sourceActions: rawActions.length,
          created: createdCount,
          existing: existingCount,
          invalid: invalidCount
        },
        actions: synchronizedActions
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      console.error('syncDocumentActions transaction error:', txErr);
      return res.status(500).json({ error: 'Failed to synchronize contract actions' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('syncDocumentActions error:', err);
    return res.status(500).json({ error: 'Failed to synchronize contract actions' });
  }
}

/**
 * Handler for GET /api/actions/:actionId
 */
async function getActionById(req, res) {
  try {
    const { actionId } = req.params;
    const { action, errorStatus, errorMessage } = await authorizeAction(actionId, req.user);
    if (errorStatus) {
      return res.status(errorStatus).json({ error: errorMessage });
    }

    const { doc_owner_id, ...cleanAction } = action;

    // Enrich with provenance / evidence / assessment from parent intelligence snapshot if present
    if (cleanAction.intelligence_snapshot_id) {
      const { rows: snapRows } = await db.query(
        `SELECT actions_json FROM contract_intelligence WHERE id = $1`,
        [cleanAction.intelligence_snapshot_id]
      );
      if (snapRows.length > 0) {
        let snapActions = snapRows[0].actions_json;
        if (typeof snapActions === 'string') {
          try { snapActions = JSON.parse(snapActions); } catch (e) {}
        }
        if (Array.isArray(snapActions)) {
          const match = snapActions.find(
            (a) => (a.actionId || a.action_id || a.source_action_id) === cleanAction.source_action_id
          );
          if (match) {
            cleanAction.document_evidence = match.documentEvidence || match.document_evidence || null;
            cleanAction.intelligence_assessment = match.intelligenceAssessment || match.intelligence_assessment || null;
            cleanAction.priority_breakdown = match.priorityBreakdown || match.priority_breakdown || null;
            cleanAction.provenance = match.provenance || null;
          }
        }
      }
    }

    return res.json({ action: cleanAction });
  } catch (err) {
    console.error('getActionById error:', err);
    return res.status(500).json({ error: 'Failed to retrieve contract action' });
  }
}

/**
 * Handler for GET /api/actions/:actionId/history
 */
async function getActionHistory(req, res) {
  try {
    const { actionId } = req.params;
    const { action, errorStatus, errorMessage } = await authorizeAction(actionId, req.user);
    if (errorStatus) {
      return res.status(errorStatus).json({ error: errorMessage });
    }

    const { rows: decisions } = await db.query(
      `SELECT id, action_id, previous_status, new_status, decision, reason, decided_by, created_at
       FROM contract_action_decisions
       WHERE action_id = $1
       ORDER BY created_at ASC`,
      [action.id]
    );

    const { rows: activity } = await db.query(
      `SELECT id, action_id, event_type, actor_id, metadata, created_at
       FROM contract_action_activity
       WHERE action_id = $1
       ORDER BY created_at ASC`,
      [action.id]
    );

    const { doc_owner_id, ...cleanAction } = action;
    return res.json({
      action: cleanAction,
      decisions,
      activity
    });
  } catch (err) {
    console.error('getActionHistory error:', err);
    return res.status(500).json({ error: 'Failed to retrieve action history' });
  }
}

const actionWorkflowService = require('../services/actionWorkflowService');
const actionCommentService = require('../services/actionCommentService');

/**
 * Handler for PATCH /api/actions/:actionId/status
 */
async function updateActionStatus(req, res) {
  try {
    const { actionId } = req.params;
    const { status, resolutionNotes, reason, dismissalReason } = req.body || {};

    const result = await actionWorkflowService.transitionActionStatus(
      actionId,
      status,
      { resolutionNotes, reason, dismissalReason },
      req.user
    );

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.errorMessage });
    }

    return res.json({ success: true, action: result.action });
  } catch (err) {
    console.error('updateActionStatus error:', err);
    return res.status(500).json({ error: 'Internal server error while updating action status' });
  }
}

/**
 * Handler for POST /api/actions/:actionId/decision
 */
async function postActionDecision(req, res) {
  try {
    const { actionId } = req.params;
    const { decision, reason } = req.body || {};

    const result = await actionWorkflowService.recordActionDecision(
      actionId,
      { decision, reason },
      req.user
    );

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.errorMessage });
    }

    return res.json({ success: true, action: result.action });
  } catch (err) {
    console.error('postActionDecision error:', err);
    return res.status(500).json({ error: 'Internal server error while recording action decision' });
  }
}

/**
 * Handler for PATCH /api/actions/:actionId/owner
 */
async function updateActionOwner(req, res) {
  try {
    const { actionId } = req.params;
    const { ownerId } = req.body || {};

    const result = await actionWorkflowService.assignActionOwner(
      actionId,
      ownerId,
      req.user
    );

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.errorMessage });
    }

    return res.json({ success: true, action: result.action });
  } catch (err) {
    console.error('updateActionOwner error:', err);
    return res.status(500).json({ error: 'Internal server error while updating action owner' });
  }
}

/**
 * Handler for PATCH /api/actions/:actionId/due-date
 */
async function updateActionDueDate(req, res) {
  try {
    const { actionId } = req.params;
    const { dueDate } = req.body || {};

    const result = await actionWorkflowService.updateActionDueDate(
      actionId,
      dueDate,
      req.user
    );

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.errorMessage });
    }

    return res.json({ success: true, action: result.action });
  } catch (err) {
    console.error('updateActionDueDate error:', err);
    return res.status(500).json({ error: 'Internal server error while updating action due date' });
  }
}

/**
 * Handler for GET /api/actions/:actionId/comments
 */
async function getActionComments(req, res) {
  try {
    const { actionId } = req.params;
    const result = await actionCommentService.getCommentsByAction(actionId, req.user);

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.errorMessage });
    }

    return res.json({
      comments: result.comments,
      totalCount: result.totalCount,
      activeCount: result.activeCount
    });
  } catch (err) {
    console.error('getActionComments error:', err);
    return res.status(500).json({ error: 'Internal server error while retrieving action comments' });
  }
}

/**
 * Handler for POST /api/actions/:actionId/comments
 */
async function createActionComment(req, res) {
  try {
    const { actionId } = req.params;
    const { body, parentCommentId, contextReferences } = req.body || {};

    const result = await actionCommentService.createComment(
      actionId,
      { body, parentCommentId, contextReferences },
      req.user
    );

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.errorMessage });
    }

    return res.status(201).json({ success: true, comment: result.comment });
  } catch (err) {
    console.error('createActionComment error:', err);
    return res.status(500).json({ error: 'Internal server error while creating action comment' });
  }
}

/**
 * Handler for PATCH /api/actions/:actionId/comments/:commentId
 */
async function updateActionComment(req, res) {
  try {
    const { actionId, commentId } = req.params;
    const { body } = req.body || {};

    const result = await actionCommentService.editComment(
      actionId,
      commentId,
      { body },
      req.user
    );

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.errorMessage });
    }

    return res.json({ success: true, comment: result.comment });
  } catch (err) {
    console.error('updateActionComment error:', err);
    return res.status(500).json({ error: 'Internal server error while updating action comment' });
  }
}

/**
 * Handler for DELETE /api/actions/:actionId/comments/:commentId
 */
async function deleteActionComment(req, res) {
  try {
    const { actionId, commentId } = req.params;

    const result = await actionCommentService.softDeleteComment(
      actionId,
      commentId,
      req.user
    );

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.errorMessage });
    }

    return res.json({ success: true, message: result.message });
  } catch (err) {
    console.error('deleteActionComment error:', err);
    return res.status(500).json({ error: 'Internal server error while deleting action comment' });
  }
}

// Router endpoints mounted on /api/actions
router.get('/:actionId/history', requireAuth, getActionHistory);
router.get('/:actionId', requireAuth, getActionById);

router.patch('/:actionId/status', requireAuth, updateActionStatus);
router.post('/:actionId/decision', requireAuth, postActionDecision);
router.patch('/:actionId/owner', requireAuth, updateActionOwner);
router.patch('/:actionId/due-date', requireAuth, updateActionDueDate);

router.get('/:actionId/comments', requireAuth, getActionComments);
router.post('/:actionId/comments', requireAuth, createActionComment);
router.patch('/:actionId/comments/:commentId', requireAuth, updateActionComment);
router.delete('/:actionId/comments/:commentId', requireAuth, deleteActionComment);

module.exports = {
  router,
  authorizeDocument,
  authorizeAction,
  getDocumentActions,
  syncDocumentActions,
  getActionById,
  getActionHistory,
  updateActionStatus,
  postActionDecision,
  updateActionOwner,
  updateActionDueDate,
  getActionComments,
  createActionComment,
  updateActionComment,
  deleteActionComment
};
