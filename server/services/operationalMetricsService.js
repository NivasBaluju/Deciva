/**
 * server/services/operationalMetricsService.js
 * Centralized Enterprise Operational Metrics
 * Gathers and correlates real-time health, DR, workflow, governance,
 * integration outbox, and background job metrics across tenants.
 */

const db = require('../db');
const { getRecoveryMetrics } = require('./backupService');

/**
 * Returns comprehensive operational metrics.
 */
async function getOperationalMetrics(tenantId = null) {
  const metrics = {
    timestamp: new Date().toISOString(),
    tenant_id: tenantId || 'GLOBAL'
  };

  try {
    let docQ = 'SELECT COUNT(*) AS total FROM documents';
    let wfQ = "SELECT COUNT(*) AS pending FROM contract_decision_workflows WHERE status IN ('UNDER_REVIEW', 'CHANGES_REQUESTED')";
    let actQ = "SELECT COUNT(*) AS open FROM contract_actions WHERE status != 'COMPLETED'";
    let monQ = 'SELECT COUNT(*) AS total FROM contract_monitoring_events';
    let findQ = "SELECT COUNT(*) AS non_compliant FROM contract_compliance_findings WHERE finding_status = 'NON_COMPLIANT'";
    let excQ = "SELECT COUNT(*) AS pending FROM contract_governance_exceptions WHERE status = 'REQUESTED'";
    let intQ = "SELECT COUNT(*) AS active, SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END) AS failed FROM enterprise_integrations";
    let outboxQ = "SELECT SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status = 'DEAD_LETTER' THEN 1 ELSE 0 END) AS dead_letter FROM integration_event_outbox";
    let jobQ = "SELECT COUNT(*) AS failed FROM background_job_runs WHERE status = 'FAILED'";

    const params = [];
    if (tenantId) {
      docQ += ' WHERE tenant_id = $1';
      wfQ += ' AND tenant_id = $1';
      actQ += ' AND tenant_id = $1';
      monQ += ' AND tenant_id = $1';
      findQ += ' AND evaluation_id IN (SELECT id FROM contract_compliance_evaluations WHERE tenant_id = $1)';
      excQ += ' AND tenant_id = $1';
      intQ += ' WHERE tenant_id = $1';
      outboxQ += ' WHERE tenant_id = $1';
      jobQ += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }

    const [
      docRes, wfRes, actRes, monRes, findRes, excRes, intRes, outboxRes, jobRes, recoveryMetrics
    ] = await Promise.all([
      db.query(docQ, params),
      db.query(wfQ, params),
      db.query(actQ, params),
      db.query(monQ, params),
      db.query(findQ, params),
      db.query(excQ, params),
      db.query(intQ, params),
      db.query(outboxQ, params),
      db.query(jobQ, params),
      getRecoveryMetrics()
    ]);

    metrics.documents_processed = Number(docRes.rows[0]?.total || 0);
    metrics.pending_workflows = Number(wfRes.rows[0]?.pending || 0);
    metrics.open_actions = Number(actRes.rows[0]?.open || 0);
    metrics.monitoring_events = Number(monRes.rows[0]?.total || 0);
    metrics.compliance_findings = Number(findRes.rows[0]?.non_compliant || 0);
    metrics.active_exceptions = Number(excRes.rows[0]?.pending || 0);
    metrics.active_integrations = Number(intRes.rows[0]?.active || 0);
    metrics.failed_integrations = Number(intRes.rows[0]?.failed || 0);
    metrics.outbox_pending = Number(outboxRes.rows[0]?.pending || 0);
    metrics.outbox_dead_letter = Number(outboxRes.rows[0]?.dead_letter || 0);
    metrics.background_jobs_failed = Number(jobRes.rows[0]?.failed || 0);

    metrics.disaster_recovery = recoveryMetrics;

    return metrics;
  } catch (err) {
    console.error('Error fetching operational metrics:', err);
    return {
      timestamp: new Date().toISOString(),
      error: err.message
    };
  }
}

/**
 * Returns metrics summary formatted for operational dashboards.
 */
async function getMetricsSummary(tenantId = null) {
  const metrics = await getOperationalMetrics(tenantId);
  const { rows: vRows } = await db.query('SELECT version()');
  return {
    ...metrics,
    database_version: vRows[0]?.version || 'PostgreSQL 16',
    entity_counts: {
      documents: metrics.documents_processed || 0,
      workflows: metrics.pending_workflows || 0,
      actions: metrics.open_actions || 0,
      monitoring_events: metrics.monitoring_events || 0
    }
  };
}

module.exports = {
  getOperationalMetrics,
  getMetricsSummary
};
