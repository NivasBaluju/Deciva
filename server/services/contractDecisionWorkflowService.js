/**
 * Deciva — Contract Decision Workflow Service
 * ---------------------------------------------------------------------------
 * Coordinates enterprise human-in-the-loop decision governance, deterministic
 * approval policy enforcement, collaborative multi-reviewer workflows,
 * relational state transitions with SELECT ... FOR UPDATE concurrency locking,
 * Action Center synchronization, and cryptographic auditability.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { evaluateApprovalPolicy } = require('./approvalPolicyService');
const { recordAudit } = require('../utils/audit');
const { recordAiTelemetry } = require('../utils/aiTelemetry');
const logger = require('../utils/logger');

// Deterministic State Machine Transitions
const ALLOWED_TRANSITIONS = {
  DRAFT: ['SUBMITTED', 'UNDER_REVIEW', 'CANCELLED'],
  SUBMITTED: ['UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'],
  UNDER_REVIEW: ['CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'],
  CHANGES_REQUESTED: ['SUBMITTED', 'UNDER_REVIEW', 'CANCELLED'],
  APPROVED: ['COMPLETED'],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: []
};

/**
 * Validates whether a status transition is permitted by the state machine.
 */
function validateTransition(fromStatus, toStatus) {
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    const err = new Error(`Invalid status transition from ${fromStatus} to ${toStatus}`);
    err.status = 400;
    throw err;
  }
}

/**
 * Creates a new contract decision workflow.
 */
async function createDecisionWorkflow(tenantId, documentId, creatorId, workflowData = {}) {
  const docRes = await db.query(
    'SELECT id, original_name, filename, user_id FROM documents WHERE id = $1',
    [documentId]
  );
  if (docRes.rows.length === 0) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }
  const doc = docRes.rows[0];
  if (tenantId && doc.user_id !== tenantId && tenantId !== creatorId) {
    // Check if user is admin
    const userRes = await db.query('SELECT role FROM users WHERE id = $1', [creatorId]);
    if (userRes.rows.length === 0 || userRes.rows[0].role !== 'admin') {
      const err = new Error('Forbidden: Access denied to document');
      err.status = 403;
      throw err;
    }
  }

  const id = uuidv4();
  const title = String(workflowData.title || 'Contract Decision Review').trim();
  const description = String(workflowData.description || 'Human decision review workflow for contract risk intelligence.').trim();
  const decisionType = String(workflowData.decisionType || 'STANDARD_DECISION').toUpperCase();
  const priority = String(workflowData.priority || 'MEDIUM').toUpperCase();
  const riskScore = Number(workflowData.riskScore) || 0;
  const liabilityExposure = Number(workflowData.liabilityExposure) || 0;
  const dueAt = workflowData.dueAt ? new Date(workflowData.dueAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const evidenceJson = workflowData.evidenceJson || {};
  const recommendationJson = workflowData.recommendationJson || {};
  const actionId = workflowData.actionId || null;

  const policyOutcome = evaluateApprovalPolicy({
    riskScore,
    liabilityExposure,
    priority,
    decisionType
  }, workflowData.customPolicy);

  const requiresIndependent = policyOutcome.requiresIndependentApproval;
  const currentOwner = workflowData.ownerId || creatorId;
  const currentApprover = workflowData.approverId || null;

  // If approver assigned upfront, enforce separation of duties if independent approval required
  if (requiresIndependent && currentApprover && currentApprover === creatorId) {
    const err = new Error('Separation of duties violation: Decision creator cannot be assigned as independent approver.');
    err.status = 403;
    throw err;
  }

  await db.query(`
    INSERT INTO contract_decision_workflows (
      id, tenant_id, document_id, action_id, decision_type,
      title, description, status, created_by, current_owner,
      current_approver, priority, due_at, evidence_json,
      recommendation_json, requires_independent_approval,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, 'DRAFT', $8, $9,
      $10, $11, $12, $13,
      $14, $15,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `, [
    id,
    doc.user_id,
    documentId,
    actionId,
    decisionType,
    title,
    description,
    creatorId,
    currentOwner,
    currentApprover,
    priority,
    dueAt,
    JSON.stringify(evidenceJson),
    JSON.stringify(recommendationJson),
    requiresIndependent
  ]);

  if (currentApprover) {
    await db.query(`
      INSERT INTO contract_decision_reviewers (
        id, decision_id, user_id, role, status, assigned_by, assigned_at
      ) VALUES ($1, $2, $3, 'APPROVER', 'PENDING', $4, CURRENT_TIMESTAMP)
      ON CONFLICT (decision_id, user_id, role) DO NOTHING
    `, [uuidv4(), id, currentApprover, creatorId]);
  }

  if (Array.isArray(workflowData.reviewers)) {
    for (const rev of workflowData.reviewers) {
      const revUserId = typeof rev === 'string' ? rev : rev.userId;
      const revRole = (typeof rev === 'object' && rev.role) ? rev.role.toUpperCase() : 'REVIEWER';
      if (revUserId && revUserId !== currentApprover) {
        await db.query(`
          INSERT INTO contract_decision_reviewers (
            id, decision_id, user_id, role, status, assigned_by, assigned_at
          ) VALUES ($1, $2, $3, $4, 'PENDING', $5, CURRENT_TIMESTAMP)
          ON CONFLICT (decision_id, user_id, role) DO NOTHING
        `, [uuidv4(), id, revUserId, revRole, creatorId]);
      }
    }
  }

  const eventId = uuidv4();
  await db.query(`
    INSERT INTO contract_decision_events (
      id, decision_id, actor_id, event_type, previous_status, new_status, reason, metadata, created_at
    ) VALUES ($1, $2, $3, 'WORKFLOW_CREATED', NULL, 'DRAFT', $4, $5, CURRENT_TIMESTAMP)
  `, [
    eventId,
    id,
    creatorId,
    'Decision workflow initialized',
    JSON.stringify({
      policyOutcome,
      priority,
      decisionType,
      requiresIndependent
    })
  ]);

  const auditResult = await recordAudit(creatorId, 'DECISION_WORKFLOW_CREATED', {
    decisionId: id,
    documentId,
    title,
    decisionType,
    priority,
    requiresIndependentApproval: requiresIndependent
  });

  return {
    id,
    tenantId: doc.user_id,
    documentId,
    actionId,
    decisionType,
    title,
    description,
    status: 'DRAFT',
    createdBy: creatorId,
    currentOwner,
    currentApprover,
    priority,
    dueAt,
    requiresIndependentApproval: requiresIndependent,
    policyOutcome,
    evidenceJson,
    recommendationJson,
    blockchainAudit: auditResult
  };
}

/**
 * Submits a decision workflow for active review/approval with row-level concurrency lock.
 */
async function submitDecisionWorkflow(decisionId, actorId, options = {}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Concurrency lock
    const { rows } = await client.query(
      'SELECT * FROM contract_decision_workflows WHERE id = $1 FOR UPDATE',
      [decisionId]
    );
    if (rows.length === 0) {
      const err = new Error('Decision workflow not found');
      err.status = 404;
      throw err;
    }
    const workflow = rows[0];

    // Check authorization: creator, owner, or admin
    if (workflow.created_by !== actorId && workflow.current_owner !== actorId) {
      const userCheck = await client.query('SELECT role FROM users WHERE id = $1', [actorId]);
      if (userCheck.rows.length === 0 || userCheck.rows[0].role !== 'admin') {
        const err = new Error('Forbidden: Only workflow creator, owner, or admin can submit');
        err.status = 403;
        throw err;
      }
    }

    const previousStatus = workflow.status;
    const targetStatus = 'UNDER_REVIEW';
    validateTransition(previousStatus, targetStatus);

    await client.query(`
      UPDATE contract_decision_workflows
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [targetStatus, decisionId]);

    // Record event
    await client.query(`
      INSERT INTO contract_decision_events (
        id, decision_id, actor_id, event_type, previous_status, new_status, reason, metadata, created_at
      ) VALUES ($1, $2, $3, 'WORKFLOW_SUBMITTED', $4, $5, $6, $7, CURRENT_TIMESTAMP)
    `, [
      uuidv4(),
      decisionId,
      actorId,
      previousStatus,
      targetStatus,
      options.notes || 'Workflow submitted for formal stakeholder review and approval',
      JSON.stringify(options.metadata || {})
    ]);

    await client.query('COMMIT');

    const auditResult = await recordAudit(actorId, 'WORKFLOW_SUBMITTED', {
      decisionId,
      previousStatus,
      newStatus: targetStatus
    });

    return {
      decisionId,
      previousStatus,
      status: targetStatus,
      submittedBy: actorId,
      blockchainAudit: auditResult
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Assigns a reviewer to a decision workflow with concurrency lock.
 */
async function assignReviewer(decisionId, actorId, reviewerData = {}) {
  const { userId, role = 'REVIEWER', notes } = reviewerData;
  if (!userId) {
    const err = new Error('Target reviewer userId is required');
    err.status = 400;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT * FROM contract_decision_workflows WHERE id = $1 FOR UPDATE',
      [decisionId]
    );
    if (rows.length === 0) {
      const err = new Error('Decision workflow not found');
      err.status = 404;
      throw err;
    }
    const workflow = rows[0];

    if (['COMPLETED', 'CANCELLED'].includes(workflow.status)) {
      const err = new Error(`Cannot assign reviewers to a ${workflow.status} workflow`);
      err.status = 400;
      throw err;
    }

    // Role check: actor must be creator, owner, or admin
    if (workflow.created_by !== actorId && workflow.current_owner !== actorId) {
      const userCheck = await client.query('SELECT role FROM users WHERE id = $1', [actorId]);
      if (userCheck.rows.length === 0 || userCheck.rows[0].role !== 'admin') {
        const err = new Error('Forbidden: Only owner, creator, or admin can assign reviewers');
        err.status = 403;
        throw err;
      }
    }

    const assignedRole = String(role).toUpperCase();

    // If assigned as APPROVER, check separation of duties if independent approval required
    if (assignedRole === 'APPROVER' && workflow.requires_independent_approval && userId === workflow.created_by) {
      const err = new Error('Separation of duties violation: Decision creator cannot be assigned as independent approver.');
      err.status = 403;
      throw err;
    }

    const reviewerId = uuidv4();
    await client.query(`
      INSERT INTO contract_decision_reviewers (
        id, decision_id, user_id, role, status, assigned_by, assigned_at, notes
      ) VALUES ($1, $2, $3, $4, 'PENDING', $5, CURRENT_TIMESTAMP, $6)
      ON CONFLICT (decision_id, user_id, role)
      DO UPDATE SET status = 'PENDING', assigned_by = $5, assigned_at = CURRENT_TIMESTAMP, notes = $6
    `, [reviewerId, decisionId, userId, assignedRole, actorId, notes || null]);

    if (assignedRole === 'APPROVER' && !workflow.current_approver) {
      await client.query(`
        UPDATE contract_decision_workflows
        SET current_approver = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [userId, decisionId]);
    }

    // Record event
    await client.query(`
      INSERT INTO contract_decision_events (
        id, decision_id, actor_id, event_type, previous_status, new_status, reason, metadata, created_at
      ) VALUES ($1, $2, $3, 'REVIEWER_ASSIGNED', $4, $4, $5, $6, CURRENT_TIMESTAMP)
    `, [
      uuidv4(),
      decisionId,
      actorId,
      workflow.status,
      `Assigned user ${userId} with role ${assignedRole}`,
      JSON.stringify({ assignedUserId: userId, role: assignedRole, notes })
    ]);

    await client.query('COMMIT');

    const auditResult = await recordAudit(actorId, 'REVIEWER_ASSIGNED', {
      decisionId,
      assignedUserId: userId,
      role: assignedRole
    });

    return {
      success: true,
      decisionId,
      userId,
      role: assignedRole,
      blockchainAudit: auditResult
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Assigns an approver to a decision workflow with concurrency lock and separation of duties enforcement.
 */
async function assignApprover(decisionId, actorId, approverData = {}) {
  const { approverId, notes } = approverData;
  if (!approverId) {
    const err = new Error('Approver userId is required');
    err.status = 400;
    throw err;
  }

  return assignReviewer(decisionId, actorId, {
    userId: approverId,
    role: 'APPROVER',
    notes
  });
}

/**
 * Reviewer or approver requests changes with row-level concurrency lock.
 */
async function requestChanges(decisionId, actorId, requestData = {}) {
  const { reason, notes, clauseReference } = requestData;
  if (!reason && !notes) {
    const err = new Error('A reason or explanatory notes are required when requesting changes');
    err.status = 400;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT * FROM contract_decision_workflows WHERE id = $1 FOR UPDATE',
      [decisionId]
    );
    if (rows.length === 0) {
      const err = new Error('Decision workflow not found');
      err.status = 404;
      throw err;
    }
    const workflow = rows[0];

    // Authorization: Actor must be an assigned reviewer, current approver, owner, or admin
    const revCheck = await client.query(
      'SELECT * FROM contract_decision_reviewers WHERE decision_id = $1 AND user_id = $2',
      [decisionId, actorId]
    );
    const userCheck = await client.query('SELECT role FROM users WHERE id = $1', [actorId]);
    const isAdmin = userCheck.rows.length > 0 && userCheck.rows[0].role === 'admin';
    const isApprover = workflow.current_approver === actorId;

    if (revCheck.rows.length === 0 && !isApprover && !isAdmin) {
      const err = new Error('Forbidden: Only assigned reviewers, approvers, or admins can request changes');
      err.status = 403;
      throw err;
    }

    const previousStatus = workflow.status;
    const targetStatus = 'CHANGES_REQUESTED';
    validateTransition(previousStatus, targetStatus);

    await client.query(`
      UPDATE contract_decision_workflows
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [targetStatus, decisionId]);

    // Update reviewer status if assigned
    await client.query(`
      UPDATE contract_decision_reviewers
      SET status = 'CHANGES_REQUESTED', responded_at = CURRENT_TIMESTAMP, response = $1, notes = $2
      WHERE decision_id = $3 AND user_id = $4
    `, [reason || 'Changes requested', notes || null, decisionId, actorId]);

    // Create inline comment if clauseReference provided
    if (clauseReference || notes) {
      await client.query(`
        INSERT INTO contract_decision_comments (
          id, decision_id, user_id, body, clause_reference, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'OPEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        uuidv4(),
        decisionId,
        actorId,
        `[Changes Requested] ${reason ? reason + ': ' : ''}${notes || ''}`,
        clauseReference || null
      ]);
    }

    // Record event
    await client.query(`
      INSERT INTO contract_decision_events (
        id, decision_id, actor_id, event_type, previous_status, new_status, reason, metadata, created_at
      ) VALUES ($1, $2, $3, 'CHANGES_REQUESTED', $4, $5, $6, $7, CURRENT_TIMESTAMP)
    `, [
      uuidv4(),
      decisionId,
      actorId,
      previousStatus,
      targetStatus,
      reason || 'Changes requested by reviewer/approver',
      JSON.stringify({ clauseReference, notes })
    ]);

    await client.query('COMMIT');

    const auditResult = await recordAudit(actorId, 'WORKFLOW_CHANGES_REQUESTED', {
      decisionId,
      reason,
      clauseReference
    });

    return {
      success: true,
      decisionId,
      previousStatus,
      status: targetStatus,
      reason,
      blockchainAudit: auditResult
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Resubmits a decision workflow after addressing requested changes.
 */
async function resubmitDecision(decisionId, actorId, options = {}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT * FROM contract_decision_workflows WHERE id = $1 FOR UPDATE',
      [decisionId]
    );
    if (rows.length === 0) {
      const err = new Error('Decision workflow not found');
      err.status = 404;
      throw err;
    }
    const workflow = rows[0];

    // Authorization: creator, owner, or admin
    if (workflow.created_by !== actorId && workflow.current_owner !== actorId) {
      const userCheck = await client.query('SELECT role FROM users WHERE id = $1', [actorId]);
      if (userCheck.rows.length === 0 || userCheck.rows[0].role !== 'admin') {
        const err = new Error('Forbidden: Only workflow creator, owner, or admin can resubmit');
        err.status = 403;
        throw err;
      }
    }

    const previousStatus = workflow.status;
    const targetStatus = 'UNDER_REVIEW';
    validateTransition(previousStatus, targetStatus);

    await client.query(`
      UPDATE contract_decision_workflows
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [targetStatus, decisionId]);

    // Reset reviewer statuses to PENDING
    await client.query(`
      UPDATE contract_decision_reviewers
      SET status = 'PENDING', responded_at = NULL
      WHERE decision_id = $1 AND status = 'CHANGES_REQUESTED'
    `, [decisionId]);

    // Record event
    await client.query(`
      INSERT INTO contract_decision_events (
        id, decision_id, actor_id, event_type, previous_status, new_status, reason, metadata, created_at
      ) VALUES ($1, $2, $3, 'DECISION_RESUBMITTED', $4, $5, $6, $7, CURRENT_TIMESTAMP)
    `, [
      uuidv4(),
      decisionId,
      actorId,
      previousStatus,
      targetStatus,
      options.notes || 'Revisions completed and decision resubmitted for review',
      JSON.stringify(options.metadata || {})
    ]);

    await client.query('COMMIT');

    const auditResult = await recordAudit(actorId, 'WORKFLOW_RESUBMITTED', {
      decisionId,
      previousStatus,
      newStatus: targetStatus
    });

    return {
      success: true,
      decisionId,
      status: targetStatus,
      blockchainAudit: auditResult
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Human approval of a decision workflow with concurrency lock & separation-of-duties check.
 */
async function approveDecision(decisionId, actorId, approvalData = {}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT * FROM contract_decision_workflows WHERE id = $1 FOR UPDATE',
      [decisionId]
    );
    if (rows.length === 0) {
      const err = new Error('Decision workflow not found');
      err.status = 404;
      throw err;
    }
    const workflow = rows[0];

    const previousStatus = workflow.status;
    const targetStatus = 'APPROVED';
    validateTransition(previousStatus, targetStatus);

    // Strict Separation of Duties: creator !== approver if independent approval required
    if (workflow.requires_independent_approval && actorId === workflow.created_by) {
      const err = new Error('Separation of duties violation: Decision creator cannot approve decisions requiring independent approval.');
      err.status = 403;
      throw err;
    }

    // Authorization check: Must be designated approver, assigned reviewer with APPROVER role, or admin
    const revCheck = await client.query(
      'SELECT role FROM contract_decision_reviewers WHERE decision_id = $1 AND user_id = $2',
      [decisionId, actorId]
    );
    const userCheck = await client.query('SELECT role FROM users WHERE id = $1', [actorId]);
    const isAdmin = userCheck.rows.length > 0 && userCheck.rows[0].role === 'admin';
    const isDesignatedApprover = workflow.current_approver === actorId;
    const hasApproverRole = revCheck.rows.some(r => r.role === 'APPROVER');

    if (!isDesignatedApprover && !hasApproverRole && !isAdmin) {
      const err = new Error('Forbidden: Only authorized approvers or administrators can approve this decision');
      err.status = 403;
      throw err;
    }

    // Update workflow status
    await client.query(`
      UPDATE contract_decision_workflows
      SET status = $1, current_approver = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [targetStatus, actorId, decisionId]);

    // Update reviewer response
    await client.query(`
      UPDATE contract_decision_reviewers
      SET status = 'APPROVED', responded_at = CURRENT_TIMESTAMP, response = 'APPROVED', notes = $1
      WHERE decision_id = $2 AND user_id = $3
    `, [approvalData.notes || 'Approved', decisionId, actorId]);

    // Record event
    await client.query(`
      INSERT INTO contract_decision_events (
        id, decision_id, actor_id, event_type, previous_status, new_status, reason, metadata, created_at
      ) VALUES ($1, $2, $3, 'DECISION_APPROVED', $4, $5, $6, $7, CURRENT_TIMESTAMP)
    `, [
      uuidv4(),
      decisionId,
      actorId,
      previousStatus,
      targetStatus,
      approvalData.notes || 'Formally approved by authorized approver',
      JSON.stringify({ notes: approvalData.notes })
    ]);

    await client.query('COMMIT');

    const auditResult = await recordAudit(actorId, 'WORKFLOW_DECISION_APPROVED', {
      decisionId,
      previousStatus,
      newStatus: targetStatus,
      notes: approvalData.notes
    });

    return {
      success: true,
      decisionId,
      previousStatus,
      status: targetStatus,
      approvedBy: actorId,
      blockchainAudit: auditResult
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Rejection of a decision workflow with concurrency lock.
 */
async function rejectDecision(decisionId, actorId, rejectData = {}) {
  const { reason, notes } = rejectData;
  if (!reason && !notes) {
    const err = new Error('A rejection reason or notes are required');
    err.status = 400;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT * FROM contract_decision_workflows WHERE id = $1 FOR UPDATE',
      [decisionId]
    );
    if (rows.length === 0) {
      const err = new Error('Decision workflow not found');
      err.status = 404;
      throw err;
    }
    const workflow = rows[0];

    const previousStatus = workflow.status;
    const targetStatus = 'REJECTED';
    validateTransition(previousStatus, targetStatus);

    // Authorization check: approver, reviewer, or admin
    const revCheck = await client.query(
      'SELECT * FROM contract_decision_reviewers WHERE decision_id = $1 AND user_id = $2',
      [decisionId, actorId]
    );
    const userCheck = await client.query('SELECT role FROM users WHERE id = $1', [actorId]);
    const isAdmin = userCheck.rows.length > 0 && userCheck.rows[0].role === 'admin';
    const isDesignatedApprover = workflow.current_approver === actorId;

    if (revCheck.rows.length === 0 && !isDesignatedApprover && !isAdmin) {
      const err = new Error('Forbidden: Only assigned approvers, reviewers, or admins can reject this decision');
      err.status = 403;
      throw err;
    }

    await client.query(`
      UPDATE contract_decision_workflows
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [targetStatus, decisionId]);

    // Update reviewer response
    await client.query(`
      UPDATE contract_decision_reviewers
      SET status = 'REJECTED', responded_at = CURRENT_TIMESTAMP, response = $1, notes = $2
      WHERE decision_id = $3 AND user_id = $4
    `, [reason || 'Rejected', notes || null, decisionId, actorId]);

    // Record event
    await client.query(`
      INSERT INTO contract_decision_events (
        id, decision_id, actor_id, event_type, previous_status, new_status, reason, metadata, created_at
      ) VALUES ($1, $2, $3, 'DECISION_REJECTED', $4, $5, $6, $7, CURRENT_TIMESTAMP)
    `, [
      uuidv4(),
      decisionId,
      actorId,
      previousStatus,
      targetStatus,
      reason || 'Decision rejected',
      JSON.stringify({ notes })
    ]);

    await client.query('COMMIT');

    const auditResult = await recordAudit(actorId, 'WORKFLOW_DECISION_REJECTED', {
      decisionId,
      previousStatus,
      newStatus: targetStatus,
      reason,
      notes
    });

    return {
      success: true,
      decisionId,
      previousStatus,
      status: targetStatus,
      rejectedBy: actorId,
      reason,
      blockchainAudit: auditResult
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Completes an approved decision workflow and synchronizes with the Action Center.
 */
async function completeDecision(decisionId, actorId, options = {}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT * FROM contract_decision_workflows WHERE id = $1 FOR UPDATE',
      [decisionId]
    );
    if (rows.length === 0) {
      const err = new Error('Decision workflow not found');
      err.status = 404;
      throw err;
    }
    const workflow = rows[0];

    const previousStatus = workflow.status;
    const targetStatus = 'COMPLETED';
    validateTransition(previousStatus, targetStatus);

    // Authorization: owner, creator, or admin
    if (workflow.created_by !== actorId && workflow.current_owner !== actorId) {
      const userCheck = await client.query('SELECT role FROM users WHERE id = $1', [actorId]);
      if (userCheck.rows.length === 0 || userCheck.rows[0].role !== 'admin') {
        const err = new Error('Forbidden: Only workflow creator, owner, or admin can complete a decision');
        err.status = 403;
        throw err;
      }
    }

    await client.query(`
      UPDATE contract_decision_workflows
      SET status = $1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [targetStatus, decisionId]);

    // If linked to an Action Center action (contract_actions), mark that action as completed
    if (workflow.action_id) {
      await client.query(`
        UPDATE contract_actions
        SET status = 'COMPLETED', decision = 'APPROVED', resolution_notes = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [options.outcomeNotes || `Completed via Decision Workflow: ${workflow.title}`, workflow.action_id]);

      await client.query(`
        INSERT INTO contract_action_activity (
          id, action_id, event_type, actor_id, metadata, created_at
        ) VALUES (
          gen_random_uuid(), $1, 'ACTION_COMPLETED_VIA_WORKFLOW', $2, $3, CURRENT_TIMESTAMP
        )
      `, [
        workflow.action_id,
        actorId,
        JSON.stringify({ decisionId, outcomeNotes: options.outcomeNotes })
      ]);
    }

    // Record event
    await client.query(`
      INSERT INTO contract_decision_events (
        id, decision_id, actor_id, event_type, previous_status, new_status, reason, metadata, created_at
      ) VALUES ($1, $2, $3, 'DECISION_COMPLETED', $4, $5, $6, $7, CURRENT_TIMESTAMP)
    `, [
      uuidv4(),
      decisionId,
      actorId,
      previousStatus,
      targetStatus,
      options.outcomeNotes || 'Decision execution verified and workflow completed',
      JSON.stringify(options.metadata || {})
    ]);

    await client.query('COMMIT');

    const auditResult = await recordAudit(actorId, 'WORKFLOW_DECISION_COMPLETED', {
      decisionId,
      actionId: workflow.action_id,
      outcomeNotes: options.outcomeNotes
    });

    return {
      success: true,
      decisionId,
      status: targetStatus,
      completedAt: new Date().toISOString(),
      blockchainAudit: auditResult
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cancels a decision workflow.
 */
async function cancelDecision(decisionId, actorId, options = {}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT * FROM contract_decision_workflows WHERE id = $1 FOR UPDATE',
      [decisionId]
    );
    if (rows.length === 0) {
      const err = new Error('Decision workflow not found');
      err.status = 404;
      throw err;
    }
    const workflow = rows[0];

    const previousStatus = workflow.status;
    const targetStatus = 'CANCELLED';
    validateTransition(previousStatus, targetStatus);

    // Authorization: owner, creator, or admin
    if (workflow.created_by !== actorId && workflow.current_owner !== actorId) {
      const userCheck = await client.query('SELECT role FROM users WHERE id = $1', [actorId]);
      if (userCheck.rows.length === 0 || userCheck.rows[0].role !== 'admin') {
        const err = new Error('Forbidden: Only workflow creator, owner, or admin can cancel a decision');
        err.status = 403;
        throw err;
      }
    }

    await client.query(`
      UPDATE contract_decision_workflows
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [targetStatus, decisionId]);

    // Record event
    await client.query(`
      INSERT INTO contract_decision_events (
        id, decision_id, actor_id, event_type, previous_status, new_status, reason, metadata, created_at
      ) VALUES ($1, $2, $3, 'DECISION_CANCELLED', $4, $5, $6, $7, CURRENT_TIMESTAMP)
    `, [
      uuidv4(),
      decisionId,
      actorId,
      previousStatus,
      targetStatus,
      options.reason || 'Decision workflow cancelled',
      JSON.stringify(options.metadata || {})
    ]);

    await client.query('COMMIT');

    const auditResult = await recordAudit(actorId, 'WORKFLOW_DECISION_CANCELLED', {
      decisionId,
      reason: options.reason
    });

    return {
      success: true,
      decisionId,
      status: targetStatus,
      blockchainAudit: auditResult
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Adds a discussion or clause-specific comment to a decision workflow.
 */
async function addComment(decisionId, actorId, commentData = {}) {
  const { body, clauseReference, parentCommentId } = commentData;
  if (!body || !String(body).trim()) {
    const err = new Error('Comment body cannot be empty');
    err.status = 400;
    throw err;
  }

  // Verify workflow exists
  const wfRes = await db.query('SELECT id, status FROM contract_decision_workflows WHERE id = $1', [decisionId]);
  if (wfRes.rows.length === 0) {
    const err = new Error('Decision workflow not found');
    err.status = 404;
    throw err;
  }

  const commentId = uuidv4();
  await db.query(`
    INSERT INTO contract_decision_comments (
      id, decision_id, user_id, parent_comment_id, body, clause_reference, status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [
    commentId,
    decisionId,
    actorId,
    parentCommentId || null,
    String(body).trim(),
    clauseReference || null
  ]);

  // Record event
  await db.query(`
    INSERT INTO contract_decision_events (
      id, decision_id, actor_id, event_type, previous_status, new_status, reason, metadata, created_at
    ) VALUES ($1, $2, $3, 'COMMENT_ADDED', $4, $4, $5, $6, CURRENT_TIMESTAMP)
  `, [
    uuidv4(),
    decisionId,
    actorId,
    wfRes.rows[0].status,
    'Comment added to decision discussion',
    JSON.stringify({ commentId, clauseReference })
  ]);

  return {
    id: commentId,
    decisionId,
    userId: actorId,
    body: String(body).trim(),
    clauseReference: clauseReference || null,
    parentCommentId: parentCommentId || null,
    status: 'OPEN',
    createdAt: new Date().toISOString()
  };
}

/**
 * Resolves a comment thread.
 */
async function resolveComment(commentId, actorId, options = {}) {
  const res = await db.query(`
    UPDATE contract_decision_comments
    SET status = 'RESOLVED', resolved_by = $1, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING *
  `, [actorId, commentId]);

  if (res.rows.length === 0) {
    const err = new Error('Comment not found');
    err.status = 404;
    throw err;
  }

  const comment = res.rows[0];

  // Record event
  await db.query(`
    INSERT INTO contract_decision_events (
      id, decision_id, actor_id, event_type, previous_status, new_status, reason, metadata, created_at
    ) VALUES ($1, $2, $3, 'COMMENT_RESOLVED', NULL, 'OPEN', $4, $5, CURRENT_TIMESTAMP)
  `, [
    uuidv4(),
    comment.decision_id,
    actorId,
    options.notes || 'Comment marked as resolved',
    JSON.stringify({ commentId })
  ]);

  return {
    id: comment.id,
    decisionId: comment.decision_id,
    status: 'RESOLVED',
    resolvedBy: actorId,
    resolvedAt: comment.resolved_at
  };
}

/**
 * Fetches complete details of a decision workflow with reviewers, comments, and audit timeline.
 */
async function getDecisionWorkflow(decisionId, user) {
  const { rows: workflows } = await db.query(`
    SELECT
      w.*,
      d.original_name as document_name,
      u_cr.name as creator_name,
      u_cr.email as creator_email,
      u_ow.name as owner_name,
      u_ow.email as owner_email,
      u_ap.name as approver_name,
      u_ap.email as approver_email
    FROM contract_decision_workflows w
    JOIN documents d ON d.id = w.document_id
    LEFT JOIN users u_cr ON u_cr.id = w.created_by
    LEFT JOIN users u_ow ON u_ow.id = w.current_owner
    LEFT JOIN users u_ap ON u_ap.id = w.current_approver
    WHERE w.id = $1
  `, [decisionId]);

  if (workflows.length === 0) {
    const err = new Error('Decision workflow not found');
    err.status = 404;
    throw err;
  }
  const wf = workflows[0];

  // Tenant check
  if (user && user.role !== 'admin' && wf.tenant_id !== user.id && wf.created_by !== user.id && wf.current_owner !== user.id) {
    // Also check if user is in reviewers list
    const { rows: revCheck } = await db.query(
      'SELECT id FROM contract_decision_reviewers WHERE decision_id = $1 AND user_id = $2',
      [decisionId, user.id]
    );
    if (revCheck.length === 0) {
      const err = new Error('Forbidden: Access denied to decision workflow');
      err.status = 403;
      throw err;
    }
  }

  // Fetch Reviewers
  const { rows: reviewers } = await db.query(`
    SELECT
      r.*,
      u.name as user_name,
      u.email as user_email
    FROM contract_decision_reviewers r
    JOIN users u ON u.id = r.user_id
    WHERE r.decision_id = $1
    ORDER BY r.assigned_at ASC
  `, [decisionId]);

  // Fetch Comments
  const { rows: comments } = await db.query(`
    SELECT
      c.*,
      u.name as user_name,
      u.email as user_email,
      u_res.name as resolver_name
    FROM contract_decision_comments c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN users u_res ON u_res.id = c.resolved_by
    WHERE c.decision_id = $1
    ORDER BY c.created_at ASC
  `, [decisionId]);

  // Fetch Events / Timeline
  const { rows: events } = await db.query(`
    SELECT
      e.*,
      u.name as actor_name,
      u.email as actor_email
    FROM contract_decision_events e
    LEFT JOIN users u ON u.id = e.actor_id
    WHERE e.decision_id = $1
    ORDER BY e.created_at ASC
  `, [decisionId]);

  return {
    ...wf,
    reviewers,
    comments,
    timeline: events
  };
}

/**
 * Lists all decision workflows for a document.
 */
async function listDocumentDecisions(documentId, user, options = {}) {
  // Document access check
  const docRes = await db.query('SELECT id, user_id FROM documents WHERE id = $1', [documentId]);
  if (docRes.rows.length === 0) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }
  const doc = docRes.rows[0];
  if (user && user.role !== 'admin' && doc.user_id !== user.id) {
    const err = new Error('Forbidden: Access denied to document decisions');
    err.status = 403;
    throw err;
  }

  const { rows } = await db.query(`
    SELECT
      w.*,
      u_cr.name as creator_name,
      u_ow.name as owner_name,
      u_ap.name as approver_name,
      (SELECT COUNT(*) FROM contract_decision_comments WHERE decision_id = w.id)::int as comment_count,
      (SELECT COUNT(*) FROM contract_decision_reviewers WHERE decision_id = w.id)::int as reviewer_count
    FROM contract_decision_workflows w
    LEFT JOIN users u_cr ON u_cr.id = w.created_by
    LEFT JOIN users u_ow ON u_ow.id = w.current_owner
    LEFT JOIN users u_ap ON u_ap.id = w.current_approver
    WHERE w.document_id = $1
    ORDER BY w.created_at DESC
  `, [documentId]);

  return rows;
}

/**
 * Lists inbox items for a user: pending approvals, assigned reviews, and owned workflows.
 */
async function getWorkflowInbox(user, options = {}) {
  if (!user || !user.id) {
    const err = new Error('Unauthorized: User identity required for workflow inbox');
    err.status = 401;
    throw err;
  }

  const userId = user.id;
  const isAdmin = user.role === 'admin';

  const pendingApprovalsQuery = `
    SELECT
      w.*,
      d.original_name as document_name,
      u_cr.name as creator_name,
      u_ow.name as owner_name
    FROM contract_decision_workflows w
    JOIN documents d ON d.id = w.document_id
    LEFT JOIN users u_cr ON u_cr.id = w.created_by
    LEFT JOIN users u_ow ON u_ow.id = w.current_owner
    WHERE (w.current_approver = $1 ${isAdmin ? 'OR TRUE' : ''})
      AND w.status IN ('SUBMITTED', 'UNDER_REVIEW')
    ORDER BY w.priority = 'CRITICAL' DESC, w.due_at ASC NULLS LAST
  `;
  const { rows: pendingApprovals } = await db.query(pendingApprovalsQuery, [userId]);

  const assignedReviewsQuery = `
    SELECT
      w.*,
      d.original_name as document_name,
      r.role as my_review_role,
      r.status as my_review_status,
      u_cr.name as creator_name,
      u_ow.name as owner_name
    FROM contract_decision_reviewers r
    JOIN contract_decision_workflows w ON w.id = r.decision_id
    JOIN documents d ON d.id = w.document_id
    LEFT JOIN users u_cr ON u_cr.id = w.created_by
    LEFT JOIN users u_ow ON u_ow.id = w.current_owner
    WHERE (r.user_id = $1 ${isAdmin ? 'OR TRUE' : ''})
      AND r.status = 'PENDING'
      AND w.status IN ('SUBMITTED', 'UNDER_REVIEW')
    ORDER BY w.due_at ASC NULLS LAST
  `;
  const { rows: assignedReviews } = await db.query(assignedReviewsQuery, [userId]);

  const myDecisionsQuery = `
    SELECT
      w.*,
      d.original_name as document_name,
      u_ap.name as approver_name,
      (SELECT COUNT(*) FROM contract_decision_comments WHERE decision_id = w.id)::int as comment_count
    FROM contract_decision_workflows w
    JOIN documents d ON d.id = w.document_id
    LEFT JOIN users u_ap ON u_ap.id = w.current_approver
    WHERE (w.created_by = $1 OR w.current_owner = $1 ${isAdmin ? 'OR TRUE' : ''})
    ORDER BY w.updated_at DESC
  `;
  const { rows: myDecisions } = await db.query(myDecisionsQuery, [userId]);

  return {
    pendingApprovals,
    assignedReviews,
    myDecisions,
    summary: {
      pendingApprovalsCount: pendingApprovals.length,
      assignedReviewsCount: assignedReviews.length,
      myDecisionsCount: myDecisions.length
    }
  };
}

/**
 * Returns the timeline of chronological audit events for a workflow.
 */
async function getWorkflowTimeline(decisionId, user) {
  const wf = await getDecisionWorkflow(decisionId, user);
  return wf.timeline;
}

module.exports = {
  createDecisionWorkflow,
  submitDecisionWorkflow,
  assignReviewer,
  assignApprover,
  requestChanges,
  resubmitDecision,
  approveDecision,
  rejectDecision,
  completeDecision,
  cancelDecision,
  addComment,
  resolveComment,
  getDecisionWorkflow,
  listDocumentDecisions,
  getWorkflowInbox,
  getWorkflowTimeline,
  validateTransition,
  ALLOWED_TRANSITIONS
};
