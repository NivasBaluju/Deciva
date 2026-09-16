const PDFDocument = require('pdfkit');

/**
 * Escapes a single value for RFC-4180 standard CSV.
 */
function escapeCsvValue(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts an array of objects into an RFC-4180 CSV string with deterministic column order.
 */
function toCsv(headers, rows) {
  const headerLine = headers.map(h => escapeCsvValue(h.label || h.key)).join(',');
  const dataLines = rows.map(row => {
    return headers.map(h => escapeCsvValue(row[h.key])).join(',');
  });
  return [headerLine, ...dataLines].join('\r\n');
}

/**
 * Generates formatted JSON export string for complete canonical evidence package.
 */
function generateJsonExport(evidencePackage) {
  return JSON.stringify(evidencePackage, null, 2);
}

/**
 * Generates modular CSV files for contract or portfolio evidence.
 */
function generateCsvExport(type, evidencePackage) {
  const { evidence, manifest } = evidencePackage;

  if (type === 'actions' || type === 'contract_actions') {
    const headers = [
      { key: 'documentId', label: 'Document ID' },
      { key: 'documentName', label: 'Document Name' },
      { key: 'actionId', label: 'Action ID' },
      { key: 'title', label: 'Action Title' },
      { key: 'category', label: 'Category' },
      { key: 'priorityScore', label: 'Priority Score' },
      { key: 'priorityBand', label: 'Priority Band' },
      { key: 'status', label: 'Status' },
      { key: 'decision', label: 'Decision' },
      { key: 'ownerId', label: 'Owner ID' },
      { key: 'dueDate', label: 'Due Date' },
      { key: 'isEscalated', label: 'Is Escalated' },
      { key: 'escalationRule', label: 'Escalation Rule' },
      { key: 'createdAt', label: 'Created At' },
      { key: 'resolvedAt', label: 'Resolved At' }
    ];

    const actions = evidence.workflowActions || [];
    const docName = evidence.subject?.filename || manifest.subject?.documentName || '';
    const docId = evidence.subject?.documentId || manifest.subject?.documentId || '';

    const rows = actions.map(a => ({
      documentId: docId,
      documentName: docName,
      actionId: a.id,
      title: a.title,
      category: a.category,
      priorityScore: a.priorityScore,
      priorityBand: a.priorityBand,
      status: a.status,
      decision: a.decision || '',
      ownerId: a.ownerId || '',
      dueDate: a.dueDate || '',
      isEscalated: a.isEscalated ? 'TRUE' : 'FALSE',
      escalationRule: a.escalationRule || '',
      createdAt: a.createdAt || '',
      resolvedAt: a.resolvedAt || ''
    }));

    return toCsv(headers, rows);
  }

  if (type === 'decisions') {
    const headers = [
      { key: 'decisionId', label: 'Decision ID' },
      { key: 'actionId', label: 'Action ID' },
      { key: 'decision', label: 'Decision' },
      { key: 'reason', label: 'Reason' },
      { key: 'decidedBy', label: 'Decided By (User ID)' },
      { key: 'decidedAt', label: 'Decided At' }
    ];

    const decisions = evidence.decisionLedger || [];
    const rows = decisions.map(d => ({
      decisionId: d.decisionId,
      actionId: d.actionId,
      decision: d.decision,
      reason: d.reason,
      decidedBy: d.decidedBy || '',
      decidedAt: d.decidedAt || ''
    }));

    return toCsv(headers, rows);
  }

  if (type === 'activity') {
    const headers = [
      { key: 'activityId', label: 'Activity ID' },
      { key: 'actionId', label: 'Action ID' },
      { key: 'activityType', label: 'Activity Type' },
      { key: 'actorId', label: 'Actor ID' },
      { key: 'createdAt', label: 'Timestamp' }
    ];

    const activities = evidence.activityAuditTrail || [];
    const rows = activities.map(act => ({
      activityId: act.activityId,
      actionId: act.actionId,
      activityType: act.activityType,
      actorId: act.actorId || '',
      createdAt: act.createdAt || ''
    }));

    return toCsv(headers, rows);
  }

  if (type === 'portfolio_contracts') {
    const headers = [
      { key: 'documentId', label: 'Document ID' },
      { key: 'documentName', label: 'Document Name' },
      { key: 'healthScore', label: 'Health Score' },
      { key: 'healthGrade', label: 'Health Grade' },
      { key: 'totalActions', label: 'Total Actions' },
      { key: 'activeActions', label: 'Active Actions' },
      { key: 'criticalActions', label: 'Critical Actions' },
      { key: 'overdueActions', label: 'Overdue Actions' },
      { key: 'resolutionRate', label: 'Resolution Rate (%)' }
    ];

    const contracts = evidence.contractsHealth || [];
    const rows = contracts.map(c => ({
      documentId: c.documentId,
      documentName: c.documentName,
      healthScore: c.healthScore,
      healthGrade: c.healthGrade,
      totalActions: c.totalActions,
      activeActions: c.activeActions,
      criticalActions: c.criticalActions,
      overdueActions: c.overdueActions,
      resolutionRate: `${c.resolutionRate}%`
    }));

    return toCsv(headers, rows);
  }

  if (type === 'portfolio_actions') {
    const headers = [
      { key: 'documentId', label: 'Document ID' },
      { key: 'documentName', label: 'Document Name' },
      { key: 'actionId', label: 'Action ID' },
      { key: 'actionTitle', label: 'Action Title' },
      { key: 'priorityScore', label: 'Priority Score' },
      { key: 'priorityBand', label: 'Priority Band' },
      { key: 'attentionScore', label: 'Attention Score' },
      { key: 'attentionReasons', label: 'Attention Reasons' },
      { key: 'daysOverdue', label: 'Days Overdue' },
      { key: 'status', label: 'Status' },
      { key: 'isEscalated', label: 'Is Escalated' },
      { key: 'ownerId', label: 'Owner ID' }
    ];

    const queue = evidence.attentionQueue || [];
    const rows = queue.map(item => ({
      documentId: item.documentId,
      documentName: item.documentName,
      actionId: item.actionId,
      actionTitle: item.actionTitle,
      priorityScore: item.priorityScore,
      priorityBand: item.priorityBand,
      attentionScore: item.attentionScore,
      attentionReasons: (item.attentionReasons || []).join('; '),
      daysOverdue: item.daysOverdue,
      status: item.status,
      isEscalated: item.isEscalated ? 'TRUE' : 'FALSE',
      ownerId: item.ownerId || ''
    }));

    return toCsv(headers, rows);
  }

  if (type === 'batches' || type === 'governed_batches') {
    const headers = [
      { key: 'batchId', label: 'Batch ID' },
      { key: 'operationType', label: 'Operation Type' },
      { key: 'mode', label: 'Execution Mode' },
      { key: 'status', label: 'Status' },
      { key: 'requestedCount', label: 'Requested Count' },
      { key: 'eligibleCount', label: 'Eligible Count' },
      { key: 'executedCount', label: 'Executed Count' },
      { key: 'blockedCount', label: 'Blocked Count' },
      { key: 'policyVersion', label: 'Policy Version' },
      { key: 'policyFlags', label: 'Policy Flags' },
      { key: 'previewHash', label: 'Preview Hash' },
      { key: 'requesterId', label: 'Requester ID' },
      { key: 'approvedBy', label: 'Approved By' },
      { key: 'approvedAt', label: 'Approved At' },
      { key: 'approvalComments', label: 'Approval Comments' },
      { key: 'createdAt', label: 'Created At' },
      { key: 'completedAt', label: 'Completed At' }
    ];

    const batches = evidence.governedBatches || evidence.governedOperationsHistory || [];
    const rows = batches.map(b => ({
      batchId: b.batchId,
      operationType: b.operationType,
      mode: b.mode,
      status: b.status,
      requestedCount: b.requestedCount,
      eligibleCount: b.eligibleCount,
      executedCount: b.executedCount,
      blockedCount: b.blockedCount,
      policyVersion: b.policyVersion,
      policyFlags: Array.isArray(b.policyFlags) ? b.policyFlags.join('; ') : '',
      previewHash: b.previewHash || '',
      requesterId: b.requesterId || '',
      approvedBy: b.approvedBy || '',
      approvedAt: b.approvedAt || '',
      approvalComments: b.approvalComments || '',
      createdAt: b.createdAt || '',
      completedAt: b.completedAt || ''
    }));

    return toCsv(headers, rows);
  }

  throw new Error(`Unsupported CSV export type: ${type}`);
}

/**
 * Generates an executive compliance audit report PDF buffer.
 */
function generatePdfExport(exportType, evidencePackage) {
  return new Promise((resolve, reject) => {
    try {
      const { manifest, evidence } = evidencePackage;
      const isPortfolio = exportType === 'PORTFOLIO_GOVERNANCE_AUDIT' || manifest?.exportType === 'PORTFOLIO_GOVERNANCE_AUDIT';

      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        bufferPages: true,
        info: {
          Title: isPortfolio ? 'Deciva — Portfolio Governance Audit' : `Deciva — Contract Compliance Audit (${manifest?.subject?.documentName || 'Contract'})`,
          Author: 'Deciva Compliance Engine',
          Subject: 'Executive Compliance & Integrity-Verifiable Audit Evidence',
          Keywords: 'compliance, audit, governance, integrity, contract intelligence'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

  // Helper colors
  const PRIMARY = '#0F172A';
  const ACCENT = '#2563EB';
  const MUTED = '#64748B';
  const BORDER = '#CBD5E1';
  const BOX_BG = '#F8FAFC';

  doc.rect(40, 40, 515, 45).fill('#0F172A');
  doc.fillColor('#FFFFFF').fontSize(16).font('Helvetica-Bold')
    .text('DECIVA', 55, 48);
  doc.fontSize(10).font('Helvetica')
    .text('ENTERPRISE CONTRACT GOVERNANCE & COMPLIANCE AUDIT', 55, 66);

  doc.moveDown(2);
  let y = 100;

  doc.fillColor(PRIMARY).fontSize(14).font('Helvetica-Bold')
    .text(isPortfolio ? 'Contract Portfolio Governance Audit' : `Contract Compliance Audit: ${manifest.subject?.documentName || 'Document'}`, 40, y);
  y += 20;

  doc.fillColor(MUTED).fontSize(9).font('Helvetica')
    .text(`Export Type: ${manifest.exportType}  |  Schema Version: v${manifest.evidenceSchemaVersion}  |  Generated: ${new Date(manifest.generatedAt).toUTCString()}`, 40, y);
  y += 20;

  doc.rect(40, y, 515, 65).fillAndStroke(BOX_BG, BORDER);
  doc.fillColor(ACCENT).fontSize(10).font('Helvetica-Bold')
    .text('CANONICAL EVIDENCE SHA-256 CONTENT HASH', 50, y + 10);
  
  doc.fillColor('#0F172A').fontSize(9).font('Courier-Bold')
    .text(manifest.integrity?.canonicalHash || 'N/A', 50, y + 26);

  doc.fillColor(MUTED).fontSize(7.5).font('Helvetica')
    .text('Notice: This PDF is a human-readable presentation. The authoritative machine-verifiable evidence is the canonical JSON payload.', 50, y + 44);
  y += 80;

  if (!isPortfolio) {
    // Contract Level Report
    // Subject Details
    doc.fillColor(PRIMARY).fontSize(11).font('Helvetica-Bold').text('1. Contract Subject Information', 40, y);
    y += 16;
    doc.fontSize(8.5).font('Helvetica').fillColor('#334155');
    doc.text(`Document ID: ${evidence.subject?.documentId || 'N/A'}`, 50, y); y += 12;
    doc.text(`Filename: ${evidence.subject?.filename || 'N/A'}`, 50, y); y += 12;
    doc.text(`Original Size: ${evidence.subject?.sizeBytes || 0} bytes  |  MIME Type: ${evidence.subject?.mimeType || 'N/A'}`, 50, y); y += 12;
    doc.text(`Uploaded: ${evidence.subject?.createdAt || 'N/A'}`, 50, y); y += 18;

    // Operational Health Summary
    const health = evidence.operationalHealthAtExport || {};
    doc.fillColor(PRIMARY).fontSize(11).font('Helvetica-Bold').text('2. Operational Governance Health', 40, y);
    y += 16;
    doc.fontSize(8.5).font('Helvetica').fillColor('#334155');
    doc.text(`Health Score: ${health.healthScore ?? 'N/A'} / 100  (Grade: ${health.healthGrade || 'N/A'})  |  Engine Formula: v${health.formulaVersion || '1.0'}`, 50, y); y += 12;
    doc.text(`Actions Resolution Rate: ${health.resolutionMetrics?.resolutionRate || 0}%  (${health.resolutionMetrics?.resolvedActions || 0}/${health.resolutionMetrics?.totalActions || 0} Resolved)`, 50, y); y += 12;
    doc.text(`Deadline Compliance: ${health.deadlineMetrics?.onTimeRate || 100}% on-time  |  Overdue Actions: ${health.deadlineMetrics?.overdueActions || 0}`, 50, y); y += 18;

    // Intelligence Snapshot
    const snap = evidence.historicalIntelligenceSnapshot;
    doc.fillColor(PRIMARY).fontSize(11).font('Helvetica-Bold').text('3. Historical AI Intelligence Snapshot (Phase 6.4)', 40, y);
    y += 16;
    if (snap) {
      doc.fontSize(8.5).font('Helvetica').fillColor('#334155');
      doc.text(`Snapshot Date: ${snap.createdAt ? new Date(snap.createdAt).toUTCString() : 'N/A'}  |  AI Health Score: ${snap.healthScore}/100`, 50, y); y += 12;
      doc.text(`Risk Counts: Critical (${snap.criticalCount}), Important (${snap.importantCount}), Monitoring (${snap.monitoringCount}), Healthy (${snap.healthyCount})`, 50, y); y += 12;
      if (snap.executiveSummary) {
        doc.text(`Summary: ${snap.executiveSummary.substring(0, 200)}...`, 50, y, { width: 490 });
        y += 24;
      }
    } else {
      doc.fontSize(8.5).font('Helvetica-Oblique').fillColor(MUTED).text('No historical AI snapshot recorded for this document.', 50, y);
      y += 16;
    }
    y += 6;

    // Workflow Actions Summary Table
    if (y > 650) { doc.addPage(); y = 50; }
    doc.fillColor(PRIMARY).fontSize(11).font('Helvetica-Bold').text('4. Workflow Action Items', 40, y);
    y += 16;
    const actions = evidence.workflowActions || [];
    if (actions.length > 0) {
      // Table header
      doc.rect(40, y, 515, 18).fill('#E2E8F0');
      doc.fillColor(PRIMARY).fontSize(8).font('Helvetica-Bold');
      doc.text('Title', 45, y + 5, { width: 180 });
      doc.text('Category', 230, y + 5, { width: 80 });
      doc.text('Score', 315, y + 5, { width: 40 });
      doc.text('Band', 360, y + 5, { width: 50 });
      doc.text('Status', 415, y + 5, { width: 60 });
      doc.text('Escalated', 480, y + 5, { width: 70 });
      y += 20;

      doc.font('Helvetica').fontSize(7.5).fillColor('#1E293B');
      for (const act of actions.slice(0, 15)) {
        if (y > 740) { doc.addPage(); y = 50; }
        doc.text(act.title || 'Untitled', 45, y, { width: 180, lineBreak: false });
        doc.text(act.category || 'GENERAL', 230, y, { width: 80, lineBreak: false });
        doc.text(String(act.priorityScore || 0), 315, y, { width: 40 });
        doc.text(act.priorityBand || 'LOW', 360, y, { width: 50 });
        doc.text(act.status || 'OPEN', 415, y, { width: 60 });
        doc.text(act.isEscalated ? `YES (${act.escalationRule || 'AUTO'})` : 'NO', 480, y, { width: 70 });
        y += 14;
      }
      if (actions.length > 15) {
        doc.fillColor(MUTED).fontSize(7.5).text(`... and ${actions.length - 15} additional action items in canonical JSON export.`, 45, y);
        y += 14;
      }
    } else {
      doc.fontSize(8.5).font('Helvetica-Oblique').fillColor(MUTED).text('No workflow actions recorded.', 50, y);
      y += 16;
    }
    y += 10;

    // Decision Ledger Summary
    if (y > 650) { doc.addPage(); y = 50; }
    doc.fillColor(PRIMARY).fontSize(11).font('Helvetica-Bold').text('5. Append-Only Decision Ledger', 40, y);
    y += 16;
    const decisions = evidence.decisionLedger || [];
    if (decisions.length > 0) {
      for (const d of decisions.slice(0, 10)) {
        if (y > 740) { doc.addPage(); y = 50; }
        doc.fontSize(8).font('Helvetica-Bold').fillColor(PRIMARY)
          .text(`[${d.decision}] Recorded on ${d.decidedAt ? new Date(d.decidedAt).toUTCString() : 'N/A'} by User ${d.decidedBy || 'System'}`, 50, y);
        y += 11;
        if (d.reason) {
          doc.fontSize(7.5).font('Helvetica').fillColor('#475569').text(`Reason: ${d.reason}`, 60, y, { width: 480 });
          y += 11;
        }
      }
    } else {
      doc.fontSize(8.5).font('Helvetica-Oblique').fillColor(MUTED).text('No decisions recorded in ledger.', 50, y);
      y += 16;
    }

    const batches = evidence.governedOperationsHistory || [];
    if (batches.length > 0) {
      if (y > 650) { doc.addPage(); y = 50; }
      doc.fillColor(PRIMARY).fontSize(11).font('Helvetica-Bold').text('6. Governed Operations & Separation-of-Duties Lineage', 40, y);
      y += 16;
      for (const b of batches.slice(0, 10)) {
        if (y > 740) { doc.addPage(); y = 50; }
        const flagsStr = (b.policyFlags || []).join(', ') || 'NONE';
        doc.fontSize(8).font('Helvetica-Bold').fillColor(PRIMARY)
          .text(`Batch ${b.batchId.slice(0, 8)}… [${b.operationType} - ${b.status}]`, 50, y);
        y += 11;
        doc.fontSize(7.5).font('Helvetica').fillColor('#334155')
          .text(`Executed: ${b.executedCount}/${b.requestedCount} | Policy v${b.policyVersion} (${flagsStr}) | Preview Hash: ${(b.previewHash || '').slice(0, 16)}…`, 50, y);
        y += 11;
        if (b.approvedBy) {
          doc.text(`Approved by: ${b.approvedBy} at ${b.approvedAt || 'N/A'}${b.approvalComments ? ` — Note: "${b.approvalComments}"` : ''}`, 50, y);
          y += 11;
        }
        y += 4;
      }
    }
  } else {
    // Portfolio Level Report
    const summary = evidence.portfolioSummary || {};
    const health = evidence.portfolioHealth || {};

    doc.fillColor(PRIMARY).fontSize(11).font('Helvetica-Bold').text('1. Portfolio Executive Summary', 40, y);
    y += 16;
    doc.fontSize(8.5).font('Helvetica').fillColor('#334155');
    doc.text(`Total Managed Contracts: ${summary.totalContracts || 0}  |  Total Workflow Actions: ${summary.totalActions || 0}`, 50, y); y += 12;
    doc.text(`Active Backlog: ${summary.activeActions || 0}  |  Resolved: ${summary.resolvedActions || 0}  (${summary.resolutionRate || 0}% resolution rate)`, 50, y); y += 12;
    doc.text(`Critical Risk Items: ${summary.criticalActions || 0}  |  Active Escalations: ${summary.escalatedActions || 0}  |  Overdue: ${summary.overdueActions || 0}`, 50, y); y += 18;

    doc.fillColor(PRIMARY).fontSize(11).font('Helvetica-Bold').text('2. Portfolio Health Index', 40, y);
    y += 16;
    doc.fontSize(8.5).font('Helvetica').fillColor('#334155');
    doc.text(`Portfolio Health Score: ${health.portfolioHealthScore ?? 'N/A'} / 100  (Grade: ${health.grade || 'N/A'})`, 50, y); y += 12;
    doc.text(`Weighted Document Base: ${health.weightedBase || 0}  |  Escalation Penalty: -${health.escalationPenalty || 0}  |  Critical Overdue Penalty: -${health.criticalOverduePenalty || 0}`, 50, y); y += 18;

    // Contracts Table
    if (y > 650) { doc.addPage(); y = 50; }
    doc.fillColor(PRIMARY).fontSize(11).font('Helvetica-Bold').text('3. Contract Health Rankings (Riskiest First)', 40, y);
    y += 16;
    const contracts = evidence.contractsHealth || [];
    if (contracts.length > 0) {
      doc.rect(40, y, 515, 18).fill('#E2E8F0');
      doc.fillColor(PRIMARY).fontSize(8).font('Helvetica-Bold');
      doc.text('Contract Name', 45, y + 5, { width: 220 });
      doc.text('Health', 270, y + 5, { width: 50 });
      doc.text('Grade', 325, y + 5, { width: 60 });
      doc.text('Active / Total', 390, y + 5, { width: 75 });
      doc.text('Resolution', 470, y + 5, { width: 80 });
      y += 20;

      doc.font('Helvetica').fontSize(7.5).fillColor('#1E293B');
      for (const c of contracts.slice(0, 15)) {
        if (y > 740) { doc.addPage(); y = 50; }
        doc.text(c.documentName || 'Contract', 45, y, { width: 220, lineBreak: false });
        doc.text(`${c.healthScore}/100`, 270, y, { width: 50 });
        doc.text(c.healthGrade || 'N/A', 325, y, { width: 60 });
        doc.text(`${c.activeActions} / ${c.totalActions}`, 390, y, { width: 75 });
        doc.text(`${c.resolutionRate}%`, 470, y, { width: 80 });
        y += 14;
      }
    } else {
      doc.fontSize(8.5).font('Helvetica-Oblique').fillColor(MUTED).text('No contracts found in portfolio.', 50, y);
      y += 16;
    }

    const pBatches = evidence.governedBatches || [];
    if (pBatches.length > 0) {
      if (y > 650) { doc.addPage(); y = 50; }
      doc.fillColor(PRIMARY).fontSize(11).font('Helvetica-Bold').text('4. Governed Portfolio Operations & Approval Lineage', 40, y);
      y += 16;
      for (const b of pBatches.slice(0, 10)) {
        if (y > 740) { doc.addPage(); y = 50; }
        const flagsStr = (b.policyFlags || []).join(', ') || 'NONE';
        doc.fontSize(8).font('Helvetica-Bold').fillColor(PRIMARY)
          .text(`Batch ${b.batchId.slice(0, 8)}… [${b.operationType} - ${b.status}]`, 50, y);
        y += 11;
        doc.fontSize(7.5).font('Helvetica').fillColor('#334155')
          .text(`Executed: ${b.executedCount}/${b.requestedCount} | Policy v${b.policyVersion} (${flagsStr}) | Preview Hash: ${(b.previewHash || '').slice(0, 16)}…`, 50, y);
        y += 11;
        if (b.approvedBy) {
          doc.text(`Approved by: ${b.approvedBy} at ${b.approvedAt || 'N/A'}${b.approvalComments ? ` — Note: "${b.approvalComments}"` : ''}`, 50, y);
          y += 11;
        }
        y += 4;
      }
    }
  }

  // Footer / Verification instructions on final page
  doc.moveDown(2);
  const bottomY = 770;
  doc.rect(40, bottomY, 515, 30).fill('#F1F5F9');
  doc.fillColor(MUTED).fontSize(7).font('Helvetica')
    .text('Verification: To verify payload integrity, submit the canonical JSON export to POST /api/compliance/verify or use the Deciva UI.', 50, bottomY + 7);
  doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  escapeCsvValue,
  toCsv,
  generateJsonExport,
  generateCsvExport,
  generatePdfExport
};
