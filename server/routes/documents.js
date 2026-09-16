const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { encryptBuffer, decryptBuffer, sha256 } = require('../utils/crypto');
const { recordAudit } = require('../utils/audit');
const {
  extractClauses, simplifyText, ragAnswer, riskScore, calculateCalibratedDocumentRisk,
  negotiationSuggestions, complianceCheck, extractDeadlines,
  detectPII, redactPII, diffDocuments
} = require('../utils/aiEngine');
const { askGeminiOrFallback } = require('../utils/gemini');
const { getDocumentActions, syncDocumentActions } = require('./contractActions');
const { aiLimiter } = require('../middleware/rateLimiter');
const {
  getDocumentDecisionIntelligence,
  applyDecisionAction
} = require('../services/contractDecisionService');
const {
  evaluateContractMonitoring,
  getDocumentChanges,
  acknowledgeMonitoringEvent
} = require('../services/contractMonitoringService');
const {
  createDecisionWorkflow,
  listDocumentDecisions
} = require('../services/contractDecisionWorkflowService');
const { evaluateApprovalPolicy } = require('../services/approvalPolicyService');
const policyComplianceService = require('../services/policyComplianceService');

const router = express.Router();
const uploadsDir = path.join(__dirname, '..', '..', 'data', 'uploads');

const { recordAiTelemetry } = require('../utils/aiTelemetry');
const logger = require('../utils/logger');
const { getInternalServiceKey } = require('../services/productionConfigService');

const AI_MICROSERVICE_URL = (process.env.AI_MICROSERVICE_URL || 'http://127.0.0.1:5001').replace(/\/+$/, '');
const INTERNAL_SERVICE_KEY = getInternalServiceKey();

function getInternalHeaders(reqOrExtra = {}, extraHeaders = {}) {
  let req = null;
  let extras = {};
  if (reqOrExtra && (reqOrExtra.headers || reqOrExtra.correlationId)) {
    req = reqOrExtra;
    extras = extraHeaders;
  } else {
    extras = reqOrExtra;
  }
  const headers = {
    'x-internal-service-key': INTERNAL_SERVICE_KEY,
    ...extras
  };
  if (req && req.correlationId) {
    headers['x-correlation-id'] = req.correlationId;
  }
  return headers;
}

async function authorizeDocument(id, user) {
  const { rows } = await db.query(
    'SELECT id, user_id, original_name, filename, extracted_text, risk_score, created_at FROM documents WHERE id = $1',
    [id]
  );
  if (rows.length === 0) {
    return { errorStatus: 404, errorMessage: 'Document not found' };
  }
  if (rows[0].user_id !== user.id && user.role !== 'admin') {
    return { errorStatus: 403, errorMessage: 'Unauthorized access to document' };
  }
  return { document: rows[0] };
}

function formatFallbackClauses(text = '') {
  const extracted = extractClauses(text);
  const detected = [];
  const standardTypes = [
    { key: 'confidentiality', label: 'Confidentiality' },
    { key: 'termination', label: 'Termination' },
    { key: 'payment', label: 'Payment Terms' },
    { key: 'intellectual_property', label: 'Intellectual Property' },
    { key: 'penalties', label: 'Liability & Indemnification' },
    { key: 'governing_law', label: 'Governing Law' },
    { key: 'jurisdiction', label: 'Jurisdiction' },
    { key: 'parties', label: 'Parties' },
    { key: 'dates', label: 'Key Dates' }
  ];

  const detectedKeys = new Set();
  for (const [key, clauseEntry] of Object.entries(extracted || {})) {
    // extractClauses returns: { label: string, found: boolean, excerpts: Array<{ text: string, sentenceIndex: number }> }
    // We also support defensive variations (e.g. array of strings or array of excerpt objects)
    let excerpts = [];
    let isFound = false;

    if (Array.isArray(clauseEntry)) {
      excerpts = clauseEntry;
      isFound = clauseEntry.length > 0;
    } else if (clauseEntry && typeof clauseEntry === 'object') {
      excerpts = Array.isArray(clauseEntry.excerpts) ? clauseEntry.excerpts : [];
      isFound = clauseEntry.found === true || excerpts.length > 0;
    }

    if (isFound && excerpts.length > 0) {
      const typeInfo = standardTypes.find(s => s.key === key) || { label: clauseEntry?.label || key };
      detectedKeys.add(key);
      const firstExcerpt = excerpts[0];
      const snippetText = (typeof firstExcerpt === 'string'
        ? firstExcerpt
        : (firstExcerpt?.text || '')
      ).trim();

      detected.push({
        clauseType: typeInfo.label,
        clause_type: key,
        type: typeInfo.label,
        confidence: null,
        confidenceMethodology: 'deterministic_pattern_match',
        effectiveConfidence: null,
        detectionMethod: 'RULE_HEURISTIC',
        status: 'CONFIRMED',
        snippet: snippetText,
        extractedSnippet: snippetText,
        text: snippetText,
        excerpts: excerpts.map(e => (typeof e === 'string' ? { text: e } : e))
      });
    }
  }

  const missing = standardTypes
    .filter(s => !detectedKeys.has(s.key))
    .map(s => s.label);

  return {
    detected,
    missing,
    auditItems: [],
    checklistScore: Math.round((detected.length / standardTypes.length) * 100)
  };
}

function formatFallbackDeadlines(text = '') {
  const raw = extractDeadlines(text) || [];
  return raw.map((d, idx) => ({
    id: `dl-${idx + 1}`,
    deadlineDate: d.date || d.deadlineDate || null,
    relativeDeadline: d.relative || d.relativeDeadline || null,
    deadlineType: d.type || d.deadlineType || 'MILESTONE',
    sourceText: d.text || d.sourceText || 'Contract timeline trigger',
    confidence: d.confidence || 0.88
  }));
}

function formatFallbackRisks(text = '') {
  const r = calculateCalibratedDocumentRisk(text);
  const score = r.score;
  const level = r.level;
  const factors = (r.factors || []).map(f => ({
    riskType: f.riskType || 'CONTRACT_TERM',
    severity: f.severity || 'MEDIUM',
    reason: f.reason || 'Contractual liability observation',
    riskPoints: f.riskPoints || 15,
    vector: f.riskType || 'CONTRACT_TERM',
    score: f.riskPoints || 15
  }));
  return { score, level, factors };
}

function fallbackGetAnalysis(doc) {
  const text = doc.extracted_text || '';
  const clauses = formatFallbackClauses(text);
  const deadlines = formatFallbackDeadlines(text);
  const riskObj = formatFallbackRisks(text);

  return {
    documentId: doc.id,
    analysisStatus: 'COMPLETED',
    risk: {
      score: riskObj.score,
      level: riskObj.level,
      scoreLabel: `${riskObj.score}/100`
    },
    riskScore: riskObj.score,
    risk_score: riskObj.score,
    riskLevel: riskObj.level,
    riskFactors: riskObj.factors,
    factors: riskObj.factors,
    clauses: {
      detected: clauses.detected,
      missing: clauses.missing,
      auditItems: clauses.auditItems,
      checklistScore: clauses.checklistScore
    },
    deadlines,
    executiveSummary: `Contract evaluation executed via Deciva zero-trust legal engine. Detected ${clauses.detected.length} core clauses, ${deadlines.length} key milestones, with calculated portfolio risk of ${riskObj.score}/100 (${riskObj.level}).`
  };
}

function fallbackGetIntelligence(doc) {
  const analysis = fallbackGetAnalysis(doc);
  const healthScore = Math.max(10, 100 - analysis.riskScore);
  return {
    documentId: doc.id,
    healthScore,
    executiveSummary: analysis.executiveSummary,
    metrics: {
      criticalCount: analysis.riskScore >= 60 ? 2 : 0,
      importantCount: analysis.riskScore >= 30 ? 3 : 1,
      monitoringCount: analysis.deadlines.length,
      healthyCount: analysis.clauses.detected.length
    },
    conflicts: [],
    actionPlan: [
      {
        id: `act-1`,
        source_action_id: `act-1`,
        title: 'Review Limitation of Liability & Indemnity Caps',
        category: 'GOVERNANCE',
        priority_score: analysis.riskScore,
        status: 'OPEN'
      }
    ]
  };
}

function fallbackGetNegotiationOpportunities(doc) {
  const text = doc.extracted_text || '';
  const suggestions = negotiationSuggestions(text) || [];
  const clauses = formatFallbackClauses(text);
  const opps = [];

  suggestions.forEach((s, idx) => {
    opps.push({
      clauseId: `sug-${idx + 1}`,
      clauseType: s.issue ? s.issue.toUpperCase().replace(/\s+/g, '_') : 'GENERAL_CLAUSE',
      originalText: s.clause,
      riskSeverity: (s.risk || 'medium').toUpperCase(),
      identifiedImbalance: s.issue,
      strategy: s.recommendation,
      suggestedRevision: s.suggestedText
    });
  });

  if (opps.length === 0 && clauses.detected.length > 0) {
    clauses.detected.slice(0, 5).forEach((c, idx) => {
      opps.push({
        clauseId: `clause-${idx + 1}`,
        clauseType: c.type || c.clauseType || c.clause_type || 'GENERAL_CLAUSE',
        originalText: c.text || c.snippet || c.extractedSnippet || '',
        riskSeverity: c.riskLevel || 'LOW',
        identifiedImbalance: 'Standard clause provision requiring balanced risk governance.',
        strategy: 'Ensure mutual terms and fair commercial risk allocation.',
        suggestedRevision: c.text || c.snippet || c.extractedSnippet || ''
      });
    });
  }

  if (opps.length === 0) {
    opps.push({
      clauseId: 'clause-1',
      clauseType: 'GOVERNANCE_TERMS',
      originalText: text.slice(0, 200) || 'Contractual rights and obligations under this agreement.',
      riskSeverity: 'LOW',
      identifiedImbalance: 'General terms review recommended.',
      strategy: 'Standardize reciprocal obligations and dispute resolution mechanisms.',
      suggestedRevision: 'The parties agree to perform all obligations in good faith and resolve disputes amicably.'
    });
  }

  return opps;
}

function computeNodeWordDiff(originalText, proposedText) {
  const Diff = require('diff');
  const parts = Diff.diffWordsWithSpace(originalText || '', proposedText || '');
  const operations = [];
  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  for (const part of parts) {
    if (part.added) {
      operations.push({ type: 'insert', text: part.value });
      additions += (part.value.match(/\w+/g) || []).length;
    } else if (part.removed) {
      operations.push({ type: 'delete', text: part.value });
      deletions += (part.value.match(/\w+/g) || []).length;
    } else {
      operations.push({ type: 'equal', text: part.value });
      unchanged += (part.value.match(/\w+/g) || []).length;
    }
  }

  return {
    operations,
    summary: { additions, deletions, unchanged },
    unifiedDiff: `--- Original Clause\n+++ Negotiated Revision\n- ${originalText}\n+ ${proposedText}`
  };
}

function fallbackNegotiate(doc, clauseId, clauseType, mode = 'balanced', clauseRow = null) {
  let targetSnippet = '';
  let resolvedClauseId = clauseId || 'clause-1';
  let resolvedType = clauseType || 'GENERAL_PROVISION';
  let identifiedImbalance = 'General terms review recommended.';
  let strategy = 'Standardize reciprocal obligations and dispute resolution mechanisms.';

  if (clauseRow && (clauseRow.extracted_snippet || clauseRow.clause_text)) {
    targetSnippet = clauseRow.extracted_snippet || clauseRow.clause_text;
    resolvedClauseId = clauseRow.id;
    resolvedType = clauseRow.clause_type;
  } else {
    const opps = fallbackGetNegotiationOpportunities(doc);
    let matched = opps.find(o => o.clauseId === clauseId);
    if (!matched && clauseType) {
      matched = opps.find(o => o.clauseType.toLowerCase() === clauseType.toLowerCase());
    }
    if (!matched) {
      matched = opps[0];
    }
    targetSnippet = matched.originalText;
    resolvedClauseId = matched.clauseId;
    resolvedType = matched.clauseType;
    identifiedImbalance = matched.identifiedImbalance;
    strategy = matched.strategy;
  }

  const originalClause = targetSnippet;
  let suggestedRevision = originalClause;

  const lowClause = originalClause.toLowerCase();
  const cType = (resolvedType || '').toUpperCase();

  if (cType.includes('TERMINATION') || lowClause.includes('terminate')) {
    if (mode === 'protective') {
      suggestedRevision = originalClause.replace(/\b(at any time without notice|immediately without cause)\b/gi, "upon forty-five (45) days' prior written notice, subject to a thirty (30) day right to cure any alleged material breach");
      if (suggestedRevision === originalClause) {
        suggestedRevision = "Either party may terminate this Agreement only upon thirty (30) days' prior written notice in the event of a material breach that remains uncured after written notification.";
      }
      strategy = "Require substantial advance notice (45 days) and a mandatory opportunity to cure material breaches before termination.";
      identifiedImbalance = "Unrestricted or unilateral termination privileges create critical business disruption risks.";
    } else if (mode === 'aggressive') {
      suggestedRevision = "The Company may terminate this Agreement immediately upon written notice for any default, while the counterparty must provide sixty (60) days' prior written notice and satisfy all outstanding deliverables.";
      strategy = "Secure unilateral immediate termination rights for your organization while binding the counterparty to extended notice windows.";
      identifiedImbalance = "Termination terms should provide maximal leverage and immediate exit remedies upon counterparty non-performance.";
    } else if (mode === 'collaborative') {
      suggestedRevision = "In the event of a dispute or desire to terminate, the parties agree to first engage in good-faith executive escalation for fifteen (15) business days prior to issuing any formal thirty (30) day notice of termination.";
      strategy = "Introduce an informal executive consultation period before formal termination procedures can be initiated.";
      identifiedImbalance = "Immediate termination without dialogue can prematurely dissolve valuable commercial partnerships.";
    } else { // balanced
      suggestedRevision = "Either party may terminate this Agreement by providing thirty (30) days' prior written notice to the other party.";
      strategy = "Make termination rights strictly mutual and tie them to a standard 30-day written notice requirement.";
      identifiedImbalance = "Termination rights should be bilateral with standard commercial notice rather than unilateral.";
    }
  } else if (cType.includes('LIABILITY') || lowClause.includes('liab') || lowClause.includes('damage')) {
    if (mode === 'protective') {
      suggestedRevision = "In no event shall either party's aggregate liability under this Agreement exceed the total fees paid or payable during the preceding six (6) month period, and neither party shall be liable for indirect, punitive, or consequential damages.";
      strategy = "Institute an aggregate liability ceiling tied to 6 months of contract fees and exclude all consequential damages.";
      identifiedImbalance = "Uncapped liability exposes the organization to unbounded financial and legal exposure.";
    } else if (mode === 'aggressive') {
      suggestedRevision = "The counterparty's liability for breach of confidentiality, intellectual property, or indemnification shall be uncapped, while Company's aggregate liability shall be capped at $5,000.";
      strategy = "Carve out key counterparty breach areas from liability caps while securing a nominal cap for your side.";
      identifiedImbalance = "Liability carve-outs should maximize counterparty accountability for critical operational breaches.";
    } else if (mode === 'collaborative') {
      suggestedRevision = "Each party's aggregate liability arising under this Agreement shall be reasonably capped at the total contract value, with mutual exclusions for lost profits and standard commercially equitable carve-outs.";
      strategy = "Align both parties around a mutual 12-month contract value liability cap.";
      identifiedImbalance = "Asymmetrical liability caps impede mutual trust and risk sharing.";
    } else { // balanced
      suggestedRevision = "Except for gross negligence or willful misconduct, neither party's aggregate liability shall exceed the total fees paid under this Agreement during the preceding twelve (12) months.";
      strategy = "Establish a mutual 12-month fee cap with standard carve-outs for gross negligence.";
      identifiedImbalance = "Liability is insufficiently capped or lacks standard mutual exclusions.";
    }
  } else {
    if (mode === 'protective') {
      suggestedRevision += ' Provided, however, that neither party shall be liable for indirect, incidental, or consequential damages, and total aggregate liability shall be capped at the fees paid in the preceding 12 months.';
    } else if (mode === 'aggressive') {
      suggestedRevision = `The Company reserves the right to enforce this provision immediately upon written notice, without prejudice to any other remedies at law or equity. ${suggestedRevision}`;
    } else if (mode === 'collaborative') {
      suggestedRevision = `The parties shall use commercially reasonable efforts to consult mutually and resolve any differences in good faith prior to formal enforcement. ${suggestedRevision}`;
    } else {
      suggestedRevision = `Both parties mutually agree that: ${originalClause} Each party shall act reasonably and in good faith.`;
    }
  }

  const redline = computeNodeWordDiff(originalClause, suggestedRevision);
  const fullText = doc.extracted_text || '';

  const { modifiedText, success: replaceOk } = constructModifiedContractState(
    fullText,
    originalClause,
    suggestedRevision
  );

  const beforeRisk = calculateCalibratedDocumentRisk(fullText);
  const afterRisk = replaceOk ? calculateCalibratedDocumentRisk(modifiedText) : beforeRisk;

  const beforeScore = beforeRisk.score;
  const afterScore = afterRisk.score;
  const riskDelta = afterScore - beforeScore;
  const riskDirection = riskDelta < 0 ? 'REDUCED' : riskDelta > 0 ? 'INCREASED' : 'UNCHANGED';
  const findingsDiff = compareRiskFindings(beforeRisk.factors, afterRisk.factors);

  const prov = {
    engine: 'deterministic',
    provider: 'node-fallback-rules',
    model: 'deciva-redliner-fallback',
    timestamp: new Date().toISOString(),
    confidence: { score: null, methodology: 'deterministic_template' },
    grounded: true,
    riskScoring: {
      engine: 'deterministic-calibrated-risk-2.0',
      authority: 'rules_engine',
      confidence: { score: null }
    }
  };

  return {
    documentId: doc.id,
    clauseId: resolvedClauseId,
    clauseType: resolvedType,
    mode,
    originalClause,
    proposedClause: suggestedRevision,
    beforeScore,
    afterScore,
    riskDelta,
    riskDirection,
    beforeLevel: beforeRisk.level,
    afterLevel: afterRisk.level,
    riskFindings: findingsDiff,
    before_score: beforeScore,
    after_score: afterScore,
    risk_delta: riskDelta,
    risk_direction: riskDirection,
    risk_findings: findingsDiff,
    documentEvidence: {
      clause: originalClause,
      section: 'Contract Provision',
      segmentIndex: 0,
      sources: [{ excerpt: originalClause.slice(0, 300) }]
    },
    aiRecommendation: {
      riskSeverity: afterRisk.level,
      identifiedImbalance,
      strategy,
      suggestedRevision,
      objectives: [
        'make_rights_and_obligations_mutual',
        'establish_reasonable_cure_and_notice_periods',
        'fair_commercial_risk_allocation'
      ]
    },
    redline,
    engine: prov.engine,
    provider: prov.provider,
    model: prov.model,
    grounded: prov.grounded,
    confidence: { score: null, methodology: 'deterministic_template' },
    confidenceScore: null,
    provenance: prov
  };
}

function constructModifiedContractState(originalText, targetClause, proposedClause, contextText = null) {
  if (!originalText) return { modifiedText: originalText, success: false, error: 'Original document text is empty.' };
  const targetClean = (targetClause || '').trim();
  if (!targetClean) return { modifiedText: originalText, success: false, error: 'Target clause text is required for substitution.' };
  const proposedClean = (proposedClause || '').trim();

  // 1. Exact match
  if (originalText.includes(targetClean)) {
    const count = originalText.split(targetClean).length - 1;
    if (count > 1) {
      if (contextText && originalText.includes(contextText.trim())) {
        const ctx = contextText.trim();
        if (ctx.includes(targetClean)) {
          const ctxStart = originalText.indexOf(ctx);
          const offsetInCtx = ctx.indexOf(targetClean);
          const matchStart = ctxStart + offsetInCtx;
          const matchEnd = matchStart + targetClean.length;
          const modified = originalText.slice(0, matchStart) + proposedClean + originalText.slice(matchEnd);
          return { modifiedText: modified, success: true, error: '' };
        }
      }
      return { modifiedText: originalText, success: false, error: `Ambiguous target clause: ${count} identical occurrences detected in document text without distinguishing positional context.` };
    }
    const modified = originalText.replace(targetClean, proposedClean);
    return { modifiedText: modified, success: true, error: '' };
  }

  // 2. Whitespace-normalized match
  const targetWords = targetClean.match(/\S+/g);
  if (!targetWords) return { modifiedText: originalText, success: false, error: 'Target clause contains no words.' };
  const escapedWords = targetWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(escapedWords.join('\\s+'), 'gi');
  const allMatches = Array.from(originalText.matchAll(pattern));
  if (allMatches.length > 1) {
    if (contextText && originalText.includes(contextText.trim())) {
      const ctx = contextText.trim();
      const ctxStart = originalText.indexOf(ctx);
      const ctxEnd = ctxStart + ctx.length;
      const scoped = allMatches.filter(m => m.index >= ctxStart && m.index < ctxEnd);
      if (scoped.length === 1) {
        const m = scoped[0];
        const modified = originalText.slice(0, m.index) + proposedClean + originalText.slice(m.index + m[0].length);
        return { modifiedText: modified, success: true, error: '' };
      }
    }
    return { modifiedText: originalText, success: false, error: `Ambiguous target clause: ${allMatches.length} pattern matches detected in document text without distinguishing positional context.` };
  } else if (allMatches.length === 1) {
    const match = allMatches[0];
    const startIndex = match.index;
    const endIndex = startIndex + match[0].length;
    const modified = originalText.slice(0, startIndex) + proposedClean + originalText.slice(endIndex);
    return { modifiedText: modified, success: true, error: '' };
  }

  // 3. Substring window match (anchor match for truncated snippets)
  const cleanNoDots = targetClean.replace(/\.{2,}/g, '').trim();
  const wordsNoDots = cleanNoDots.match(/\S+/g);
  if (wordsNoDots && wordsNoDots.length >= 4) {
    const anchorLen = Math.min(6, wordsNoDots.length);
    const startWords = wordsNoDots.slice(0, anchorLen).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const startPattern = new RegExp(startWords.join('\\s+'), 'gi');
    const startMatches = Array.from(originalText.matchAll(startPattern));
    if (startMatches.length === 1) {
      const startMatch = startMatches[0];
      const endAnchorLen = Math.min(5, wordsNoDots.length);
      const endWords = wordsNoDots.slice(-endAnchorLen).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const endPattern = new RegExp(endWords.join('\\s+'), 'i');
      const textAfterStart = originalText.slice(startMatch.index);
      const endMatch = textAfterStart.match(endPattern);
      if (endMatch) {
        const fullEnd = startMatch.index + endMatch.index + endMatch[0].length;
        const modified = originalText.slice(0, startMatch.index) + proposedClean + originalText.slice(fullEnd);
        return { modifiedText: modified, success: true, error: '' };
      }
    }
  }

  return { modifiedText: originalText, success: false, error: 'Target clause could not be located in document text.' };
}

function compareRiskFindings(beforeFactors = [], afterFactors = []) {
  const beforeHazards = {};
  for (const f of beforeFactors) {
    if (f.category === 'CONFIRMED_HAZARD') beforeHazards[f.riskType] = f;
  }
  const afterHazards = {};
  for (const f of afterFactors) {
    if (f.category === 'CONFIRMED_HAZARD') afterHazards[f.riskType] = f;
  }

  const resolvedHazards = Object.keys(beforeHazards).filter(t => !afterHazards[t]);
  const introducedHazards = Object.keys(afterHazards).filter(t => !beforeHazards[t]);

  const beforeHazardPts = Object.values(beforeHazards).reduce((acc, f) => acc + (f.riskPoints || 0), 0);
  const afterHazardPts = Object.values(afterHazards).reduce((acc, f) => acc + (f.riskPoints || 0), 0);

  const beforeOmissions = {};
  for (const f of beforeFactors) {
    if (f.category === 'POTENTIAL_OMISSION') beforeOmissions[f.riskType] = f;
  }
  const afterOmissions = {};
  for (const f of afterFactors) {
    if (f.category === 'POTENTIAL_OMISSION') afterOmissions[f.riskType] = f;
  }

  const resolvedOmissions = Object.keys(beforeOmissions).filter(t => !afterOmissions[t]);
  const introducedOmissions = Object.keys(afterOmissions).filter(t => !beforeOmissions[t]);

  const beforeOmissionPts = Object.values(beforeOmissions).reduce((acc, f) => acc + (f.riskPoints || 0), 0);
  const afterOmissionPts = Object.values(afterOmissions).reduce((acc, f) => acc + (f.riskPoints || 0), 0);

  return {
    beforeFactors,
    afterFactors,
    resolvedHazards,
    introducedHazards,
    hazardPointsDelta: afterHazardPts - beforeHazardPts,
    resolvedOmissions,
    introducedOmissions,
    omissionPointsDelta: afterOmissionPts - beforeOmissionPts
  };
}

async function fallbackSimulate(doc, params = {}, database = db) {
  const originalText = doc.extracted_text || '';
  const scenario = (params.scenario || '').trim();
  const proposedClause = (params.proposedClause || params.proposed_clause || '').trim();
  let originalClause = (params.originalClause || params.original_clause || '').trim();
  const clauseId = params.clauseId || params.clause_id || null;

  if (proposedClause) {
    if (!originalClause && clauseId && database) {
      try {
        const { rows } = await database.query(
          'SELECT extracted_snippet FROM document_clauses WHERE id = $1 AND document_id = $2',
          [clauseId, doc.id]
        );
        if (rows.length > 0 && rows[0].extracted_snippet) {
          originalClause = rows[0].extracted_snippet;
        }
      } catch (_) {}
    }

    let targetSnippet = originalClause;
    if (!targetSnippet && scenario) {
      if (originalText.includes(scenario)) {
        targetSnippet = scenario;
      }
    }

    if (!targetSnippet) {
      return {
        error: 'Original clause text could not be identified for substitution. Provide clauseId or originalClause.',
        status: 400
      };
    }

    const { modifiedText, success, error: replaceErr } = constructModifiedContractState(
      originalText,
      targetSnippet,
      proposedClause
    );
    if (!success) {
      return {
        error: `Target clause could not be located in document text: ${replaceErr}`,
        status: 400
      };
    }

    const beforeRisk = calculateCalibratedDocumentRisk(originalText);
    const afterRisk = calculateCalibratedDocumentRisk(modifiedText);

    const beforeScore = beforeRisk.score;
    const beforeLevel = beforeRisk.level;
    const afterScore = afterRisk.score;
    const afterLevel = afterRisk.level;
    const riskDelta = afterScore - beforeScore;
    const riskDirection = riskDelta < 0 ? 'REDUCED' : riskDelta > 0 ? 'INCREASED' : 'UNCHANGED';
    const findingsDiff = compareRiskFindings(beforeRisk.factors, afterRisk.factors);

    const documentEvidence = [
      {
        section: 'Target Provision',
        segmentIndex: 0,
        excerpt: targetSnippet.slice(0, 300) + (targetSnippet.length > 300 ? '...' : '')
      }
    ];

    let deltaNote = '';
    if (riskDelta < 0) deltaNote = ` (Quantitative risk reduced by ${Math.abs(riskDelta)} points).`;
    else if (riskDelta > 0) deltaNote = ` (Quantitative risk increased by ${riskDelta} points).`;

    const simulationAnalysis = {
      potentialImpact: `Contract risk re-evaluated following proposed clause modification${deltaNote}. Baseline score of ${beforeScore}/100 shifted to ${afterScore}/100.`,
      riskLevel: afterLevel,
      affectedAreas: ['Contractual Liability', 'Commercial Exposure', 'Obligations'],
      possibleConsequences: riskDelta < 0
        ? ['Hazard exposure successfully mitigated under updated contract terms.', 'Lower regulatory or financial liability for contracting party.']
        : riskDelta > 0
        ? ['Proposed modification increases contract exposure.', 'Additional covenants or protections required to offset risk.']
        : ['No net shift in quantifiable risk factors under current risk scoring heuristics.'],
      recommendedNextSteps: [
        'Review final execution version with legal counsel.',
        'Ensure mutual assent and clear integration into master agreement.'
      ],
      disclaimer: 'This is a hypothetical scenario analysis based on provisions identified in the document. It does not constitute formal legal advice.'
    };

    const prov = {
      engine: 'deterministic-rules-engine',
      provider: 'node-fallback-rules',
      model: 'deciva-calibrated-risk-2.0',
      timestamp: new Date().toISOString(),
      confidence: {
        score: null,
        methodology: 'deterministic_rule_based'
      },
      grounding: {
        status: 'GROUNDED',
        contractProvisionsReferenced: 1
      },
      generationType: 'DETERMINISTIC'
    };

    return {
      documentId: doc.id,
      scenario: scenario || `Clause Modification: ${targetSnippet.slice(0, 50)}...`,
      clauseId,
      originalClause: targetSnippet,
      proposedClause,
      grounded: true,
      beforeScore,
      afterScore,
      riskDelta,
      riskDirection,
      beforeLevel,
      afterLevel,
      riskFindings: findingsDiff,
      documentEvidence,
      simulationAnalysis,
      engine: prov.engine,
      provider: prov.provider,
      model: prov.model,
      confidence: { score: null, methodology: 'deterministic_rule_based' },
      confidenceScore: null,
      retrieval_score: null,
      retrieval_methodology: null,
      sources: documentEvidence,
      provenance: prov
    };
  }

  // Pure scenario without proposedClause
  const baseRisk = calculateCalibratedDocumentRisk(originalText);
  const beforeScore = baseRisk.score;
  const beforeLevel = baseRisk.level;
  const scLower = scenario.toLowerCase();

  let riskLevel = beforeLevel;
  let potentialImpact = `Analysis of scenario: "${scenario}". Potential impact on contractual obligations evaluated under identified provisions.`;
  let affectedAreas = ['Operational Delivery', 'Contractual Rights', 'Commercial Exposure'];

  if (/pay|fee|cost|invoice|money|delay|default/i.test(scLower)) {
    riskLevel = 'HIGH';
    potentialImpact = `If performance or financial milestone is delayed as described, default provisions and statutory cure periods may be triggered.`;
    affectedAreas = ['Payment Terms', 'Breach & Default', 'Remedies'];
  } else if (/terminat|cancel|exit/i.test(scLower)) {
    riskLevel = 'HIGH';
    potentialImpact = `Early termination or exit scenario triggers advance notice requirements and post-termination transition obligations.`;
    affectedAreas = ['Termination Rights', 'Post-Termination Survival', 'Transition Services'];
  }

  const documentEvidence = [
    {
      pageNumber: 1,
      excerpt: originalText.slice(0, 300) || 'Governing contractual terms and conditions.'
    }
  ];

  const prov = {
    engine: 'deterministic-rules-engine',
    provider: 'node-fallback-rules',
    model: 'deciva-calibrated-risk-2.0',
    timestamp: new Date().toISOString(),
    confidence: {
      score: null,
      methodology: 'deterministic_rule_based'
    },
    grounding: {
      status: 'GROUNDED',
      contractProvisionsReferenced: 1
    },
    generationType: 'DETERMINISTIC'
  };

  return {
    documentId: doc.id,
    scenario,
    clauseId: null,
    originalClause: null,
    proposedClause: null,
    grounded: true,
    beforeScore,
    afterScore: beforeScore,
    riskDelta: 0,
    riskDirection: 'UNCHANGED',
    beforeLevel,
    afterLevel: beforeLevel,
    riskFindings: compareRiskFindings(baseRisk.factors, baseRisk.factors),
    documentEvidence,
    simulationAnalysis: {
      potentialImpact,
      riskLevel,
      affectedAreas,
      possibleConsequences: [
        'Notice of breach or performance dispute may be issued by the affected party.',
        'A formal cure window (typically 30 days) is typically required prior to unilateral termination.',
        'Financial indemnification or liquidated damages exposure may be assessed if cure fails.'
      ],
      recommendedNextSteps: [
        'Issue formal written communication referencing the governing notice clause.',
        'Review contract dispute escalation steps prior to initiating formal litigation.',
        'Schedule mutual commercial consultation to mitigate damages.'
      ],
      disclaimer: 'This is a hypothetical scenario analysis based on provisions identified in the document. It does not constitute formal legal advice.'
    },
    engine: prov.engine,
    provider: prov.provider,
    model: prov.model,
    confidence: { score: null, methodology: 'deterministic_rule_based' },
    confidenceScore: null,
    retrieval_score: null,
    retrieval_methodology: null,
    sources: documentEvidence,
    provenance: prov
  };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

async function extractText(buffer, mimeType, originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  try {
    if (mimeType === 'application/pdf' || ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const parsePromise = pdfParse(buffer);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('PDF parsing timeout')), 10000)
      );
      const result = await Promise.race([parsePromise, timeoutPromise]);
      const extracted = (result.text || '').trim();
      if (!extracted) {
        return { text: '', confidence: 0.0, status: 'INSUFFICIENT_EVIDENCE', error: 'PDF contains no extractable digital text stream' };
      }
      return { text: extracted, confidence: 1.0, methodology: 'digital_text_stream', status: 'SUCCESS' };
    }
    if (ext === '.docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      const extracted = (result.value || '').trim();
      if (!extracted) {
        return { text: '', confidence: 0.0, status: 'INSUFFICIENT_EVIDENCE', error: 'DOCX contains no extractable text' };
      }
      return { text: extracted, confidence: 1.0, methodology: 'digital_text_stream', status: 'SUCCESS' };
    }
    if (mimeType.startsWith('text/') || ext === '.txt') {
      const extracted = buffer.toString('utf8').trim();
      if (!extracted) {
        return { text: '', confidence: 0.0, status: 'INSUFFICIENT_EVIDENCE', error: 'Text file is empty' };
      }
      return { text: extracted, confidence: 1.0, status: 'SUCCESS' };
    }
    if (mimeType.startsWith('image/')) {
      return { text: '', confidence: 0.0, status: 'OCR_REQUIRED', error: 'Image OCR required' };
    }
    const extracted = buffer.toString('utf8').trim();
    return { text: extracted, confidence: extracted ? 0.5 : 0.0, status: extracted ? 'SUCCESS' : 'INSUFFICIENT_EVIDENCE' };
  } catch (e) {
    console.warn('Extract text failure:', e.message);
    return { text: '', confidence: 0.0, status: 'EXTRACTION_FAILED', error: e.message };
  }
}

// In-memory synchronization latch (per-node optimization for concurrent identical uploads)
const activeInFlightUploads = new Map();

function ensureEncryptedFile(filename) {
  if (!filename) return;
  try {
    const filePath = path.resolve(uploadsDir, filename);
    if (!fs.existsSync(filePath)) {
      const tmpPath = filePath.replace(/\.enc$/i, '.tmp');
      if (fs.existsSync(tmpPath)) {
        fs.renameSync(tmpPath, filePath);
      }
    }
  } catch (err) {
    console.warn('[Auto-recover enc file warning]', err.message);
  }
}

function finalizeStorage(docId) {
  const tPath = path.join(uploadsDir, `${docId}.tmp`);
  const fPath = path.join(uploadsDir, `${docId}.enc`);
  if (fs.existsSync(tPath)) {
    try {
      if (!fs.existsSync(fPath)) {
        fs.renameSync(tPath, fPath);
      } else {
        fs.unlinkSync(tPath);
      }
    } catch (err) {
      console.warn(`[Storage Finalize Warning] ${err.message}`);
    }
  }
}

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  let canonicalDocumentId = null;
  let tmpFilePath = null;
  let resolveInFlight = null;
  let rejectInFlight = null;
  let inFlightKey = null;

  const rawIdempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || null;
  const idempotencyKey = typeof rawIdempotencyKey === 'string' ? rawIdempotencyKey.trim() : null;

  try {
    if (!req.file || req.file.size === 0 || !req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ error: 'File is empty or missing' });
    }

    const ext = path.extname(req.file.originalname || '').toLowerCase();
    const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.doc', '.txt', '.rtf', '.png', '.jpg', '.jpeg', '.tiff']);
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({ error: `Unsupported file extension '${ext}'. Allowed formats: PDF, DOCX, TXT, DOC, RTF, images.` });
    }

    const buf = req.file.buffer;
    // Magic bytes checking
    const isMzExe = buf.length >= 2 && buf[0] === 0x4D && buf[1] === 0x5A; // MZ header
    const isElf = buf.length >= 4 && buf[0] === 0x7F && buf[1] === 0x45 && buf[2] === 0x4C && buf[3] === 0x46; // ELF header
    const isMachO = buf.length >= 4 && (
      (buf[0] === 0xFE && buf[1] === 0xED && buf[2] === 0xFA && (buf[3] === 0xCE || buf[3] === 0xCF)) ||
      (buf[0] === 0xCF && buf[1] === 0xFA && buf[2] === 0xED && buf[3] === 0xFE)
    );
    if (isMzExe || isElf || isMachO) {
      return res.status(400).json({ error: 'Executable files and binary binaries are strictly prohibited.' });
    }

    const fileHash = sha256(req.file.buffer);

    // 1. In-process concurrency synchronization check
    if (idempotencyKey) {
      inFlightKey = `${req.user.id}:${idempotencyKey}`;
      if (activeInFlightUploads.has(inFlightKey)) {
        try {
          const inFlightResult = await activeInFlightUploads.get(inFlightKey);
          return res.status(200).json(inFlightResult);
        } catch (_) {
          // If the in-flight failed, proceed to database check/retry
        }
      }
    }

    // 2. Persistent PostgreSQL Idempotency Check
    if (idempotencyKey) {
      const { rows: existingRows } = await db.query(
        'SELECT id, user_id, idempotency_key, request_hash, document_id, status, response_payload FROM upload_idempotency WHERE user_id = $1 AND idempotency_key = $2',
        [req.user.id, idempotencyKey]
      );

      if (existingRows.length > 0) {
        const existing = existingRows[0];
        if (existing.request_hash !== fileHash) {
          return res.status(409).json({
            error: 'Idempotency key has already been used for a different file upload payload.',
            code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
          });
        }
        if (existing.status === 'PROCESSING') {
          res.setHeader('Retry-After', '1');
          return res.status(409).json({
            error: 'Upload operation with this idempotency key is currently in progress.',
            code: 'OPERATION_IN_PROGRESS'
          });
        }
        if (existing.status === 'COMPLETED') {
          if (existing.response_payload) {
            return res.status(200).json(existing.response_payload);
          }
          const { rows: docRows } = await db.query('SELECT * FROM documents WHERE id = $1', [existing.document_id]);
          if (docRows.length > 0) {
            const d = docRows[0];
            return res.status(200).json({
              id: d.id,
              document_id: d.id,
              name: d.original_name,
              filename: d.original_name,
              size: Number(d.size),
              sha256: d.sha256,
              ocrConfidence: d.ocr_confidence,
              riskScore: d.risk_score,
              risk_score: d.risk_score,
              analysisStatus: d.analysis_status || 'NOT_STARTED',
              encrypted: true
            });
          }
        }
      }
    }

    // 3. Node Gateway Generates Canonical Document ID
    canonicalDocumentId = uuidv4();
    const storedName = `${canonicalDocumentId}.enc`;
    const tmpName = `${canonicalDocumentId}.tmp`;
    tmpFilePath = path.join(uploadsDir, tmpName);

    // Register in-flight promise for in-process concurrency coordination
    if (idempotencyKey) {
      const p = new Promise((resolve, reject) => {
        resolveInFlight = resolve;
        rejectInFlight = reject;
      });
      p.catch(() => {});
      activeInFlightUploads.set(inFlightKey, p);
    }

    // 4. Register Persistent PROCESSING Record in PostgreSQL
    if (idempotencyKey) {
      try {
        await db.query(`
          INSERT INTO upload_idempotency (id, user_id, idempotency_key, request_hash, document_id, status)
          VALUES ($1, $2, $3, $4, $5, 'PROCESSING')
        `, [uuidv4(), req.user.id, idempotencyKey, fileHash, canonicalDocumentId]);
      } catch (insertErr) {
        if (insertErr.code === '23505') { // Unique constraint violation (user_id, idempotency_key)
          if (rejectInFlight) {
            rejectInFlight(new Error('Concurrency conflict: key already processing or completed'));
          }
          if (inFlightKey) {
            activeInFlightUploads.delete(inFlightKey);
          }
          const { rows: raceRows } = await db.query(
            'SELECT id, user_id, idempotency_key, request_hash, document_id, status, response_payload FROM upload_idempotency WHERE user_id = $1 AND idempotency_key = $2',
            [req.user.id, idempotencyKey]
          );
          if (raceRows.length > 0) {
            const row = raceRows[0];
            if (row.request_hash !== fileHash) {
              return res.status(409).json({
                error: 'Idempotency key has already been used for a different file upload payload.',
                code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
              });
            }
            if (row.status === 'PROCESSING') {
              res.setHeader('Retry-After', '1');
              return res.status(409).json({
                error: 'Upload operation with this idempotency key is currently in progress.',
                code: 'OPERATION_IN_PROGRESS'
              });
            }
            if (row.status === 'COMPLETED' && row.response_payload) {
              return res.status(200).json(row.response_payload);
            }
          }
          return res.status(409).json({
            error: 'Upload operation with this idempotency key is currently in progress.',
            code: 'OPERATION_IN_PROGRESS'
          });
        }
        throw insertErr;
      }
    }

    // 5. Atomic Storage: Write to .tmp first
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const encrypted = encryptBuffer(req.file.buffer);
    fs.writeFileSync(tmpFilePath, encrypted);

    let uploadResult = null;

    // 6. Forward to Python/Flask Microservice with Canonical ID
    try {
      const form = new FormData();
      const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'application/octet-stream' });
      form.append('file', blob, req.file.originalname);
      form.append('document_id', canonicalDocumentId);
      if (req.user && req.user.id) {
        form.append('user_id', req.user.id);
      }

      const flaskRes = await fetch(`${AI_MICROSERVICE_URL}/api/documents/upload`, {
        method: 'POST',
        headers: getInternalHeaders(req),
        body: form,
        signal: AbortSignal.timeout(2500)
      });

      if (flaskRes.ok) {
        const flaskData = await flaskRes.json();
        finalizeStorage(canonicalDocumentId);
        uploadResult = {
          id: flaskData.document_id || canonicalDocumentId,
          document_id: flaskData.document_id || canonicalDocumentId,
          name: req.file.originalname,
          filename: req.file.originalname,
          size: req.file.size,
          sha256: flaskData.sha256 || fileHash,
          ocrConfidence: flaskData.ocr_confidence,
          riskScore: flaskData.risk_score,
          risk_score: flaskData.risk_score,
          analysisStatus: flaskData.analysis_status || 'NOT_STARTED',
          encrypted: true
        };
      }
    } catch (proxyErr) {
      console.warn('Flask upload proxy failed, checking DB reconciliation:', proxyErr.message);
    }

    // 7. DB Reconciliation & Fallback (Using the SAME canonical ID)
    if (!uploadResult) {
      const { rows: existingDocs } = await db.query(
        'SELECT id, original_name, filename, size, sha256, ocr_confidence, risk_score, analysis_status, extraction_status FROM documents WHERE id = $1',
        [canonicalDocumentId]
      );

      if (existingDocs.length > 0) {
        const d = existingDocs[0];
        finalizeStorage(canonicalDocumentId);
        uploadResult = {
          id: d.id,
          document_id: d.id,
          name: d.original_name || req.file.originalname,
          filename: d.original_name || req.file.originalname,
          size: Number(d.size) || req.file.size,
          sha256: d.sha256 || fileHash,
          ocrConfidence: d.ocr_confidence,
          riskScore: d.risk_score,
          risk_score: d.risk_score,
          analysisStatus: d.analysis_status || 'NOT_STARTED',
          encrypted: true
        };
      } else {
        // Direct local fallback using the EXACT SAME canonicalDocumentId
        const extractRes = await extractText(req.file.buffer, req.file.mimetype || '', req.file.originalname || '');
        const text = extractRes.text || '';
        const confidence = extractRes.confidence || 0.0;
        const analysisStatus = extractRes.status === 'SUCCESS' ? 'NOT_STARTED' : (extractRes.status || 'INSUFFICIENT_EVIDENCE');
        const riskResult = calculateCalibratedDocumentRisk(text);
        const risk = riskResult.score;

        await db.query(`
          INSERT INTO documents (
            id, user_id, filename, original_name, mime_type, size, sha256, encrypted, 
            extracted_text, ocr_confidence, version_group, version_number, risk_score, analysis_status, extraction_status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (id) DO UPDATE SET
            extracted_text = CASE
              WHEN documents.extracted_text IS NOT NULL AND length(documents.extracted_text) > 0 THEN documents.extracted_text
              ELSE EXCLUDED.extracted_text
            END,
            extraction_status = CASE
              WHEN documents.extraction_status = 'COMPLETED' THEN 'COMPLETED'
              WHEN EXCLUDED.extraction_status = 'COMPLETED' THEN 'COMPLETED'
              ELSE documents.extraction_status
            END,
            analysis_status = CASE
              WHEN documents.analysis_status = 'COMPLETED' THEN 'COMPLETED'
              WHEN EXCLUDED.analysis_status = 'COMPLETED' THEN 'COMPLETED'
              ELSE documents.analysis_status
            END,
            ocr_confidence = COALESCE(documents.ocr_confidence, EXCLUDED.ocr_confidence),
            risk_score = COALESCE(documents.risk_score, EXCLUDED.risk_score)
        `, [
          canonicalDocumentId, req.user.id, storedName, req.file.originalname, req.file.mimetype, req.file.size, fileHash,
          text, confidence, canonicalDocumentId, 1, risk, analysisStatus, 'COMPLETED'
        ]);

        // Populate document_risk_factors
        if (riskResult.factors && riskResult.factors.length > 0) {
          for (const factor of riskResult.factors) {
            await db.query(`
              INSERT INTO document_risk_factors (id, document_id, risk_type, severity, risk_points, reason, vector, score)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              ON CONFLICT DO NOTHING
            `, [
              uuidv4(), canonicalDocumentId, factor.riskType, factor.severity, factor.riskPoints, factor.reason,
              factor.riskType, factor.riskPoints
            ]).catch(() => {});
          }
        }

        // Populate document_clauses
        const clausesData = formatFallbackClauses(text);
        if (clausesData.detected && clausesData.detected.length > 0) {
          for (const clause of clausesData.detected) {
            await db.query(`
              INSERT INTO document_clauses (id, document_id, clause_type, confidence, extracted_snippet, status)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT DO NOTHING
            `, [
              uuidv4(), canonicalDocumentId, clause.clause_type || clause.clauseType, (typeof clause.confidence === 'number' ? clause.confidence : 1.0),
              clause.snippet || clause.extractedSnippet, 'CONFIRMED'
            ]).catch((err) => {
              console.warn('Fallback clause insertion notice:', err.message);
            });
          }
        }

        finalizeStorage(canonicalDocumentId);

        uploadResult = {
          id: canonicalDocumentId,
          document_id: canonicalDocumentId,
          name: req.file.originalname,
          filename: req.file.originalname,
          size: req.file.size,
          sha256: fileHash,
          ocrConfidence: confidence,
          riskScore: risk,
          risk_score: risk,
          analysisStatus: analysisStatus,
          encrypted: true
        };
      }
    }

    // 8. Mark Idempotency as COMPLETED with response payload
    if (idempotencyKey) {
      await db.query(`
        UPDATE upload_idempotency
        SET status = 'COMPLETED', response_payload = $1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2 AND idempotency_key = $3
      `, [JSON.stringify(uploadResult), req.user.id, idempotencyKey]).catch(e => console.warn('Idempotency update error:', e.message));
    }

    await recordAudit(req.user.id, 'DOCUMENT_UPLOADED', {
      documentId: uploadResult.document_id,
      name: req.file.originalname,
      sha256: fileHash
    });

    if (resolveInFlight) {
      resolveInFlight(uploadResult);
    }
    if (inFlightKey) {
      activeInFlightUploads.delete(inFlightKey);
    }

    return res.status(201).json(uploadResult);

  } catch (err) {
    console.error('Upload document error:', err);

    if (tmpFilePath && fs.existsSync(tmpFilePath)) {
      try { fs.unlinkSync(tmpFilePath); } catch (_) {}
    }

    if (idempotencyKey && req.user && req.user.id) {
      await db.query(`
        UPDATE upload_idempotency
        SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND idempotency_key = $2 AND status = 'PROCESSING'
      `, [req.user.id, idempotencyKey]).catch(() => {});
    }

    if (rejectInFlight) {
      rejectInFlight(err);
    }
    if (inFlightKey) {
      activeInFlightUploads.delete(inFlightKey);
    }

    return res.status(500).json({ error: 'Document upload could not be completed' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const query = isAdmin
      ? `SELECT id, original_name AS filename, original_name, mime_type, size, sha256, ocr_confidence, risk_score, version_group, version_number, created_at
         FROM documents ORDER BY created_at DESC`
      : `SELECT id, original_name AS filename, original_name, mime_type, size, sha256, ocr_confidence, risk_score, version_group, version_number, created_at
         FROM documents WHERE user_id = $1 ORDER BY created_at DESC`;
    const params = isAdmin ? [] : [req.user.id];

    const { rows: docs } = await db.query(query, params);
    res.json(docs);
  } catch (err) {
    console.error('List documents error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    const doc = rows[0];
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    await recordAudit(req.user.id, 'DOCUMENT_VIEWED', { documentId: doc.id });
    res.json({ document: doc });
  } catch (err) {
    console.error('Get document error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    const doc = rows[0];
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const filePath = path.resolve(uploadsDir, doc.filename);
    if (!filePath.startsWith(path.resolve(uploadsDir) + path.sep)) {
      return res.status(403).json({ error: 'Access denied: Invalid file path' });
    }
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (fileErr) {
        console.warn('Could not delete file from disk:', fileErr.message);
      }
    }
    await db.query('DELETE FROM chat_messages WHERE document_id = $1', [doc.id]);
    await db.query('DELETE FROM share_links WHERE document_id = $1', [doc.id]);
    await db.query('DELETE FROM document_clauses WHERE document_id = $1', [doc.id]).catch(() => {});
    await db.query('DELETE FROM document_risk_factors WHERE document_id = $1', [doc.id]).catch(() => {});
    await db.query('DELETE FROM documents WHERE id = $1', [doc.id]);
    await recordAudit(req.user.id, 'DOCUMENT_DELETED', { documentId: doc.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete document error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Verify integrity (recompute SHA-256 of decrypted file vs stored hash) --
router.get('/:id/verify', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    const doc = rows[0];
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    ensureEncryptedFile(doc.filename);
    const filePath = path.resolve(uploadsDir, doc.filename);
    if (!filePath.startsWith(path.resolve(uploadsDir) + path.sep)) {
      return res.status(403).json({ error: 'Access denied: Invalid file path' });
    }
    if (!fs.existsSync(filePath)) return res.status(410).json({ error: 'File missing from storage' });
    const encrypted = fs.readFileSync(filePath);
    let decrypted, currentHash, valid;
    try {
      decrypted = decryptBuffer(encrypted);
      currentHash = sha256(decrypted);
      valid = currentHash === doc.sha256;
    } catch (e) {
      return res.json({ valid: false, error: 'Decryption/authentication failed — file may be corrupted or tampered with.' });
    }
    res.json({ valid, storedHash: doc.sha256, currentHash });
  } catch (err) {
    console.error('Verify document error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/analysis', requireAuth, async (req, res) => {
  try {
    const authCheck = await authorizeDocument(req.params.id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    try {
      const response = await fetch(`${AI_MICROSERVICE_URL}/api/documents/${req.params.id}/analysis`, {
        headers: getInternalHeaders(req),
        signal: AbortSignal.timeout(4000)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.risk && data.risk.score !== undefined) {
          if (data.riskScore === undefined) data.riskScore = data.risk.score;
          if (data.risk_score === undefined) data.risk_score = data.risk.score;
        }
        return res.status(response.status).json(data);
      }
    } catch (proxyErr) {
      console.warn('AI Analysis microservice proxy notice:', proxyErr.message);
    }

    const fallbackData = fallbackGetAnalysis(authCheck.document);
    res.json(fallbackData);
  } catch (err) {
    console.error('Analysis fetch error:', err);
    res.status(500).json({ error: 'AI Analysis service unavailable' });
  }
});

router.get('/:id/clauses', requireAuth, async (req, res) => {
  try {
    const authCheck = await authorizeDocument(req.params.id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    try {
      const response = await fetch(`${AI_MICROSERVICE_URL}/api/documents/${req.params.id}/clauses`, {
        headers: getInternalHeaders(req),
        signal: AbortSignal.timeout(4000)
      });
      if (response.ok) {
        const data = await response.json();
        return res.status(response.status).json(data);
      }
    } catch (proxyErr) {
      console.warn('Clauses microservice proxy notice:', proxyErr.message);
    }

    const clauses = formatFallbackClauses(authCheck.document.extracted_text || '');
    res.json({
      documentId: authCheck.document.id,
      detected: clauses.detected,
      missing: clauses.missing,
      clauses,
      auditItems: clauses.auditItems,
      checklistScore: clauses.checklistScore
    });
  } catch (err) {
    console.error('Clauses fetch error:', err);
    res.status(500).json({ error: 'Clauses service unavailable' });
  }
});

router.get('/:id/deadlines', requireAuth, async (req, res) => {
  try {
    const authCheck = await authorizeDocument(req.params.id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    try {
      const response = await fetch(`${AI_MICROSERVICE_URL}/api/documents/${req.params.id}/deadlines`, {
        headers: getInternalHeaders(req),
        signal: AbortSignal.timeout(4000)
      });
      if (response.ok) {
        const data = await response.json();
        return res.status(response.status).json(data);
      }
    } catch (proxyErr) {
      console.warn('Deadlines microservice proxy notice:', proxyErr.message);
    }

    const deadlines = formatFallbackDeadlines(authCheck.document.extracted_text || '');
    res.json({ documentId: authCheck.document.id, deadlines });
  } catch (err) {
    console.error('Deadlines fetch error:', err);
    res.status(500).json({ error: 'Deadlines service unavailable' });
  }
});

router.get('/:id/risks', requireAuth, async (req, res) => {
  try {
    const authCheck = await authorizeDocument(req.params.id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    try {
      const response = await fetch(`${AI_MICROSERVICE_URL}/api/documents/${req.params.id}/risks`, {
        headers: getInternalHeaders(req),
        signal: AbortSignal.timeout(4000)
      });
      if (response.ok) {
        const data = await response.json();
        return res.status(response.status).json(data);
      }
    } catch (proxyErr) {
      console.warn('Risks microservice proxy notice:', proxyErr.message);
    }

    const riskObj = formatFallbackRisks(authCheck.document.extracted_text || '');
    res.json({
      documentId: authCheck.document.id,
      risk: { score: riskObj.score, level: riskObj.level },
      riskScore: riskObj.score,
      riskLevel: riskObj.level,
      riskFactors: riskObj.factors,
      factors: riskObj.factors
    });
  } catch (err) {
    console.error('Risks fetch error:', err);
    res.status(500).json({ error: 'Risk service unavailable' });
  }
});

router.post('/:id/analyze', requireAuth, aiLimiter, async (req, res) => {
  const startTime = Date.now();
  try {
    const authCheck = await authorizeDocument(req.params.id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    try {
      const response = await fetch(`${AI_MICROSERVICE_URL}/api/documents/${req.params.id}/analyze`, {
        method: 'POST',
        headers: getInternalHeaders(req),
        signal: AbortSignal.timeout(6000)
      });
      if (response.ok) {
        const data = await response.json();
        recordAiTelemetry({
          correlationId: req.correlationId,
          userId: req.user.id,
          documentId: req.params.id,
          operationType: 'ANALYSIS',
          provider: 'flask-nlp',
          model: 'deciva-analyzer',
          durationMs: Date.now() - startTime,
          status: 'SUCCESS',
          groundedStatus: 'GROUNDED'
        });
        return res.status(response.status).json(data);
      }
    } catch (proxyErr) {
      console.warn('Analyze microservice proxy notice:', proxyErr.message);
    }

    const fallbackData = fallbackGetAnalysis(authCheck.document);
    try {
      await db.query('UPDATE documents SET risk_score = $1, analysis_status = $2 WHERE id = $3', [
        fallbackData.riskScore,
        'COMPLETED',
        authCheck.document.id
      ]);
    } catch (uErr) {
      console.warn('Analysis score persistence notice:', uErr.message);
    }

    recordAiTelemetry({
      correlationId: req.correlationId,
      userId: req.user.id,
      documentId: req.params.id,
      operationType: 'ANALYSIS',
      provider: 'node-rules',
      model: 'deciva-rules',
      durationMs: Date.now() - startTime,
      status: 'SUCCESS',
      groundedStatus: 'GROUNDED',
      fallbackUsed: true
    });

    res.json(fallbackData);
  } catch (err) {
    console.error('Analyze trigger error:', err);
    res.status(500).json({ error: 'AI Analyze service unavailable' });
  }
});

router.post('/:id/chat', requireAuth, aiLimiter, async (req, res) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;

    // Layer 1: Gateway Authorization & Ownership verification FIRST
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const question = req.body.question || req.body.message;
    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: 'Question is required and cannot be empty' });
    }

    let ragData = null;
    let provider = 'flask-nlp';
    let model = 'deciva-rag';
    let fallbackUsed = false;

    try {
      const flaskRes = await fetch(`${AI_MICROSERVICE_URL}/api/documents/${id}/chat`, {
        method: 'POST',
        headers: getInternalHeaders(req, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ question: String(question).trim() }),
        signal: AbortSignal.timeout(16000)
      });
      if (flaskRes.ok) {
        ragData = await flaskRes.json();
        provider = ragData.provider || 'flask-nlp';
        model = ragData.model || 'deciva-rag';
      }
    } catch (proxyErr) {
      console.warn('Document chat microservice proxy notice:', proxyErr.message);
    }

    if (!ragData) {
      fallbackUsed = true;
      const geminiResult = await askGeminiOrFallback(question, authCheck.document.extracted_text || '');
      ragData = {
        question: String(question).trim(),
        answer: geminiResult.answer,
        engine: geminiResult.engine || 'deterministic',
        confidence: geminiResult.confidence || { score: null, methodology: 'not_available' },
        confidenceScore: geminiResult.confidenceScore !== undefined ? geminiResult.confidenceScore : null,
        retrieval_score: geminiResult.retrieval_score !== undefined ? geminiResult.retrieval_score : null,
        retrieval_methodology: geminiResult.retrieval_methodology || null,
        grounded: geminiResult.grounded !== false,
        groundingStatus: geminiResult.groundingStatus || 'GROUNDED',
        sources: geminiResult.sources || [],
        provenance: geminiResult.provenance,
        provider: geminiResult.provider || null,
        model: geminiResult.model || null,
        fallbackUsed: true
      };
      provider = geminiResult.provider || 'local';
      model = geminiResult.model || 'heuristic';
    }

    const durationMs = Date.now() - startTime;
    const isGrounded = ragData.grounded !== false && ragData.groundingStatus !== 'INSUFFICIENT_EVIDENCE';
    const groundedStatus = isGrounded ? 'GROUNDED' : 'INSUFFICIENT_EVIDENCE';

    recordAiTelemetry({
      correlationId: req.correlationId,
      userId: req.user.id,
      documentId: id,
      operationType: 'CHAT_RAG',
      provider,
      model,
      durationMs,
      status: 'SUCCESS',
      groundedStatus,
      tokensUsed: ragData.tokensUsed || 0,
      fallbackUsed
    });

    // Persist conversation messages
    const userMsgId = uuidv4();
    const assistantMsgId = uuidv4();

    try {
      await db.query(
        `INSERT INTO chat_messages (id, document_id, user_id, role, content, created_at)
         VALUES ($1, $2, $3, 'USER', $4, CURRENT_TIMESTAMP)`,
        [userMsgId, id, req.user.id, String(question).trim()]
      );

      const dbConfidence = typeof ragData.confidence === 'object' && ragData.confidence !== null
        ? ragData.confidence.score
        : (typeof ragData.confidence === 'number' ? ragData.confidence : null);

      await db.query(
        `INSERT INTO chat_messages (id, document_id, user_id, role, content, confidence, grounded, sources, created_at)
         VALUES ($1, $2, $3, 'ASSISTANT', $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [
          assistantMsgId,
          id,
          req.user.id,
          ragData.answer || '',
          dbConfidence,
          ragData.grounded !== undefined ? ragData.grounded : true,
          JSON.stringify(ragData.sources || [])
        ]
      );
    } catch (dbErr) {
      console.warn('Chat message persistence notice:', dbErr.message);
    }

    res.json(ragData);
  } catch (err) {
    console.error('Document chat error:', err);
    res.status(500).json({ error: 'AI Chat service unavailable' });
  }
});

router.get('/:id/chat', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Layer 1: Gateway Authorization & Ownership verification
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const { rows: messages } = await db.query(
      `SELECT id, role, content, confidence, grounded, sources, created_at AS "createdAt"
       FROM chat_messages
       WHERE document_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    const formattedMessages = messages.map(m => ({
      ...m,
      sources: typeof m.sources === 'string' ? JSON.parse(m.sources) : (m.sources || [])
    }));

    res.json({ messages: formattedMessages });
  } catch (err) {
    console.error('Document chat history fetch error:', err);
    res.status(500).json({ error: 'Failed to retrieve chat history' });
  }
});

router.post('/:id/negotiate', requireAuth, aiLimiter, async (req, res) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;

    // Layer 1: Gateway Authorization & Ownership verification FIRST
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const { clauseId, clauseType, mode = 'balanced' } = req.body || {};

    const validModes = ['balanced', 'protective', 'aggressive', 'collaborative'];
    if (mode && !validModes.includes(mode)) {
      return res.status(400).json({
        error: `Invalid negotiation mode '${mode}'. Must be one of: ${validModes.join(', ')}`
      });
    }

    // Idempotency check
    const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey || null;
    if (idempotencyKey) {
      const { rows: cachedRows } = await db.query(
        `SELECT * FROM contract_negotiations WHERE user_id = $1 AND idempotency_key = $2`,
        [req.user.id, idempotencyKey]
      );
      if (cachedRows.length > 0) {
        const row = cachedRows[0];
        return res.status(200).json({
          id: row.id,
          negotiationId: row.id,
          documentId: row.document_id,
          clauseId: row.clause_id,
          clauseType: row.clause_type,
          mode: row.mode,
          originalClause: row.original_clause,
          proposedClause: row.proposed_clause,
          beforeScore: row.before_score,
          afterScore: row.after_score,
          riskDelta: row.risk_delta,
          riskDirection: row.risk_direction,
          riskFindings: row.risk_findings,
          redline: row.redline,
          aiRecommendation: {
            suggestedRevision: row.proposed_clause,
            strategy: row.strategy,
            identifiedImbalance: row.identified_imbalance
          },
          provenance: row.provenance,
          status: row.status,
          calculationStatus: 'COMPLETED',
          persistenceStatus: 'CACHED',
          createdAt: row.created_at
        });
      }
    }

    // Layer 2 Isolation: If clauseId provided, verify it belongs strictly to this document
    let targetClauseRow = null;
    if (clauseId && !String(clauseId).startsWith('seg-')) {
      const { rows: cRows } = await db.query(
        'SELECT id, document_id, clause_type, extracted_snippet FROM document_clauses WHERE id = $1 AND document_id = $2',
        [clauseId, id]
      );
      if (cRows.length === 0) {
        return res.status(404).json({ error: 'Clause not found in specified document' });
      }
      targetClauseRow = cRows[0];
    }

    let negData = null;
    let provider = 'flask-nlp';
    let model = 'deciva-redliner';
    let fallbackUsed = false;

    try {
      const flaskRes = await fetch(`${AI_MICROSERVICE_URL}/api/documents/${id}/negotiate`, {
        method: 'POST',
        headers: getInternalHeaders(req, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ clauseId, clauseType, mode }),
        signal: AbortSignal.timeout(16000)
      });
      if (flaskRes.ok) {
        negData = await flaskRes.json();
      }
    } catch (proxyErr) {
      console.warn('Negotiate microservice proxy notice:', proxyErr.message);
    }

    if (!negData || negData.beforeScore === undefined) {
      fallbackUsed = true;
      provider = 'node-rules';
      model = 'deciva-redliner-fallback';
      negData = fallbackNegotiate(authCheck.document, clauseId, clauseType, mode, targetClauseRow);
    }

    // Persist negotiation record with explicit failure representation
    const negotiationId = uuidv4();
    let persistenceStatus = 'PERSISTED';
    let savedId = negotiationId;
    let savedStatus = 'ACTIVE';

    try {
      await db.query(
        `INSERT INTO contract_negotiations (
          id, document_id, user_id, clause_id, clause_type, mode,
          original_clause, proposed_clause, before_score, after_score,
          risk_delta, risk_direction, risk_findings, redline, strategy,
          identified_imbalance, provenance, idempotency_key, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          negotiationId,
          id,
          req.user.id,
          negData.clauseId || clauseId || null,
          negData.clauseType || clauseType || 'GENERAL_PROVISION',
          mode,
          negData.originalClause || '',
          negData.proposedClause || negData.aiRecommendation?.suggestedRevision || '',
          negData.beforeScore,
          negData.afterScore,
          negData.riskDelta,
          negData.riskDirection,
          JSON.stringify(negData.riskFindings || {}),
          JSON.stringify(negData.redline || {}),
          negData.aiRecommendation?.strategy || '',
          negData.aiRecommendation?.identifiedImbalance || '',
          JSON.stringify(negData.provenance || {}),
          idempotencyKey,
          'ACTIVE'
        ]
      );
    } catch (dbErr) {
      console.warn('Negotiation persistence notice:', dbErr.message);
      persistenceStatus = 'FAILED';
      savedId = null;
      savedStatus = 'EPHEMERAL_ONLY';
    }

    negData.id = savedId;
    negData.negotiationId = savedId;
    negData.status = savedStatus;
    negData.calculationStatus = 'COMPLETED';
    negData.persistenceStatus = persistenceStatus;

    const durationMs = Date.now() - startTime;
    recordAiTelemetry({
      correlationId: req.correlationId,
      userId: req.user.id,
      documentId: id,
      operationType: 'NEGOTIATION',
      provider,
      model,
      durationMs,
      status: 'SUCCESS',
      groundedStatus: 'GROUNDED',
      metadata: { mode },
      fallbackUsed
    });

    res.json(negData);
  } catch (err) {
    console.error('Document negotiation error:', err);
    res.status(500).json({ error: 'AI Negotiation service unavailable' });
  }
});

router.get('/:id/negotiations', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const { rows } = await db.query(
      `SELECT id, document_id, user_id, clause_id, clause_type, mode,
              original_clause, proposed_clause, before_score, after_score,
              risk_delta, risk_direction, risk_findings, redline, strategy,
              identified_imbalance, provenance, status, created_at
       FROM contract_negotiations
       WHERE document_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    const formatted = rows.map(r => ({
      id: r.id,
      negotiationId: r.id,
      documentId: r.document_id,
      clauseId: r.clause_id,
      clauseType: r.clause_type,
      mode: r.mode,
      originalClause: r.original_clause,
      proposedClause: r.proposed_clause,
      beforeScore: r.before_score,
      afterScore: r.after_score,
      riskDelta: r.risk_delta,
      riskDirection: r.risk_direction,
      riskFindings: r.risk_findings,
      redline: r.redline,
      strategy: r.strategy,
      identifiedImbalance: r.identified_imbalance,
      provenance: r.provenance,
      status: r.status,
      createdAt: r.created_at
    }));

    res.json({
      documentId: id,
      negotiations: formatted,
      count: formatted.length
    });
  } catch (err) {
    console.error('Fetch negotiations error:', err);
    res.status(500).json({ error: 'Failed to retrieve negotiation history' });
  }
});

router.get('/:id/negotiation-suggestions', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Layer 1: Gateway Authorization & Ownership verification
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    try {
      const flaskRes = await fetch(`${AI_MICROSERVICE_URL}/api/documents/${id}/negotiation-suggestions`, {
        headers: getInternalHeaders(req),
        signal: AbortSignal.timeout(4000)
      });
      if (flaskRes.ok) {
        const oppData = await flaskRes.json();
        return res.status(flaskRes.status).json(oppData);
      }
    } catch (proxyErr) {
      console.warn('Negotiation suggestions proxy notice:', proxyErr.message);
    }

    const opportunities = fallbackGetNegotiationOpportunities(authCheck.document);
    res.json({
      documentId: id,
      opportunities,
      count: opportunities.length
    });
  } catch (err) {
    console.error('Document negotiation suggestions error:', err);
    res.status(500).json({ error: 'AI Negotiation suggestions service unavailable' });
  }
});

router.post('/:id/export-redline-docx', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const { mode = 'balanced', clauses = null } = req.body;
    const { generateDocumentRedlineDocx } = require('../services/docxExportService');

    const result = await generateDocumentRedlineDocx({
      documentId: id,
      userId: req.user.id,
      negotiationMode: mode,
      requestedClauses: clauses
    });

    if (req.query.download === 'true') {
      return res.download(result.storage_path, result.filename);
    }

    return res.status(200).json({
      success: true,
      document_id: result.document_id,
      filename: result.filename,
      download_url: `/api/documents/${id}/download-redline-docx?file=${encodeURIComponent(result.filename)}`,
      clauses_count: result.clauses_count,
      generated_at: result.generated_at
    });
  } catch (err) {
    console.error('DOCX redline export error:', err);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message, code: err.code || 'DOCX_EXPORT_FAILED' });
  }
});

router.get('/:id/download-redline-docx', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const requestedFile = req.query.file;
    if (!requestedFile || !/^redline_[a-zA-Z0-9_-]+\.docx$/.test(requestedFile)) {
      return res.status(400).json({ error: 'Invalid or missing filename' });
    }

    const filePath = path.resolve(__dirname, '../../storage/docx_exports', requestedFile);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Export file not found or expired' });
    }

    return res.download(filePath, requestedFile);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:id/export-audit-package', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const { generateCryptographicAuditExport } = require('../services/auditExportService');
    const result = await generateCryptographicAuditExport({
      documentId: id,
      userId: req.user.id,
      tenantId: req.user.tenant_id
    });

    return res.status(200).json({
      success: true,
      export_id: result.export_id,
      filename: result.filename,
      bundle_sha256: result.bundle_sha256,
      sections_count: result.sections_count,
      manifest: result.manifest,
      download_url: `/api/documents/${id}/download-audit-package?file=${encodeURIComponent(result.filename)}`,
      generated_at: result.generated_at
    });
  } catch (err) {
    console.error('Audit package export error:', err);
    return res.status(500).json({ error: err.message, code: 'AUDIT_EXPORT_FAILED' });
  }
});

router.get('/:id/download-audit-package', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const requestedFile = req.query.file;
    if (!requestedFile || !/^audit_package_[a-zA-Z0-9_-]+\.json$/.test(requestedFile)) {
      return res.status(400).json({ error: 'Invalid or missing filename' });
    }

    const filePath = path.resolve(__dirname, '../../storage/audit_exports', requestedFile);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audit export package not found or expired' });
    }

    return res.download(filePath, requestedFile);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:id/simulate', requireAuth, aiLimiter, async (req, res) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;

    // Layer 1: Gateway Authorization & Ownership verification FIRST
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const scenario = typeof req.body.scenario === 'string' ? req.body.scenario.trim() : '';
    const clauseId = req.body.clauseId || req.body.clause_id || null;
    const originalClause = req.body.originalClause || req.body.original_clause || null;
    const proposedClause = typeof req.body.proposedClause === 'string'
      ? req.body.proposedClause.trim()
      : (typeof req.body.proposed_clause === 'string' ? req.body.proposed_clause.trim() : '');
    const rawIdempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || req.body.idempotencyKey || req.body.idempotency_key || null;
    const idempotencyKey = typeof rawIdempotencyKey === 'string' ? rawIdempotencyKey.trim() : null;

    if (!scenario && !proposedClause) {
      return res.status(400).json({ error: 'Either scenario text or proposedClause is required for risk simulation' });
    }

    // Check idempotency cache
    if (idempotencyKey) {
      const { rows: cachedRows } = await db.query(
        `SELECT id, scenario, clause_id AS "clauseId", original_clause AS "originalClause",
                proposed_clause AS "proposedClause", before_score AS "beforeScore",
                after_score AS "afterScore", risk_delta AS "riskDelta", risk_direction AS "riskDirection",
                risk_findings AS "riskFindings", grounded, document_evidence AS "documentEvidence",
                simulation_analysis AS "simulationAnalysis", risk_level AS "riskLevel",
                provenance, idempotency_key AS "idempotencyKey", status, created_at AS "createdAt"
         FROM contract_simulations
         WHERE document_id = $1 AND user_id = $2 AND idempotency_key = $3;`,
        [id, req.user.id, idempotencyKey]
      );
      if (cachedRows.length > 0) {
        const cached = cachedRows[0];
        return res.status(200).json({
          simulationId: cached.id,
          documentId: id,
          scenario: cached.scenario,
          clauseId: cached.clauseId,
          originalClause: cached.originalClause,
          proposedClause: cached.proposedClause,
          beforeScore: cached.beforeScore,
          afterScore: cached.afterScore,
          riskDelta: cached.riskDelta,
          riskDirection: cached.riskDirection,
          riskFindings: typeof cached.riskFindings === 'string' ? JSON.parse(cached.riskFindings) : (cached.riskFindings || {}),
          grounded: cached.grounded,
          documentEvidence: typeof cached.documentEvidence === 'string' ? JSON.parse(cached.documentEvidence) : (cached.documentEvidence || []),
          simulationAnalysis: typeof cached.simulationAnalysis === 'string' ? JSON.parse(cached.simulationAnalysis) : (cached.simulationAnalysis || {}),
          provenance: typeof cached.provenance === 'string' ? JSON.parse(cached.provenance) : (cached.provenance || {}),
          status: cached.status
        });
      }
    }

    let simData = null;
    let provider = 'flask-nlp';
    let model = 'deciva-simulator';
    let fallbackUsed = false;

    try {
      const flaskRes = await fetch(`${AI_MICROSERVICE_URL}/api/documents/${id}/simulate`, {
        method: 'POST',
        headers: getInternalHeaders(req, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scenario,
          clauseId,
          originalClause,
          proposedClause,
          idempotencyKey
        }),
        signal: AbortSignal.timeout(16000)
      });
      if (flaskRes.ok) {
        simData = await flaskRes.json();
      } else {
        const errJson = await flaskRes.json().catch(() => ({}));
        if (flaskRes.status === 400 && errJson.error) {
          return res.status(400).json(errJson);
        }
      }
    } catch (proxyErr) {
      console.warn('Simulation microservice proxy notice:', proxyErr.message);
    }

    if (!simData) {
      fallbackUsed = true;
      provider = 'node-rules';
      model = 'deciva-simulator-fallback';
      simData = await fallbackSimulate(authCheck.document, {
        scenario,
        clauseId,
        originalClause,
        proposedClause
      }, db);
      if (simData.error) {
        return res.status(simData.status || 400).json(simData);
      }
    }

    const durationMs = Date.now() - startTime;

    // Persist to contract_simulations in PostgreSQL
    const simId = simData.simulationId || uuidv4();
    try {
      await db.query(
        `INSERT INTO contract_simulations (
          id, document_id, user_id, scenario, clause_id, original_clause, proposed_clause,
          before_score, after_score, risk_delta, risk_direction, risk_findings,
          grounded, document_evidence, simulation_analysis, risk_level, provenance,
          idempotency_key, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19);`,
        [
          simId,
          id,
          req.user.id,
          (simData.scenario || scenario || '').trim(),
          simData.clauseId || clauseId || null,
          simData.originalClause || originalClause || null,
          simData.proposedClause || proposedClause || null,
          simData.beforeScore !== undefined ? simData.beforeScore : null,
          simData.afterScore !== undefined ? simData.afterScore : null,
          simData.riskDelta !== undefined ? simData.riskDelta : null,
          simData.riskDirection || 'UNCHANGED',
          JSON.stringify(simData.riskFindings || {}),
          simData.grounded !== false,
          JSON.stringify(simData.documentEvidence || []),
          JSON.stringify(simData.simulationAnalysis || {}),
          simData.afterLevel || simData.simulationAnalysis?.riskLevel || 'UNKNOWN',
          JSON.stringify(simData.provenance || {}),
          idempotencyKey || null,
          'COMPLETED'
        ]
      );
      simData.simulationId = simId;
    } catch (dbErr) {
      console.warn('Failed to persist contract simulation:', dbErr.message);
    }

    recordAiTelemetry({
      correlationId: req.correlationId,
      userId: req.user.id,
      documentId: id,
      operationType: 'SIMULATION',
      provider,
      model,
      durationMs,
      status: 'SUCCESS',
      groundedStatus: simData.grounded !== false ? 'GROUNDED' : 'PARTIAL',
      metadata: { riskLevel: simData.afterLevel || simData.simulationAnalysis?.riskLevel, riskDelta: simData.riskDelta },
      fallbackUsed
    });

    res.json(simData);
  } catch (err) {
    console.error('Document simulation error:', err);
    res.status(500).json({ error: 'AI Simulation service unavailable' });
  }
});

router.get('/:id/simulations', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Layer 1: Gateway Authorization & Ownership verification
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const { rows: simulations } = await db.query(
      `SELECT id, scenario, clause_id AS "clauseId", original_clause AS "originalClause",
              proposed_clause AS "proposedClause", before_score AS "beforeScore",
              after_score AS "afterScore", risk_delta AS "riskDelta", risk_direction AS "riskDirection",
              risk_findings AS "riskFindings", grounded, document_evidence AS "documentEvidence",
              simulation_analysis AS "simulationAnalysis", risk_level AS "riskLevel",
              provenance, idempotency_key AS "idempotencyKey", status,
              created_at AS "createdAt"
       FROM contract_simulations
       WHERE document_id = $1
       ORDER BY created_at DESC;`,
      [id]
    );

    const formattedSimulations = simulations.map(s => ({
      ...s,
      riskFindings: typeof s.riskFindings === 'string' ? JSON.parse(s.riskFindings) : (s.riskFindings || {}),
      documentEvidence: typeof s.documentEvidence === 'string' ? JSON.parse(s.documentEvidence) : (s.documentEvidence || []),
      simulationAnalysis: typeof s.simulationAnalysis === 'string' ? JSON.parse(s.simulationAnalysis) : (s.simulationAnalysis || {}),
      provenance: typeof s.provenance === 'string' ? JSON.parse(s.provenance) : (s.provenance || {})
    }));

    res.json({ simulations: formattedSimulations, count: formattedSimulations.length });
  } catch (err) {
    console.error('Document simulations history fetch error:', err);
    res.status(500).json({ error: 'Failed to retrieve simulation history' });
  }
});

router.get('/:id/intelligence', requireAuth, async (req, res) => {
  const intelStart = Date.now();
  try {
    const { id } = req.params;

    // Layer 1: Gateway Authentication & Authorization Check
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    let intelData = null;
    let provider = 'flask-nlp';
    let model = 'deciva-intelligence';
    let fallbackUsed = false;

    try {
      const flaskRes = await fetch(`${AI_MICROSERVICE_URL}/api/documents/${id}/intelligence`, {
        headers: getInternalHeaders(req),
        signal: AbortSignal.timeout(4000)
      });
      if (flaskRes.ok) {
        intelData = await flaskRes.json();
      }
    } catch (proxyErr) {
      console.warn('Intelligence microservice proxy notice:', proxyErr.message);
    }

    if (!intelData) {
      fallbackUsed = true;
      provider = 'node-rules';
      model = 'deciva-intelligence-fallback';
      intelData = fallbackGetIntelligence(authCheck.document);
    }

    recordAiTelemetry({
      correlationId: req.correlationId,
      userId: req.user.id,
      documentId: id,
      operationType: 'INTELLIGENCE',
      provider,
      model,
      durationMs: Date.now() - intelStart,
      status: 'SUCCESS',
      groundedStatus: 'GROUNDED',
      fallbackUsed
    });

    // Gateway Single Persistence Boundary: Persist intelligence snapshot to PostgreSQL
    try {
      const snapId = uuidv4();
      await db.query(
        `INSERT INTO contract_intelligence (
          id, document_id, user_id, health_score, critical_count, important_count,
          monitoring_count, healthy_count, executive_summary, conflicts_json, actions_json, metrics_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);`,
        [
          snapId,
          id,
          req.user.id,
          intelData.healthScore || 0,
          intelData.metrics?.criticalCount || 0,
          intelData.metrics?.importantCount || 0,
          intelData.metrics?.monitoringCount || 0,
          intelData.metrics?.healthyCount || 0,
          intelData.executiveSummary || '',
          JSON.stringify(intelData.conflicts || []),
          JSON.stringify(intelData.actionPlan || []),
          JSON.stringify(intelData.metrics || {})
        ]
      );
      intelData.snapshotId = snapId;
    } catch (persistErr) {
      console.warn('Contract intelligence snapshot persistence warning:', persistErr.message);
    }

    res.json(intelData);
  } catch (err) {
    console.error('Document intelligence error:', err);
    res.status(500).json({ error: 'Executive Intelligence service unavailable' });
  }
});

router.post('/:id/intelligence/refresh', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Layer 1: Gateway Authentication & Authorization Check
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    let intelData = null;
    try {
      const flaskRes = await fetch(`${AI_MICROSERVICE_URL}/api/documents/${id}/intelligence/refresh`, {
        method: 'POST',
        headers: getInternalHeaders(req),
        signal: AbortSignal.timeout(5000)
      });
      if (flaskRes.ok) {
        intelData = await flaskRes.json();
      }
    } catch (proxyErr) {
      console.warn('Intelligence refresh proxy notice:', proxyErr.message);
    }

    if (!intelData) {
      intelData = fallbackGetIntelligence(authCheck.document);
    }

    // Gateway Single Persistence Boundary: Persist refreshed snapshot
    try {
      const snapId = uuidv4();
      await db.query(
        `INSERT INTO contract_intelligence (
          id, document_id, user_id, health_score, critical_count, important_count,
          monitoring_count, healthy_count, executive_summary, conflicts_json, actions_json, metrics_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);`,
        [
          snapId,
          id,
          req.user.id,
          intelData.healthScore || 0,
          intelData.metrics?.criticalCount || 0,
          intelData.metrics?.importantCount || 0,
          intelData.metrics?.monitoringCount || 0,
          intelData.metrics?.healthyCount || 0,
          intelData.executiveSummary || '',
          JSON.stringify(intelData.conflicts || []),
          JSON.stringify(intelData.actionPlan || []),
          JSON.stringify(intelData.metrics || {})
        ]
      );
      intelData.snapshotId = snapId;
    } catch (persistErr) {
      console.warn('Contract intelligence snapshot persistence warning:', persistErr.message);
    }

    res.json(intelData);
  } catch (err) {
    console.error('Document intelligence refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh executive intelligence' });
  }
});

router.get('/:id/actions', requireAuth, getDocumentActions);
router.post('/:id/actions/sync', requireAuth, syncDocumentActions);

router.get('/:id/decision-intelligence', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const data = await getDocumentDecisionIntelligence(id, req.user, req.correlationId);
    res.json(data);
  } catch (err) {
    console.error('Decision Intelligence error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Decision Intelligence service unavailable' });
  }
});

router.post('/:id/decisions/scenarios', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const data = await getDocumentDecisionIntelligence(id, req.user, req.correlationId);
    res.json({
      documentId: id,
      exposureScore: data.exposureScore,
      whatIfScenarios: data.whatIfScenarios || [],
      disclaimer: data.disclaimer
    });
  } catch (err) {
    console.error('Decision Scenarios error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Decision scenarios service unavailable' });
  }
});

router.post('/:id/decisions/act', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const result = await applyDecisionAction(id, req.user, req.body);
    res.status(201).json(result);
  } catch (err) {
    console.error('Apply Decision Action error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to apply decision action' });
  }
});

router.get('/:id/monitoring', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const data = await evaluateContractMonitoring(id, req.correlationId);
    res.json(data);
  } catch (err) {
    console.error('Document monitoring error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Contract monitoring service unavailable' });
  }
});

router.get('/:id/lifecycle', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const { rows } = await db.query(
      `SELECT * FROM contract_lifecycle_states WHERE document_id = $1`,
      [id]
    );
    if (!rows.length) {
      const evalData = await evaluateContractMonitoring(id, req.correlationId);
      return res.json({ success: true, lifecycle: evalData.lifecycle });
    }
    res.json({ success: true, lifecycle: rows[0] });
  } catch (err) {
    console.error('Document lifecycle error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Contract lifecycle service unavailable' });
  }
});

router.get('/:id/changes', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const data = await getDocumentChanges(id, req.user);
    res.json(data);
  } catch (err) {
    console.error('Document changes error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Contract changes service unavailable' });
  }
});

router.post('/:id/monitoring/:eventId/acknowledge', requireAuth, async (req, res) => {
  try {
    const { id, eventId } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const updated = await acknowledgeMonitoringEvent(id, eventId, req.user);
    res.json({ success: true, event: updated });
  } catch (err) {
    console.error('Acknowledge monitoring event error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to acknowledge monitoring event' });
  }
});

router.get('/:id/decisions', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const decisions = await listDocumentDecisions(id, req.user, req.query);
    res.json({ success: true, decisions });
  } catch (err) {
    console.error('List document decisions error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to list document decisions' });
  }
});

router.post('/:id/decisions', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const result = await createDecisionWorkflow(req.user.id, id, req.user.id, req.body);
    res.status(201).json({ success: true, decision: result });
  } catch (err) {
    console.error('Create decision workflow error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to create decision workflow' });
  }
});

router.post('/:id/decisions/policy-evaluate', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const evaluation = evaluateApprovalPolicy(req.body);
    res.json({ success: true, evaluation });
  } catch (err) {
    console.error('Evaluate approval policy error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to evaluate approval policy' });
  }
});

router.get('/:id/compliance-governance', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const tenantId = req.user.tenant_id || req.user.id;
    const evaluation = await policyComplianceService.getDocumentCompliance(tenantId, id);
    res.json({ success: true, evaluation });
  } catch (err) {
    console.error('Get document compliance error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to get compliance evaluation' });
  }
});

router.post('/:id/compliance-governance/evaluate', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const tenantId = req.user.tenant_id || req.user.id;
    const evaluation = await policyComplianceService.evaluateDocumentCompliance(tenantId, id, req.user.id, req.body || {});
    res.json({ success: true, evaluation });
  } catch (err) {
    console.error('Evaluate document compliance error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to evaluate document compliance' });
  }
});

router.get('/:id/compliance-governance/findings', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const tenantId = req.user.tenant_id || req.user.id;
    const findings = await policyComplianceService.getDocumentFindings(tenantId, id);
    res.json({ success: true, findings });
  } catch (err) {
    console.error('Get document findings error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to get compliance findings' });
  }
});

router.post('/:id/compliance-governance/findings/:findingId/exception', requireAuth, async (req, res) => {
  try {
    const { id, findingId } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const tenantId = req.user.tenant_id || req.user.id;
    const { reason } = req.body;
    const exception = await policyComplianceService.requestException(tenantId, id, findingId, req.user.id, reason);
    res.status(201).json({ success: true, exception });
  } catch (err) {
    console.error('Request exception error:', err);
    res.status(err.status || 400).json({ error: err.message || 'Failed to request exception' });
  }
});

router.get('/:id/compliance-governance/exceptions', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authCheck = await authorizeDocument(id, req.user);
    if (authCheck.errorStatus) {
      return res.status(authCheck.errorStatus).json({ error: authCheck.errorMessage });
    }

    const tenantId = req.user.tenant_id || req.user.id;
    const exceptions = await policyComplianceService.listExceptions(tenantId, { document_id: id });
    res.json({ success: true, exceptions });
  } catch (err) {
    console.error('Get document exceptions error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to get document exceptions' });
  }
});

const workflowAnalyticsRouter = require('./workflowAnalytics');
router.use('/', workflowAnalyticsRouter);

router.formatFallbackClauses = formatFallbackClauses;
router.fallbackGetAnalysis = fallbackGetAnalysis;
router.fallbackGetNegotiationOpportunities = fallbackGetNegotiationOpportunities;

module.exports = router;
