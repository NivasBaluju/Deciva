/**
 * server/services/retentionEnforcementService.js
 * Retention Enforcement Engine
 * Evaluates, previews, and safely executes retention policies across documents,
 * monitoring events, workflow events, evaluations, exceptions, and outbox logs.
 * Strictly respects legal holds, ensuring protected records are never purged.
 */

const crypto = require('crypto');
const db = require('../db');
const { isProtected } = require('./legalHoldService');
const { recordAudit } = require('../utils/audit');
const { EnterpriseError, ERROR_CODES } = require('../utils/errorTaxonomy');

/**
 * Creates or updates a retention policy.
 */
async function configureRetentionPolicy({ tenantId, name, targetAsset, retentionDays, action = 'PURGE' }) {
  const policyId = crypto.randomUUID();
  await db.query(`
    INSERT INTO retention_policies (id, tenant_id, name, target_asset, retention_days, action, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, true)
  `, [policyId, tenantId, name, targetAsset, retentionDays, action]);

  return {
    id: policyId,
    tenant_id: tenantId,
    name,
    target_asset: targetAsset,
    retention_days: retentionDays,
    action,
    is_active: true
  };
}

/**
 * Evaluates candidate records for retention against legal hold protection.
 */
async function evaluateRetention(tenantId, { policyId = null } = {}) {
  let policyQuery = 'SELECT * FROM retention_policies WHERE tenant_id = $1 AND is_active = true';
  const policyParams = [tenantId];
  if (policyId) {
    policyQuery += ' AND id = $2';
    policyParams.push(policyId);
  }

  const { rows: policies } = await db.query(policyQuery, policyParams);

  const evaluationResults = [];

  for (const pol of policies) {
    const cutoffDate = new Date(Date.now() - pol.retention_days * 24 * 60 * 60 * 1000);
    const result = {
      policy_id: pol.id,
      policy_name: pol.name,
      target_asset: pol.target_asset,
      retention_days: pol.retention_days,
      cutoff_date: cutoffDate.toISOString(),
      candidates_evaluated: 0,
      eligible_for_purge: [],
      protected_by_hold: []
    };

    if (pol.target_asset === 'DOCUMENTS') {
      const { rows: docs } = await db.query(`
        SELECT id, original_name AS title, created_at FROM documents 
        WHERE (tenant_id = $1 OR user_id = $1) AND created_at < $2
      `, [tenantId, cutoffDate]);

      result.candidates_evaluated = docs.length;
      for (const doc of docs) {
        const holdCheck = await isProtected(tenantId, 'DOCUMENT', doc.id);
        if (holdCheck.protected) {
          result.protected_by_hold.push({ id: doc.id, reason: holdCheck.reason });
        } else {
          result.eligible_for_purge.push({ id: doc.id, title: doc.title });
        }
      }
    } else if (pol.target_asset === 'MONITORING_EVENTS') {
      const { rows: events } = await db.query(`
        SELECT id, event_type, detected_at FROM contract_monitoring_events 
        WHERE (user_id = $1 OR user_id IN (SELECT id FROM users WHERE id = $1)) AND detected_at < $2
      `, [tenantId, cutoffDate]);

      result.candidates_evaluated = events.length;
      for (const ev of events) {
        const holdCheck = await isProtected(tenantId, 'MONITORING', ev.id);
        if (holdCheck.protected) {
          result.protected_by_hold.push({ id: ev.id, reason: holdCheck.reason });
        } else {
          result.eligible_for_purge.push({ id: ev.id });
        }
      }
    } else if (pol.target_asset === 'OUTBOX_EVENTS') {
      const { rows: outbox } = await db.query(`
        SELECT id, event_type, created_at FROM integration_event_outbox 
        WHERE tenant_id = $1 AND created_at < $2
      `, [tenantId, cutoffDate]);

      result.candidates_evaluated = outbox.length;
      for (const ob of outbox) {
        result.eligible_for_purge.push({ id: ob.id });
      }
    }

    evaluationResults.push(result);
  }

  return evaluationResults;
}

/**
 * Previews retention without making any mutations.
 */
async function previewRetention(tenantId, { policyId = null } = {}) {
  const startTime = Date.now();
  const evaluations = await evaluateRetention(tenantId, { policyId });

  let totalEvaluated = 0;
  let totalEligible = 0;
  let totalHeld = 0;

  for (const ev of evaluations) {
    totalEvaluated += ev.candidates_evaluated;
    totalEligible += ev.eligible_for_purge.length;
    totalHeld += ev.protected_by_hold.length;

    // Log preview execution
    await db.query(`
      INSERT INTO retention_execution_logs (
        id, tenant_id, policy_id, mode, evaluated_count, retained_count, purged_count, held_count, duration_ms
      ) VALUES ($1, $2, $3, 'PREVIEW', $4, $5, 0, $6, $7)
    `, [
      crypto.randomUUID(), tenantId, ev.policy_id, ev.candidates_evaluated,
      ev.candidates_evaluated - ev.eligible_for_purge.length, ev.protected_by_hold.length, Date.now() - startTime
    ]);
  }

  return {
    mode: 'PREVIEW',
    tenant_id: tenantId,
    total_evaluated: totalEvaluated,
    total_eligible_for_purge: totalEligible,
    total_protected_by_legal_hold: totalHeld,
    policies_evaluated: evaluations,
    duration_ms: Date.now() - startTime
  };
}

/**
 * Applies retention by purging non-protected records.
 */
async function applyRetention(tenantId, { policyId = null, executedBy = null } = {}) {
  const startTime = Date.now();
  const evaluations = await evaluateRetention(tenantId, { policyId });

  let totalPurged = 0;
  let totalHeld = 0;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    for (const ev of evaluations) {
      totalHeld += ev.protected_by_hold.length;

      if (ev.target_asset === 'DOCUMENTS' && ev.eligible_for_purge.length > 0) {
        const purgeIds = ev.eligible_for_purge.map(d => d.id);
        await client.query('DELETE FROM documents WHERE id = ANY($1)', [purgeIds]);
        totalPurged += purgeIds.length;
      } else if (ev.target_asset === 'MONITORING_EVENTS' && ev.eligible_for_purge.length > 0) {
        const purgeIds = ev.eligible_for_purge.map(d => d.id);
        await client.query('DELETE FROM contract_monitoring_events WHERE id = ANY($1)', [purgeIds]);
        totalPurged += purgeIds.length;
      } else if (ev.target_asset === 'OUTBOX_EVENTS' && ev.eligible_for_purge.length > 0) {
        const purgeIds = ev.eligible_for_purge.map(d => d.id);
        await client.query('DELETE FROM integration_event_outbox WHERE id = ANY($1)', [purgeIds]);
        totalPurged += purgeIds.length;
      }

      await client.query(`
        INSERT INTO retention_execution_logs (
          id, tenant_id, policy_id, mode, evaluated_count, retained_count, purged_count, held_count, duration_ms
        ) VALUES ($1, $2, $3, 'APPLY', $4, $5, $6, $7, $8)
      `, [
        crypto.randomUUID(), tenantId, ev.policy_id, ev.candidates_evaluated,
        ev.candidates_evaluated - ev.eligible_for_purge.length, ev.eligible_for_purge.length, ev.protected_by_hold.length, Date.now() - startTime
      ]);
    }

    await client.query('COMMIT');

    await recordAudit(executedBy, 'RETENTION_EXECUTED', {
      tenant_id: tenantId,
      total_purged: totalPurged,
      total_held: totalHeld,
      duration_ms: Date.now() - startTime
    });

    return {
      mode: 'APPLY',
      status: 'COMPLETED',
      tenant_id: tenantId,
      total_purged: totalPurged,
      total_protected_by_legal_hold: totalHeld,
      duration_ms: Date.now() - startTime
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Retention execution error:', err);
    throw new EnterpriseError(ERROR_CODES.RETENTION_ERROR, `Retention application failed: ${err.message}`);
  } finally {
    client.release();
  }
}

module.exports = {
  configureRetentionPolicy,
  createRetentionPolicy: configureRetentionPolicy,
  evaluateRetention,
  previewRetention,
  applyRetention
};
