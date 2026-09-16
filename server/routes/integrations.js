/**
 * Deciva — Enterprise Integrations REST API
 * ---------------------------------------------------------------------------
 * Provides endpoints for integration lifecycle management, connection diagnostics,
 * synchronization runs, outbox events, object mappings, and secure webhook ingestion.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { integrationLimiter, webhookLimiter } = require('../middleware/rateLimiter');
const { recordAudit } = require('../utils/audit');
const { sha256 } = require('../utils/crypto');
const CredentialVaultService = require('../services/credentialVaultService');
const IntegrationSecurityService = require('../services/integrationSecurityService');
const IntegrationSyncService = require('../services/integrationSyncService');
const IntegrationHealthService = require('../services/integrationHealthService');
const IntegrationEventService = require('../services/integrationEventService');
const { getProvider, listSupportedProviders } = require('../services/integrations/providerRegistry');

const router = express.Router();

function getTenantId(req) {
  return req.user?.tenant_id || req.user?.id;
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      error: 'Integration management requires administrator privileges',
      code: 'FORBIDDEN_ADMIN_REQUIRED'
    });
  }
  next();
}

// Provider & Tenant Overview

router.get('/providers', requireAuth, (req, res) => {
  res.json({ providers: listSupportedProviders() });
});

router.get('/overview', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const overview = await IntegrationHealthService.getTenantOverview(tenantId);
    res.json(overview);
  } catch (err) {
    console.error('[Integrations API] Overview error:', err);
    res.status(500).json({ error: 'Failed to retrieve integration overview' });
  }
});

// Integration Lifecycle (CRUD)

router.get('/', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { rows } = await db.query(
      `SELECT id, tenant_id, name, provider, integration_type, status,
              configuration_json, created_at, updated_at, last_sync_at,
              credentials_reference IS NOT NULL AS has_credentials
       FROM enterprise_integrations
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );

    res.json(rows.map(row => ({
      ...row,
      configuration: typeof row.configuration_json === 'string'
        ? JSON.parse(row.configuration_json)
        : row.configuration_json
    })));
  } catch (err) {
    console.error('[Integrations API] List error:', err);
    res.status(500).json({ error: 'Failed to list integrations' });
  }
});

router.post('/', requireAuth, requireAdmin, integrationLimiter, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { name, provider, integration_type, configuration = {}, secret } = req.body;

    if (!name || !provider || !integration_type) {
      return res.status(400).json({ error: 'Missing required fields: name, provider, integration_type' });
    }

    const validTypes = ['DOCUMENT_SOURCE', 'WEBHOOK', 'OUTBOUND_API', 'IDENTITY', 'BUSINESS_SYSTEM'];
    if (!validTypes.includes(integration_type)) {
      return res.status(400).json({ error: `Invalid integration_type. Must be one of: ${validTypes.join(', ')}` });
    }

    // Validate provider configuration
    const providerInstance = getProvider(provider);
    const validation = await providerInstance.validateConfiguration(configuration);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid provider configuration', details: validation.errors });
    }

    // Vault-encrypt secret if provided
    let credRef = null;
    if (secret) {
      const stored = CredentialVaultService.storeSecret(secret, { provider, key_type: 'api_key' });
      credRef = JSON.stringify(stored);
    }

    const id = uuidv4();
    const configStr = JSON.stringify(configuration);

    await db.query(
      `INSERT INTO enterprise_integrations (
        id, tenant_id, name, provider, integration_type, status,
        configuration_json, credentials_reference, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, tenantId, name.trim(), provider.trim(), integration_type, configStr, credRef, req.user.id]
    );

    // Record initial configuration version
    await db.query(
      `INSERT INTO integration_config_versions (
        id, tenant_id, integration_id, version, configuration_hash, changed_by, created_at
      ) VALUES ($1, $2, $3, 1, $4, $5, CURRENT_TIMESTAMP)`,
      [uuidv4(), tenantId, id, sha256(configStr), req.user.id]
    );

    await recordAudit(tenantId, 'INTEGRATION_CREATED', { integrationId: id, name, provider });

    res.status(201).json({
      id,
      name,
      provider,
      integration_type,
      status: 'DRAFT',
      configuration,
      has_credentials: Boolean(credRef)
    });
  } catch (err) {
    console.error('[Integrations API] Create error:', err);
    res.status(500).json({ error: 'Failed to create integration' });
  }
});

router.get('/:integrationId', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const access = await IntegrationSecurityService.validateIntegrationAccess(tenantId, req.params.integrationId, req.user);
    if (!access.allowed) {
      return res.status(access.status || 403).json({ error: access.error });
    }

    const intg = access.integration;
    res.json({
      id: intg.id,
      tenant_id: intg.tenant_id,
      name: intg.name,
      provider: intg.provider,
      integration_type: intg.integration_type,
      status: intg.status,
      configuration: typeof intg.configuration_json === 'string'
        ? JSON.parse(intg.configuration_json)
        : intg.configuration_json,
      has_credentials: Boolean(intg.credentials_reference),
      created_at: intg.created_at,
      updated_at: intg.updated_at,
      last_sync_at: intg.last_sync_at
    });
  } catch (err) {
    console.error('[Integrations API] Get error:', err);
    res.status(500).json({ error: 'Failed to retrieve integration' });
  }
});

router.patch('/:integrationId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const access = await IntegrationSecurityService.validateIntegrationAccess(tenantId, req.params.integrationId, req.user);
    if (!access.allowed) return res.status(access.status || 403).json({ error: access.error });

    const intg = access.integration;
    const { name, configuration, secret } = req.body;

    let newName = intg.name;
    if (name) newName = name.trim();

    let newConfigStr = intg.configuration_json;
    if (configuration) {
      const provider = getProvider(intg.provider);
      const validation = await provider.validateConfiguration(configuration);
      if (!validation.valid) {
        return res.status(400).json({ error: 'Invalid configuration', details: validation.errors });
      }
      newConfigStr = JSON.stringify(configuration);
    }

    let credRef = intg.credentials_reference;
    if (secret) {
      const stored = CredentialVaultService.storeSecret(secret, { provider: intg.provider });
      credRef = JSON.stringify(stored);
    }

    await db.query(
      `UPDATE enterprise_integrations
       SET name = $1, configuration_json = $2, credentials_reference = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [newName, newConfigStr, credRef, intg.id]
    );

    // Increment config version
    const { rows: verRows } = await db.query(
      `SELECT MAX(version) AS max_ver FROM integration_config_versions WHERE integration_id = $1`,
      [intg.id]
    );
    const nextVer = (verRows[0]?.max_ver || 1) + 1;
    await db.query(
      `INSERT INTO integration_config_versions (
        id, tenant_id, integration_id, version, configuration_hash, changed_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [uuidv4(), tenantId, intg.id, nextVer, sha256(newConfigStr), req.user.id]
    );

    await recordAudit(tenantId, 'INTEGRATION_UPDATED', { integrationId: intg.id, version: nextVer });

    res.json({ message: 'Integration updated successfully', version: nextVer });
  } catch (err) {
    console.error('[Integrations API] Patch error:', err);
    res.status(500).json({ error: 'Failed to update integration' });
  }
});

router.post('/:integrationId/activate', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const access = await IntegrationSecurityService.validateIntegrationAccess(tenantId, req.params.integrationId, req.user);
    if (!access.allowed) return res.status(access.status || 403).json({ error: access.error });

    const intg = access.integration;
    const provider = getProvider(intg.provider);
    const config = typeof intg.configuration_json === 'string' ? JSON.parse(intg.configuration_json) : intg.configuration_json;

    const creds = intg.credentials_reference
      ? { apiKey: CredentialVaultService.retrieveSecret(intg.credentials_reference) }
      : {};

    const conn = await provider.testConnection(config, creds);
    if (!conn.reachable) {
      return res.status(400).json({
        error: 'Cannot activate integration: Connection check failed',
        details: conn
      });
    }

    await db.query(
      `UPDATE enterprise_integrations SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [intg.id]
    );

    await recordAudit(tenantId, 'INTEGRATION_ACTIVATED', { integrationId: intg.id });

    res.json({ status: 'ACTIVE', message: 'Integration activated successfully' });
  } catch (err) {
    console.error('[Integrations API] Activate error:', err);
    res.status(500).json({ error: 'Failed to activate integration' });
  }
});

router.post('/:integrationId/pause', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const access = await IntegrationSecurityService.validateIntegrationAccess(tenantId, req.params.integrationId, req.user);
    if (!access.allowed) return res.status(access.status || 403).json({ error: access.error });

    await db.query(
      `UPDATE enterprise_integrations SET status = 'PAUSED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [req.params.integrationId]
    );

    await recordAudit(tenantId, 'INTEGRATION_PAUSED', { integrationId: req.params.integrationId });

    res.json({ status: 'PAUSED', message: 'Integration paused' });
  } catch (err) {
    console.error('[Integrations API] Pause error:', err);
    res.status(500).json({ error: 'Failed to pause integration' });
  }
});

router.post('/:integrationId/disable', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const access = await IntegrationSecurityService.validateIntegrationAccess(tenantId, req.params.integrationId, req.user);
    if (!access.allowed) return res.status(access.status || 403).json({ error: access.error });

    await db.query(
      `UPDATE enterprise_integrations SET status = 'DISABLED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [req.params.integrationId]
    );

    await recordAudit(tenantId, 'INTEGRATION_DISABLED', { integrationId: req.params.integrationId });

    res.json({ status: 'DISABLED', message: 'Integration disabled' });
  } catch (err) {
    console.error('[Integrations API] Disable error:', err);
    res.status(500).json({ error: 'Failed to disable integration' });
  }
});

router.delete('/:integrationId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const access = await IntegrationSecurityService.validateIntegrationAccess(tenantId, req.params.integrationId, req.user);
    if (!access.allowed) return res.status(access.status || 403).json({ error: access.error });

    await db.query('DELETE FROM enterprise_integrations WHERE id = $1', [req.params.integrationId]);

    await recordAudit(tenantId, 'INTEGRATION_DELETED', { integrationId: req.params.integrationId });

    res.json({ message: 'Integration and associated mappings removed' });
  } catch (err) {
    console.error('[Integrations API] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete integration' });
  }
});

// Connection & Health Diagnostics

router.post('/:integrationId/test', requireAuth, integrationLimiter, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const access = await IntegrationSecurityService.validateIntegrationAccess(tenantId, req.params.integrationId, req.user);
    if (!access.allowed) return res.status(access.status || 403).json({ error: access.error });

    const intg = access.integration;
    const provider = getProvider(intg.provider);
    const config = typeof intg.configuration_json === 'string' ? JSON.parse(intg.configuration_json) : intg.configuration_json;

    const creds = intg.credentials_reference
      ? { apiKey: CredentialVaultService.retrieveSecret(intg.credentials_reference) }
      : {};

    const check = await provider.testConnection(config, creds);
    res.json(check);
  } catch (err) {
    console.error('[Integrations API] Test error:', err);
    res.status(500).json({ error: 'Connection test failed', details: err.message });
  }
});

router.get('/:integrationId/health', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const health = await IntegrationHealthService.getIntegrationHealth(tenantId, req.params.integrationId);
    res.json(health);
  } catch (err) {
    console.error('[Integrations API] Health error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Synchronization Runs & Mappings

router.post('/:integrationId/sync', requireAuth, requireAdmin, integrationLimiter, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const result = await IntegrationSyncService.executeSyncRun(tenantId, req.params.integrationId, req.body || {});
    res.json(result);
  } catch (err) {
    console.error('[Integrations API] Sync run error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.get('/:integrationId/sync-runs', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { rows } = await db.query(
      `SELECT * FROM integration_sync_runs
       WHERE integration_id = $1 AND tenant_id = $2
       ORDER BY started_at DESC LIMIT 50`,
      [req.params.integrationId, tenantId]
    );
    res.json({ runs: rows });
  } catch (err) {
    console.error('[Integrations API] Sync runs history error:', err);
    res.status(500).json({ error: 'Failed to retrieve sync runs' });
  }
});

router.get('/:integrationId/mappings', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { rows } = await db.query(
      `SELECT * FROM integration_object_mappings
       WHERE integration_id = $1 AND tenant_id = $2
       ORDER BY last_synced_at DESC LIMIT 100`,
      [req.params.integrationId, tenantId]
    );
    res.json({ mappings: rows });
  } catch (err) {
    console.error('[Integrations API] Mappings error:', err);
    res.status(500).json({ error: 'Failed to retrieve mappings' });
  }
});

// Outbox Events & Dead-Letter Replay

router.get('/:integrationId/events', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const events = await IntegrationEventService.listEvents(tenantId, {
      integrationId: req.params.integrationId,
      status: req.query.status,
      limit: parseInt(req.query.limit, 10) || 50
    });
    res.json({ events });
  } catch (err) {
    console.error('[Integrations API] List events error:', err);
    res.status(500).json({ error: 'Failed to list outbound events' });
  }
});

router.post('/:integrationId/events/retry', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const result = await IntegrationEventService.retryDeadLetterEvents(tenantId, req.body?.eventId);
    res.json({ message: 'Events queued for retry', ...result });
  } catch (err) {
    console.error('[Integrations API] Retry events error:', err);
    res.status(500).json({ error: 'Failed to retry events' });
  }
});

// Inbound Webhook Endpoint (HMAC-Verified)

router.post('/:integrationId/webhook', webhookLimiter, async (req, res) => {
  try {
    const integrationId = req.params.integrationId;
    const resolved = await IntegrationSecurityService.resolveIntegrationTenant(integrationId);
    if (!resolved) {
      return res.status(404).json({ error: 'Integration endpoint not found' });
    }

    const tenantId = resolved.tenant_id;
    const sigHeader = req.headers['x-hub-signature-256'] || req.headers['x-signature'] || req.headers['x-webhook-signature'];
    const timestampHeader = req.headers['x-timestamp'] || req.headers['x-webhook-timestamp'];

    const result = await IntegrationSyncService.processWebhookEvent(tenantId, integrationId, {
      rawBody: req.rawBody || JSON.stringify(req.body),
      signatureHeader: sigHeader,
      timestampHeader,
      payload: req.body
    });

    res.json(result);
  } catch (err) {
    console.error('[Integrations API] Webhook processing error:', err.message);
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
