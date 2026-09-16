const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { verifyChain, verifyLedger, recordAudit, logThreat } = require('../utils/audit');
const { EnterpriseError, formatErrorResponse } = require('../utils/errorTaxonomy');
const adminProvisioningService = require('../services/adminProvisioningService');

const router = express.Router();

router.get('/overview', requireAdmin, async (req, res) => {
  try {
    const [usersRes, docsRes, sessRes, threatsRes] = await Promise.all([
      db.query('SELECT COUNT(*) AS c FROM users'),
      db.query('SELECT COUNT(*) AS c FROM documents'),
      db.query('SELECT COUNT(*) AS c FROM sessions WHERE revoked = false'),
      db.query('SELECT COUNT(*) AS c FROM threat_logs')
    ]);

    const chain = await verifyLedger();

    res.json({
      totalUsers: Number(usersRes.rows[0].c),
      totalDocuments: Number(docsRes.rows[0].c),
      totalActiveSessions: Number(sessRes.rows[0].c),
      totalThreatAlerts: Number(threatsRes.rows[0].c),
      cryptographicAudit: { totalBlocks: chain.totalBlocks, valid: chain.valid },
      blockchainAudit: { totalBlocks: chain.totalBlocks, valid: chain.valid } // backward-compatible deprecated alias
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/risky-users', requireAdmin, async (req, res) => {
  try {
    const { rows: users } = await db.query(`
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.role, 
        u.created_at,
        COALESCE(d.doc_count, 0) AS doc_count,
        COALESCE(s.active_sessions, 0) AS active_sessions,
        COALESCE(s.min_trust, 100) AS min_trust,
        COALESCE(t.threat_count, 0) AS threat_count
      FROM users u
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS doc_count FROM documents GROUP BY user_id
      ) d ON d.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS active_sessions, MIN(trust_score) AS min_trust
        FROM sessions WHERE revoked = false GROUP BY user_id
      ) s ON s.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS threat_count FROM threat_logs GROUP BY user_id
      ) t ON t.user_id = u.id
      ORDER BY 
        CASE 
          WHEN COALESCE(t.threat_count, 0) > 0 OR COALESCE(s.min_trust, 100) < 70 THEN 1 
          ELSE 2 
        END,
        u.created_at DESC
    `);

    // Fetch recent threats for each user
    const formatted = await Promise.all(users.map(async (u) => {
      const threatCount = Number(u.threat_count);
      const minTrust = Number(u.min_trust);
      const docCount = Number(u.doc_count);
      const activeSessions = Number(u.active_sessions);

      let riskLevel = 'HEALTHY';
      if (threatCount > 1 || minTrust <= 40) {
        riskLevel = 'CRITICAL_RISK';
      } else if (threatCount === 1 || minTrust < 75) {
        riskLevel = 'ELEVATED_RISK';
      }

      const { rows: threatList } = await db.query(
        'SELECT id, severity, category, message, ip, created_at FROM threat_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3',
        [u.id]
      );

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.created_at,
        docCount,
        activeSessions,
        minTrust,
        threatCount,
        riskLevel,
        recentThreats: threatList
      };
    }));

    res.json({ users: formatted });
  } catch (err) {
    console.error('Risky users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/quarantine-user/:id', requireAdmin, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [targetUserId]);
    const targetUser = rows[0];
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // Revoke all sessions
    await db.query('UPDATE sessions SET revoked = true WHERE user_id = $1', [targetUserId]);

    // Record threat & audit log
    await logThreat(targetUserId, req.ip, 'high', 'admin_quarantine', `User quarantined by admin ${req.user.email}`);
    await recordAudit(req.user.id, 'ADMIN_USER_QUARANTINED', { targetUserId, targetEmail: targetUser.email });

    res.json({ ok: true, message: `All active sessions revoked for ${targetUser.email}` });
  } catch (err) {
    console.error('Quarantine user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { rows: users } = await db.query(`
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.role, 
        u.mfa_enabled,
        u.created_at,
        COALESCE(s.active_sessions, 0) AS active_sessions,
        COALESCE(t.threat_count, 0) AS threat_count
      FROM users u
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS active_sessions FROM sessions WHERE revoked = false GROUP BY user_id
      ) s ON s.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS threat_count FROM threat_logs GROUP BY user_id
      ) t ON t.user_id = u.id
      ORDER BY u.created_at DESC
    `);
    res.json({ users });
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const { role, reason } = req.body || {};
    const result = await adminProvisioningService.provisionUserRole(
      db,
      targetUserId,
      role,
      req.user,
      reason
    );
    res.json(result);
  } catch (err) {
    if (err instanceof EnterpriseError || err.statusCode) {
      return res.status(err.statusCode || 400).json({
        error: err.message,
        code: err.errorCode || err.code
      });
    }
    console.error('Admin provision user role error:', err);
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.get('/threat-logs', requireAdmin, async (req, res) => {
  try {
    const { rows: threats } = await db.query(`
      SELECT t.id, t.user_id, u.email AS user_email, t.ip, t.severity, t.category, t.message, t.created_at
      FROM threat_logs t
      LEFT JOIN users u ON u.id = t.user_id
      ORDER BY t.created_at DESC
      LIMIT 100
    `);
    res.json({ threats });
  } catch (err) {
    console.error('Admin threat logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const backupService = require('../services/backupService');
const dataExportService = require('../services/dataExportService');
const dataImportService = require('../services/dataImportService');
const tenantLifecycleService = require('../services/tenantLifecycleService');
const legalHoldService = require('../services/legalHoldService');
const retentionEnforcementService = require('../services/retentionEnforcementService');
const jobExecutionService = require('../services/jobExecutionService');
const operationalMetricsService = require('../services/operationalMetricsService');
const productionConfigService = require('../services/productionConfigService');
const featureFlagService = require('../services/featureFlagService');
const databaseIntegrityService = require('../services/databaseIntegrityService');
const demoSeedService = require('../services/demoSeedService');

router.get('/operations/metrics', requireAdmin, async (req, res) => {
  try {
    const tenantId = req.query.tenant_id || null;
    const metrics = await operationalMetricsService.getOperationalMetrics(tenantId);
    res.json(metrics);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.get('/database/integrity', requireAdmin, async (req, res) => {
  try {
    const report = await databaseIntegrityService.checkDatabaseIntegrity();
    res.json(report);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.get('/audit/integrity', requireAdmin, async (req, res) => {
  try {
    const verification = await verifyChain();
    res.json({
      status: verification.valid ? 'VALID' : 'INVALID',
      total_blocks: verification.totalBlocks,
      algorithm: 'SHA-256',
      timestamp: new Date().toISOString(),
      correlation_id: req.correlationId
    });
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.get('/backups', requireAdmin, async (req, res) => {
  try {
    const tenantId = req.query.tenant_id || null;
    const backups = await backupService.listBackups({ tenantId });
    res.json({ backups });
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/backups', requireAdmin, async (req, res) => {
  try {
    const { tenant_id, type = 'FULL_DATABASE', description = '' } = req.body;
    const backup = await backupService.createBackup({
      tenantId: tenant_id || null,
      type,
      createdBy: req.user.id,
      description
    });
    res.status(201).json(backup);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/backups/:id/verify', requireAdmin, async (req, res) => {
  try {
    const result = await backupService.verifyBackup(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/backups/:id/restore', requireAdmin, async (req, res) => {
  try {
    const { dry_run = false, isolation_prefix = 'isolated_recovery_' } = req.body;
    const result = await backupService.restoreBackup(req.params.id, {
      targetIsolationPrefix: isolation_prefix,
      dryRun: Boolean(dry_run),
      adminUserId: req.user.id
    });
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/backups/:id/verify-external', requireAdmin, async (req, res) => {
  try {
    const result = await backupService.verifyExternalBackup(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/backups/:id/restore-external', requireAdmin, async (req, res) => {
  try {
    const { dry_run = false, isolation_prefix = 'isolated_external_recovery_' } = req.body;
    const result = await backupService.restoreFromExternalBackup(req.params.id, {
      targetIsolationPrefix: isolation_prefix,
      dryRun: Boolean(dry_run),
      adminUserId: req.user.id
    });
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/backups/prune', requireAdmin, async (req, res) => {
  try {
    const { dry_run = false } = req.body;
    const result = await backupService.pruneExpiredBackups({ dryRun: Boolean(dry_run) });
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.get('/backups/metrics', requireAdmin, async (req, res) => {
  try {
    const metrics = await backupService.getRecoveryMetrics();
    res.json(metrics);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/export', requireAdmin, async (req, res) => {
  try {
    const { tenant_id } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id is required' });
    const exportPackage = await dataExportService.exportTenantData(tenant_id, { requestedBy: req.user.id });
    res.json(exportPackage);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/import', requireAdmin, async (req, res) => {
  try {
    const { package: exportPayload, target_tenant_id, mode = 'DRY_RUN' } = req.body;
    if (!exportPayload || !target_tenant_id) {
      return res.status(400).json({ error: 'package and target_tenant_id are required' });
    }
    const report = await dataImportService.importTenantData(exportPayload, {
      targetTenantId: target_tenant_id,
      mode,
      importedBy: req.user.id
    });
    res.json(report);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.get('/lifecycle/:tenantId', requireAdmin, async (req, res) => {
  try {
    const status = await tenantLifecycleService.getTenantStatus(req.params.tenantId);
    res.json(status);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/lifecycle/:tenantId/suspend', requireAdmin, async (req, res) => {
  try {
    const result = await tenantLifecycleService.suspendTenant(req.params.tenantId, {
      reason: req.body.reason,
      adminUserId: req.user.id
    });
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/lifecycle/:tenantId/resume', requireAdmin, async (req, res) => {
  try {
    const result = await tenantLifecycleService.resumeTenant(req.params.tenantId, {
      reason: req.body.reason,
      adminUserId: req.user.id
    });
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/lifecycle/:tenantId/archive', requireAdmin, async (req, res) => {
  try {
    const result = await tenantLifecycleService.archiveTenant(req.params.tenantId, {
      reason: req.body.reason,
      adminUserId: req.user.id
    });
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/lifecycle/:tenantId/request-deletion', requireAdmin, async (req, res) => {
  try {
    const result = await tenantLifecycleService.requestTenantDeletion(req.params.tenantId, {
      reason: req.body.reason,
      adminUserId: req.user.id,
      scheduledDays: req.body.scheduled_days || 30
    });
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/lifecycle/:tenantId/authorize-deletion', requireAdmin, async (req, res) => {
  try {
    const result = await tenantLifecycleService.authorizeTenantDeletion(req.params.tenantId, {
      reason: req.body.reason,
      adminUserId: req.user.id
    });
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/lifecycle/:tenantId/cancel-deletion', requireAdmin, async (req, res) => {
  try {
    const result = await tenantLifecycleService.cancelTenantDeletion(req.params.tenantId, {
      reason: req.body.reason,
      adminUserId: req.user.id
    });
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/lifecycle/:tenantId/execute-deletion', requireAdmin, async (req, res) => {
  try {
    const result = await tenantLifecycleService.executeTenantDeletion(req.params.tenantId, {
      adminUserId: req.user.id
    });
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/retention/preview', requireAdmin, async (req, res) => {
  try {
    const { tenant_id, policy_id } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id is required' });
    const preview = await retentionEnforcementService.previewRetention(tenant_id, { policyId: policy_id });
    res.json(preview);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/retention/apply', requireAdmin, async (req, res) => {
  try {
    const { tenant_id, policy_id } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id is required' });
    const result = await retentionEnforcementService.applyRetention(tenant_id, {
      policyId: policy_id,
      executedBy: req.user.id
    });
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.get('/legal-holds', requireAdmin, async (req, res) => {
  try {
    const tenantId = req.query.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'tenant_id query param is required' });
    const holds = await legalHoldService.listLegalHolds(tenantId);
    res.json({ legal_holds: holds });
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/legal-holds', requireAdmin, async (req, res) => {
  try {
    const { tenant_id, name, matter_id, description, scope_type, scope_id } = req.body;
    const hold = await legalHoldService.createLegalHold({
      tenantId: tenant_id,
      name,
      matterId: matter_id,
      description,
      scopeType: scope_type,
      scopeId: scope_id,
      createdBy: req.user.id
    });
    res.status(201).json(hold);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/legal-holds/:id/release', requireAdmin, async (req, res) => {
  try {
    const { tenant_id, reason } = req.body;
    const result = await legalHoldService.releaseLegalHold(req.params.id, {
      tenantId: tenant_id,
      releasedBy: req.user.id,
      reason
    });
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/break-glass', requireAdmin, async (req, res) => {
  try {
    const { reason, tenant_id, scope = 'EMERGENCY_RECOVERY' } = req.body;
    if (!reason || !tenant_id) {
      return res.status(400).json({ error: 'Explicit justification reason and tenant_id are required for break-glass' });
    }

    const logId = require('crypto').randomUUID();
    await db.query(`
      INSERT INTO admin_break_glass_logs (id, admin_user_id, tenant_id, reason, scope, correlation_id, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [logId, req.user.id, tenant_id, reason, scope, req.correlationId || 'none', req.ip]);

    await recordAudit(req.user.id, 'ADMIN_BREAK_GLASS_INVOKED', {
      break_glass_id: logId,
      tenant_id,
      reason,
      scope,
      admin_email: req.user.email
    });

    res.json({
      break_glass_id: logId,
      status: 'AUTHORIZED',
      admin_user_id: req.user.id,
      timestamp: new Date().toISOString(),
      correlation_id: req.correlationId
    });
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.get('/jobs', requireAdmin, async (req, res) => {
  try {
    const { tenant_id, status, limit = 50 } = req.query;
    const jobs = await jobExecutionService.listJobs({ tenantId: tenant_id, status, limit: Number(limit) });
    res.json({ jobs });
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/jobs/:id/retry', requireAdmin, async (req, res) => {
  try {
    const result = await jobExecutionService.retryJob(req.params.id, { adminUserId: req.user.id });
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.get('/feature-flags', requireAdmin, async (req, res) => {
  try {
    const flags = await featureFlagService.listFeatureFlags();
    res.json({ feature_flags: flags });
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/feature-flags', requireAdmin, async (req, res) => {
  try {
    const { flag_key, is_enabled, description, tenant_overrides } = req.body;
    const result = await featureFlagService.setFeatureFlag(flag_key, {
      isEnabled: Boolean(is_enabled),
      description,
      tenantOverrides: tenant_overrides || {},
      adminUserId: req.user.id
    });
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.get('/config/fingerprint', requireAdmin, (req, res) => {
  try {
    const fingerprint = productionConfigService.getConfigurationFingerprint();
    res.json(fingerprint);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.get('/demo/status', requireAdmin, async (req, res) => {
  try {
    const status = await demoSeedService.getDemoStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/demo/seed', requireAdmin, async (req, res) => {
  try {
    const result = await demoSeedService.seedDemoDataset(req.user.id);
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

router.post('/demo/purge', requireAdmin, async (req, res) => {
  try {
    const result = await demoSeedService.purgeDemoDataset(req.user.id);
    res.json(result);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err, req.correlationId));
  }
});

module.exports = router;

