/**
 * server/services/auditExportService.js
 * Phase F: Evidence-Backed Cryptographic Audit Export
 * Compiles a comprehensive, verifiable audit export package containing:
 * 1. Executive summary
 * 2. Contract identity
 * 3. Decision timeline
 * 4. Risk register
 * 5. Evidence references
 * 6. Governance findings
 * 7. Approval history
 * 8. Monitoring events
 * 9. Integration events
 * 10. Audit ledger verification
 * 11. Export manifest with individual SHA-256 digests
 *
 * Enforces strict secret scrubbing (stripping passwords, tokens, API keys).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { recordAudit } = require('../utils/audit');
const { EnterpriseError, ERROR_CODES } = require('../utils/errorTaxonomy');

const AUDIT_EXPORTS_DIR = path.resolve(__dirname, '../../storage/audit_exports');
if (!fs.existsSync(AUDIT_EXPORTS_DIR)) {
  fs.mkdirSync(AUDIT_EXPORTS_DIR, { recursive: true });
}

/**
 * Recursively scrubs known sensitive keys from exported objects.
 */
function scrubSensitiveData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(scrubSensitiveData);

  const sensitiveKeys = new Set([
    'password', 'password_hash', 'secret', 'api_key', 'token', 'private_key',
    'access_token', 'refresh_token', 'client_secret', 'internal_service_key'
  ]);

  const scrubbed = {};
  for (const [key, val] of Object.entries(obj)) {
    if (sensitiveKeys.has(key.toLowerCase())) {
      scrubbed[key] = '[SCRUBBED_FOR_AUDIT_SECURITY]';
    } else if (typeof val === 'object' && val !== null) {
      scrubbed[key] = scrubSensitiveData(val);
    } else {
      scrubbed[key] = val;
    }
  }
  return scrubbed;
}

/**
 * Assembles an evidence-backed, verifiable audit package for a document or tenant.
 */
async function generateCryptographicAuditExport({ documentId = null, tenantId = null, userId = null }) {
  const startTime = Date.now();
  const exportId = crypto.randomUUID();
  const exportBundle = {};

  let docRecord = null;
  if (documentId) {
    const { rows: docs } = await db.query('SELECT * FROM documents WHERE id = $1', [documentId]);
    if (docs.length === 0) {
      throw new EnterpriseError(ERROR_CODES.NOT_FOUND, 'Document not found', { statusCode: 404 });
    }
    docRecord = docs[0];
  }

  exportBundle['executive_summary'] = {
    export_id: exportId,
    generated_at: new Date().toISOString(),
    document_id: documentId,
    tenant_id: tenantId,
    document_name: docRecord?.original_name || docRecord?.filename || 'Portfolio Audit',
    sha256: docRecord?.sha256 || 'SHA-256 NOT_ASSESSED',
    risk_score: docRecord?.risk_score ?? 'NOT_ASSESSED',
    analysis_status: docRecord?.analysis_status || 'UNKNOWN',
    confidentiality_notice: 'Deciva Authoritative Evidence-Backed Audit Package'
  };

  const { rows: workflows } = documentId
    ? await db.query('SELECT * FROM contract_decision_workflows WHERE document_id = $1 ORDER BY created_at ASC', [documentId])
    : await db.query('SELECT * FROM contract_decision_workflows ORDER BY created_at ASC LIMIT 100');

  const { rows: comments } = documentId
    ? await db.query(`
        SELECT c.* FROM contract_decision_comments c
        JOIN contract_decision_workflows w ON c.decision_id = w.id
        WHERE w.document_id = $1
      `, [documentId])
    : await db.query('SELECT * FROM contract_decision_comments LIMIT 100');

  exportBundle['decision_timeline'] = {
    workflows: scrubSensitiveData(workflows),
    comments: scrubSensitiveData(comments)
  };

  let riskFactors = [];
  try {
    const { rows: rf } = documentId
      ? await db.query('SELECT * FROM document_risk_factors WHERE document_id = $1', [documentId])
      : await db.query('SELECT * FROM document_risk_factors LIMIT 100');
    riskFactors = rf;
  } catch (e) {
    // If document_risk_factors uses doc_id or not populated
    riskFactors = [{ category: 'OVERALL_RISK', score: docRecord?.risk_score ?? 'NOT_ASSESSED' }];
  }

  exportBundle['risk_register'] = {
    overall_score: docRecord?.risk_score ?? 'NOT_ASSESSED',
    risk_factors: scrubSensitiveData(riskFactors)
  };

  let clauses = [];
  try {
    const { rows: cl } = documentId
      ? await db.query('SELECT * FROM document_clauses WHERE document_id = $1', [documentId])
      : await db.query('SELECT * FROM document_clauses LIMIT 100');
    clauses = cl;
  } catch (e) {
    clauses = [];
  }

  exportBundle['evidence_references'] = {
    total_clauses: clauses.length,
    grounded_clauses: scrubSensitiveData(clauses)
  };

  let findings = [];
  try {
    const { rows: fd } = documentId
      ? await db.query('SELECT * FROM contract_compliance_findings WHERE document_id = $1', [documentId])
      : await db.query('SELECT * FROM contract_compliance_findings LIMIT 100');
    findings = fd;
  } catch (e) {
    findings = [];
  }

  exportBundle['governance_findings'] = {
    total_findings: findings.length,
    findings: scrubSensitiveData(findings)
  };

  let actions = [];
  try {
    const { rows: ac } = documentId
      ? await db.query('SELECT * FROM contract_actions WHERE document_id = $1', [documentId])
      : await db.query('SELECT * FROM contract_actions LIMIT 100');
    actions = ac;
  } catch (e) {
    actions = [];
  }

  exportBundle['approval_history'] = {
    total_actions: actions.length,
    actions: scrubSensitiveData(actions)
  };

  let monEvents = [];
  try {
    const { rows: me } = documentId
      ? await db.query('SELECT * FROM contract_monitoring_events WHERE document_id = $1', [documentId])
      : await db.query('SELECT * FROM contract_monitoring_events LIMIT 100');
    monEvents = me;
  } catch (e) {
    monEvents = [];
  }

  exportBundle['monitoring_events'] = {
    total_events: monEvents.length,
    events: scrubSensitiveData(monEvents)
  };

  let intQuery = 'SELECT * FROM integration_event_outbox WHERE 1=1';
  const intParams = [];
  if (tenantId) {
    intParams.push(tenantId);
    intQuery += ` AND tenant_id = $${intParams.length}`;
  }
  intQuery += ' ORDER BY created_at DESC LIMIT 50';
  const { rows: outbox } = await db.query(intQuery, intParams);

  exportBundle['integration_events'] = {
    outbox_events: scrubSensitiveData(outbox)
  };

  const { rows: auditBlocks } = await db.query(
    'SELECT block_index, action, details_json, prev_hash, hash, created_at FROM blockchain_audit ORDER BY block_index DESC LIMIT 50'
  );

  let chainIntegrityValid = true;
  for (let i = 0; i < auditBlocks.length - 1; i++) {
    const current = auditBlocks[i];
    const prev = auditBlocks[i + 1];
    if (current.prev_hash && current.prev_hash !== prev.hash) {
      chainIntegrityValid = false;
      break;
    }
  }

  const ledgerVerification = {
    chain_valid: chainIntegrityValid,
    blocks_inspected: auditBlocks.length,
    latest_block: auditBlocks[0] || null,
    hash_algorithm: 'SHA-256'
  };
  exportBundle['cryptographic_audit_ledger_verification'] = ledgerVerification;
  exportBundle['blockchain_ledger_verification'] = ledgerVerification; // backward-compatible deprecated alias

  const manifest = {
    export_id: exportId,
    generated_at: new Date().toISOString(),
    generator: 'Deciva Enterprise Audit Exporter v2.0',
    secret_scrubbing_applied: true,
    file_checksums: {}
  };

  for (const [sectionName, sectionData] of Object.entries(exportBundle)) {
    const serialized = JSON.stringify(sectionData, null, 2);
    const hash = crypto.createHash('sha256').update(serialized).digest('hex');
    manifest.file_checksums[`${sectionName}.json`] = {
      sha256: hash,
      size_bytes: Buffer.byteLength(serialized, 'utf8')
    };
  }

  exportBundle['manifest'] = manifest;

  // Write bundle to storage
  const bundleFilename = `audit_package_${documentId || 'tenant'}_${exportId}.json`;
  const bundlePath = path.join(AUDIT_EXPORTS_DIR, bundleFilename);
  fs.writeFileSync(bundlePath, JSON.stringify(exportBundle, null, 2), 'utf8');

  // Overall bundle SHA-256
  const overallBundleHash = crypto.createHash('sha256').update(fs.readFileSync(bundlePath)).digest('hex');

  await recordAudit(userId, 'CRYPTOGRAPHIC_AUDIT_EXPORT_GENERATED', {
    export_id: exportId,
    document_id: documentId,
    tenant_id: tenantId,
    bundle_hash: overallBundleHash,
    duration_ms: Date.now() - startTime
  });

  return {
    success: true,
    export_id: exportId,
    filename: bundleFilename,
    storage_path: bundlePath,
    bundle_sha256: overallBundleHash,
    sections_count: Object.keys(exportBundle).length,
    manifest: manifest.file_checksums,
    generated_at: manifest.generated_at
  };
}

module.exports = {
  scrubSensitiveData,
  generateCryptographicAuditExport
};
