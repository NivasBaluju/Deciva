/**
 * Deciva — Governance & Compliance Routes
 * ---------------------------------------------------------------------------
 * Exposes enterprise REST APIs for policy management, versioning,
 * control configuration, compliance evaluations, dry-runs, and exception governance.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const policyComplianceService = require('../services/policyComplianceService');
const logger = require('../utils/logger');

// Helper to determine tenant ID from authenticated user
function getTenantId(req) {
  return req.user.tenant_id || req.user.id;
}

/**
 * GET /api/governance/overview
 * Returns organizational compliance statistics, policy counts, and exception breakdown.
 */
router.get('/overview', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const overview = await policyComplianceService.getGovernanceOverview(tenantId);
    res.json({ success: true, overview });
  } catch (err) {
    logger.error('Governance overview error:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch governance overview' });
  }
});

/**
 * GET /api/governance/policies
 * Lists active and historical governance policies for the organization.
 */
router.get('/policies', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const policies = await policyComplianceService.listPolicies(tenantId, req.query);
    res.json({ success: true, policies });
  } catch (err) {
    logger.error('List policies error:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Failed to list policies' });
  }
});

/**
 * POST /api/governance/policies
 * Creates a new governance policy.
 */
router.post('/policies', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const policy = await policyComplianceService.createPolicy(tenantId, req.user.id, req.body);
    res.status(201).json({ success: true, policy });
  } catch (err) {
    logger.error('Create policy error:', err.message);
    res.status(err.status || 400).json({ error: err.message || 'Failed to create policy' });
  }
});

/**
 * GET /api/governance/policies/:id
 * Retrieves a policy and its configured controls.
 */
router.get('/policies/:id', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const policy = await policyComplianceService.getPolicy(tenantId, req.params.id);
    res.json({ success: true, policy });
  } catch (err) {
    res.status(err.status || 404).json({ error: err.message || 'Policy not found' });
  }
});

/**
 * PUT /api/governance/policies/:id
 * Updates a policy, automatically incrementing its version.
 */
router.put('/policies/:id', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const policy = await policyComplianceService.updatePolicy(tenantId, req.user.id, req.params.id, req.body);
    res.json({ success: true, policy });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Failed to update policy' });
  }
});

/**
 * POST /api/governance/policies/:id/controls
 * Adds a new control with strict rule definition validation.
 */
router.post('/policies/:id/controls', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const control = await policyComplianceService.addControl(tenantId, req.params.id, req.body);
    res.status(201).json({ success: true, control });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Failed to add control' });
  }
});

/**
 * PUT /api/governance/controls/:id
 * Updates a control.
 */
router.put('/controls/:id', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const control = await policyComplianceService.updateControl(tenantId, req.params.id, req.body);
    res.json({ success: true, control });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Failed to update control' });
  }
});

/**
 * POST /api/governance/policies/:id/dry-run
 * Simulates policy evaluation against a document without saving records.
 */
router.post('/policies/:id/dry-run', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { document_id } = req.body;
    if (!document_id) {
      return res.status(400).json({ error: 'document_id is required for dry-run simulation' });
    }

    const preview = await policyComplianceService.evaluateDocumentCompliance(
      tenantId,
      document_id,
      req.user.id,
      { policy_id: req.params.id, is_dry_run: true }
    );
    res.json({ success: true, preview });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Dry-run evaluation failed' });
  }
});

/**
 * GET /api/governance/documents/:id/evaluations
 * Gets latest compliance evaluation for a document.
 */
router.get('/documents/:id/evaluations', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const evaluation = await policyComplianceService.getDocumentCompliance(tenantId, req.params.id);
    res.json({ success: true, evaluation });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch compliance evaluation' });
  }
});

/**
 * POST /api/governance/documents/:id/evaluate
 * Triggers full deterministic compliance evaluation and persists records.
 */
router.post('/documents/:id/evaluate', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const evaluation = await policyComplianceService.evaluateDocumentCompliance(
      tenantId,
      req.params.id,
      req.user.id,
      req.body || {}
    );
    res.json({ success: true, evaluation });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Compliance evaluation failed' });
  }
});

/**
 * GET /api/governance/exceptions
 * Lists exception requests across the organization or for a document.
 */
router.get('/exceptions', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const exceptions = await policyComplianceService.listExceptions(tenantId, req.query);
    res.json({ success: true, exceptions });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to list exceptions' });
  }
});

/**
 * POST /api/governance/exceptions/:id/approve
 * Approves an exception with strict separation of duties and concurrency lock.
 */
router.post('/exceptions/:id/approve', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { notes, expires_at } = req.body;
    const exception = await policyComplianceService.approveException(
      tenantId,
      req.params.id,
      req.user,
      notes,
      expires_at
    );
    res.json({ success: true, exception });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to approve exception' });
  }
});

/**
 * POST /api/governance/exceptions/:id/reject
 * Rejects an exception.
 */
router.post('/exceptions/:id/reject', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { notes } = req.body;
    const exception = await policyComplianceService.rejectException(
      tenantId,
      req.params.id,
      req.user,
      notes
    );
    res.json({ success: true, exception });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to reject exception' });
  }
});

/**
 * POST /api/governance/exceptions/:id/revoke
 * Revokes an approved exception.
 */
router.post('/exceptions/:id/revoke', requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const exception = await policyComplianceService.revokeException(
      tenantId,
      req.params.id,
      req.user
    );
    res.json({ success: true, exception });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to revoke exception' });
  }
});

module.exports = router;
