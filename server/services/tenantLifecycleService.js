/**
 * server/services/tenantLifecycleService.js
 * Tenant Lifecycle Management
 * Controls the full enterprise tenant lifecycle:
 * ACTIVE <-> SUSPENDED -> ARCHIVING -> ARCHIVED -> DELETION_PENDING -> DELETION_AUTHORIZED -> DELETING -> DELETED
 * Enforces legal hold protection so no tenant under legal hold can be destroyed.
 */

const crypto = require('crypto');
const db = require('../db');
const { isProtected } = require('./legalHoldService');
const { recordAudit } = require('../utils/audit');
const { EnterpriseError, ERROR_CODES } = require('../utils/errorTaxonomy');

const LIFECYCLE_STATUS = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVING: 'ARCHIVING',
  ARCHIVED: 'ARCHIVED',
  DELETION_PENDING: 'DELETION_PENDING',
  DELETION_AUTHORIZED: 'DELETION_AUTHORIZED',
  DELETING: 'DELETING',
  DELETED: 'DELETED'
};

async function getTenantStatus(tenantId) {
  const { rows } = await db.query(`
    SELECT status, previous_status, reason, scheduled_deletion_at, updated_at 
    FROM tenant_lifecycle_records 
    WHERE tenant_id = $1 
    ORDER BY created_at DESC 
    LIMIT 1
  `, [tenantId]);

  return rows.length > 0 ? rows[0] : { status: LIFECYCLE_STATUS.ACTIVE };
}

async function recordTransition(tenantId, newStatus, previousStatus, reason, requestedBy, confirmedBy = null, scheduledDate = null) {
  const recordId = crypto.randomUUID();
  await db.query(`
    INSERT INTO tenant_lifecycle_records (
      id, tenant_id, status, previous_status, reason, requested_by, confirmed_by, scheduled_deletion_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
  `, [recordId, tenantId, newStatus, previousStatus, reason, requestedBy, confirmedBy, scheduledDate]);

  await recordAudit(requestedBy, `TENANT_${newStatus}`, {
    tenant_id: tenantId,
    previous_status: previousStatus,
    new_status: newStatus,
    reason
  });
}

/**
 * Suspends tenant access.
 */
async function suspendTenant(tenantId, { reason = 'Administrative suspension', adminUserId = null } = {}) {
  const current = await getTenantStatus(tenantId);
  if (current.status === LIFECYCLE_STATUS.DELETED) {
    throw new EnterpriseError(ERROR_CODES.CONFLICT_ERROR, 'Cannot suspend a deleted tenant');
  }

  await recordTransition(tenantId, LIFECYCLE_STATUS.SUSPENDED, current.status, reason, adminUserId);
  return { tenant_id: tenantId, status: LIFECYCLE_STATUS.SUSPENDED };
}

/**
 * Resumes suspended or archived tenant.
 */
async function resumeTenant(tenantId, { reason = 'Administrative resume', adminUserId = null } = {}) {
  const current = await getTenantStatus(tenantId);
  if (current.status === LIFECYCLE_STATUS.DELETED) {
    throw new EnterpriseError(ERROR_CODES.CONFLICT_ERROR, 'Cannot resume a deleted tenant');
  }

  await recordTransition(tenantId, LIFECYCLE_STATUS.ACTIVE, current.status, reason, adminUserId);
  return { tenant_id: tenantId, status: LIFECYCLE_STATUS.ACTIVE };
}

/**
 * Archives tenant records.
 */
async function archiveTenant(tenantId, { reason = 'Administrative archive', adminUserId = null } = {}) {
  const current = await getTenantStatus(tenantId);
  await recordTransition(tenantId, LIFECYCLE_STATUS.ARCHIVED, current.status, reason, adminUserId);
  return { tenant_id: tenantId, status: LIFECYCLE_STATUS.ARCHIVED };
}

/**
 * Initiates tenant deletion request (DELETION_PENDING).
 */
async function requestTenantDeletion(tenantId, { reason = 'Tenant request', adminUserId = null, scheduledDays = 30 } = {}) {
  const current = await getTenantStatus(tenantId);
  const scheduledDate = new Date(Date.now() + scheduledDays * 24 * 60 * 60 * 1000);

  await recordTransition(
    tenantId,
    LIFECYCLE_STATUS.DELETION_PENDING,
    current.status,
    reason,
    adminUserId,
    null,
    scheduledDate
  );

  return {
    tenant_id: tenantId,
    status: LIFECYCLE_STATUS.DELETION_PENDING,
    scheduled_deletion_at: scheduledDate.toISOString()
  };
}

/**
 * Confirms and authorizes tenant deletion (DELETION_AUTHORIZED).
 */
async function authorizeTenantDeletion(tenantId, { reason = 'Authorized by enterprise compliance', adminUserId = null } = {}) {
  const current = await getTenantStatus(tenantId);
  if (current.status !== LIFECYCLE_STATUS.DELETION_PENDING) {
    throw new EnterpriseError(ERROR_CODES.CONFLICT_ERROR, `Tenant must be in DELETION_PENDING to authorize deletion (current: ${current.status})`);
  }

  await recordTransition(
    tenantId,
    LIFECYCLE_STATUS.DELETION_AUTHORIZED,
    current.status,
    reason,
    adminUserId,
    adminUserId
  );

  return {
    tenant_id: tenantId,
    status: LIFECYCLE_STATUS.DELETION_AUTHORIZED
  };
}

/**
 * Cancels a pending deletion and restores tenant to ACTIVE.
 */
async function cancelTenantDeletion(tenantId, { reason = 'Deletion cancelled', adminUserId = null } = {}) {
  const current = await getTenantStatus(tenantId);
  if (![LIFECYCLE_STATUS.DELETION_PENDING, LIFECYCLE_STATUS.DELETION_AUTHORIZED].includes(current.status)) {
    throw new EnterpriseError(ERROR_CODES.CONFLICT_ERROR, `Cannot cancel deletion from state: ${current.status}`);
  }

  await recordTransition(tenantId, LIFECYCLE_STATUS.ACTIVE, current.status, reason, adminUserId);
  return { tenant_id: tenantId, status: LIFECYCLE_STATUS.ACTIVE };
}

/**
 * Executes irreversible tenant operational data destruction (DELETING -> DELETED).
 * Strictly halts if any legal hold is active on the tenant!
 */
async function executeTenantDeletion(tenantId, { adminUserId = null } = {}) {
  const current = await getTenantStatus(tenantId);
  if (current.status !== LIFECYCLE_STATUS.DELETION_AUTHORIZED) {
    throw new EnterpriseError(
      ERROR_CODES.AUTHORIZATION_ERROR,
      `Cannot execute tenant deletion without prior authorization. Current status: ${current.status}`
    );
  }

  // Legal Hold Protection Invariant
  const holdCheck = await isProtected(tenantId, 'ALL');
  if (holdCheck.protected) {
    throw new EnterpriseError(
      ERROR_CODES.AUTHORIZATION_ERROR,
      `Cannot execute tenant deletion: Tenant is protected under legal hold (${holdCheck.reason})`
    );
  }

  // Begin operational destruction
  await recordTransition(tenantId, LIFECYCLE_STATUS.DELETING, current.status, 'Executing data destruction', adminUserId);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Dynamically clean tenant data based on available columns (tenant_id or user_id)
    const tablesToClean = [
      'enterprise_integrations',
      'integration_event_outbox',
      'contract_decision_workflows',
      'contract_monitoring_events',
      'contract_actions',
      'contract_compliance_evaluations',
      'contract_governance_policies',
      'documents'
    ];

    for (const table of tablesToClean) {
      try {
        const { rows: colCheck } = await client.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name IN ('tenant_id', 'user_id')",
          [table]
        );
        const col = colCheck.find(c => c.column_name === 'tenant_id') 
          ? 'tenant_id' 
          : (colCheck.find(c => c.column_name === 'user_id') ? 'user_id' : null);
        if (col) {
          await client.query(`DELETE FROM ${table} WHERE ${col} = $1`, [tenantId]);
        }
      } catch (cleanErr) {
        console.warn(`Non-critical clean warning on ${table}:`, cleanErr.message);
      }
    }

    // Mark lifecycle record as DELETED with deleted_at timestamp
    await client.query(`
      UPDATE tenant_lifecycle_records 
      SET status = 'DELETED', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $1
    `, [tenantId]);

    await client.query('COMMIT');

    await recordAudit(adminUserId, 'TENANT_DELETED', {
      tenant_id: tenantId,
      operational_data_destroyed: true
    });

    return {
      tenant_id: tenantId,
      status: LIFECYCLE_STATUS.DELETED,
      operational_data_destroyed: true,
      deleted_at: new Date().toISOString()
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Tenant deletion execution error:', err);
    throw new EnterpriseError(ERROR_CODES.PERSISTENCE_ERROR, `Failed to destroy tenant data: ${err.message}`);
  } finally {
    client.release();
  }
}

module.exports = {
  LIFECYCLE_STATUS,
  getTenantStatus,
  suspendTenant,
  resumeTenant,
  archiveTenant,
  requestTenantDeletion,
  authorizeTenantDeletion,
  cancelTenantDeletion,
  executeTenantDeletion
};
