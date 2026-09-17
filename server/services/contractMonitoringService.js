/**
 * Deciva — Contract Portfolio Monitoring & Lifecycle Service
 * ---------------------------------------------------------------------------
 * Continuous, deterministic portfolio intelligence and monitoring engine.
 * 
 * Core Architectural Principles:
 * 1. Evidence-First Monitoring: Every event references an actual contract artifact,
 *    clause, or stored intelligence snapshot. Never generate ungrounded alerts.
 * 2. Deterministic Change Detection: Detects modifications in clauses, liability caps,
 *    notice windows, payment terms, and governing jurisdictions with previous & current values.
 * 3. Strict No-Fabrication: If dates or deadlines are absent from evidence, returns NOT_AVAILABLE or UNKNOWN.
 * 4. Deterministic Prioritization: Inspectable weighted priority formula across Severity, Relevance, Urgency, and Magnitude.
 * 5. Strict Idempotency & Deduplication: Running monitoring cycles repeatedly against unchanged
 *    contracts generates zero duplicate events or actions.
 * 6. Action Center Bridge: Automatically routes prioritized critical/high events into contract_actions.
 * 7. Cryptographic Audit & Telemetry: Preserves full chain integrity and privacy-safe operational telemetry.
 */

const http = require('http');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { recordAudit } = require('../utils/audit');
const { recordAiTelemetry } = require('../utils/aiTelemetry');
const logger = require('../utils/logger');
const { getInternalServiceKey } = require('./productionConfigService');

const FLASK_HOST = process.env.FLASK_HOST || '127.0.0.1';
const FLASK_PORT = process.env.FLASK_PORT || 5001;
const rawAiUrl = (process.env.AI_MICROSERVICE_URL || `http://${FLASK_HOST}:${FLASK_PORT}`).trim();
const AI_MICROSERVICE_URL = (rawAiUrl.startsWith('http://') || rawAiUrl.startsWith('https://') ? rawAiUrl : `http://${rawAiUrl}`).replace(/\/+$/, '');
const INTERNAL_KEY = getInternalServiceKey();

const NOT_AVAILABLE = 'NOT_AVAILABLE';
const UNKNOWN = 'UNKNOWN';

// Deterministic scoring weights
const SEVERITY_SCORES = { CRITICAL: 95, HIGH: 75, MEDIUM: 50, LOW: 25, INFORMATIONAL: 10 };
const RELEVANCE_SCORES = { HIGH: 85, MEDIUM: 50, LOW: 20 };
const URGENCY_SCORES = { IMMEDIATE: 95, URGENT: 85, APPROACHING: 65, MODERATE: 40, LOW: 15 };
const MAGNITUDE_SCORES = { MAJOR: 90, MODERATE: 55, MINOR: 25 };

/**
 * Deterministic attention priority calculation.
 */
function calculateAttentionPriority(sev = 'MEDIUM', rel = 'MEDIUM', urg = 'LOW', mag = 'MODERATE') {
  const s = SEVERITY_SCORES[sev.toUpperCase()] || 50;
  const r = RELEVANCE_SCORES[rel.toUpperCase()] || 50;
  const u = URGENCY_SCORES[urg.toUpperCase()] || 15;
  const m = MAGNITUDE_SCORES[mag.toUpperCase()] || 25;

  const raw = (0.35 * s) + (0.25 * r) + (0.25 * u) + (0.15 * m);
  const score = Math.min(100, Math.max(0, Math.round(raw)));

  let rank = 'INFORMATIONAL';
  if (score >= 80) rank = 'CRITICAL';
  else if (score >= 60) rank = 'HIGH';
  else if (score >= 40) rank = 'MEDIUM';
  else if (score >= 20) rank = 'LOW';

  return {
    priority_score: score,
    priority_rank: rank,
    factors: {
      severity: { level: sev.toUpperCase(), score: s, weight: 0.35 },
      business_relevance: { level: rel.toUpperCase(), score: r, weight: 0.25 },
      deadline_urgency: { level: urg.toUpperCase(), score: u, weight: 0.25 },
      change_magnitude: { level: mag.toUpperCase(), score: m, weight: 0.15 }
    },
    formula: 'round(0.35 * S + 0.25 * R + 0.25 * U + 0.15 * M)'
  };
}

/**
 * Extracts liability cap numeric value and excerpt.
 */
function extractLiabilityCap(text) {
  if (!text) return null;
  const patterns = [
    /(?:liability\s+(?:shall|will|is)?\s*(?:not\s+exceed|be\s+limited\s+to|capped\s+at)\s*(?:\$|USD\s*)([0-9,]+(?:\.[0-9]{2})?))/i,
    /(?:maximum\s+aggregate\s+liability\s*(?:shall\s+be|of)\s*(?:\$|USD\s*)([0-9,]+(?:\.[0-9]{2})?))/i,
    /(?:aggregate\s+liability\s+(?:under|arising).*?(?:\$|USD\s*)([0-9,]+(?:\.[0-9]{2})?))/i,
    /(?:cap\s+of\s*(?:\$|USD\s*)([0-9,]+(?:\.[0-9]{2})?))/i
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(val)) {
        const start = Math.max(0, m.index - 20);
        const end = Math.min(text.length, m.index + m[0].length + 20);
        return { val, quote: text.slice(start, end).trim() };
      }
    }
  }
  return null;
}

/**
 * Extracts governing law jurisdiction and excerpt.
 */
function extractGoverningLaw(text) {
  if (!text) return null;
  const m = text.match(/(?:governed\s+by(?:\s+and\s+construed\s+in\s+accordance\s+with)?\s+the\s+laws\s+of\s+(?:the\s+State\s+of\s+)?([A-Za-z\s]+?)(?:\.|,|\s+without|\s+and))/i);
  if (m) {
    return {
      jurisdiction: m[1].trim(),
      quote: text.slice(Math.max(0, m.index), Math.min(text.length, m.index + m[0].length + 30)).trim()
    };
  }
  return null;
}

/**
 * Extracts payment terms and excerpt.
 */
function extractPaymentTerms(text) {
  if (!text) return null;
  const m = text.match(/(?:(?:Net\s*(?:15|30|45|60|90))|(?:within\s+(?:15|30|45|60|90)\s+(?:calendar\s+)?days\s+of\s+(?:receipt\s+of\s+)?invoice))/i);
  if (m) {
    return {
      term: m[0].trim(),
      quote: text.slice(Math.max(0, m.index - 15), Math.min(text.length, m.index + m[0].length + 20)).trim()
    };
  }
  return null;
}

/**
 * Extracts notice days and excerpt.
 */
function extractNoticeDays(text) {
  if (!text) return null;
  const patterns = [
    /(?:written\s+notice\s+(?:of\s+at\s+least|at\s+least|not\s+less\s+than)\s*([0-9]+)\s*(?:business\s+|calendar\s+)?days)/i,
    /(?:notice\s+(?:period\s+of|prior\s+to\s+renewal\s+of)\s*([0-9]+)\s*days)/i,
    /(?:prior\s+written\s+notice\s+of\s*([0-9]+)\s*days)/i
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const days = parseInt(m[1], 10);
      if (!isNaN(days)) {
        return {
          days,
          quote: text.slice(Math.max(0, m.index - 10), Math.min(text.length, m.index + m[0].length + 25)).trim()
        };
      }
    }
  }
  return null;
}

/**
 * Evaluates contract lifecycle events and dates deterministically.
 */
function computeLocalLifecycle(docId, text, now = new Date()) {
  if (!text) {
    return {
      document_id: docId,
      state: UNKNOWN,
      renewal_date: NOT_AVAILABLE,
      notice_deadline: NOT_AVAILABLE,
      cure_deadline: NOT_AVAILABLE,
      expiration_date: NOT_AVAILABLE,
      lifecycle_reason: 'Contract contains no extracted text or verifiable dates.',
      evidence: {
        expiration_evidence: NOT_AVAILABLE,
        renewal_evidence: NOT_AVAILABLE,
        notice_evidence: NOT_AVAILABLE,
        cure_evidence: NOT_AVAILABLE,
        auto_renew: false,
        notice_period_days: NOT_AVAILABLE,
        cure_period_days: NOT_AVAILABLE
      }
    };
  }

  // Find expiration date
  let expirationDate = null;
  let expirationQuote = null;
  const datePatterns = [
    /(?:expires?\s+on|expiration\s+date\s*(?:is|:)?|shall\s+terminate\s+on|term\s+ends\s+on)\s*([A-Za-z]+\s+[0-9]{1,2},?\s+[0-9]{4}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i,
    /(?:effective\s+until)\s*([A-Za-z]+\s+[0-9]{1,2},?\s+[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i
  ];

  for (const pat of datePatterns) {
    const m = text.match(pat);
    if (m) {
      const parsed = new Date(m[1]);
      if (!isNaN(parsed.getTime())) {
        expirationDate = parsed;
        expirationQuote = text.slice(Math.max(0, m.index - 10), Math.min(text.length, m.index + m[0].length + 20)).trim();
        break;
      }
    }
  }

  const noticeInfo = extractNoticeDays(text);
  const noticeDays = noticeInfo ? noticeInfo.days : null;
  const noticeQuote = noticeInfo ? noticeInfo.quote : null;

  // Auto-renewal clause
  const autoRenewMatch = text.match(/(?:automatic(?:ally)?\s+renew(?:al|s)?|successive\s+(?:terms?|periods?)\s+of\s*[0-9]+\s*(?:year|month)s?)/i);
  const autoRenew = Boolean(autoRenewMatch);
  const renewalQuote = autoRenewMatch ? text.slice(Math.max(0, autoRenewMatch.index - 15), Math.min(text.length, autoRenewMatch.index + autoRenewMatch[0].length + 35)).trim() : null;

  let noticeDeadline = null;
  if (expirationDate && noticeDays !== null) {
    noticeDeadline = new Date(expirationDate.getTime() - (noticeDays * 24 * 60 * 60 * 1000));
  }

  const renewalDate = autoRenew ? expirationDate : null;

  let state = UNKNOWN;
  let reason = 'Contract does not contain sufficient dates or renewal provisions.';

  if (expirationDate) {
    const daysToExpiration = (expirationDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    if (daysToExpiration < 0) {
      state = 'EXPIRED';
      reason = `Contract passed expiration date (${expirationDate.toISOString().slice(0, 10)}).`;
    } else if (noticeDeadline) {
      const daysToNotice = (noticeDeadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
      if (daysToNotice < 0 && daysToExpiration > 0) {
        state = 'NOTICE_WINDOW_OPEN';
        reason = `Contract is within the mandatory ${noticeDays}-day non-renewal notice window.`;
      } else if (daysToNotice <= 30) {
        state = 'RENEWAL_APPROACHING';
        reason = `Notice deadline (${noticeDeadline.toISOString().slice(0, 10)}) approaches in ${Math.round(daysToNotice)} days.`;
      } else {
        state = 'ACTIVE';
        reason = 'Contract is in active term outside critical notice windows.';
      }
    } else if (daysToExpiration <= 60) {
      state = 'RENEWAL_APPROACHING';
      reason = `Contract expiration approaches in ${Math.round(daysToExpiration)} days.`;
    } else {
      state = 'ACTIVE';
      reason = 'Contract is in active term.';
    }
  } else if (/agreement|terms|contract/i.test(text)) {
    state = 'ACTIVE';
    reason = 'Contract language indicates ongoing operational agreement; specific expiration date NOT_AVAILABLE.';
  }

  return {
    document_id: docId,
    state,
    renewal_date: renewalDate ? renewalDate.toISOString() : NOT_AVAILABLE,
    notice_deadline: noticeDeadline ? noticeDeadline.toISOString() : NOT_AVAILABLE,
    cure_deadline: NOT_AVAILABLE,
    expiration_date: expirationDate ? expirationDate.toISOString() : NOT_AVAILABLE,
    lifecycle_reason: reason,
    evidence: {
      expiration_evidence: expirationQuote || NOT_AVAILABLE,
      renewal_evidence: renewalQuote || NOT_AVAILABLE,
      notice_evidence: noticeQuote || NOT_AVAILABLE,
      cure_evidence: NOT_AVAILABLE,
      auto_renew: autoRenew,
      notice_period_days: noticeDays !== null ? noticeDays : NOT_AVAILABLE,
      cure_period_days: NOT_AVAILABLE
    }
  };
}

/**
 * Detects contract changes locally when Python is unavailable.
 */
function computeLocalChanges(prevText, currText, prevIntel, currIntel, docId) {
  const changes = [];
  if (!prevText && !prevIntel) return changes;

  const prevT = prevText || '';
  const currT = currText || '';

  const prevCap = extractLiabilityCap(prevT);
  const currCap = extractLiabilityCap(currT);
  if (prevCap && currCap && prevCap.val !== currCap.val) {
    const diff = currCap.val - prevCap.val;
    const riskDelta = diff > 0 ? -15 : 25;
    changes.push({
      document_id: docId,
      event_type: 'LIABILITY_CHANGE',
      severity: currCap.val < prevCap.val ? 'CRITICAL' : 'MEDIUM',
      field: 'liability_cap',
      previous_value: `$${prevCap.val.toLocaleString('en-US')}`,
      current_value: `$${currCap.val.toLocaleString('en-US')}`,
      title: `Liability Cap Modified from $${Math.round(prevCap.val).toLocaleString('en-US')} to $${Math.round(currCap.val).toLocaleString('en-US')}`,
      description: `Contractual aggregate liability cap shifted from $${prevCap.val.toFixed(2)} to $${currCap.val.toFixed(2)}.`,
      evidence_reference: currCap.quote,
      affected_dimension: 'LIABILITY_LIMIT',
      risk_delta: riskDelta,
      deduplication_key: `change_liability_cap_${Math.round(prevCap.val)}_${Math.round(currCap.val)}`
    });
  } else if (!prevCap && currCap) {
    changes.push({
      document_id: docId,
      event_type: 'LIABILITY_CHANGE',
      severity: 'LOW',
      field: 'liability_cap',
      previous_value: NOT_AVAILABLE,
      current_value: `$${currCap.val.toLocaleString('en-US')}`,
      title: `Explicit Liability Cap Introduced: $${Math.round(currCap.val).toLocaleString('en-US')}`,
      description: `A defined liability cap of $${currCap.val.toFixed(2)} was added to the contract.`,
      evidence_reference: currCap.quote,
      affected_dimension: 'LIABILITY_LIMIT',
      risk_delta: -10,
      deduplication_key: `change_liability_cap_added_${Math.round(currCap.val)}`
    });
  } else if (prevCap && !currCap) {
    changes.push({
      document_id: docId,
      event_type: 'LIABILITY_CHANGE',
      severity: 'CRITICAL',
      field: 'liability_cap',
      previous_value: `$${prevCap.val.toLocaleString('en-US')}`,
      current_value: NOT_AVAILABLE,
      title: 'Liability Cap Removed (Unlimited Exposure)',
      description: 'Previous liability limitation was removed, creating potential uncapped liability.',
      evidence_reference: `Previous: ${prevCap.quote}`,
      affected_dimension: 'LIABILITY_LIMIT',
      risk_delta: 30,
      deduplication_key: 'change_liability_cap_removed'
    });
  }

  const prevLaw = extractGoverningLaw(prevT);
  const currLaw = extractGoverningLaw(currT);
  if (prevLaw && currLaw && prevLaw.jurisdiction.toLowerCase() !== currLaw.jurisdiction.toLowerCase()) {
    changes.push({
      document_id: docId,
      event_type: 'GOVERNING_LAW_CHANGE',
      severity: 'HIGH',
      field: 'governing_law',
      previous_value: prevLaw.jurisdiction,
      current_value: currLaw.jurisdiction,
      title: `Governing Law Changed: ${prevLaw.jurisdiction} → ${currLaw.jurisdiction}`,
      description: `Governing jurisdiction amended from ${prevLaw.jurisdiction} to ${currLaw.jurisdiction}.`,
      evidence_reference: currLaw.quote,
      affected_dimension: 'JURISDICTION_LAW',
      risk_delta: 15,
      deduplication_key: `change_gov_law_${prevLaw.jurisdiction.toLowerCase()}_${currLaw.jurisdiction.toLowerCase()}`
    });
  }

  const prevPay = extractPaymentTerms(prevT);
  const currPay = extractPaymentTerms(currT);
  if (prevPay && currPay && prevPay.term.toLowerCase() !== currPay.term.toLowerCase()) {
    changes.push({
      document_id: docId,
      event_type: 'PAYMENT_TERM_CHANGE',
      severity: 'MEDIUM',
      field: 'payment_terms',
      previous_value: prevPay.term,
      current_value: currPay.term,
      title: `Payment Terms Modified: ${prevPay.term} → ${currPay.term}`,
      description: `Contractual settlement window updated from ${prevPay.term} to ${currPay.term}.`,
      evidence_reference: currPay.quote,
      affected_dimension: 'PAYMENT_OBLIGATION',
      risk_delta: 5,
      deduplication_key: `change_payment_${prevPay.term.toLowerCase()}_${currPay.term.toLowerCase()}`
    });
  }

  const prevNotice = extractNoticeDays(prevT);
  const currNotice = extractNoticeDays(currT);
  if (prevNotice && currNotice && prevNotice.days !== currNotice.days) {
    const riskDelta = currNotice.days < prevNotice.days ? 15 : -5;
    changes.push({
      document_id: docId,
      event_type: currNotice.days < prevNotice.days ? 'NOTICE_DEADLINE_APPROACHING' : 'CONTRACT_CHANGED',
      severity: currNotice.days < prevNotice.days ? 'HIGH' : 'LOW',
      field: 'notice_period',
      previous_value: `${prevNotice.days} days`,
      current_value: `${currNotice.days} days`,
      title: `Notice Window Adjusted: ${prevNotice.days} days → ${currNotice.days} days`,
      description: `Contract notice requirement modified from ${prevNotice.days} days to ${currNotice.days} days.`,
      evidence_reference: currNotice.quote,
      affected_dimension: 'TERMINATION_RIGHTS',
      risk_delta: riskDelta,
      deduplication_key: `change_notice_days_${prevNotice.days}_${currNotice.days}`
    });
  }

  if (prevIntel && currIntel) {
    const prevExp = prevIntel.exposure_score || prevIntel.health_score || 0;
    const currExp = currIntel.exposure_score || currIntel.health_score || 0;
    const diff = currExp - prevExp;
    if (Math.abs(diff) >= 10) {
      changes.push({
        document_id: docId,
        event_type: diff > 0 ? 'RISK_INCREASED' : 'RISK_DECREASED',
        severity: diff >= 20 ? 'CRITICAL' : (diff >= 10 ? 'HIGH' : 'INFORMATIONAL'),
        field: 'exposure_score',
        previous_value: String(prevExp),
        current_value: String(currExp),
        title: diff > 0 ? `Contract Exposure Surged by ${diff} Points` : `Contract Exposure Decreased by ${Math.abs(diff)} Points`,
        description: `Contract exposure score moved from ${prevExp} to ${currExp} (${diff >= 0 ? '+' : ''}${diff}).`,
        evidence_reference: currIntel.primary_driver || 'Re-evaluated contract intelligence baseline.',
        affected_dimension: 'COMPREHENSIVE_RISK',
        risk_delta: diff,
        deduplication_key: `change_risk_score_${prevExp}_${currExp}`
      });
    }
  }

  return changes;
}

/**
 * Fetch monitoring evaluation from Flask microservice.
 */
async function fetchMonitoringFromFlask(docId, correlationId) {
  const res = await fetch(`${AI_MICROSERVICE_URL}/api/documents/${encodeURIComponent(docId)}/monitoring/evaluate`, {
    method: 'GET',
    headers: {
      'x-internal-service-key': INTERNAL_KEY,
      'x-correlation-id': correlationId || uuidv4()
    },
    signal: AbortSignal.timeout(8000)
  });

  if (res.ok) {
    return await res.json();
  }
  const text = await res.text();
  throw new Error(`Microservice returned status ${res.status}: ${text.slice(0, 200)}`);
}

/**
 * Evaluates monitoring for a single contract with automatic microservice failover.
 */
async function evaluateContractMonitoring(docId, correlationId) {
  const startTime = Date.now();
  let result = null;
  let fallbackUsed = false;

  try {
    result = await fetchMonitoringFromFlask(docId, correlationId);
  } catch (flaskErr) {
    logger.warn(`[Monitoring Service] Microservice unavailable for doc ${docId} (${flaskErr.message}). Engaging local deterministic fallback.`);
    fallbackUsed = true;
  }

  if (!result) {
    const { rows: docRows } = await db.query(
      `SELECT id, user_id, filename, extracted_text, version_group, version_number FROM documents WHERE id = $1`,
      [docId]
    );
    if (!docRows.length) {
      throw new Error(`Document ${docId} not found`);
    }
    const doc = docRows[0];

    let snapshotsQuery = `SELECT id, executive_summary, health_score, exposure_score, decision_intelligence_json, primary_driver, created_at
       FROM contract_intelligence
       WHERE document_id = $1
       ORDER BY created_at DESC LIMIT 2`;
    let snapshotsParams = [docId];

    if (doc.version_group) {
      snapshotsQuery = `SELECT id, executive_summary, health_score, exposure_score, decision_intelligence_json, primary_driver, created_at
       FROM contract_intelligence
       WHERE document_id IN (
         SELECT id FROM documents WHERE version_group = $1 AND version_number <= $2
       )
       ORDER BY created_at DESC LIMIT 2`;
      snapshotsParams = [doc.version_group, doc.version_number || 1];
    }

    const { rows: snapshots } = await db.query(snapshotsQuery, snapshotsParams);

    let prevText = null;
    if (doc.version_group && doc.version_number > 1) {
      const { rows: prevRows } = await db.query(
        `SELECT extracted_text FROM documents
         WHERE version_group = $1 AND version_number < $2
         ORDER BY version_number DESC LIMIT 1`,
        [doc.version_group, doc.version_number]
      );
      if (prevRows.length) {
        prevText = prevRows[0].extracted_text;
      }
    }

    const currIntel = snapshots[0] || null;
    const prevIntel = snapshots.length > 1 ? snapshots[1] : null;

    const lifecycle = computeLocalLifecycle(docId, doc.extracted_text);
    const changes = computeLocalChanges(prevText, doc.extracted_text, prevIntel, currIntel, docId);

    for (const chg of changes) {
      let urg = 'LOW';
      if (lifecycle.state === 'NOTICE_WINDOW_OPEN') urg = 'IMMEDIATE';
      else if (lifecycle.state === 'RENEWAL_APPROACHING') urg = 'APPROACHING';

      const mag = Math.abs(chg.risk_delta || 0) >= 20 || chg.event_type === 'LIABILITY_CHANGE' ? 'MAJOR' : 'MODERATE';
      const pCalc = calculateAttentionPriority(chg.severity, 'HIGH', urg, mag);
      chg.priority_score = pCalc.priority_score;
      chg.priority_rank = pCalc.priority_rank;
      chg.priority_factors = pCalc.factors;
    }

    result = {
      documentId: docId,
      filename: doc.filename,
      lifecycle,
      detectedChanges: changes,
      changeCount: changes.length,
      timestamp: new Date().toISOString()
    };
  }

  result.engine = fallbackUsed ? 'local_deterministic_fallback' : 'python_microservice';
  result.durationMs = Date.now() - startTime;

  return result;
}

/**
 * Idempotent portfolio continuous monitoring runner.
 * Evaluates all accessible contracts, updates lifecycle states, persists deduplicated events,
 * routes high-priority alerts to Action Center, records cryptographic audit, and emits telemetry.
 */
async function runPortfolioMonitoring(user, correlationId = uuidv4()) {
  const startTime = Date.now();
  const userId = user ? user.id : null;
  const isAdmin = user && (user.role === 'admin' || user.role === 'compliance_officer');

  // Query accessible documents
  const query = isAdmin
    ? 'SELECT id, user_id, filename FROM documents ORDER BY created_at DESC'
    : 'SELECT id, user_id, filename FROM documents WHERE user_id = $1 ORDER BY created_at DESC';
  const params = isAdmin ? [] : [userId];

  const { rows: docs } = await db.query(query, params);

  let evaluatedDocsCount = 0;
  let newEventsCount = 0;
  let actionsCreatedCount = 0;
  const runEvents = [];

  for (const doc of docs) {
    evaluatedDocsCount++;
    try {
      const evaluation = await evaluateContractMonitoring(doc.id, correlationId);
      const lc = evaluation.lifecycle;

      const renewalDateVal = lc.renewal_date !== NOT_AVAILABLE ? lc.renewal_date : null;
      const noticeDeadlineVal = lc.notice_deadline !== NOT_AVAILABLE ? lc.notice_deadline : null;
      const cureDeadlineVal = lc.cure_deadline !== NOT_AVAILABLE ? lc.cure_deadline : null;
      const expirationDateVal = lc.expiration_date !== NOT_AVAILABLE ? lc.expiration_date : null;

      await db.query(`
        INSERT INTO contract_lifecycle_states (
          document_id, user_id, state, renewal_date, notice_deadline, cure_deadline, expiration_date, evidence_json, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        ON CONFLICT (document_id) DO UPDATE SET
          state = EXCLUDED.state,
          renewal_date = EXCLUDED.renewal_date,
          notice_deadline = EXCLUDED.notice_deadline,
          cure_deadline = EXCLUDED.cure_deadline,
          expiration_date = EXCLUDED.expiration_date,
          evidence_json = EXCLUDED.evidence_json,
          updated_at = CURRENT_TIMESTAMP
      `, [
        doc.id,
        doc.user_id,
        lc.state || UNKNOWN,
        renewalDateVal,
        noticeDeadlineVal,
        cureDeadlineVal,
        expirationDateVal,
        JSON.stringify(lc.evidence || {})
      ]);

      const candidateEvents = [...(evaluation.detectedChanges || [])];
      if (lc.state === 'NOTICE_WINDOW_OPEN') {
        const pCalc = calculateAttentionPriority('CRITICAL', 'HIGH', 'IMMEDIATE', 'MAJOR');
        candidateEvents.push({
          document_id: doc.id,
          event_type: 'NOTICE_DEADLINE_APPROACHING',
          severity: 'CRITICAL',
          priority_score: pCalc.priority_score,
          priority_rank: pCalc.priority_rank,
          title: `Non-Renewal Notice Window Active (${doc.filename})`,
          description: lc.lifecycle_reason,
          evidence_reference: lc.evidence ? lc.evidence.notice_evidence : NOT_AVAILABLE,
          previous_value: 'ACTIVE',
          current_value: 'NOTICE_WINDOW_OPEN',
          risk_delta: 20,
          affected_dimension: 'TERMINATION_RIGHTS',
          deduplication_key: `lifecycle_notice_window_open_${doc.id}`
        });
      } else if (lc.state === 'RENEWAL_APPROACHING') {
        const pCalc = calculateAttentionPriority('HIGH', 'HIGH', 'APPROACHING', 'MODERATE');
        candidateEvents.push({
          document_id: doc.id,
          event_type: 'RENEWAL_APPROACHING',
          severity: 'HIGH',
          priority_score: pCalc.priority_score,
          priority_rank: pCalc.priority_rank,
          title: `Contract Renewal Approaching (${doc.filename})`,
          description: lc.lifecycle_reason,
          evidence_reference: lc.evidence ? (lc.evidence.renewal_evidence || lc.evidence.expiration_evidence) : NOT_AVAILABLE,
          previous_value: 'ACTIVE',
          current_value: 'RENEWAL_APPROACHING',
          risk_delta: 10,
          affected_dimension: 'LIFECYCLE_TERM',
          deduplication_key: `lifecycle_renewal_approaching_${doc.id}`
        });
      }

      for (const ev of candidateEvents) {
        const eventId = uuidv4();
        const score = typeof ev.priority_score === 'number' ? ev.priority_score : 50;

        const { rows: inserted } = await db.query(`
          INSERT INTO contract_monitoring_events (
            id, document_id, user_id, event_type, severity, priority_score,
            title, description, evidence_reference, previous_value, current_value,
            risk_delta, affected_dimension, deduplication_key, status, metadata, detected_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'OPEN', $15, CURRENT_TIMESTAMP
          )
          ON CONFLICT (document_id, deduplication_key) DO UPDATE SET
            priority_score = EXCLUDED.priority_score,
            severity = EXCLUDED.severity,
            metadata = EXCLUDED.metadata
          RETURNING id, (xmax = 0) AS is_new
        `, [
          eventId,
          doc.id,
          doc.user_id,
          ev.event_type || 'CONTRACT_CHANGED',
          ev.severity || 'MEDIUM',
          score,
          ev.title,
          ev.description,
          ev.evidence_reference || NOT_AVAILABLE,
          ev.previous_value || NOT_AVAILABLE,
          ev.current_value || NOT_AVAILABLE,
          ev.risk_delta || 0,
          ev.affected_dimension || 'GENERAL',
          ev.deduplication_key,
          JSON.stringify({ correlationId, documentName: doc.filename, priorityFactors: ev.priority_factors || {} })
        ]);

        const isNew = inserted[0] ? inserted[0].is_new : false;
        const actualId = inserted[0] ? inserted[0].id : eventId;
        if (isNew) {
          newEventsCount++;
          runEvents.push({ eventId: actualId, docId: doc.id, title: ev.title, severity: ev.severity });

          // Cryptographic audit for newly detected change/event
          await recordAudit(userId, 'CONTRACT_CHANGE_DETECTED', {
            documentId: doc.id,
            eventId: actualId,
            eventType: ev.event_type,
            severity: ev.severity,
            riskDelta: ev.risk_delta,
            deduplicationKey: ev.deduplication_key,
            correlationId
          });
        }

        if (score >= 60 || ev.severity === 'CRITICAL' || ev.severity === 'HIGH') {
          const sourceActionId = `MONITORING_${ev.deduplication_key}`;
          
          // Check if action already exists
          const { rows: existingAction } = await db.query(
            `SELECT id FROM contract_actions WHERE document_id = $1 AND source_action_id = $2 AND status NOT IN ('RESOLVED', 'DISMISSED')`,
            [doc.id, sourceActionId]
          );

          if (!existingAction.length) {
            const actionId = uuidv4();
            const actionCategory = ev.severity === 'CRITICAL' ? 'CRITICAL' : 'IMPORTANT';
            const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7-day SLA for monitoring tasks

            await db.query(`
              INSERT INTO contract_actions (
                id, document_id, source_action_id, title, category,
                priority_score, status, decision, owner_id, due_date,
                decision_reason, resolution_notes, created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, 'OPEN', 'PENDING', $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
              )
            `, [
              actionId,
              doc.id,
              sourceActionId,
              `Monitoring Alert: ${ev.title}`,
              actionCategory,
              score,
              doc.user_id,
              dueDate,
              `Generated automatically by Phase 11 Continuous Monitoring. Reason: ${ev.description}`,
              `Evidence Citation: ${ev.evidence_reference || NOT_AVAILABLE}`
            ]);

            await db.query(`
              INSERT INTO contract_action_activity (
                id, action_id, event_type, actor_id, metadata, created_at
              ) VALUES (
                gen_random_uuid(), $1, 'MONITORING_ACTION_CREATED', $2, $3, CURRENT_TIMESTAMP
              )
            `, [
              actionId,
              userId,
              JSON.stringify({ eventId: actualId, deduplicationKey: ev.deduplication_key, correlationId })
            ]);

            await recordAudit(userId, 'MONITORING_ACTION_CREATED', {
              actionId,
              documentId: doc.id,
              eventId: actualId,
              sourceActionId,
              correlationId
            });

            actionsCreatedCount++;
          }
        }
      }

    } catch (docErr) {
      logger.error(`[Monitoring Service] Error evaluating doc ${doc.id}: ${docErr.message}`);
    }
  }

  const durationMs = Date.now() - startTime;

  // Cryptographic audit for completed run
  await recordAudit(userId, 'MONITORING_RUN_COMPLETED', {
    evaluatedDocsCount,
    newEventsCount,
    actionsCreatedCount,
    durationMs,
    correlationId
  });

  // Privacy-safe AI Telemetry recording
  await recordAiTelemetry({
    correlationId,
    userId,
    operationType: 'CONTRACT_MONITORING',
    provider: 'deciva_monitoring_engine',
    model: 'deterministic_change_lifecycle_v11',
    durationMs,
    status: 'SUCCESS',
    groundedStatus: 'GROUNDED',
    metadata: {
      evaluatedDocsCount,
      newEventsCount,
      actionsCreatedCount,
      scope: isAdmin ? 'PORTFOLIO_WIDE' : 'USER_TENANT'
    }
  });

  return {
    success: true,
    evaluatedDocsCount,
    newEventsCount,
    actionsCreatedCount,
    durationMs,
    correlationId,
    timestamp: new Date().toISOString()
  };
}

/**
 * Retrieves portfolio monitoring events.
 */
async function getPortfolioMonitoringEvents(user, query = {}) {
  const userId = user ? user.id : null;
  const isAdmin = user && (user.role === 'admin' || user.role === 'compliance_officer');

  const status = query.status || 'ALL';
  const severity = query.severity || 'ALL';
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
  const offset = Math.max(0, parseInt(query.offset || '0', 10));

  let sql = `
    SELECT 
      e.id, e.document_id, e.user_id, e.event_type, e.severity, e.priority_score,
      e.title, e.description, e.evidence_reference, e.previous_value, e.current_value,
      e.risk_delta, e.affected_dimension, e.status, e.detected_at, e.acknowledged_at,
      d.filename, d.version_number
    FROM contract_monitoring_events e
    JOIN documents d ON d.id = e.document_id
    WHERE 1=1
  `;
  const params = [];

  if (!isAdmin) {
    params.push(userId);
    sql += ` AND e.user_id = $${params.length}`;
  }

  if (status !== 'ALL') {
    params.push(status);
    sql += ` AND e.status = $${params.length}`;
  }

  if (severity !== 'ALL') {
    params.push(severity);
    sql += ` AND e.severity = $${params.length}`;
  }

  sql += ` ORDER BY e.priority_score DESC, e.detected_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const { rows } = await db.query(sql, params);
  return rows;
}

/**
 * Retrieves prioritized contracts requiring immediate attention.
 */
async function getPortfolioAttentionQueue(user) {
  const userId = user ? user.id : null;
  const isAdmin = user && (user.role === 'admin' || user.role === 'compliance_officer');

  let sql = `
    SELECT 
      e.id AS event_id, e.document_id, e.title, e.description, e.severity,
      e.priority_score, e.risk_delta, e.affected_dimension, e.evidence_reference,
      e.previous_value, e.current_value, e.detected_at,
      d.filename, d.risk_score,
      cls.state AS lifecycle_state, cls.notice_deadline, cls.renewal_date, cls.expiration_date
    FROM contract_monitoring_events e
    JOIN documents d ON d.id = e.document_id
    LEFT JOIN contract_lifecycle_states cls ON cls.document_id = e.document_id
    WHERE e.status = 'OPEN'
  `;
  const params = [];

  if (!isAdmin) {
    params.push(userId);
    sql += ` AND e.user_id = $${params.length}`;
  }

  sql += ` ORDER BY e.priority_score DESC, e.detected_at DESC LIMIT 25`;

  const { rows } = await db.query(sql, params);
  return rows;
}

/**
 * Retrieves portfolio lifecycle deadlines and calendar view.
 */
async function getPortfolioLifecycleCalendar(user) {
  const userId = user ? user.id : null;
  const isAdmin = user && (user.role === 'admin' || user.role === 'compliance_officer');

  let sql = `
    SELECT 
      cls.document_id, cls.user_id, cls.state, cls.renewal_date,
      cls.notice_deadline, cls.cure_deadline, cls.expiration_date,
      cls.evidence_json, cls.updated_at,
      d.filename, d.risk_score
    FROM contract_lifecycle_states cls
    JOIN documents d ON d.id = cls.document_id
    WHERE 1=1
  `;
  const params = [];

  if (!isAdmin) {
    params.push(userId);
    sql += ` AND cls.user_id = $${params.length}`;
  }

  sql += ` ORDER BY COALESCE(cls.notice_deadline, cls.expiration_date, cls.renewal_date) ASC NULLS LAST`;

  const { rows } = await db.query(sql, params);

  // Group events into structured calendar markers
  const calendarEvents = [];
  for (const r of rows) {
    const evidence = r.evidence_json || {};
    if (r.notice_deadline) {
      calendarEvents.push({
        documentId: r.document_id,
        filename: r.filename,
        eventType: 'NOTICE_DEADLINE',
        date: r.notice_deadline,
        label: 'Renewal Notice Deadline',
        state: r.state,
        evidence: evidence.notice_evidence || NOT_AVAILABLE
      });
    }
    if (r.renewal_date) {
      calendarEvents.push({
        documentId: r.document_id,
        filename: r.filename,
        eventType: 'RENEWAL_DATE',
        date: r.renewal_date,
        label: 'Contract Auto-Renewal',
        state: r.state,
        evidence: evidence.renewal_evidence || NOT_AVAILABLE
      });
    }
    if (r.expiration_date) {
      calendarEvents.push({
        documentId: r.document_id,
        filename: r.filename,
        eventType: 'EXPIRATION_DATE',
        date: r.expiration_date,
        label: 'Contract Term Expiration',
        state: r.state,
        evidence: evidence.expiration_evidence || NOT_AVAILABLE
      });
    }
  }

  calendarEvents.sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    contracts: rows,
    calendarEvents
  };
}

/**
 * Retrieves change timeline and events for a specific contract.
 */
async function getDocumentChanges(docId, user) {
  const userId = user ? user.id : null;
  const isAdmin = user && (user.role === 'admin' || user.role === 'compliance_officer');

  const { rows: docRows } = await db.query(
    `SELECT id, user_id, filename, version_number, risk_score FROM documents WHERE id = $1`,
    [docId]
  );
  if (!docRows.length) {
    throw new Error(`Document ${docId} not found`);
  }
  const doc = docRows[0];
  if (!isAdmin && doc.user_id !== userId) {
    const err = new Error('Access forbidden: tenant isolation boundary enforced.');
    err.status = 403;
    throw err;
  }

  const { rows: events } = await db.query(
    `SELECT * FROM contract_monitoring_events WHERE document_id = $1 ORDER BY detected_at DESC`,
    [docId]
  );

  const { rows: lifecycleRows } = await db.query(
    `SELECT * FROM contract_lifecycle_states WHERE document_id = $1`,
    [docId]
  );

  return {
    documentId: docId,
    filename: doc.filename,
    versionNumber: doc.version_number,
    lifecycle: lifecycleRows[0] || null,
    events,
    eventCount: events.length
  };
}

/**
 * Acknowledges a monitoring event.
 */
async function acknowledgeMonitoringEvent(docId, eventId, user) {
  const userId = user ? user.id : null;
  const isAdmin = user && (user.role === 'admin' || user.role === 'compliance_officer');

  // Verify ownership
  const { rows: evRows } = await db.query(
    `SELECT e.*, d.user_id AS doc_user_id FROM contract_monitoring_events e
     JOIN documents d ON d.id = e.document_id
     WHERE e.id = $1 AND e.document_id = $2`,
    [eventId, docId]
  );

  if (!evRows.length) {
    throw new Error(`Monitoring event ${eventId} not found for document ${docId}`);
  }

  const ev = evRows[0];
  if (!isAdmin && ev.doc_user_id !== userId) {
    const err = new Error('Access forbidden: tenant isolation boundary enforced.');
    err.status = 403;
    throw err;
  }

  const { rows: updated } = await db.query(`
    UPDATE contract_monitoring_events
    SET status = 'ACKNOWLEDGED', acknowledged_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `, [eventId]);

  await recordAudit(userId, 'MONITORING_EVENT_ACKNOWLEDGED', {
    eventId,
    documentId: docId,
    eventType: ev.event_type
  });

  return updated[0];
}

module.exports = {
  evaluateContractMonitoring,
  runPortfolioMonitoring,
  getPortfolioMonitoringEvents,
  getPortfolioAttentionQueue,
  getPortfolioLifecycleCalendar,
  getDocumentChanges,
  acknowledgeMonitoringEvent,
  calculateAttentionPriority
};
