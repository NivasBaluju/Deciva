const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { verifyChain, verifyLedger } = require('../utils/audit');
const complianceService = require('../services/complianceAuditService');
const exportService = require('../services/evidenceExportService');
const integrityService = require('../services/evidenceIntegrityService');

/**
 * POST /api/compliance/verify
 * Stateless in-memory tamper and integrity verification.
 * Accepts: { evidence: object, expectedHash: string }
 * Returns: { valid: boolean, expectedHash: string, computedHash: string, algorithm: 'SHA-256' }
 */
router.post('/verify', requireAuth, (req, res) => {
  try {
    const evidence = req.body?.evidence;
    const expectedHash = req.body?.expectedHash 
      || req.body?.manifest?.integrity?.canonicalHash 
      || req.body?.manifest?.canonicalHash
      || req.body?.manifest?.evidenceHash 
      || req.body?.manifest?.sha256;
    if (!evidence || !expectedHash) {
      return res.status(400).json({
        error: 'Both evidence object and expectedHash string (or manifest.integrity.canonicalHash) are required for verification',
        valid: false
      });
    }

    const result = integrityService.verifyEvidenceHash(evidence, expectedHash);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message, valid: false });
  }
});

/**
 * GET /api/compliance/documents/:documentId/evidence
 * GET /api/compliance/contracts/:documentId
 * Fetch canonical evidence and manifest for a specific document.
 */
router.get(['/documents/:documentId/evidence', '/contracts/:documentId/evidence', '/contracts/:documentId', '/documents/:documentId'], requireAuth, async (req, res) => {
  try {
    const data = await complianceService.getContractEvidence(req.params.documentId, req.user);
    return res.status(200).json(data);
  } catch (err) {
    console.error('[Compliance Route Error]:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
});

/**
 * GET /api/compliance/documents/:documentId/export/json
 * GET /api/compliance/contracts/:documentId/export/json
 * Download full machine-readable canonical evidence package as JSON.
 */
router.get(['/documents/:documentId/export/json', '/contracts/:documentId/export/json'], requireAuth, async (req, res) => {
  try {
    const evidencePackage = await complianceService.getContractEvidence(req.params.documentId, req.user);
    const jsonOutput = exportService.generateJsonExport(evidencePackage);

    const safeName = (evidencePackage.subject?.filename || req.params.documentId).replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="contract_evidence_${safeName}.json"`);
    return res.send(jsonOutput);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
});

/**
 * GET /api/compliance/documents/:documentId/export/pdf
 * GET /api/compliance/contracts/:documentId/export/pdf
 * Download formatted executive compliance audit summary as PDF.
 */
router.get(['/documents/:documentId/export/pdf', '/contracts/:documentId/export/pdf'], requireAuth, async (req, res) => {
  try {
    const evidencePackage = await complianceService.getContractEvidence(req.params.documentId, req.user);
    const pdfBuffer = await exportService.generatePdfExport('CONTRACT_GOVERNANCE_AUDIT', evidencePackage);
    const safeName = (evidencePackage.subject?.filename || req.params.documentId).replace(/[^a-zA-Z0-9_-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="contract_audit_${safeName}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[Contract PDF Export Error]:', err);
    const status = err.status || 500;
    if (!res.headersSent) {
      return res.status(status).json({ error: err.message });
    }
  }
});

/**
 * GET /api/compliance/documents/:documentId/export/csv
 * GET /api/compliance/contracts/:documentId/export/csv
 * Unified CSV export by type (actions, decisions, activity, batches).
 */
router.get(['/documents/:documentId/export/csv', '/contracts/:documentId/export/csv'], requireAuth, async (req, res) => {
  try {
    const evidencePackage = await complianceService.getContractEvidence(req.params.documentId, req.user);
    const type = req.query.type || 'actions';
    const csvOutput = exportService.generateCsvExport(type, evidencePackage);

    const safeName = (evidencePackage.subject?.filename || req.params.documentId).replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="contract_${type}_${safeName}.csv"`);
    return res.send(csvOutput);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
});

/**
 * GET /api/compliance/documents/:documentId/export/actions.csv
 * Download flattened action items CSV for spreadsheet analysis.
 */
router.get(['/documents/:documentId/export/actions.csv', '/contracts/:documentId/export/actions.csv'], requireAuth, async (req, res) => {
  try {
    const evidencePackage = await complianceService.getContractEvidence(req.params.documentId, req.user);
    const csvOutput = exportService.generateCsvExport('actions', evidencePackage);

    const safeName = (evidencePackage.subject?.filename || req.params.documentId).replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="contract_actions_${safeName}.csv"`);
    return res.send(csvOutput);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
});

/**
 * GET /api/compliance/documents/:documentId/export/decisions.csv
 * Download decision ledger CSV.
 */
router.get('/documents/:documentId/export/decisions.csv', requireAuth, async (req, res) => {
  try {
    const evidencePackage = await complianceService.getContractEvidence(req.params.documentId, req.user);
    const csvOutput = exportService.generateCsvExport('decisions', evidencePackage);

    const safeName = (evidencePackage.subject?.filename || req.params.documentId).replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="contract_decisions_${safeName}.csv"`);
    return res.send(csvOutput);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
});

/**
 * GET /api/compliance/documents/:documentId/export/activity.csv
 * Download action activity audit log CSV.
 */
router.get('/documents/:documentId/export/activity.csv', requireAuth, async (req, res) => {
  try {
    const evidencePackage = await complianceService.getContractEvidence(req.params.documentId, req.user);
    const csvOutput = exportService.generateCsvExport('activity', evidencePackage);

    const safeName = (evidencePackage.subject?.filename || req.params.documentId).replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="contract_activity_${safeName}.csv"`);
    return res.send(csvOutput);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
});

/**
 * GET /api/compliance/portfolio/evidence
 * GET /api/compliance/portfolio
 * Fetch complete portfolio governance evidence and manifest.
 */
router.get(['/portfolio/evidence', '/portfolio'], requireAuth, async (req, res) => {
  try {
    const data = await complianceService.getPortfolioEvidence(req.user);
    return res.status(200).json(data);
  } catch (err) {
    console.error('[Portfolio Evidence Error]:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
});

/**
 * GET /api/compliance/portfolio/export/json
 * Download portfolio evidence package as JSON.
 */
router.get('/portfolio/export/json', requireAuth, async (req, res) => {
  try {
    const evidencePackage = await complianceService.getPortfolioEvidence(req.user);
    const jsonOutput = exportService.generateJsonExport(evidencePackage);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="portfolio_compliance_evidence.json"');
    return res.send(jsonOutput);
  } catch (err) {
    console.error('[Portfolio JSON Export Error]:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
});

/**
 * GET /api/compliance/portfolio/export/pdf
 * Download executive portfolio governance audit summary as PDF.
 */
router.get('/portfolio/export/pdf', requireAuth, async (req, res) => {
  try {
    const evidencePackage = await complianceService.getPortfolioEvidence(req.user);
    const pdfBuffer = await exportService.generatePdfExport('PORTFOLIO_GOVERNANCE_AUDIT', evidencePackage);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Content-Disposition', 'attachment; filename="portfolio_compliance_audit.pdf"');
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[Portfolio PDF Export Error]:', err);
    const status = err.status || 500;
    if (!res.headersSent) {
      return res.status(status).json({ error: err.message });
    }
  }
});

/**
 * GET /api/compliance/portfolio/export/csv
 * Unified portfolio CSV export by type (portfolio_actions, portfolio_contracts, governed_batches).
 */
router.get('/portfolio/export/csv', requireAuth, async (req, res) => {
  try {
    const evidencePackage = await complianceService.getPortfolioEvidence(req.user);
    const type = req.query.type || 'portfolio_actions';
    const csvOutput = exportService.generateCsvExport(type, evidencePackage);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="portfolio_${type}.csv"`);
    return res.send(csvOutput);
  } catch (err) {
    console.error('[Portfolio CSV Export Error]:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
});

/**
 * GET /api/compliance/portfolio/export/actions.csv
 * Download portfolio-wide action queue CSV.
 */
router.get('/portfolio/export/actions.csv', requireAuth, async (req, res) => {
  try {
    const evidencePackage = await complianceService.getPortfolioEvidence(req.user);
    const csvOutput = exportService.generateCsvExport('portfolio_actions', evidencePackage);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="portfolio_action_queue.csv"');
    return res.send(csvOutput);
  } catch (err) {
    console.error('[Portfolio Actions CSV Error]:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
});

/**
 * GET /api/compliance/portfolio/export/contracts.csv
 * Download portfolio contract rankings CSV.
 */
router.get('/portfolio/export/contracts.csv', requireAuth, async (req, res) => {
  try {
    const evidencePackage = await complianceService.getPortfolioEvidence(req.user);
    const csvOutput = exportService.generateCsvExport('portfolio_contracts', evidencePackage);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="portfolio_contracts_health.csv"');
    return res.send(csvOutput);
  } catch (err) {
    console.error('[Portfolio Contracts CSV Error]:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
});

/**
 * GET /api/compliance/audit-trail
 * Paginated, tamper-evident audit ledger explorer with cryptographic integrity status.
 */
router.get(['/audit-trail', '/audit-explorer'], requireAuth, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const actionFilter = req.query.action ? String(req.query.action).trim() : null;

    let query = `
      SELECT 
        b.id,
        b.block_index AS "blockIndex",
        b.user_id AS "userId",
        b.action,
        b.details_json AS "detailsJson",
        b.prev_hash AS "prevHash",
        b.hash,
        b.created_at AS "createdAt",
        u.email AS "userEmail",
        u.role AS "userRole"
      FROM blockchain_audit b
      LEFT JOIN users u ON u.id = b.user_id
    `;
    const params = [];
    const conditions = [];

    if (actionFilter) {
      params.push(actionFilter);
      conditions.push(`b.action = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY b.block_index DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const countQuery = actionFilter
      ? 'SELECT COUNT(*) AS c FROM blockchain_audit WHERE action = $1'
      : 'SELECT COUNT(*) AS c FROM blockchain_audit';
    const countParams = actionFilter ? [actionFilter] : [];

    const [rowsRes, countRes, chainStatus] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams),
      verifyChain()
    ]);

    const formattedBlocks = rowsRes.rows.map(r => {
      let parsedDetails = {};
      try {
        parsedDetails = typeof r.detailsJson === 'string' ? JSON.parse(r.detailsJson) : (r.detailsJson || {});
      } catch {
        parsedDetails = { raw: r.detailsJson };
      }
      return {
        id: r.id,
        blockIndex: Number(r.blockIndex),
        action: r.action,
        actor: r.userEmail ? r.userEmail.replace(/^(.{2})(.*)(@.*)$/, '$1***$3') : 'System / Anonymous',
        actorRole: r.userRole || 'system',
        details: parsedDetails,
        prevHash: r.prevHash,
        hash: r.hash,
        createdAt: r.createdAt
      };
    });

    res.json({
      total: Number(countRes.rows[0].c),
      limit,
      offset,
      chainIntegrity: {
        valid: chainStatus.valid,
        totalBlocks: chainStatus.totalBlocks,
        verifiedAt: new Date().toISOString()
      },
      blocks: formattedBlocks
    });
  } catch (err) {
    console.error('[Audit Trail Error]:', err);
    res.status(500).json({ error: 'Failed to retrieve audit trail' });
  }
});

/**
 * GET /api/compliance/audit-trail/verify
 * Direct mathematical verification of every SHA-256 hash across the cryptographic audit ledger.
 */
router.get(['/audit-trail/verify', '/audit-chain/verify', '/audit-ledger/verify'], requireAuth, async (req, res) => {
  try {
    const chainStatus = await verifyLedger();
    res.json({
      ...chainStatus,
      cryptographicAudit: { totalBlocks: chainStatus.totalBlocks, valid: chainStatus.valid },
      blockchainAudit: { totalBlocks: chainStatus.totalBlocks, valid: chainStatus.valid }, // backward-compatible deprecated alias
      algorithm: 'SHA-256',
      verifiedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Audit Ledger Verification Error]:', err);
    res.status(500).json({ error: 'Failed to verify cryptographic chain' });
  }
});

/**
 * GET /api/compliance/retention-policy
 * Enterprise Data Retention & Privacy Governance Schedule.
 * Transparently details the retention behavior across all storage layers.
 */
router.get(['/retention-policy', '/governance/retention'], (req, res) => {
  res.json({
    version: '2026.1-enterprise',
    retentionSchedule: [
      {
        asset: 'documents',
        retentionPeriod: 'Indefinite (User-Governed)',
        storageType: 'AES-256 Encrypted on Disk / DB Metadata',
        deletionMechanism: 'User-initiated hard delete with cryptographic ledger record (DOCUMENT_DELETED)',
        piiClassification: 'Confidential'
      },
      {
        asset: 'extracted_text',
        retentionPeriod: 'Bound to Document Lifecycle',
        storageType: 'PostgreSQL text column',
        deletionMechanism: 'Cascading DELETE ON CASCADE from documents table',
        piiClassification: 'Confidential'
      },
      {
        asset: 'chat_messages',
        retentionPeriod: 'Bound to Document Lifecycle',
        storageType: 'PostgreSQL chat_messages table',
        deletionMechanism: 'Cascading DELETE ON CASCADE from documents table',
        piiClassification: 'Internal Operational'
      },
      {
        asset: 'ai_telemetry_logs',
        retentionPeriod: '90 Days',
        storageType: 'PostgreSQL ai_telemetry_logs table',
        deletionMechanism: 'Scheduled operational purge; contains zero raw contract text or prompts',
        piiClassification: 'Non-Sensitive Telemetry'
      },
      {
        asset: 'blockchain_audit',
        retentionPeriod: 'Permanent (Immutable Ledger)',
        storageType: 'PostgreSQL blockchain_audit table',
        deletionMechanism: 'Append-only SHA-256 hash chain; non-deletable for legal audit integrity',
        piiClassification: 'Cryptographic Proof'
      },
      {
        asset: 'sessions',
        retentionPeriod: '7 Days or Explicit Logout',
        storageType: 'PostgreSQL sessions table',
        deletionMechanism: 'Token expiration and zero-trust revocation flags',
        piiClassification: 'Authentication Credential'
      },
      {
        asset: 'otp_codes',
        retentionPeriod: '10 Minutes',
        storageType: 'PostgreSQL otp_codes table',
        deletionMechanism: 'Single-use flag and expires_at threshold rejection',
        piiClassification: 'Ephemeral Credential'
      },
      {
        asset: 'share_links',
        retentionPeriod: 'Configurable (Default 48h to 7d)',
        storageType: 'PostgreSQL share_links table',
        deletionMechanism: 'CSPRNG token expiration and download count limits',
        piiClassification: 'Access Link'
      },
      {
        asset: 'temporary_files',
        retentionPeriod: '0 Seconds (Ephemeral In-Memory)',
        storageType: 'RAM (Multer Memory Storage Buffer)',
        deletionMechanism: 'Garbage collected immediately upon request completion',
        piiClassification: 'Ephemeral'
      }
    ],
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
