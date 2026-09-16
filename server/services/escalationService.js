const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const notificationService = require('./notificationService');

/**
 * Deterministic Escalation Rule Identifiers
 */
const ESCALATION_RULES = {
  OVERDUE_3D: 'OVERDUE_3D',
  IGNORED_CRITICAL_5D: 'IGNORED_CRITICAL_5D',
  UNASSIGNED_HIGH_RISK_3D: 'UNASSIGNED_HIGH_RISK_3D'
};

/**
 * Evaluates escalation rules for all active actions in a document.
 * Follows strict transition deduplication: only emits audit/notification when transitioning to escalated.
 */
async function evaluateDocumentEscalations(documentId, user) {
  if (!documentId) {
    return { errorStatus: 400, errorMessage: 'Document ID is required' };
  }

  const { rows: docRows } = await db.query(
    'SELECT id, user_id FROM documents WHERE id = $1',
    [documentId]
  );

  if (docRows.length === 0) {
    return { errorStatus: 404, errorMessage: 'Document not found' };
  }

  const doc = docRows[0];
  if (doc.user_id !== user.id && user.role !== 'admin') {
    return { errorStatus: 403, errorMessage: 'Unauthorized access to document' };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: actions } = await client.query(
      `SELECT a.id, a.document_id, a.source_action_id, a.title, a.category,
              a.priority_score, a.status, a.owner_id, a.due_date,
              a.is_escalated, a.escalation_rule, a.escalation_reason, a.escalated_at,
              a.created_at, a.updated_at
       FROM contract_actions a
       WHERE a.document_id = $1
         AND a.status NOT IN ('RESOLVED', 'DISMISSED')
       FOR UPDATE OF a`,
      [documentId]
    );

    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    let newlyEscalatedCount = 0;
    let totalEscalatedCount = 0;

    for (const action of actions) {
      let triggeredRule = null;
      let triggeredReason = null;

      const dueDate = action.due_date ? new Date(action.due_date) : null;
      const createdAt = new Date(action.created_at);

      // Rule 1: Overdue by > 3 days
      if (dueDate && dueDate < threeDaysAgo) {
        triggeredRule = ESCALATION_RULES.OVERDUE_3D;
        const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        triggeredReason = `Action is overdue by ${daysOverdue} days (exceeds 3-day threshold).`;
      }
      // Rule 2: Critical score >= 80 untouched in OPEN status for > 5 days
      else if (Number(action.priority_score) >= 80 && action.status === 'OPEN' && createdAt < fiveDaysAgo) {
        triggeredRule = ESCALATION_RULES.IGNORED_CRITICAL_5D;
        triggeredReason = `Critical action (Priority: ${action.priority_score}) has remained in OPEN status for over 5 days without review.`;
      }
      // Rule 3: High-risk score >= 70 unassigned for > 3 days
      else if (Number(action.priority_score) >= 70 && !action.owner_id && createdAt < threeDaysAgo) {
        triggeredRule = ESCALATION_RULES.UNASSIGNED_HIGH_RISK_3D;
        triggeredReason = `High-priority action (Priority: ${action.priority_score}) is unassigned after 3 days.`;
      }

      if (triggeredRule) {
        totalEscalatedCount++;

        // Only transition / emit notification if newly escalated or rule changed
        const isNewTransition = !action.is_escalated || action.escalation_rule !== triggeredRule;
        if (isNewTransition) {
          newlyEscalatedCount++;

          // Update action row
          await client.query(
            `UPDATE contract_actions
             SET is_escalated = TRUE,
                 escalation_rule = $1,
                 escalation_reason = $2,
                 escalated_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [triggeredRule, triggeredReason, action.id]
          );

          // Append to contract_action_activity
          const activityId = uuidv4();
          const recipientId = action.owner_id || doc.user_id;

          await client.query(
            `INSERT INTO contract_action_activity (
               id, action_id, event_type, actor_id, metadata
             ) VALUES ($1, $2, 'ACTION_ESCALATED', $3, $4)`,
            [
              activityId,
              action.id,
              user.id,
              JSON.stringify({
                rule: triggeredRule,
                reason: triggeredReason,
                previousEscalationState: Boolean(action.is_escalated),
                escalatedTo: recipientId,
                triggerDate: now.toISOString()
              })
            ]
          );

          // Dispatch notification
          try {
            await notificationService.notifyActionEscalated(
              { ...action, priority_score: action.priority_score },
              triggeredRule,
              triggeredReason,
              recipientId,
              activityId,
              client
            );
          } catch (notifErr) {
            console.error('Failed to dispatch escalation notification:', notifErr);
          }
        }
      } else if (action.is_escalated) {
        // Condition no longer met, clear active escalation
        await client.query(
          `UPDATE contract_actions
           SET is_escalated = FALSE,
               escalation_rule = NULL,
               escalation_reason = NULL,
               escalated_at = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [action.id]
        );
      }
    }

    await client.query('COMMIT');

    return {
      success: true,
      documentId,
      totalEvaluated: actions.length,
      totalEscalated: totalEscalatedCount,
      newlyEscalatedCount
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('evaluateDocumentEscalations error:', err);
    return { errorStatus: 500, errorMessage: 'Failed to evaluate document escalations' };
  } finally {
    client.release();
  }
}

/**
 * Retrieves the Executive Attention Queue for a document (Strictly read-only).
 * Filters for escalated, critical (>=80), and overdue active actions.
 */
async function getExecutiveAttentionQueue(documentId, user) {
  if (!documentId) {
    return { errorStatus: 400, errorMessage: 'Document ID is required' };
  }

  const { rows: docRows } = await db.query(
    'SELECT id, user_id FROM documents WHERE id = $1',
    [documentId]
  );

  if (docRows.length === 0) {
    return { errorStatus: 404, errorMessage: 'Document not found' };
  }

  const doc = docRows[0];
  if (doc.user_id !== user.id && user.role !== 'admin') {
    return { errorStatus: 403, errorMessage: 'Unauthorized access to document' };
  }

  const query = `
    SELECT a.id, a.document_id, a.source_action_id, a.title, a.category,
           a.priority_score, a.status, a.decision, a.owner_id,
           a.due_date, a.is_escalated, a.escalation_rule, a.escalation_reason, a.escalated_at,
           a.created_at, a.updated_at,
           u.name AS owner_name, u.email AS owner_email, u.role AS owner_role
    FROM contract_actions a
    LEFT JOIN users u ON u.id = a.owner_id
    WHERE a.document_id = $1
      AND a.status NOT IN ('RESOLVED', 'DISMISSED')
      AND (
        a.is_escalated = TRUE
        OR a.priority_score >= 80
        OR (a.due_date IS NOT NULL AND a.due_date < CURRENT_TIMESTAMP)
      )
    ORDER BY 
      (CASE WHEN a.is_escalated THEN 1 ELSE 0 END) DESC,
      a.priority_score DESC,
      a.due_date ASC NULLS LAST;
  `;

  const { rows: attentionActions } = await db.query(query, [documentId]);

  const formatted = attentionActions.map((a) => ({
    id: a.id,
    documentId: a.document_id,
    sourceActionId: a.source_action_id,
    title: a.title,
    category: a.category,
    priorityScore: Number(a.priority_score),
    status: a.status,
    decision: a.decision,
    ownerId: a.owner_id,
    owner: a.owner_id ? {
      id: a.owner_id,
      name: a.owner_name || 'Assigned User',
      email: a.owner_email || '',
      role: a.owner_role || 'user'
    } : null,
    dueDate: a.due_date,
    isEscalated: Boolean(a.is_escalated),
    escalationRule: a.escalation_rule,
    escalationReason: a.escalation_reason,
    escalatedAt: a.escalated_at,
    createdAt: a.created_at,
    updatedAt: a.updated_at
  }));

  return {
    success: true,
    documentId,
    totalAttentionItems: formatted.length,
    attentionQueue: formatted
  };
}

module.exports = {
  ESCALATION_RULES,
  evaluateDocumentEscalations,
  getExecutiveAttentionQueue
};
