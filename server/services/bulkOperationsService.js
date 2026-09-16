'use strict';

/**
 * Bulk Operations Service
 *
 * Implements the three-step controlled portfolio operation flow:
 *   1. previewBulkOperation  — validates, classifies, stores preview record + canonical hash
 *   2. executeBulkOperation  — idempotency check, single atomic transaction, per-action audit
 *   3. getBatchHistory       — paginated read of past batches for the authenticated user
 *
 * Design invariants:
 *   - Execution receives ONLY (user, previewId, idempotencyKey). No action IDs or payload
 *     from the client at execute time. The operation is loaded from the stored preview record.
 *   - isValidTransition() from actionWorkflowService is the single source of truth for transitions.
 *   - Single-action service functions (transitionActionStatus, assignActionOwner, etc.) are NOT
 *     called here because they open their own BEGIN/COMMIT. All mutations are inline within the
 *     single bulk transaction.
 *   - Zero mutations persist on any failure (full ROLLBACK).
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../db');
const { WORKFLOW_STATES, ALLOWED_TRANSITIONS, isValidTransition } = require('./actionWorkflowService');
const { evaluateBatchPolicy, POLICY_VERSION, GOVERNANCE_POLICY_FLAGS } = require('./operationPolicyEngine');

const OPERATION_TYPES = {
  BULK_ASSIGN:     'BULK_ASSIGN',
  BULK_DEADLINE:   'BULK_DEADLINE',
  BULK_TRANSITION: 'BULK_TRANSITION',
};

const BATCH_MODES = {
  STRICT: 'STRICT',
  SUBSET: 'SUBSET',
};

const BATCH_STATUS = {
  PREVIEWED:         'PREVIEWED',
  PENDING_APPROVAL:  'PENDING_APPROVAL',
  APPROVED:          'APPROVED',
  REJECTED:          'REJECTED',
  EXECUTING:         'EXECUTING',
  COMPLETED:         'COMPLETED',
  FAILED:            'FAILED',
};

const MAX_BATCH_SIZE = 100;

// Block reason codes
const BLOCK_REASONS = {
  ACTION_NOT_FOUND:   'ACTION_NOT_FOUND',
  UNAUTHORIZED:       'UNAUTHORIZED',
  DUPLICATE_ID:       'DUPLICATE_ID',
  ACTION_NOT_ACTIVE:  'ACTION_NOT_ACTIVE',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  INVALID_OWNER:      'INVALID_OWNER',
  INVALID_DATE:       'INVALID_DATE',
  EMPTY_BATCH:        'EMPTY_BATCH',
  BATCH_TOO_LARGE:    'BATCH_TOO_LARGE',
  STATE_CHANGED:      'STATE_CHANGED',
};

// Canonical hashing helpers

/**
 * Returns a canonical JSON string suitable for hashing.
 * Keys are sorted recursively; arrays are left in the order provided.
 */
function canonicalJSON(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const sorted = {};
  for (const k of Object.keys(value).sort()) {
    sorted[k] = value[k];
  }
  return JSON.stringify(sorted);
}

/**
 * Computes the canonical SHA-256 preview hash from the normalized operation inputs.
 * actionIds are sorted and deduplicated before hashing.
 */
function computePreviewHash(operation, mode, actionIds, payload) {
  const normalized = {
    operation: operation.toUpperCase(),
    mode: mode.toUpperCase(),
    actionIds: [...new Set(actionIds)].slice().sort(),
    payload: payload || {},
  };
  const canonical = `${normalized.operation}|${normalized.mode}|${JSON.stringify(normalized.actionIds)}|${canonicalJSON(normalized.payload)}`;
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Computes the idempotency request hash.
 * Binds: authenticated user identity + preview record + idempotency key.
 */
function computeRequestHash(userId, previewId, idempotencyKey) {
  return crypto.createHash('sha256')
    .update(`${userId}:${previewId}:${idempotencyKey}`, 'utf8')
    .digest('hex');
}

// Input validation helpers

function validateInputs(operation, mode, actionIds, payload) {
  if (!operation || !Object.values(OPERATION_TYPES).includes(operation.toUpperCase())) {
    return { errorStatus: 400, errorMessage: `Invalid operation '${operation}'. Allowed: ${Object.values(OPERATION_TYPES).join(', ')}` };
  }
  if (!mode || !Object.values(BATCH_MODES).includes(mode.toUpperCase())) {
    return { errorStatus: 400, errorMessage: `Invalid mode '${mode}'. Allowed: STRICT, SUBSET` };
  }
  if (!Array.isArray(actionIds) || actionIds.length === 0) {
    return { errorStatus: 400, errorMessage: 'actionIds must be a non-empty array', blockReason: BLOCK_REASONS.EMPTY_BATCH };
  }
  if (actionIds.length > MAX_BATCH_SIZE) {
    return { errorStatus: 400, errorMessage: `Batch size ${actionIds.length} exceeds maximum of ${MAX_BATCH_SIZE}`, blockReason: BLOCK_REASONS.BATCH_TOO_LARGE };
  }
  const op = operation.toUpperCase();
  if (op === OPERATION_TYPES.BULK_ASSIGN) {
    if (!payload || (!payload.ownerId && payload.ownerId !== null)) {
      return { errorStatus: 400, errorMessage: 'payload.ownerId is required for BULK_ASSIGN (use null to unassign)' };
    }
  }
  if (op === OPERATION_TYPES.BULK_DEADLINE) {
    if (!payload || (payload.dueDate !== null && payload.dueDate !== undefined)) {
      if (payload && payload.dueDate !== null && payload.dueDate !== undefined) {
        const parsed = new Date(payload.dueDate);
        if (isNaN(parsed.getTime())) {
          return { errorStatus: 400, errorMessage: 'payload.dueDate must be a valid ISO timestamp or null' };
        }
      }
    }
    if (!payload || (payload.dueDate === undefined && payload.clearDueDate !== true)) {
      return { errorStatus: 400, errorMessage: 'payload.dueDate (ISO string or null) is required for BULK_DEADLINE' };
    }
  }
  if (op === OPERATION_TYPES.BULK_TRANSITION) {
    if (!payload || !payload.targetStatus) {
      return { errorStatus: 400, errorMessage: 'payload.targetStatus is required for BULK_TRANSITION' };
    }
    if (!Object.values(WORKFLOW_STATES).includes(payload.targetStatus.toUpperCase())) {
      return { errorStatus: 400, errorMessage: `Invalid targetStatus '${payload.targetStatus}'. Allowed: ${Object.values(WORKFLOW_STATES).join(', ')}` };
    }
    if (payload.targetStatus.toUpperCase() === WORKFLOW_STATES.RESOLVED) {
      if (!payload.resolutionNotes || typeof payload.resolutionNotes !== 'string' || payload.resolutionNotes.trim().length === 0) {
        return { errorStatus: 400, errorMessage: 'payload.resolutionNotes is required when transitioning to RESOLVED' };
      }
    }
    if (payload.targetStatus.toUpperCase() === WORKFLOW_STATES.DISMISSED) {
      if (!payload.reason || typeof payload.reason !== 'string' || payload.reason.trim().length === 0) {
        return { errorStatus: 400, errorMessage: 'payload.reason is required when transitioning to DISMISSED' };
      }
    }
  }
  return null;
}

// Per-action pre-flight validator

/**
 * Classifies a single actionId as eligible or blocked.
 * Returns { eligible: boolean, reason?: string, actionData?: object }
 */
async function validateSingleAction(actionId, operation, payload, seenIds, client) {
  // Deduplication check
  if (seenIds.has(actionId)) {
    return { eligible: false, reason: BLOCK_REASONS.DUPLICATE_ID };
  }
  seenIds.add(actionId);

  // Existence + authorization check
  const { rows } = await client.query(
    `SELECT a.id, a.status, a.owner_id, a.due_date, a.priority_score, a.title, a.category,
            d.user_id AS doc_owner_id
     FROM contract_actions a
     JOIN documents d ON d.id = a.document_id
     WHERE a.id = $1`,
    [actionId]
  );

  if (rows.length === 0) {
    return { eligible: false, reason: BLOCK_REASONS.ACTION_NOT_FOUND };
  }

  const action = rows[0];

  if (action.doc_owner_id !== action._userId) {
    // Authorization is checked by the caller using req.user
    return { eligible: true, actionData: action };
  }

  return { eligible: true, actionData: action };
}

/**
 * Pre-flight validation and preview record creation.
 *
 * @param {object} user       - req.user from requireAuth middleware
 * @param {string} operation  - BULK_ASSIGN | BULK_DEADLINE | BULK_TRANSITION
 * @param {string} mode       - STRICT | SUBSET
 * @param {string[]} actionIds
 * @param {object} payload    - Operation-specific payload
 * @returns {object}          - { previewId, eligible, blocked, ... } or { errorStatus, errorMessage }
 */
async function previewBulkOperation(user, { operation, mode, actionIds, payload }) {
  const inputError = validateInputs(operation, mode, actionIds, payload);
  if (inputError) return inputError;

  const op = operation.toUpperCase();
  const md = mode.toUpperCase();

  let resolvedOwnerId = null;
  if (op === OPERATION_TYPES.BULK_ASSIGN && payload.ownerId !== null && payload.ownerId !== undefined) {
    const { rows: ownerRows } = await db.query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [payload.ownerId]
    );
    if (ownerRows.length === 0) {
      return { errorStatus: 400, errorMessage: 'Target owner user does not exist', blockReason: BLOCK_REASONS.INVALID_OWNER };
    }
    resolvedOwnerId = ownerRows[0].id;
  }

  const seenIds = new Set();
  const eligible = [];
  const blocked = [];

  for (const rawId of actionIds) {
    const actionId = typeof rawId === 'string' ? rawId.trim() : String(rawId);

    // Deduplication
    if (seenIds.has(actionId)) {
      blocked.push({ actionId, reason: BLOCK_REASONS.DUPLICATE_ID });
      continue;
    }
    seenIds.add(actionId);

    // Load + authorize
    const { rows } = await db.query(
      `SELECT a.id, a.document_id, a.status, a.owner_id, a.due_date, a.priority_score, a.title, a.category,
              d.user_id AS doc_owner_id
       FROM contract_actions a
       JOIN documents d ON d.id = a.document_id
       WHERE a.id = $1`,
      [actionId]
    );

    if (rows.length === 0) {
      blocked.push({ actionId, reason: BLOCK_REASONS.ACTION_NOT_FOUND });
      continue;
    }

    const action = rows[0];

    // Authorization
    if (action.doc_owner_id !== user.id && user.role !== 'admin') {
      blocked.push({ actionId, reason: BLOCK_REASONS.UNAUTHORIZED });
      continue;
    }

    // Operation-specific checks
    if (op === OPERATION_TYPES.BULK_ASSIGN || op === OPERATION_TYPES.BULK_DEADLINE) {
      // Only active (OPEN or IN_REVIEW) actions can receive assignment or deadline updates
      if (action.status === WORKFLOW_STATES.RESOLVED || action.status === WORKFLOW_STATES.DISMISSED) {
        blocked.push({ actionId, reason: BLOCK_REASONS.ACTION_NOT_ACTIVE });
        continue;
      }
    }

    if (op === OPERATION_TYPES.BULK_TRANSITION) {
      const targetStatus = payload.targetStatus.toUpperCase();
      if (!isValidTransition(action.status, targetStatus)) {
        blocked.push({ actionId, reason: BLOCK_REASONS.INVALID_TRANSITION, currentStatus: action.status, targetStatus });
        continue;
      }
    }

    // Build expected change summary for the preview response
    let expectedChange = '';
    if (op === OPERATION_TYPES.BULK_ASSIGN) {
      expectedChange = resolvedOwnerId
        ? `owner_id: ${action.owner_id || 'unassigned'} → ${resolvedOwnerId}`
        : `owner_id: ${action.owner_id || 'unassigned'} → unassigned`;
    } else if (op === OPERATION_TYPES.BULK_DEADLINE) {
      const newDate = payload.dueDate ? new Date(payload.dueDate).toISOString() : null;
      expectedChange = `due_date: ${action.due_date ? new Date(action.due_date).toISOString() : 'none'} → ${newDate || 'none'}`;
    } else if (op === OPERATION_TYPES.BULK_TRANSITION) {
      expectedChange = `status: ${action.status} → ${payload.targetStatus.toUpperCase()}`;
    }

    eligible.push({
      actionId: action.id,
      documentId: action.document_id,
      title: action.title,
      category: action.category,
      currentStatus: action.status,
      priorityScore: action.priority_score,
      expectedChange,
    });
  }

  if (md === BATCH_MODES.STRICT && blocked.length > 0) {
    return {
      previewId: null,
      executable: false,
      requiresApproval: false,
      operation: op,
      mode: md,
      requested: actionIds.length,
      eligibleCount: eligible.length,
      blockedCount: blocked.length,
      blockedReasons: blocked,
      expectedChanges: eligible,
      message: `STRICT mode: ${blocked.length} action(s) are ineligible. Batch is not executable. Fix blocked actions or switch to SUBSET mode.`,
    };
  }

  if (eligible.length === 0) {
    return {
      previewId: null,
      executable: false,
      requiresApproval: false,
      operation: op,
      mode: md,
      requested: actionIds.length,
      eligibleCount: 0,
      blockedCount: blocked.length,
      blockedReasons: blocked,
      expectedChanges: [],
      message: 'No eligible actions in batch. Nothing will be executed.',
    };
  }

  const policyResult = evaluateBatchPolicy({
    operation: op,
    mode: md,
    eligibleActions: eligible,
    payload,
  });

  const normalizedPayload = {
    ...payload,
    ...(op === OPERATION_TYPES.BULK_ASSIGN ? { ownerId: resolvedOwnerId } : {}),
    ...(op === OPERATION_TYPES.BULK_TRANSITION ? { targetStatus: payload.targetStatus.toUpperCase() } : {}),
  };

  const eligibleIds = eligible.map(e => e.actionId).sort();
  const previewHash = computePreviewHash(op, md, eligibleIds, normalizedPayload);

  const previewId = uuidv4();
  const initialStatus = policyResult.requiresApproval
    ? BATCH_STATUS.PENDING_APPROVAL
    : BATCH_STATUS.PREVIEWED;

  await db.query(
    `INSERT INTO portfolio_operation_batches (
       id, user_id, operation_type, status, mode,
       requested_count, eligible_count, blocked_count,
       preview_hash, payload_json, blocked_json,
       requires_approval, policy_version, policy_flags, policy_details
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      previewId,
      user.id,
      op,
      initialStatus,
      md,
      actionIds.length,
      eligible.length,
      blocked.length,
      previewHash,
      JSON.stringify({
        ...normalizedPayload,
        eligibleActionIds: eligibleIds,
      }),
      JSON.stringify(blocked),
      policyResult.requiresApproval,
      policyResult.policyVersion,
      JSON.stringify(policyResult.policyFlags),
      JSON.stringify(policyResult.ruleDetails),
    ]
  );

  return {
    previewId,
    executable: !policyResult.requiresApproval,
    requiresApproval: policyResult.requiresApproval,
    policyVersion: policyResult.policyVersion,
    policyFlags: policyResult.policyFlags,
    policyDetails: policyResult.ruleDetails,
    status: initialStatus,
    operation: op,
    mode: md,
    requested: actionIds.length,
    eligibleCount: eligible.length,
    blockedCount: blocked.length,
    blockedReasons: blocked,
    expectedChanges: eligible,
    previewHash,
    message: policyResult.requiresApproval
      ? 'Governance Policy v1.0: Independent peer approval required before execution.'
      : 'Operation is approval-exempt and ready for execution.',
  };
}

/**
 * Executes a previously previewed bulk operation.
 *
 * @param {object} user           - req.user from requireAuth
 * @param {string} previewId      - UUID from the preview response
 * @param {string} idempotencyKey - Required; client-supplied UUID
 * @returns {object}              - Execution receipt or error
 */
async function executeBulkOperation(user, previewId, idempotencyKey) {
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
    return { errorStatus: 400, errorMessage: 'Idempotency-Key header is required', code: 'IDEMPOTENCY_KEY_REQUIRED' };
  }
  const iKey = idempotencyKey.trim();

  const { rows: previewRows } = await db.query(
    'SELECT * FROM portfolio_operation_batches WHERE id = $1',
    [previewId]
  );
  if (previewRows.length === 0) {
    return { errorStatus: 404, errorMessage: 'Preview not found. Run /preview first.' };
  }
  const preview = previewRows[0];

  if (preview.user_id !== user.id && user.role !== 'admin') {
    return { errorStatus: 403, errorMessage: 'Unauthorized: preview belongs to another user' };
  }

  const requestHash = computeRequestHash(user.id, previewId, iKey);

  const { rows: existingRows } = await db.query(
    `SELECT * FROM portfolio_operation_batches
     WHERE user_id = $1 AND idempotency_key = $2`,
    [user.id, iKey]
  );

  if (existingRows.length > 0) {
    const existing = existingRows[0];

    // Same key, same request → return cached result
    if (existing.request_hash === requestHash) {
      if (existing.status === BATCH_STATUS.COMPLETED) {
        return {
          batchId: existing.id,
          operation: existing.operation_type,
          status: existing.status,
          idempotent: true,
          requested: existing.requested_count,
          executed: existing.executed_count,
          blocked: existing.blocked_count,
          blockedReasons: existing.blocked_json || [],
          result: existing.result_json || {},
          completedAt: existing.completed_at,
        };
      }
      if (existing.status === BATCH_STATUS.EXECUTING) {
        return { errorStatus: 409, errorMessage: 'Operation is currently executing. Please wait.', code: 'OPERATION_IN_PROGRESS' };
      }
      // FAILED → allow retry below (fall through)
    } else {
      // Same key, different request → reject
      return { errorStatus: 409, errorMessage: 'Idempotency key has been used for a different operation request.', code: 'IDEMPOTENCY_KEY_REUSED' };
    }
  }

  if (preview.requires_approval) {
    if (preview.status === BATCH_STATUS.PENDING_APPROVAL) {
      return {
        errorStatus: 403,
        errorMessage: 'Operation requires independent peer approval before execution. Submit for approval first.',
        code: 'APPROVAL_REQUIRED',
        policyFlags: preview.policy_flags,
      };
    }
    if (preview.status === BATCH_STATUS.REJECTED) {
      return {
        errorStatus: 409,
        errorMessage: 'This operation batch was rejected by an authorized reviewer and cannot be executed.',
        code: 'BATCH_REJECTED',
        rejectionReason: preview.rejection_reason,
      };
    }
    if (preview.status !== BATCH_STATUS.APPROVED && preview.status !== BATCH_STATUS.FAILED) {
      if (preview.status === BATCH_STATUS.COMPLETED) {
        return { errorStatus: 409, errorMessage: 'This preview has already been executed. Create a new preview to run another operation.', code: 'PREVIEW_ALREADY_CONSUMED' };
      }
      if (preview.status === BATCH_STATUS.EXECUTING) {
        return { errorStatus: 409, errorMessage: 'This preview is currently executing.', code: 'OPERATION_IN_PROGRESS' };
      }
      return { errorStatus: 409, errorMessage: `Governed batch is in status '${preview.status}', expected 'APPROVED'.`, code: 'INVALID_BATCH_STATUS' };
    }
  } else {
    if (preview.status !== BATCH_STATUS.PREVIEWED && preview.status !== BATCH_STATUS.FAILED) {
      if (preview.status === BATCH_STATUS.COMPLETED) {
        return { errorStatus: 409, errorMessage: 'This preview has already been executed. Create a new preview to run another operation.', code: 'PREVIEW_ALREADY_CONSUMED' };
      }
      if (preview.status === BATCH_STATUS.EXECUTING) {
        return { errorStatus: 409, errorMessage: 'This preview is currently executing.', code: 'OPERATION_IN_PROGRESS' };
      }
      return { errorStatus: 409, errorMessage: `Preview is in unexpected status '${preview.status}'.` };
    }
  }

  const storedPayload = preview.payload_json || {};
  const eligibleActionIds = storedPayload.eligibleActionIds || [];
  const operation = preview.operation_type;
  const mode = preview.mode;

  if (eligibleActionIds.length === 0) {
    return { errorStatus: 400, errorMessage: 'No eligible actions in this preview. Cannot execute.' };
  }

  await db.query(
    `UPDATE portfolio_operation_batches
     SET status = $1, idempotency_key = $2, request_hash = $3
     WHERE id = $4`,
    [BATCH_STATUS.EXECUTING, iKey, requestHash, previewId]
  );

  const client = await db.connect();
  const executedActionIds = [];
  const executionBlocked = [];

  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '15000'");
    await client.query("SET LOCAL lock_timeout = '5000'");

    for (const actionId of eligibleActionIds) {
      // Re-load and re-validate under row-level lock
      const { rows } = await client.query(
        `SELECT a.*, d.user_id AS doc_owner_id
         FROM contract_actions a
         JOIN documents d ON d.id = a.document_id
         WHERE a.id = $1
         FOR UPDATE OF a`,
        [actionId]
      );

      if (rows.length === 0) {
        executionBlocked.push({ actionId, reason: BLOCK_REASONS.ACTION_NOT_FOUND });
        if (mode === BATCH_MODES.STRICT) {
          await client.query('ROLLBACK');
          await db.query(
            'UPDATE portfolio_operation_batches SET status=$1 WHERE id=$2',
            [BATCH_STATUS.FAILED, previewId]
          );
          return { errorStatus: 422, errorMessage: `STRICT mode: action ${actionId} no longer exists. Transaction rolled back.`, code: 'STRICT_MODE_ABORTED', rolledBack: true };
        }
        continue;
      }

      const action = rows[0];

      // Re-authorization
      if (action.doc_owner_id !== user.id && user.role !== 'admin') {
        executionBlocked.push({ actionId, reason: BLOCK_REASONS.UNAUTHORIZED });
        if (mode === BATCH_MODES.STRICT) {
          await client.query('ROLLBACK');
          await db.query('UPDATE portfolio_operation_batches SET status=$1 WHERE id=$2', [BATCH_STATUS.FAILED, previewId]);
          return { errorStatus: 403, errorMessage: `STRICT mode: authorization check failed for action ${actionId}. Transaction rolled back.`, code: 'STRICT_MODE_ABORTED', rolledBack: true };
        }
        continue;
      }

      // Operation-specific re-validation and mutation
      try {
        if (operation === OPERATION_TYPES.BULK_ASSIGN || operation === OPERATION_TYPES.BULK_DEADLINE) {
          if (action.status === WORKFLOW_STATES.RESOLVED || action.status === WORKFLOW_STATES.DISMISSED) {
            executionBlocked.push({ actionId, reason: BLOCK_REASONS.ACTION_NOT_ACTIVE });
            if (mode === BATCH_MODES.STRICT) {
              await client.query('ROLLBACK');
              await db.query('UPDATE portfolio_operation_batches SET status=$1 WHERE id=$2', [BATCH_STATUS.FAILED, previewId]);
              return {
                errorStatus: 409,
                errorMessage: `STRICT mode: action ${actionId} is ${action.status} and cannot be modified. Transaction rolled back.`,
                code: 'ACTION_BLOCKED_IN_STRICT_MODE',
                rolledBack: true,
              };
            }
            continue;
          }
          if (operation === OPERATION_TYPES.BULK_ASSIGN) {
            await executeSingleAssign(client, action, storedPayload, user, previewId);
          } else {
            await executeSingleDeadline(client, action, storedPayload, user, previewId);
          }
        } else if (operation === OPERATION_TYPES.BULK_TRANSITION) {
          // Re-validate state transition (state may have changed since preview)
          const targetStatus = storedPayload.targetStatus;
          if (!isValidTransition(action.status, targetStatus)) {
            executionBlocked.push({ actionId, reason: BLOCK_REASONS.STATE_CHANGED, currentStatus: action.status, targetStatus });
            if (mode === BATCH_MODES.STRICT) {
              await client.query('ROLLBACK');
              await db.query('UPDATE portfolio_operation_batches SET status=$1 WHERE id=$2', [BATCH_STATUS.FAILED, previewId]);
              return {
                errorStatus: 409,
                errorMessage: `STRICT mode: action ${actionId} state changed (${action.status} → ${targetStatus} no longer valid). Transaction rolled back.`,
                code: 'ACTION_BLOCKED_IN_STRICT_MODE',
                rolledBack: true,
              };
            }
            continue;
          }
          await executeSingleTransition(client, action, storedPayload, user, previewId);
        }
        executedActionIds.push(actionId);
      } catch (mutationErr) {
        console.error('MUTATION FAILED FOR ACTION', actionId, mutationErr);
        if (mode === BATCH_MODES.STRICT) {
          await client.query('ROLLBACK');
          await db.query('UPDATE portfolio_operation_batches SET status=$1 WHERE id=$2', [BATCH_STATUS.FAILED, previewId]);
          return {
            errorStatus: 500,
            errorMessage: `STRICT mode: mutation failed for action ${actionId}: ${mutationErr.message}. Transaction rolled back.`,
            code: 'STRICT_MODE_ABORTED',
            rolledBack: true,
          };
        }
        executionBlocked.push({ actionId, reason: 'MUTATION_FAILED' });
      }
    }

    // Update batch record to COMPLETED inside the transaction
    const resultJson = {
      executedActionIds,
      executionBlocked,
      executedCount: executedActionIds.length,
      blockedCount: (preview.blocked_count || 0) + executionBlocked.length,
    };

    await client.query(
      `UPDATE portfolio_operation_batches
       SET status = $1,
           executed_count = $2,
           blocked_count = $3,
           result_json = $4,
           completed_at = NOW()
       WHERE id = $5`,
      [
        BATCH_STATUS.COMPLETED,
        executedActionIds.length,
        (preview.blocked_count || 0) + executionBlocked.length,
        JSON.stringify(resultJson),
        previewId,
      ]
    );

    await client.query('COMMIT');

    return {
      batchId: previewId,
      operation,
      mode,
      status: BATCH_STATUS.COMPLETED,
      idempotent: false,
      requested: preview.requested_count,
      executed: executedActionIds.length,
      blocked: (preview.blocked_count || 0) + executionBlocked.length,
      blockedReasons: [...(preview.blocked_json || []), ...executionBlocked],
      executedActionIds,
      requiresApproval: preview.requires_approval,
      policyVersion: preview.policy_version,
      policyFlags: preview.policy_flags,
      approvedBy: preview.approved_by,
      approvedAt: preview.approved_at,
      completedAt: new Date().toISOString(),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    await db.query('UPDATE portfolio_operation_batches SET status=$1 WHERE id=$2', [BATCH_STATUS.FAILED, previewId]);
    console.error('executeBulkOperation transaction error:', err);
    return { errorStatus: 500, errorMessage: 'Bulk operation failed and was rolled back. Zero mutations were persisted.', code: 'TRANSACTION_FAILED', rolledBack: true };
  } finally {
    client.release();
  }
}

// Inline mutation helpers (execute inside the caller's transaction)

async function executeSingleAssign(client, action, payload, user, batchId) {
  const newOwnerId = payload.ownerId || null;
  const prevOwnerId = action.owner_id || null;

  await client.query(
    `UPDATE contract_actions
     SET owner_id = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [newOwnerId, action.id]
  );

  await client.query(
    `INSERT INTO contract_action_activity (id, action_id, event_type, actor_id, metadata)
     VALUES ($1, $2, 'BULK_ACTION_ASSIGNED', $3, $4)`,
    [
      uuidv4(), action.id, user.id,
      JSON.stringify({ batchId, previousOwnerId: prevOwnerId, newOwnerId, performedBy: user.id }),
    ]
  );
}

async function executeSingleDeadline(client, action, payload, user, batchId) {
  const prevDueDate = action.due_date ? new Date(action.due_date).toISOString() : null;
  const newDueDate = payload.dueDate ? new Date(payload.dueDate).toISOString() : null;

  const eventType = newDueDate
    ? (prevDueDate ? 'BULK_DUE_DATE_UPDATED' : 'BULK_DUE_DATE_SET')
    : 'BULK_DUE_DATE_REMOVED';

  await client.query(
    `UPDATE contract_actions
     SET due_date = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [newDueDate, action.id]
  );

  await client.query(
    `INSERT INTO contract_action_activity (id, action_id, event_type, actor_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      uuidv4(), action.id, eventType, user.id,
      JSON.stringify({ batchId, previousDueDate: prevDueDate, newDueDate, performedBy: user.id }),
    ]
  );
}

async function executeSingleTransition(client, action, payload, user, batchId) {
  const targetStatus = payload.targetStatus;
  const prevStatus = action.status;
  const resolutionNotes = payload.resolutionNotes || null;
  const reason = payload.reason || null;

  const resolvedAt = targetStatus === WORKFLOW_STATES.RESOLVED ? new Date() : action.resolved_at;
  const shouldClearEscalation = targetStatus === WORKFLOW_STATES.RESOLVED || targetStatus === WORKFLOW_STATES.DISMISSED;

  const resolutionNotesUpdate = targetStatus === WORKFLOW_STATES.RESOLVED
    ? (resolutionNotes || action.resolution_notes || null)
    : (action.resolution_notes || null);
  const decisionReasonUpdate = reason !== null ? reason : (action.decision_reason || null);

  await client.query(
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
     WHERE id = $6`,
    [
      targetStatus,
      resolutionNotesUpdate,
      resolvedAt,
      decisionReasonUpdate,
      shouldClearEscalation,
      action.id,
    ]
  );

  await client.query(
    `INSERT INTO contract_action_decisions (id, action_id, previous_status, new_status, decision, reason, decided_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      uuidv4(), action.id, prevStatus, targetStatus,
      targetStatus === WORKFLOW_STATES.DISMISSED ? 'DISMISS' : null,
      reason || resolutionNotes || null,
      user.id,
    ]
  );

  await client.query(
    `INSERT INTO contract_action_activity (id, action_id, event_type, actor_id, metadata)
     VALUES ($1, $2, 'BULK_STATUS_TRANSITIONED', $3, $4)`,
    [
      uuidv4(), action.id, user.id,
      JSON.stringify({ batchId, previousStatus: prevStatus, newStatus: targetStatus, performedBy: user.id }),
    ]
  );
}

/**
 * Returns paginated batch history for the authenticated user.
 */
async function getBatchHistory(user, { page = 1, limit = 20 } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const { rows: batches } = await db.query(
    `SELECT id, operation_type, status, mode,
            requested_count, eligible_count, executed_count, blocked_count,
            blocked_json, result_json, created_at, completed_at,
            requires_approval, policy_version, policy_flags, policy_details,
            approved_by, approved_at, approval_comments,
            rejected_by, rejected_at, rejection_reason
     FROM portfolio_operation_batches
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [user.id, limitNum, offset]
  );

  const { rows: countRows } = await db.query(
    'SELECT COUNT(*)::int AS total FROM portfolio_operation_batches WHERE user_id = $1',
    [user.id]
  );

  return {
    batches,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: countRows[0].total,
      totalPages: Math.ceil(countRows[0].total / limitNum),
    },
  };
}

// Governed Operations: Approval & Review Engine

/**
 * Predicate determining whether an authenticated user is authorized to approve/reject a batch.
 * Strictly uses the codebase's existing user role / administrative model:
 * 1. User must be authenticated
 * 2. Strict separation of duties: requester cannot approve their own batch
 * 3. Authority: user.role === 'admin'
 * 4. Batch must be in PENDING_APPROVAL
 */
function canUserApproveBatch(user, batch) {
  if (!user || !user.id || !batch) return false;
  if (user.id === batch.user_id) return false; // Anti-self-approval
  if (user.role !== 'admin') return false;     // Administrative authority required
  if (batch.status !== BATCH_STATUS.PENDING_APPROVAL) return false;
  return true;
}

/**
 * Scoped inbox: returns batches currently awaiting peer approval that the authenticated user is eligible to review.
 * Only administrative reviewers can approve batches.
 * A user can NEVER view their own batch in this approval inbox (anti-self-approval).
 */
async function getPendingApprovals(user, { page = 1, limit = 20 } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  // If user is not an admin, they have no governance authority to approve -> empty inbox
  if (user.role !== 'admin') {
    return {
      pending: [],
      pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 },
    };
  }

  const { rows: countRows } = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM portfolio_operation_batches
     WHERE status = $1 AND user_id != $2`,
    [BATCH_STATUS.PENDING_APPROVAL, user.id]
  );
  const total = countRows[0]?.total || 0;

  const { rows: pending } = await db.query(
    `SELECT b.id, b.user_id, b.operation_type, b.status, b.mode,
            b.requested_count, b.eligible_count, b.blocked_count,
            b.preview_hash, b.payload_json, b.blocked_json,
            b.requires_approval, b.policy_version, b.policy_flags, b.policy_details,
            b.created_at,
            u.name AS requester_name, u.email AS requester_email
     FROM portfolio_operation_batches b
     JOIN users u ON u.id = b.user_id
     WHERE b.status = $1 AND b.user_id != $2
     ORDER BY b.created_at DESC
     LIMIT $3 OFFSET $4`,
    [BATCH_STATUS.PENDING_APPROVAL, user.id, limitNum, offset]
  );

  return {
    pending,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
}

/**
 * Approves a batch that requires four-eyes authorization.
 * Uses an atomic transaction and row-level lock (SELECT ... FOR UPDATE) to prevent concurrent decisions.
 */
async function approveBatchOperation(user, batchId, { comments = '' } = {}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '15000'");
    await client.query("SET LOCAL lock_timeout = '5000'");
    const { rows } = await client.query(
      'SELECT * FROM portfolio_operation_batches WHERE id = $1 FOR UPDATE',
      [batchId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { errorStatus: 404, errorMessage: 'Batch operation not found' };
    }
    const batch = rows[0];

    if (batch.user_id === user.id) {
      await client.query('ROLLBACK');
      return {
        errorStatus: 403,
        errorMessage: 'Separation of duties violation: Requester cannot approve their own operation.',
        code: 'SELF_APPROVAL_FORBIDDEN',
      };
    }

    if (user.role !== 'admin') {
      await client.query('ROLLBACK');
      return {
        errorStatus: 403,
        errorMessage: 'Unauthorized: Only authorized administrative reviewers can approve governed operations.',
        code: 'APPROVER_UNAUTHORIZED',
      };
    }

    if (batch.status !== BATCH_STATUS.PENDING_APPROVAL) {
      await client.query('ROLLBACK');
      return {
        errorStatus: 409,
        errorMessage: `Batch is in status '${batch.status}' and cannot be approved. Expected PENDING_APPROVAL.`,
        code: 'BATCH_ALREADY_DECIDED',
      };
    }

    const storedPayload = batch.payload_json || {};
    const { eligibleActionIds = [], ...operationPayload } = storedPayload;
    const expectedHash = computePreviewHash(batch.operation_type, batch.mode, eligibleActionIds, operationPayload);
    if (batch.preview_hash !== expectedHash) {
      await client.query('ROLLBACK');
      return {
        errorStatus: 400,
        errorMessage: 'Preview hash verification failed. Batch definition does not match canonical preview hash.',
        code: 'HASH_MISMATCH',
      };
    }

    const now = new Date().toISOString();
    await client.query(
      `UPDATE portfolio_operation_batches
       SET status = $1, approved_by = $2, approved_at = $3, approval_comments = $4
       WHERE id = $5`,
      [BATCH_STATUS.APPROVED, user.id, now, comments?.trim() || null, batchId]
    );

    // Audit trail
    await client.query(
      `INSERT INTO activity_logs (id, user_id, action, metadata, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        uuidv4(),
        user.id,
        'BATCH_OPERATION_APPROVED',
        JSON.stringify({
          batchId,
          operation: batch.operation_type,
          requesterId: batch.user_id,
          policyVersion: batch.policy_version,
          policyFlags: batch.policy_flags,
          comments: comments?.trim() || null,
          previewHash: batch.preview_hash,
        }),
        'internal',
      ]
    );

    await client.query('COMMIT');

    return {
      batchId,
      status: BATCH_STATUS.APPROVED,
      approvedBy: user.id,
      approvedAt: now,
      approvalComments: comments?.trim() || null,
      message: 'Operation approved successfully. Ready for execution.',
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Rejects a batch that was submitted for approval.
 * Rejection is terminal: batch cannot be approved, executed, or reopened.
 */
async function rejectBatchOperation(user, batchId, { reason = '' } = {}) {
  if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
    return {
      errorStatus: 400,
      errorMessage: 'Rejection requires a meaningful explanation (minimum 10 characters).',
      code: 'REJECTION_REASON_REQUIRED',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '15000'");
    await client.query("SET LOCAL lock_timeout = '5000'");
    const { rows } = await client.query(
      'SELECT * FROM portfolio_operation_batches WHERE id = $1 FOR UPDATE',
      [batchId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { errorStatus: 404, errorMessage: 'Batch operation not found' };
    }
    const batch = rows[0];

    if (batch.user_id === user.id) {
      await client.query('ROLLBACK');
      return {
        errorStatus: 403,
        errorMessage: 'Separation of duties violation: Requester cannot reject their own operation.',
        code: 'SELF_APPROVAL_FORBIDDEN',
      };
    }

    if (user.role !== 'admin') {
      await client.query('ROLLBACK');
      return {
        errorStatus: 403,
        errorMessage: 'Unauthorized: Only authorized administrative reviewers can reject governed operations.',
        code: 'APPROVER_UNAUTHORIZED',
      };
    }

    if (batch.status !== BATCH_STATUS.PENDING_APPROVAL) {
      await client.query('ROLLBACK');
      return {
        errorStatus: 409,
        errorMessage: `Batch is in status '${batch.status}' and cannot be rejected. Expected PENDING_APPROVAL.`,
        code: 'BATCH_ALREADY_DECIDED',
      };
    }

    const now = new Date().toISOString();
    await client.query(
      `UPDATE portfolio_operation_batches
       SET status = $1, rejected_by = $2, rejected_at = $3, rejection_reason = $4, completed_at = $3
       WHERE id = $5`,
      [BATCH_STATUS.REJECTED, user.id, now, reason.trim(), batchId]
    );

    // Audit trail
    await client.query(
      `INSERT INTO activity_logs (id, user_id, action, metadata, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        uuidv4(),
        user.id,
        'BATCH_OPERATION_REJECTED',
        JSON.stringify({
          batchId,
          operation: batch.operation_type,
          requesterId: batch.user_id,
          policyVersion: batch.policy_version,
          policyFlags: batch.policy_flags,
          reason: reason.trim(),
          previewHash: batch.preview_hash,
        }),
        'internal',
      ]
    );

    await client.query('COMMIT');

    return {
      batchId,
      status: BATCH_STATUS.REJECTED,
      rejectedBy: user.id,
      rejectedAt: now,
      rejectionReason: reason.trim(),
      message: 'Operation batch was rejected. Rejection is terminal.',
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  OPERATION_TYPES,
  BATCH_MODES,
  BATCH_STATUS,
  BLOCK_REASONS,
  MAX_BATCH_SIZE,
  computePreviewHash,
  computeRequestHash,
  previewBulkOperation,
  executeBulkOperation,
  getBatchHistory,
  canUserApproveBatch,
  getPendingApprovals,
  approveBatchOperation,
  rejectBatchOperation,
};
