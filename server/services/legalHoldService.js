/**
 * server/services/legalHoldService.js
 * Enterprise Legal Hold Protection
 * Manages formal legal holds over documents, workflows, findings, and exceptions.
 * Enforces the invariant that assets under active legal hold cannot be purged by retention or tenant deletion.
 */

const crypto = require('crypto');
const db = require('../db');
const { recordAudit } = require('../utils/audit');
const { EnterpriseError, ERROR_CODES } = require('../utils/errorTaxonomy');

/**
 * Creates a formal legal hold.
 */
async function createLegalHold({ tenantId, name, matterId, description = '', scopeType = 'ALL', scopeId = null, createdBy = null }) {
  if (!tenantId || !name || !matterId) {
    throw new EnterpriseError(ERROR_CODES.VALIDATION_ERROR, 'tenantId, name, and matterId are required');
  }

  const holdId = crypto.randomUUID();
  await db.query(`
    INSERT INTO legal_holds (
      id, tenant_id, name, matter_id, description, scope_type, scope_id, created_by, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
  `, [holdId, tenantId, name, matterId, description, scopeType, scopeId, createdBy]);

  await recordAudit(createdBy, 'LEGAL_HOLD_CREATED', {
    hold_id: holdId,
    tenant_id: tenantId,
    matter_id: matterId,
    scope_type: scopeType,
    scope_id: scopeId
  });

  return {
    id: holdId,
    tenant_id: tenantId,
    name,
    matter_id: matterId,
    scope_type: scopeType,
    scope_id: scopeId,
    status: 'ACTIVE'
  };
}

/**
 * Releases an existing legal hold.
 */
async function releaseLegalHold(holdId, { tenantId, releasedBy = null, reason = '' } = {}) {
  const { rows } = await db.query('SELECT * FROM legal_holds WHERE id = $1 AND tenant_id = $2', [holdId, tenantId]);
  if (rows.length === 0) {
    throw new EnterpriseError(ERROR_CODES.VALIDATION_ERROR, 'Legal hold not found', { statusCode: 404 });
  }

  await db.query(`
    UPDATE legal_holds 
    SET status = 'RELEASED', released_at = CURRENT_TIMESTAMP, released_by = $1 
    WHERE id = $2
  `, [releasedBy, holdId]);

  await recordAudit(releasedBy, 'LEGAL_HOLD_RELEASED', {
    hold_id: holdId,
    tenant_id: tenantId,
    reason
  });

  return {
    id: holdId,
    status: 'RELEASED',
    released_by: releasedBy,
    released_at: new Date().toISOString()
  };
}

/**
 * Lists legal holds for a tenant.
 */
async function listLegalHolds(tenantId) {
  const { rows } = await db.query(
    'SELECT * FROM legal_holds WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  return rows;
}

/**
 * Determines whether a specific asset or an entire tenant is protected by an active legal hold.
 */
async function isProtected(tenantId, assetType = 'DOCUMENT', assetId = null) {
  if (!tenantId) return false;

  // Check if tenant has an active ALL hold
  const { rows: allHolds } = await db.query(`
    SELECT id, name, matter_id FROM legal_holds 
    WHERE tenant_id = $1 AND status = 'ACTIVE' AND scope_type = 'ALL'
    LIMIT 1
  `, [tenantId]);

  if (allHolds.length > 0) {
    return {
      protected: true,
      hold_id: allHolds[0].id,
      matter_id: allHolds[0].matter_id,
      reason: `Protected by tenant-wide legal hold: ${allHolds[0].name}`
    };
  }

  // Check scoped hold
  if (assetId) {
    const { rows: scopedHolds } = await db.query(`
      SELECT id, name, matter_id FROM legal_holds 
      WHERE tenant_id = $1 AND status = 'ACTIVE' AND scope_type = $2 AND scope_id = $3
      LIMIT 1
    `, [tenantId, assetType, assetId]);

    if (scopedHolds.length > 0) {
      return {
        protected: true,
        hold_id: scopedHolds[0].id,
        matter_id: scopedHolds[0].matter_id,
        reason: `Protected by scoped legal hold: ${scopedHolds[0].name}`
      };
    }
  }

  return { protected: false };
}

module.exports = {
  createLegalHold,
  releaseLegalHold,
  listLegalHolds,
  isProtected
};
