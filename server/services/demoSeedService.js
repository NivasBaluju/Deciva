/**
 * server/services/demoSeedService.js
 * Curated Demo / Seed Showcase Environment
 * Provides a controlled 5-contract demonstration dataset illustrating the complete
 * 5-to-10 minute Deciva lifecycle narrative:
 * Upload -> Evidence -> Risk -> What-If -> Decision -> Approval -> Governance -> Monitoring -> Audit
 */

const crypto = require('crypto');
const db = require('../db');
const { recordAudit } = require('../utils/audit');
const { sha256 } = require('../utils/crypto');

const DEMO_CONTRACTS = [
  {
    id: 'demo-doc-01-nda',
    filename: 'demo_nda_novatech_apex.pdf.enc',
    original_name: 'Mutual_Non_Disclosure_Agreement_NovaTech_Apex.pdf',
    mime_type: 'application/pdf',
    size: 245100,
    risk_score: 18,
    ocr_confidence: 0.98,
    category: 'NDA',
    extracted_text: `
MUTUAL NON-DISCLOSURE AGREEMENT
This Mutual Non-Disclosure Agreement ("Agreement") is entered into by and between NovaTech Solutions LLC and Apex Dynamics Inc.
1. PURPOSE: The parties wish to explore a business opportunity of mutual interest and may disclose confidential information.
2. CONFIDENTIALITY PERIOD: The recipient party agrees to protect disclosed confidential information for a period of two (2) years from disclosure.
3. EXCLUSIONS: Confidential information does not include information that is publicly known through no breach, was already rightfully possessed, or is independently developed.
4. STANDARD OF CARE: Each party agrees to exercise at least reasonable care in safeguarding the other party's confidential materials.
5. GOVERNING LAW: This Agreement shall be construed in accordance with the laws of the State of Delaware.
    `.trim()
  },
  {
    id: 'demo-doc-02-employment',
    filename: 'demo_employment_vp_eng.pdf.enc',
    original_name: 'Executive_Employment_Proprietary_Rights_VP_Eng.pdf',
    mime_type: 'application/pdf',
    size: 382400,
    risk_score: 42,
    ocr_confidence: 0.96,
    category: 'EMPLOYMENT',
    extracted_text: `
EXECUTIVE EMPLOYMENT & PROPRIETARY RIGHTS AGREEMENT
This Executive Employment Agreement is entered into between Deciva Systems Inc. ("Company") and Jane Doe ("Executive").
1. TITLE & DUTIES: Executive shall serve as Vice President of Systems Engineering, reporting to the Chief Technology Officer.
2. COMPENSATION & INCENTIVES: Base salary of $280,000 annually with equity incentive vesting over a four-year schedule subject to a one-year cliff.
3. PROPRIETARY RIGHTS & INVENTIONS: All intellectual property, patentable inventions, software architectures, and trade secrets authored or invented during employment vest immediately in Company.
4. RESTRICTIVE COVENANTS: Executive agrees to an eighteen (18) month non-solicitation covenant and a twelve (12) month non-competition restriction within specified geographic markets.
5. DISPUTE RESOLUTION: Any dispute arising under this Agreement shall be resolved through binding arbitration in Wilmington, Delaware.
    `.trim()
  },
  {
    id: 'demo-doc-03-vendor',
    filename: 'demo_vendor_panpacific.pdf.enc',
    original_name: 'Global_Logistics_Master_Services_Agreement_PanPacific.pdf',
    mime_type: 'application/pdf',
    size: 512000,
    risk_score: 84,
    ocr_confidence: 0.94,
    category: 'VENDOR',
    extracted_text: `
GLOBAL LOGISTICS & MASTER VENDOR SERVICES AGREEMENT
This Master Services Agreement is entered into between Global Retail Holdings ("Customer") and Pan-Pacific Freight Corp ("Vendor").
1. SERVICES: Vendor shall provide intermodal freight transport and cross-border customs handling across APAC and North American trade lanes.
2. UNLIMITED INDEMNIFICATION: Customer shall unconditionally indemnify, defend, and hold harmless Vendor and its subcontractors from any and all third-party cargo delay, loss, regulatory fines, or supply chain claims without any monetary limitation or liability cap.
3. TERMINATION FOR CONVENIENCE: Vendor may terminate this Agreement immediately for convenience upon three (3) business days prior written notice.
4. CROSS-BORDER DATA TRANSFERS: Customer customer records and shipping manifests will be processed across international transit nodes without Standard Contractual Clauses (SCCs).
5. LIMITATION OF LIABILITY: Vendor's total liability under this Agreement shall under no circumstances exceed one hundred dollars ($100.00).
    `.trim()
  },
  {
    id: 'demo-doc-04-saas',
    filename: 'demo_saas_aetherscale.pdf.enc',
    original_name: 'Enterprise_Cloud_Infrastructure_SLA_AetherScale.pdf',
    mime_type: 'application/pdf',
    size: 420500,
    risk_score: 68,
    ocr_confidence: 0.97,
    category: 'SAAS',
    extracted_text: `
ENTERPRISE CLOUD PLATFORM SUBSCRIPTION & SERVICE LEVEL AGREEMENT
This Agreement governs Enterprise Cloud Platform services provided by AetherScale Systems Inc. ("Provider") to Enterprise Customer ("Client").
1. SERVICE LEVEL COMMITMENT: Provider guarantees 99.95% monthly service availability across all production API clusters.
2. OUTAGE PENALTIES: In the event monthly availability falls below 99.00%, Client is entitled to a 25% recurring subscription fee credit.
3. CURRENT PERFORMANCE ALERT: Monitored uptime across Europe-West cluster for preceding billing period logged at 98.42%, triggering threshold alert and automatic service credit reconciliation.
4. AUDIT & TELEMETRY: Client retains audit access to raw hypervisor telemetry logs and security incident tickets upon 24 hours notice.
5. GOVERNING LAW: Governed by the laws of the State of California.
    `.trim()
  },
  {
    id: 'demo-doc-05-strategic-jda',
    filename: 'demo_jda_quantumbio.pdf.enc',
    original_name: 'Strategic_Joint_Development_Agreement_QuantumBio.pdf',
    mime_type: 'application/pdf',
    size: 678900,
    risk_score: 74,
    ocr_confidence: 0.95,
    category: 'JOINT_VENTURE',
    extracted_text: `
STRATEGIC JOINT DEVELOPMENT & LICENSING AGREEMENT
This Strategic Agreement is entered into between Deciva Innovations LLC and QuantumBio Consortium Inc.
1. COLLABORATION SCOPE: Joint research, development, and commercialization of AI-directed pharmaceutical compliance verification algorithms.
2. BUDGET & FINANCIAL ALLOCATION: Initial joint capital expenditure of $2,500,000 allocated across Phase 1 clinical trial validations.
3. DUAL-SIGNATORY APPROVAL: Any expenditure, IP assignment, or subcontracting agreement exceeding $1,000,000 requires explicit dual-signatory approval from both General Legal Counsel and Vice President of Finance.
4. REGIONAL EXCLUSIVITY & GOVERNANCE EXCEPTION: Parties agree to exclusive commercial licensing in APAC region, requiring formal Board Governance Policy Exception approval under Policy POL-05.
5. INTELLECTUAL PROPERTY CO-OWNERSHIP: Jointly developed algorithms shall be co-owned, with each party retaining perpetual, irrevocable cross-licenses.
    `.trim()
  }
];

/**
 * Checks whether the demo seed dataset is currently installed.
 */
async function getDemoStatus() {
  try {
    const { rows: docs } = await db.query(`
      SELECT id, original_name, risk_score, created_at
      FROM documents
      WHERE id LIKE 'demo-doc-%'
      ORDER BY id ASC
    `);

    const { rows: actionCount } = await db.query(`
      SELECT COUNT(*) as count FROM contract_actions WHERE document_id LIKE 'demo-doc-%'
    `);

    const { rows: eventCount } = await db.query(`
      SELECT COUNT(*) as count FROM contract_monitoring_events WHERE document_id LIKE 'demo-doc-%'
    `);

    const isSeeded = docs.length === DEMO_CONTRACTS.length;

    return {
      is_seeded: isSeeded,
      installed_contracts: docs.length,
      target_contracts: DEMO_CONTRACTS.length,
      demo_actions_count: parseInt(actionCount[0]?.count || '0', 10),
      demo_monitoring_alerts: parseInt(eventCount[0]?.count || '0', 10),
      contracts: docs
    };
  } catch (err) {
    console.error('Error fetching demo status:', err);
    return {
      is_seeded: false,
      installed_contracts: 0,
      target_contracts: DEMO_CONTRACTS.length,
      error: err.message
    };
  }
}

/**
 * Seeds the 5 canonical demo showcase contracts, actions, monitoring events, and workflows.
 */
async function seedDemoDataset(userId) {
  let targetUser = userId;
  if (!targetUser) {
    const { rows } = await db.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    targetUser = rows[0]?.id;
  }
  if (!targetUser) {
    const { rows } = await db.query("SELECT id FROM users LIMIT 1");
    targetUser = rows[0]?.id;
  }
  if (!targetUser) {
    throw new Error('No valid administrative user found in database to associate demo contracts.');
  }

  for (const doc of DEMO_CONTRACTS) {
    const docHash = sha256(Buffer.from(doc.extracted_text));
    await db.query(`
      INSERT INTO documents (
        id, user_id, filename, original_name, mime_type, size, sha256, encrypted,
        extracted_text, ocr_confidence, version_group, version_number, risk_score, analysis_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, 1, $11, 'COMPLETED')
      ON CONFLICT (id) DO UPDATE SET
        original_name = EXCLUDED.original_name,
        extracted_text = EXCLUDED.extracted_text,
        risk_score = EXCLUDED.risk_score,
        ocr_confidence = EXCLUDED.ocr_confidence
    `, [
      doc.id,
      targetUser,
      doc.filename,
      doc.original_name,
      doc.mime_type,
      doc.size,
      docHash,
      doc.extracted_text,
      doc.ocr_confidence,
      doc.id,
      doc.risk_score
    ]);
  }

  await db.query(`
    INSERT INTO contract_actions (
      id, document_id, source_action_id, title, category, priority_score, status, decision,
      owner_id, decision_reason, resolution_notes, is_escalated, escalation_rule, escalation_reason
    ) VALUES (
      'demo-act-01-vendor-indemnity',
      'demo-doc-03-vendor',
      'ACT-POL-02-UNCAPPED-INDEMNITY',
      'Remediate Uncapped Third-Party Cargo Indemnity Clause',
      'LEGAL_RISK',
      92,
      'OPEN',
      'ESCALATE_TO_BOARD',
      $1,
      'Violates POL-02: Exposure exceeds enterprise $5M risk tolerance without Board approval.',
      'Recommend counter-proposing standard 2x annual contract billing limitation of liability.',
      true,
      'HIGH_EXPOSURE_THRESHOLD',
      'Uncapped indemnification flagged by 9-dimension risk scoring engine (Score: 84).'
    ) ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      priority_score = EXCLUDED.priority_score,
      status = EXCLUDED.status
  `, [targetUser]);

  await db.query(`
    INSERT INTO contract_monitoring_events (
      id, document_id, user_id, event_type, severity, priority_score, title, description,
      previous_value, current_value, risk_delta, affected_dimension, deduplication_key, status
    ) VALUES (
      'demo-mon-01-saas-sla-breach',
      'demo-doc-04-saas',
      $1,
      'SLA_BREACH_DETECTED',
      'HIGH',
      88,
      'Monthly Uptime SLA Breached: 98.42% (Commitment: 99.95%)',
      'Europe-West cluster service availability dropped below contractual 99.00% threshold for billing cycle. 25% recurring service credit entitlement initiated.',
      '99.98% (Previous Billing Cycle)',
      '98.42% (Current Measured Uptime)',
      26,
      'OPERATIONAL_RELIABILITY',
      'DEDUP-SLA-AETHERSCALE-2026-09',
      'OPEN'
    ) ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      status = EXCLUDED.status,
      current_value = EXCLUDED.current_value
  `, [targetUser]);

  await db.query(`
    INSERT INTO contract_decision_workflows (
      id, tenant_id, document_id, decision_type, title, description, status,
      created_by, current_owner
    ) VALUES (
      'demo-wf-01-dual-approval',
      $1,
      'demo-doc-05-strategic-jda',
      'DUAL_EXECUTIVE_AUTHORIZATION',
      'Dual-Signatory Approval for $2.5M Capital Commitment & APAC Exclusivity',
      'Mandatory policy requirement under POL-05 for joint commitments > $1,000,000. Legal Counsel signature recorded; VP Finance authorization pending.',
      'PENDING_REVIEW',
      $1,
      $1
    ) ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      status = EXCLUDED.status
  `, [targetUser]);

  await recordAudit(targetUser, 'DEMO_DATASET_SEEDED', {
    contracts_count: DEMO_CONTRACTS.length,
    contract_ids: DEMO_CONTRACTS.map(c => c.id),
    seeded_at: new Date().toISOString()
  });

  return {
    success: true,
    message: 'Curated 5-contract demo showcase environment seeded successfully.',
    contracts_seeded: DEMO_CONTRACTS.length,
    contracts: DEMO_CONTRACTS.map(c => ({ id: c.id, name: c.original_name, risk: c.risk_score, category: c.category }))
  };
}

/**
 * Safely purges only the demo dataset items without touching real production documents.
 */
async function purgeDemoDataset(userId) {
  // Delete workflows
  await db.query("DELETE FROM contract_decision_workflows WHERE document_id LIKE 'demo-doc-%'");
  // Delete monitoring events
  await db.query("DELETE FROM contract_monitoring_events WHERE document_id LIKE 'demo-doc-%'");
  // Delete actions
  await db.query("DELETE FROM contract_actions WHERE document_id LIKE 'demo-doc-%'");
  // Delete documents
  const { rowCount } = await db.query("DELETE FROM documents WHERE id LIKE 'demo-doc-%'");

  await recordAudit(userId, 'DEMO_DATASET_PURGED', {
    purged_documents_count: rowCount,
    purged_at: new Date().toISOString()
  });

  return {
    success: true,
    message: `Purged ${rowCount} demo contracts and all associated demo actions/events.`,
    purged_count: rowCount
  };
}

module.exports = {
  DEMO_CONTRACTS,
  getDemoStatus,
  seedDemoDataset,
  purgeDemoDataset
};
