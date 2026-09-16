/**
 * Deciva — Integration Health & Observability Service
 * ---------------------------------------------------------------------------
 * Computes live integration health diagnostics, reachability, outbox queue
 * depths, failure rates, and tenant-scoped operational metrics.
 */

const db = require('../db');
const { getProvider } = require('./integrations/providerRegistry');
const CredentialVaultService = require('./credentialVaultService');

const IntegrationHealthService = {
  /**
   * Retrieves comprehensive health status for a single integration.
   */
  getIntegrationHealth: async (tenantId, integrationId) => {
    const { rows: intgRows } = await db.query(
      `SELECT * FROM enterprise_integrations WHERE id = $1 AND tenant_id = $2`,
      [integrationId, tenantId]
    );

    if (intgRows.length === 0) {
      throw new Error('Integration not found');
    }

    const intg = intgRows[0];
    const provider = getProvider(intg.provider);
    const config = typeof intg.configuration_json === 'string'
      ? JSON.parse(intg.configuration_json)
      : (intg.configuration_json || {});

    const creds = intg.credentials_reference
      ? { apiKey: CredentialVaultService.retrieveSecret(intg.credentials_reference) }
      : {};

    let reachability = { reachable: true, authenticated: true, latency_ms: 10 };
    try {
      reachability = await provider.healthCheck(config, creds);
    } catch (err) {
      reachability = { reachable: false, authenticated: false, error: err.message };
    }

    const { rows: syncRuns } = await db.query(
      `SELECT status, completed_at FROM integration_sync_runs
       WHERE integration_id = $1 ORDER BY started_at DESC LIMIT 10`,
      [integrationId]
    );

    const lastSuccess = syncRuns.find(r => r.status === 'COMPLETED')?.completed_at || null;
    const lastFailed = syncRuns.find(r => r.status === 'FAILED')?.completed_at || null;

    let consecutiveFailures = 0;
    for (const r of syncRuns) {
      if (r.status === 'FAILED') consecutiveFailures++;
      else break;
    }

    const { rows: outboxRows } = await db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM integration_event_outbox
       WHERE integration_id = $1 OR tenant_id = $2
       GROUP BY status`,
      [integrationId, tenantId]
    );

    let pendingEvents = 0;
    let deadLetterEvents = 0;
    for (const row of outboxRows) {
      if (row.status === 'PENDING') pendingEvents = row.count;
      if (row.status === 'DEAD_LETTER') deadLetterEvents = row.count;
    }

    return {
      integration_id: integrationId,
      name: intg.name,
      provider: intg.provider,
      status: intg.status,
      configured: Boolean(intg.configuration_json),
      authenticated: reachability.authenticated,
      reachable: reachability.reachable,
      latency_ms: reachability.latency_ms || null,
      last_sync_at: intg.last_sync_at,
      last_successful_sync: lastSuccess,
      last_failed_sync: lastFailed,
      consecutive_failures: consecutiveFailures,
      pending_events: pendingEvents,
      dead_letter_events: deadLetterEvents
    };
  },

  /**
   * Generates aggregate integration metrics for the tenant admin dashboard.
   */
  getTenantOverview: async (tenantId) => {
    const { rows: intgSummary } = await db.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
         COUNT(*) FILTER (WHERE status = 'ERROR')::int AS errored,
         COUNT(*) FILTER (WHERE status = 'PAUSED')::int AS paused
       FROM enterprise_integrations
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const { rows: syncSummary } = await db.query(
      `SELECT
         COALESCE(SUM(records_created), 0)::int AS imported,
         COALESCE(SUM(records_updated), 0)::int AS updated,
         COALESCE(SUM(records_failed), 0)::int AS failed,
         MAX(completed_at) AS last_sync
       FROM integration_sync_runs
       WHERE tenant_id = $1 AND status IN ('COMPLETED', 'PARTIAL')`,
      [tenantId]
    );

    const { rows: outboxSummary } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'DELIVERED')::int AS delivered,
         COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'DEAD_LETTER')::int AS dead_letter
       FROM integration_event_outbox
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const { rows: mapSummary } = await db.query(
      `SELECT COUNT(*)::int AS total_mapped
       FROM integration_object_mappings
       WHERE tenant_id = $1 AND mapping_status = 'ACTIVE'`,
      [tenantId]
    );

    return {
      integrations: {
        total: intgSummary[0]?.total || 0,
        active: intgSummary[0]?.active || 0,
        errored: intgSummary[0]?.errored || 0,
        paused: intgSummary[0]?.paused || 0
      },
      documents: {
        imported: syncSummary[0]?.imported || 0,
        updated: syncSummary[0]?.updated || 0,
        failed: syncSummary[0]?.failed || 0,
        total_mapped: mapSummary[0]?.total_mapped || 0,
        last_sync_at: syncSummary[0]?.last_sync || null
      },
      events: {
        delivered: outboxSummary[0]?.delivered || 0,
        pending: outboxSummary[0]?.pending || 0,
        dead_letter: outboxSummary[0]?.dead_letter || 0
      }
    };
  }
};

module.exports = IntegrationHealthService;
