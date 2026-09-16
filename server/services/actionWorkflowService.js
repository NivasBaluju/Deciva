const { v4: uuidv4 } = require('uuid');
const db = require('../db');

/**
 * Valid workflow states
 */
const WORKFLOW_STATES = {
  OPEN: 'OPEN',
  IN_REVIEW: 'IN_REVIEW',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED'
};

/**
 * Valid human decisions
 */
const HUMAN_DECISIONS = {
  ACCEPT: 'ACCEPT',
  NEGOTIATE: 'NEGOTIATE',
  ESCALATE: 'ESCALATE',
  DISMISS: 'DISMISS'
};

/**
 * Allowed state transitions lookup map
 */
const ALLOWED_TRANSITIONS = {
  [WORKFLOW_STATES.OPEN]: [WORKFLOW_STATES.IN_REVIEW, WORKFLOW_STATES.DISMISSED],
  [WORKFLOW_STATES.IN_REVIEW]: [WORKFLOW_STATES.OPEN, WORKFLOW_STATES.RESOLVED, WORKFLOW_STATES.DISMISSED],
  [WORKFLOW_STATES.RESOLVED]: [WORKFLOW_STATES.IN_REVIEW],
  [WORKFLOW_STATES.DISMISSED]: [WORKFLOW_STATES.IN_REVIEW]
};

/**
 * Validates whether a state transition from currentStatus to nextStatus is allowed
 */
function isValidTransition(currentStatus, nextStatus) {
  if (!currentStatus || !nextStatus) return false;
  if (currentStatus === nextStatus) return false;
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  return Array.isArray(allowed) && allowed.includes(nextStatus);
}

/**
 * Executes a controlled state transition for a contract action.
 * Uses SELECT ... FOR UPDATE within a transaction for concurrency safety.
 */
async function transitionActionStatus(actionId, targetStatus, payload = {}, user) {
  if (!actionId) {
    return { errorStatus: 400, errorMessage: 'Action ID is required' };
  }
  if (!targetStatus || !Object.values(WORKFLOW_STATES).includes(targetStatus)) {
    return {
      errorStatus: 400,
      errorMessage: `Invalid target status '${targetStatus}'. Allowed: ${Object.values(WORKFLOW_STATES).join(', ')}`
    };
  }

  const { resolutionNotes, reason, dismissalReason } = payload;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT a.*, d.user_id AS doc_owner_id
       FROM contract_actions a
       JOIN documents d ON d.id = a.document_id
       WHERE a.id = $1
       FOR UPDATE OF a`,
      [actionId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { errorStatus: 404, errorMessage: 'Action not found' };
    }

    const action = rows[0];

    if (action.doc_owner_id !== user.id && user.role !== 'admin') {
      await client.query('ROLLBACK');
      return { errorStatus: 403, errorMessage: 'Unauthorized access to action' };
    }

    const currentStatus = action.status;

    if (!isValidTransition(currentStatus, targetStatus)) {
      await client.query('ROLLBACK');
      return {
        errorStatus: 400,
        errorMessage: `Invalid state transition from '${currentStatus}' to '${targetStatus}'.`
      };
    }

    let resolvedAtUpdate = action.resolved_at;
    let resolutionNotesUpdate = action.resolution_notes;
    let decisionReasonUpdate = action.decision_reason;
    let eventType = 'ACTION_MOVED_TO_REVIEW';
    let activityMetadata = {
      previousStatus: currentStatus,
      newStatus: targetStatus
    };

    if (targetStatus === WORKFLOW_STATES.RESOLVED) {
      if (!resolutionNotes || typeof resolutionNotes !== 'string' || resolutionNotes.trim().length === 0) {
        await client.query('ROLLBACK');
        return {
          errorStatus: 400,
          errorMessage: 'Resolution notes are required when resolving an action.'
        };
      }
      resolvedAtUpdate = new Date();
      resolutionNotesUpdate = resolutionNotes.trim();
      eventType = 'ACTION_RESOLVED';
      activityMetadata.resolutionNotes = resolutionNotesUpdate;
    } else if (targetStatus === WORKFLOW_STATES.DISMISSED) {
      const actualReason = reason || dismissalReason;
      if (!actualReason || typeof actualReason !== 'string' || actualReason.trim().length === 0) {
        await client.query('ROLLBACK');
        return {
          errorStatus: 400,
          errorMessage: 'A reason is required when dismissing an action.'
        };
      }
      decisionReasonUpdate = actualReason.trim();
      eventType = 'ACTION_DISMISSED';
      activityMetadata.reason = decisionReasonUpdate;
    } else if (targetStatus === WORKFLOW_STATES.IN_REVIEW) {
      if (currentStatus === WORKFLOW_STATES.RESOLVED) {
        eventType = 'ACTION_REOPENED';
        activityMetadata.reason = reason ? reason.trim() : 'Reopened for further review';
      } else if (currentStatus === WORKFLOW_STATES.DISMISSED) {
        eventType = 'ACTION_MOVED_TO_REVIEW';
        activityMetadata.reason = reason ? reason.trim() : 'Reopened from dismissed state';
      } else {
        eventType = 'ACTION_MOVED_TO_REVIEW';
      }
    } else if (targetStatus === WORKFLOW_STATES.OPEN) {
      eventType = 'ACTION_REOPENED';
      activityMetadata.reason = reason ? reason.trim() : 'Reopened to open status';
    }

    const shouldClearEscalation = targetStatus === WORKFLOW_STATES.RESOLVED || targetStatus === WORKFLOW_STATES.DISMISSED;
    const { rows: updatedRows } = await client.query(
      `UPDATE contract_actions
       SET status = $1,
           resolution_notes = $2,
           resolved_at = $3,
           decision_reason = $4,
           is_escalated = CASE WHEN $5::boolean THEN FALSE ELSE is_escalated END,
           escalation_rule = CASE WHEN $5::boolean THEN NULL ELSE escalation_rule END,
           escalation_reason = CASE WHEN $5::boolean THEN NULL ELSE escalation_reason END,
           escalated_at = CASE WHEN $5::boolean THEN NULL ELSE escalated_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING 
         id, document_id, intelligence_snapshot_id, source_action_id,
         title, category, priority_score, status, decision,
         owner_id, due_date, decision_reason, resolution_notes,
         is_escalated, escalation_rule, escalation_reason, escalated_at,
         created_at, updated_at, resolved_at`,
      [
        targetStatus,
        resolutionNotesUpdate,
        resolvedAtUpdate,
        decisionReasonUpdate,
        shouldClearEscalation,
        action.id
      ]
    );
    const updatedAction = updatedRows[0];

    const decisionId = uuidv4();
    await client.query(
      `INSERT INTO contract_action_decisions (
         id, action_id, previous_status, new_status, decision, reason, decided_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        decisionId,
        action.id,
        currentStatus,
        targetStatus,
        targetStatus === WORKFLOW_STATES.DISMISSED ? 'DISMISS' : (action.decision || null),
        activityMetadata.reason || activityMetadata.resolutionNotes || null,
        user.id
      ]
    );

    const activityId = uuidv4();
    await client.query(
      `INSERT INTO contract_action_activity (
         id, action_id, event_type, actor_id, metadata
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        activityId,
        action.id,
        eventType,
        user.id,
        JSON.stringify(activityMetadata)
      ]
    );

    try {
      const notificationService = require('./notificationService');
      if (targetStatus === WORKFLOW_STATES.RESOLVED) {
        await notificationService.notifyActionResolved(updatedAction, user.id, client);
      } else if (
        (currentStatus === WORKFLOW_STATES.RESOLVED || currentStatus === WORKFLOW_STATES.DISMISSED) &&
        (targetStatus === WORKFLOW_STATES.IN_REVIEW || targetStatus === WORKFLOW_STATES.OPEN)
      ) {
        await notificationService.notifyActionReopened(updatedAction, user.id, client);
      }
    } catch (notifErr) {
      console.error('Failed to dispatch workflow status notification:', notifErr);
    }

    await client.query('COMMIT');
    return { success: true, action: updatedAction };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('transitionActionStatus transaction error:', err);
    return { errorStatus: 500, errorMessage: 'Failed to update action status' };
  } finally {
    client.release();
  }
}

/**
 * Records a human decision on a contract action.
 * Append-only ledger updates with deterministic state synchronization.
 */
async function recordActionDecision(actionId, payload = {}, user) {
  if (!actionId) {
    return { errorStatus: 400, errorMessage: 'Action ID is required' };
  }
  const { decision, reason } = payload;
  if (!decision || !Object.values(HUMAN_DECISIONS).includes(decision)) {
    return {
      errorStatus: 400,
      errorMessage: `Invalid decision '${decision}'. Allowed values: ${Object.values(HUMAN_DECISIONS).join(', ')}`
    };
  }
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return { errorStatus: 400, errorMessage: 'A reason is required when making a decision.' };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT a.*, d.user_id AS doc_owner_id
       FROM contract_actions a
       JOIN documents d ON d.id = a.document_id
       WHERE a.id = $1
       FOR UPDATE OF a`,
      [actionId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { errorStatus: 404, errorMessage: 'Action not found' };
    }

    const action = rows[0];

    if (action.doc_owner_id !== user.id && user.role !== 'admin') {
      await client.query('ROLLBACK');
      return { errorStatus: 403, errorMessage: 'Unauthorized access to action' };
    }

    const currentStatus = action.status;
    let targetStatus = currentStatus;

    // Decision -> State behavior:
    // NEGOTIATE / ESCALATE -> Action must be or become IN_REVIEW
    if (decision === HUMAN_DECISIONS.NEGOTIATE || decision === HUMAN_DECISIONS.ESCALATE) {
      if (currentStatus === WORKFLOW_STATES.OPEN || currentStatus === WORKFLOW_STATES.RESOLVED || currentStatus === WORKFLOW_STATES.DISMISSED) {
        targetStatus = WORKFLOW_STATES.IN_REVIEW;
      }
    } else if (decision === HUMAN_DECISIONS.DISMISS) {
      targetStatus = WORKFLOW_STATES.DISMISSED;
    }

    // Update contract_actions
    const { rows: updatedRows } = await client.query(
      `UPDATE contract_actions
       SET decision = $1,
           decision_reason = $2,
           status = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING 
         id, document_id, intelligence_snapshot_id, source_action_id,
         title, category, priority_score, status, decision,
         owner_id, due_date, decision_reason, resolution_notes,
         created_at, updated_at, resolved_at`,
      [
        decision,
        reason.trim(),
        targetStatus,
        action.id
      ]
    );
    const updatedAction = updatedRows[0];

    // Append to contract_action_decisions (append-only ledger)
    const decisionLedgerId = uuidv4();
    await client.query(
      `INSERT INTO contract_action_decisions (
         id, action_id, previous_status, new_status, decision, reason, decided_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        decisionLedgerId,
        action.id,
        currentStatus,
        targetStatus,
        decision,
        reason.trim(),
        user.id
      ]
    );

    // Append to contract_action_activity
    const activityId = uuidv4();
    await client.query(
      `INSERT INTO contract_action_activity (
         id, action_id, event_type, actor_id, metadata
       ) VALUES ($1, $2, 'DECISION_RECORDED', $3, $4)`,
      [
        activityId,
        action.id,
        user.id,
        JSON.stringify({
          decision: decision,
          reason: reason.trim(),
          previousStatus: currentStatus,
          newStatus: targetStatus
        })
      ]
    );

    await client.query('COMMIT');
    return { success: true, action: updatedAction };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('recordActionDecision transaction error:', err);
    return { errorStatus: 500, errorMessage: 'Failed to record action decision' };
  } finally {
    client.release();
  }
}

/**
 * Assigns or unassigns an owner for a contract action.
 */
async function assignActionOwner(actionId, ownerId, user) {
  if (!actionId) {
    return { errorStatus: 400, errorMessage: 'Action ID is required' };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT a.*, d.user_id AS doc_owner_id
       FROM contract_actions a
       JOIN documents d ON d.id = a.document_id
       WHERE a.id = $1
       FOR UPDATE OF a`,
      [actionId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { errorStatus: 404, errorMessage: 'Action not found' };
    }

    const action = rows[0];

    if (action.doc_owner_id !== user.id && user.role !== 'admin') {
      await client.query('ROLLBACK');
      return { errorStatus: 403, errorMessage: 'Unauthorized access to action' };
    }

    let targetOwnerId = null;
    let eventType = 'ACTION_UNASSIGNED';

    if (ownerId !== null && ownerId !== undefined && ownerId !== '') {
      // Verify target owner exists
      const { rows: userRows } = await client.query(
        'SELECT id, name, email FROM users WHERE id = $1',
        [ownerId]
      );
      if (userRows.length === 0) {
        await client.query('ROLLBACK');
        return { errorStatus: 400, errorMessage: 'Target owner user does not exist' };
      }
      targetOwnerId = userRows[0].id;
      eventType = 'ACTION_ASSIGNED';
    }

    const prevOwnerId = action.owner_id;

    const { rows: updatedRows } = await client.query(
      `UPDATE contract_actions
       SET owner_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING 
         id, document_id, intelligence_snapshot_id, source_action_id,
         title, category, priority_score, status, decision,
         owner_id, due_date, decision_reason, resolution_notes,
         created_at, updated_at, resolved_at`,
      [targetOwnerId, action.id]
    );
    const updatedAction = updatedRows[0];

    // Append to contract_action_activity
    const activityId = uuidv4();
    await client.query(
      `INSERT INTO contract_action_activity (
         id, action_id, event_type, actor_id, metadata
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        activityId,
        action.id,
        eventType,
        user.id,
        JSON.stringify({
          previousOwnerId: prevOwnerId,
          newOwnerId: targetOwnerId
        })
      ]
    );

    if (targetOwnerId && targetOwnerId !== user.id) {
      try {
        const notificationService = require('./notificationService');
        await notificationService.notifyActionAssigned(updatedAction, targetOwnerId, user.id, activityId, client);
      } catch (notifErr) {
        console.error('Failed to dispatch assignment notification:', notifErr);
      }
    }

    await client.query('COMMIT');
    return { success: true, action: updatedAction };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('assignActionOwner transaction error:', err);
    return { errorStatus: 500, errorMessage: 'Failed to update action owner' };
  } finally {
    client.release();
  }
}

/**
 * Updates or clears the due date for a contract action.
 */
async function updateActionDueDate(actionId, dueDate, user) {
  if (!actionId) {
    return { errorStatus: 400, errorMessage: 'Action ID is required' };
  }

  let parsedDueDate = null;
  let eventType = 'DUE_DATE_REMOVED';

  if (dueDate !== null && dueDate !== undefined && dueDate !== '') {
    const parsed = new Date(dueDate);
    if (isNaN(parsed.getTime())) {
      return { errorStatus: 400, errorMessage: 'Invalid ISO timestamp format for due date' };
    }
    parsedDueDate = parsed.toISOString();
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT a.*, d.user_id AS doc_owner_id
       FROM contract_actions a
       JOIN documents d ON d.id = a.document_id
       WHERE a.id = $1
       FOR UPDATE OF a`,
      [actionId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { errorStatus: 404, errorMessage: 'Action not found' };
    }

    const action = rows[0];

    if (action.doc_owner_id !== user.id && user.role !== 'admin') {
      await client.query('ROLLBACK');
      return { errorStatus: 403, errorMessage: 'Unauthorized access to action' };
    }

    const prevDueDate = action.due_date ? new Date(action.due_date).toISOString() : null;

    if (parsedDueDate) {
      eventType = prevDueDate ? 'DUE_DATE_UPDATED' : 'DUE_DATE_SET';
    } else {
      eventType = 'DUE_DATE_REMOVED';
    }

    const { rows: updatedRows } = await client.query(
      `UPDATE contract_actions
       SET due_date = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING 
         id, document_id, intelligence_snapshot_id, source_action_id,
         title, category, priority_score, status, decision,
         owner_id, due_date, decision_reason, resolution_notes,
         created_at, updated_at, resolved_at`,
      [parsedDueDate, action.id]
    );
    const updatedAction = updatedRows[0];

    // Append to contract_action_activity
    const activityId = uuidv4();
    await client.query(
      `INSERT INTO contract_action_activity (
         id, action_id, event_type, actor_id, metadata
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        activityId,
        action.id,
        eventType,
        user.id,
        JSON.stringify({
          previousDueDate: prevDueDate,
          newDueDate: parsedDueDate
        })
      ]
    );

    await client.query('COMMIT');
    return { success: true, action: updatedAction };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('updateActionDueDate transaction error:', err);
    return { errorStatus: 500, errorMessage: 'Failed to update action due date' };
  } finally {
    client.release();
  }
}

module.exports = {
  WORKFLOW_STATES,
  HUMAN_DECISIONS,
  ALLOWED_TRANSITIONS,
  isValidTransition,
  transitionActionStatus,
  recordActionDecision,
  assignActionOwner,
  updateActionDueDate
};
