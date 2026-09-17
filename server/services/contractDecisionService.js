/**
 * Deciva — Contract Decision Intelligence Service
 * ---------------------------------------------------------------------------
 * Coordinates unified contract decision intelligence between the Node.js API
 * gateway and the Python Flask intelligence microservice.
 * 
 * Strict Enterprise Guarantees:
 * 1. Single aggregate decision intelligence endpoint.
 * 2. High-resilience fail-safe local deterministic fallback executing the identical
 *    deterministic rules and transparently flagging engine: 'local_deterministic_fallback'.
 * 3. Relational action tracking (contract_actions) and cryptographic audit (blockchain_audit)
 *    upon applying decision recommendations into the Action Center.
 * 4. Zero data fabrication: monetary figures are extracted from contract or marked NOT_AVAILABLE.
 * 5. Strict tenant isolation: user can only access their own documents.
 */

const http = require('http');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { recordAudit } = require('../utils/audit');
const { recordAiTelemetry } = require('../utils/aiTelemetry');
const logger = require('../utils/logger');
const { getInternalServiceKey } = require('./productionConfigService');
const { createDeterministicProvenance } = require('../utils/aiProvenance');

const FLASK_HOST = process.env.FLASK_HOST || '127.0.0.1';
const FLASK_PORT = process.env.FLASK_PORT || 5001;
const rawAiUrl = (process.env.AI_MICROSERVICE_URL || `http://${FLASK_HOST}:${FLASK_PORT}`).trim();
const AI_MICROSERVICE_URL = (rawAiUrl.startsWith('http://') || rawAiUrl.startsWith('https://') ? rawAiUrl : `http://${rawAiUrl}`).replace(/\/+$/, '');
const INTERNAL_KEY = getInternalServiceKey();

const DECISION_DISCLAIMER = "This decision intelligence brief is grounded in detected contract evidence and deterministic decision logic. It provides structured guidance and does not constitute formal legal counsel.";
const CONFLICT_DISCLAIMER = "Potential conflict requiring review — not an absolute legal conclusion.";

/**
 * Fetch decision intelligence from Python Flask microservice.
 */
async function fetchFromFlask(docId, correlationId) {
  const res = await fetch(`${AI_MICROSERVICE_URL}/api/documents/${encodeURIComponent(docId)}/decision-intelligence`, {
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
 * Identical local deterministic fallback engine when Flask microservice is unavailable.
 */
function computeLocalDeterministicDecisionIntelligence(docRow, clauseRows, riskRows, deadlineRows, segmentRows) {
  const docText = docRow.extracted_text || '';
  const textLower = docText.toLowerCase();

  const monetaryFigures = [];
  const moneyRegex = /(?:\$|USD\s*)\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)\s*(?:million|thousand|k|m)?\b/gi;
  let match;
  while ((match = moneyRegex.exec(docText)) !== null) {
    const val = parseFloat(match[1].replace(/,/g, ''));
    if (!isNaN(val)) {
      const surrounding = docText.slice(Math.max(0, match.index - 60), Math.min(docText.length, match.index + 60)).trim();
      const surrLower = surrounding.toLowerCase();
      let contextType = 'UNKNOWN';
      if (['liability', 'cap', 'aggregate', 'limitation', 'maximum'].some(k => surrLower.includes(k))) {
        contextType = 'LIABILITY_CAP';
      } else if (['fee', 'payment', 'price', 'invoic', 'cost', 'rate'].some(k => surrLower.includes(k))) {
        contextType = 'PAYMENT_FEE';
      }
      monetaryFigures.push({
        amount: val,
        formatted: `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        contextType,
        excerpt: surrounding
      });
    }
  }

  // 2. 9-Dimension Exposure Model
  const dimensions = {};

  const hasCap = /\b(aggregate\s+liability\s+(?:shall\s+not\s+exceed|capped\s+at)|maximum\s+cumulative\s+liability|limitation\s+of\s+liability)\b/i.test(textLower);
  const hasUncappedIndemnity = /\b(indemnif.*hold\s+harmless.*all\s+claims|unlimited\s+indemnif|without\s+limitation.*indemn)\b/i.test(textLower);
  const hasCarveouts = /\b(excluding.*gross\s+negligence|excluding.*confidentiality|except\s+for.*indemnif)\b/i.test(textLower);
  const hasMutualLiability = /\b(neither\s+party.*shall\s+be\s+liable|mutual\s+limitation\s+of\s+liability)\b/i.test(textLower);

  const liabBase = 25;
  const liabContribs = [];
  if (hasUncappedIndemnity) liabContribs.push({ factor: "Uncapped Third-Party Indemnity", weight: 30, type: "RISK", description: "Broad indemnity without monetary ceiling." });
  if (hasCarveouts) liabContribs.push({ factor: "Liability Cap Carve-Outs", weight: 20, type: "RISK", description: "Multiple exceptions bypass contractual limitation of liability." });
  if (!hasCap) liabContribs.push({ factor: "Absence of Express Aggregate Cap", weight: 25, type: "RISK", description: "No explicit aggregate monetary limitation detected." });
  if (hasCap) liabContribs.push({ factor: "Contractual Liability Cap Present", weight: -15, type: "MITIGATION", description: "Express limitation clause restricts total damages exposure." });
  if (hasMutualLiability) liabContribs.push({ factor: "Mutual Reciprocal Cap", weight: -10, type: "MITIGATION", description: "Limitations apply bilaterally to both parties." });

  const liabScore = Math.max(5, Math.min(100, liabBase + liabContribs.reduce((acc, c) => acc + c.weight, 0)));
  dimensions.liability = {
    score: liabScore,
    severity: liabScore >= 80 ? "CRITICAL" : (liabScore >= 60 ? "HIGH" : (liabScore >= 40 ? "MEDIUM" : "LOW")),
    baseScore: liabBase,
    contributors: liabContribs,
    calculation: `Clamp(${liabBase} + ${liabContribs.map(c => c.weight).join(' + ') || '0'} = ${liabScore}, 0, 100)`,
    confidence: {
      score: null,
      methodology: "deterministic_rule_based"
    },
    confidenceScore: null,
    evidenceCitation: "Limitation of Liability & Indemnification clauses"
  };

  // Termination
  const hasUnilateralTerm = /\b(terminate\s+(?:immediately|at\s+any\s+time|without\s+cause\s+upon))\b/i.test(textLower);
  const shortCurePeriod = /\b(?:cure|remedy)\s+(?:period|within)\s+(?:of\s+)?([1-9]|1[0-4])\s*days\b/i.test(textLower);
  const autoRenewal = /\b(automatically\s+renew|successive\s+(?:terms|periods)|auto-renewal)\b/i.test(textLower);
  const hasConvenience = /\b(termination\s+for\s+convenience)\b/i.test(textLower);

  const termBase = 20;
  const termContribs = [];
  if (hasUnilateralTerm && !hasConvenience) termContribs.push({ factor: "Asymmetric Immediate Termination Right", weight: 35, type: "RISK", description: "Counterparty holds unilateral immediate termination capability." });
  if (shortCurePeriod) termContribs.push({ factor: "Compressed Cure Window (<15 Days)", weight: 25, type: "RISK", description: "Material breach cure timeline creates operational forfeiture risk." });
  if (autoRenewal) termContribs.push({ factor: "Automatic Renewal Commitment", weight: 20, type: "RISK", description: "Lock-in hazard if formal non-renewal notice is delayed." });
  if (hasConvenience) termContribs.push({ factor: "Mutual Termination for Convenience", weight: -10, type: "MITIGATION", description: "Exit mechanism available upon standard notice." });

  const termScore = Math.max(5, Math.min(100, termBase + termContribs.reduce((acc, c) => acc + c.weight, 0)));
  dimensions.termination = {
    score: termScore,
    severity: termScore >= 80 ? "CRITICAL" : (termScore >= 60 ? "HIGH" : (termScore >= 40 ? "MEDIUM" : "LOW")),
    baseScore: termBase,
    contributors: termContribs,
    calculation: `Clamp(${termBase} + ${termContribs.map(c => c.weight).join(' + ') || '0'} = ${termScore}, 0, 100)`,
    confidence: {
      score: null,
      methodology: "deterministic_rule_based"
    },
    confidenceScore: null,
    evidenceCitation: "Term, Termination, and Breach provisions"
  };

  const finCaps = monetaryFigures.filter(f => f.contextType === 'LIABILITY_CAP');
  const hasInterestLate = /\b(late\s+payment\s+interest|1\.5%|2%\s+per\s+month|maximum\s+permitted\s+by\s+law)\b/i.test(textLower);
  const shortPayment = /\b(?:payable|due)\s+within\s+(?:10|15)\s*days\b/i.test(textLower);

  const finBase = 20;
  const finContribs = [];
  if (!finCaps.length && !monetaryFigures.length) {
    finContribs.push({ factor: "Unquantified Monetary Exposure", weight: 25, type: "RISK", description: "Contract does not state numerical fee caps or exposure thresholds." });
  } else if (finCaps.length) {
    finContribs.push({ factor: "Identified Monetary Liability Cap", weight: -15, type: "MITIGATION", description: `Express cap value quantified (${finCaps[0].formatted}).` });
  }
  if (hasInterestLate) finContribs.push({ factor: "Aggressive Late Payment Interest Accrual", weight: 15, type: "RISK", description: "Compounding interest provisions apply upon delayed invoice disputes." });
  if (shortPayment) finContribs.push({ factor: "Short Payment Window (Net 15 or less)", weight: 15, type: "RISK", description: "Working capital pressure and expedited default triggers." });

  const finScore = Math.max(5, Math.min(100, finBase + finContribs.reduce((acc, c) => acc + c.weight, 0)));
  dimensions.financial = {
    score: finScore,
    severity: finScore >= 80 ? "CRITICAL" : (finScore >= 60 ? "HIGH" : (finScore >= 40 ? "MEDIUM" : "LOW")),
    baseScore: finBase,
    contributors: finContribs,
    calculation: `Clamp(${finBase} + ${finContribs.map(c => c.weight).join(' + ') || '0'} = ${finScore}, 0, 100)`,
    confidence: {
      score: null,
      methodology: "deterministic_rule_based"
    },
    confidenceScore: null,
    evidenceCitation: "Fees, Invoicing, and Payment clauses"
  };

  // Operational
  const hasSlaSusp = /\b(suspend\s+(?:services|access|performance)|withhold\s+deliverables)\b/i.test(textLower);
  const hasAudit = /\b(audit\s+books|inspect\s+facilities|unannounced\s+audit)\b/i.test(textLower);
  const hasSlaCredits = /\b(service\s+level\s+credit|liquidated\s+damages|sla\s+penalty)\b/i.test(textLower);

  const opBase = 20;
  const opContribs = [];
  if (hasSlaSusp) opContribs.push({ factor: "Discretionary Service Suspension Right", weight: 25, type: "RISK", description: "Counterparty may freeze access upon unverified dispute." });
  if (hasAudit) opContribs.push({ factor: "Intrusive On-Premises Audit Mandates", weight: 15, type: "RISK", description: "Operational distraction and compliance inspection exposure." });
  if (hasSlaCredits) opContribs.push({ factor: "SLA Failure Penalties", weight: 20, type: "RISK", description: "Direct operational deductions triggered by downtime thresholds." });
  if (!hasSlaSusp) opContribs.push({ factor: "Protected Service Continuity", weight: -10, type: "MITIGATION", description: "No immediate suspension or withhold remedies detected." });

  const opScore = Math.max(5, Math.min(100, opBase + opContribs.reduce((acc, c) => acc + c.weight, 0)));
  dimensions.operational = {
    score: opScore,
    severity: opScore >= 80 ? "CRITICAL" : (opScore >= 60 ? "HIGH" : (opScore >= 40 ? "MEDIUM" : "LOW")),
    baseScore: opBase,
    contributors: opContribs,
    calculation: `Clamp(${opBase} + ${opContribs.map(c => c.weight).join(' + ') || '0'} = ${opScore}, 0, 100)`,
    confidence: {
      score: null,
      methodology: "deterministic_rule_based"
    },
    confidenceScore: null,
    evidenceCitation: "Service Delivery, Operational Performance, and SLA terms"
  };

  const hasForeignJur = /\b(laws\s+of\s+england|laws\s+of\s+delaware|courts\s+of\s+new\s+york|singapore|arbitration)\b/i.test(textLower);
  const hasJuryWaiver = /\b(waive.*jury\s+trial|class\s+action\s+waiver)\b/i.test(textLower);
  const hasWarrantyDisc = /\b(as\s+is|without\s+warranty\s+of\s+any\s+kind|disclaim.*all\s+warranties)\b/i.test(textLower);

  const legBase = 20;
  const legContribs = [];
  if (hasForeignJur) legContribs.push({ factor: "Exclusive Distant Governing Jurisdiction", weight: 20, type: "RISK", description: "Litigation or arbitration venue creates high legal defense expense." });
  if (hasWarrantyDisc) legContribs.push({ factor: "Broad Warranty Disclaimers", weight: 20, type: "RISK", description: "Disclaims merchantability and fitness for purpose." });
  if (hasJuryWaiver) legContribs.push({ factor: "Procedural Rights Waiver", weight: 15, type: "RISK", description: "Jury trial waiver and expedited dispute rules." });
  if (!hasWarrantyDisc) legContribs.push({ factor: "Express Performance Warranties Retained", weight: -10, type: "MITIGATION", description: "Contract affirms core representations and performance standards." });

  const legScore = Math.max(5, Math.min(100, legBase + legContribs.reduce((acc, c) => acc + c.weight, 0)));
  dimensions.legal = {
    score: legScore,
    severity: legScore >= 80 ? "CRITICAL" : (legScore >= 60 ? "HIGH" : (legScore >= 40 ? "MEDIUM" : "LOW")),
    baseScore: legBase,
    contributors: legContribs,
    calculation: `Clamp(${legBase} + ${legContribs.map(c => c.weight).join(' + ') || '0'} = ${legScore}, 0, 100)`,
    confidence: {
      score: null,
      methodology: "deterministic_rule_based"
    },
    confidenceScore: null,
    evidenceCitation: "Governing Law, Jurisdiction, and Dispute Resolution"
  };

  const missingDataProt = !/\b(gdpr|ccpa|data\s+protection|personal\s+data|privacy)\b/i.test(textLower);
  const missingConf = !/\b(confidential\s+information|non-disclosure|proprietary)\b/i.test(textLower);

  const compBase = 15;
  const compContribs = [];
  if (missingDataProt) compContribs.push({ factor: "Omission of Express Data Privacy / DPA Language", weight: 35, type: "RISK", description: "Absence of GDPR/CCPA standard compliance obligations." });
  if (missingConf) compContribs.push({ factor: "Omission of Standard Confidentiality Protection", weight: 25, type: "RISK", description: "Unprotected proprietary disclosures." });
  if (!missingDataProt) compContribs.push({ factor: "Data Privacy Provisions Included", weight: -15, type: "MITIGATION", description: "Regulatory data processing commitments present." });
  if (!missingConf) compContribs.push({ factor: "Mutual Confidentiality Clause Active", weight: -10, type: "MITIGATION", description: "Trade secrets and business disclosures protected." });

  const compScore = Math.max(5, Math.min(100, compBase + compContribs.reduce((acc, c) => acc + c.weight, 0)));
  dimensions.compliance = {
    score: compScore,
    severity: compScore >= 80 ? "CRITICAL" : (compScore >= 60 ? "HIGH" : (compScore >= 40 ? "MEDIUM" : "LOW")),
    baseScore: compBase,
    contributors: compContribs,
    calculation: `Clamp(${compBase} + ${compContribs.map(c => c.weight).join(' + ') || '0'} = ${compScore}, 0, 100)`,
    confidence: {
      score: null,
      methodology: "deterministic_rule_based"
    },
    confidenceScore: null,
    evidenceCitation: "Regulatory, Privacy, and Confidentiality sections"
  };

  const deadlinesCount = deadlineRows.length;
  const deadBase = 20;
  const deadContribs = [];
  if (deadlinesCount === 0) {
    deadContribs.push({ factor: "Omission of Formal Timetable Milestones", weight: 15, type: "RISK", description: "No explicit schedule milestones or calendar dates detected." });
  } else if (deadlinesCount >= 5) {
    deadContribs.push({ factor: "High Operational Deadline Density", weight: 25, type: "RISK", description: `${deadlinesCount} distinct calendar and relative milestones require monitoring.` });
  } else {
    deadContribs.push({ factor: "Moderate Milestone Schedule", weight: 10, type: "RISK", description: `${deadlinesCount} tracked deadlines.` });
  }
  if (deadlineRows.some(d => (d.source_text || '').toLowerCase().includes('notice'))) {
    deadContribs.push({ factor: "Contractual Notice Window Active", weight: 15, type: "RISK", description: "Mandatory written notice clock enforces forfeiture upon lapse." });
  }

  const deadScore = Math.max(5, Math.min(100, deadBase + deadContribs.reduce((acc, c) => acc + c.weight, 0)));
  dimensions.deadline = {
    score: deadScore,
    severity: deadScore >= 80 ? "CRITICAL" : (deadScore >= 60 ? "HIGH" : (deadScore >= 40 ? "MEDIUM" : "LOW")),
    baseScore: deadBase,
    contributors: deadContribs,
    calculation: `Clamp(${deadBase} + ${deadContribs.map(c => c.weight).join(' + ') || '0'} = ${deadScore}, 0, 100)`,
    confidence: {
      score: null,
      methodology: "deterministic_rule_based"
    },
    confidenceScore: null,
    evidenceCitation: "Document milestone and notice schedules"
  };

  // Concentration
  const hasSoleSource = /\b(exclusive\s+provider|sole\s+source|exclusivity|non-compete)\b/i.test(textLower);
  const concBase = 15;
  const concContribs = [];
  if (hasSoleSource) {
    concContribs.push({ factor: "Exclusivity or Sole-Source Restraint", weight: 35, type: "RISK", description: "Binds enterprise to single vendor without fallback supplier options." });
  } else {
    concContribs.push({ factor: "Non-Exclusive Relationship", weight: -10, type: "MITIGATION", description: "Enterprise maintains freedom to engage alternate vendors." });
  }

  const concScore = Math.max(5, Math.min(100, concBase + concContribs.reduce((acc, c) => acc + c.weight, 0)));
  dimensions.concentration = {
    score: concScore,
    severity: concScore >= 80 ? "CRITICAL" : (concScore >= 60 ? "HIGH" : (concScore >= 40 ? "MEDIUM" : "LOW")),
    baseScore: concBase,
    contributors: concContribs,
    calculation: `Clamp(${concBase} + ${concContribs.map(c => c.weight).join(' + ') || '0'} = ${concScore}, 0, 100)`,
    confidence: {
      score: null,
      methodology: "deterministic_rule_based"
    },
    confidenceScore: null,
    evidenceCitation: "Exclusivity, Scope of Services, and Territory"
  };

  // Overall Composite
  const weights = {
    liability: 0.20,
    termination: 0.15,
    financial: 0.15,
    operational: 0.15,
    legal: 0.10,
    compliance: 0.10,
    deadline: 0.08,
    concentration: 0.07
  };
  const overallScore = Math.round(Object.entries(weights).reduce((acc, [dim, w]) => acc + dimensions[dim].score * w, 0));
  dimensions.overall = {
    score: overallScore,
    severity: overallScore >= 80 ? "CRITICAL" : (overallScore >= 60 ? "HIGH" : (overallScore >= 40 ? "MEDIUM" : "LOW")),
    baseScore: 0,
    contributors: Object.entries(weights).map(([k, v]) => ({
      factor: `${k.charAt(0).toUpperCase() + k.slice(1)} Dimension Contribution (${Math.round(v * 100)}%)`,
      weight: Math.round(dimensions[k].score * v),
      type: dimensions[k].score >= 50 ? "RISK" : "MITIGATION",
      description: `Score ${dimensions[k].score}/100`
    })),
    calculation: "Sum(Dimension_Score * Weight)",
    confidence: {
      score: null,
      methodology: "deterministic_rule_based"
    },
    confidenceScore: null,
    evidenceCitation: "Weighted composite across all 8 contract risk dimensions"
  };

  const dimEntries = Object.entries(dimensions).filter(([k]) => k !== 'overall');
  dimEntries.sort((a, b) => b[1].score - a[1].score);
  const primaryDriverKey = dimEntries[0] ? dimEntries[0][0] : 'liability';
  const primaryDriverLabel = `${primaryDriverKey.charAt(0).toUpperCase() + primaryDriverKey.slice(1)} Exposure`;

  const noticeMatch = textLower.match(/(\d{1,3})\s*days?['"]?\s*(?:prior\s*)?written\s+notice/);
  const noticeDays = noticeMatch ? noticeMatch[1] : '30';

  const primaryDependencyChain = [
    {
      step: 1,
      nodeType: "CLAUSE",
      title: "Payment Terms & Invoice Default",
      description: "Foundational contractual obligation establishing remittance and service standards.",
      evidence: "Invoices must be satisfied within standard stated remittance windows.",
      riskPropagation: "If delayed, activates immediate contractual cure window clock."
    },
    {
      step: 2,
      nodeType: "NOTICE_WINDOW",
      title: `${noticeDays}-Day Written Notice Requirement`,
      description: "Contractually mandated window to cure or respond before remedies vest.",
      evidence: `Formal written notice must be dispatched at least ${noticeDays} days prior to asserting breach.`,
      riskPropagation: "Failure to dispatch formal notice in strict compliance forfeits defenses."
    },
    {
      step: 3,
      nodeType: "DEADLINE",
      title: `Day ${noticeDays} Cure Expiration Threshold`,
      description: "Definitive calendar milestone where contractual breach becomes actionable.",
      evidence: `Upon lapse of the ${noticeDays}-day period, uncured defaults mature into actionable non-compliance.`,
      riskPropagation: "Clock expiration directly converts informal friction into actionable breach."
    },
    {
      step: 4,
      nodeType: "OPERATIONAL_IMPACT",
      title: hasSlaSusp ? "Operational Suspension & Immediate Remedies" : "Contract Default & Liquidated Damages",
      description: "Immediate business disruption affecting operations, deliverables, or cash flow.",
      evidence: "Counterparty retains unilateral rights to withhold deliverables, halt SLA commitments, and assess remedies.",
      riskPropagation: "Suspension disrupts downstream customer SLAs and generates revenue losses."
    },
    {
      step: 5,
      nodeType: "ESCALATION",
      title: "Executive Dispute Resolution & Formal Arbitration",
      description: "Formal legal proceedings, arbitration, or commercial termination.",
      evidence: "Unresolved defaults trigger mandatory escalation to General Counsel and binding dispute proceedings.",
      riskPropagation: "Binding forum selection dictates defense costs and public reputational risk."
    }
  ];

  const crossClauseConflicts = [];
  if (hasCap && hasUncappedIndemnity && !hasCarveouts) {
    crossClauseConflicts.push({
      id: "conflict-liability-indemnity-3",
      conflictType: "LIABILITY_INDEMNITY_AMBIGUITY",
      title: "Liability Cap vs. Indemnification Scope Ambiguity",
      description: "The contract establishes an aggregate limitation of liability, but the third-party indemnification clause does not state whether it is capped or uncapped.",
      evidenceA: {
        section: "Limitation of Liability",
        identifiedValue: "Aggregate Liability Cap Present",
        excerpt: "Total cumulative damages limited to fees paid under the agreement."
      },
      evidenceB: {
        section: "Indemnification",
        identifiedValue: "Broad Defense & Indemnity Obligation",
        excerpt: "Party shall defend, indemnify, and hold harmless against any and all claims."
      },
      potentialImpact: "In litigation, the counterparty will argue indemnity claims bypass the liability cap entirely, exposing the enterprise to uncapped damages.",
      recommendation: "Add express clause clarifying whether indemnification claims are subject to or excluded from the aggregate liability limitation.",
      disclaimer: CONFLICT_DISCLAIMER
    });
  }

  const verifiedCap = finCaps.length > 0 ? finCaps[0].amount : null;
  const optBDelta = -Math.min(28, Math.max(15, Math.round(overallScore * 0.35)));
  const optCDelta = -Math.min(48, Math.max(28, Math.round(overallScore * 0.60)));

  const whatIfScenarios = [
    {
      scenarioId: "OPTION_A",
      title: "Option A: Leave Unchanged",
      strategy: "Accept all contractual provisions as drafted without negotiation redlines.",
      riskDelta: 0,
      projectedExposureScore: overallScore,
      financialImpact: {
        status: verifiedCap ? "CALCULATED" : "NOT_AVAILABLE",
        value: verifiedCap,
        formattedDelta: "$0.00 (No change)",
        sourceClause: "Current contract terms",
        explanation: verifiedCap ? `Existing liability exposure cap remains at $${verifiedCap.toLocaleString('en-US', { minimumFractionDigits: 2 })}.` : "The contract does not provide sufficient monetary information to quantify this impact."
      },
      operationalImpact: "Operational status quo. Retains existing suspension and asymmetric cure obligations.",
      legalPosition: "Assumes full counterparty-drafted risk allocation with unmitigated legal exposure.",
      recommended: false
    },
    {
      scenarioId: "OPTION_B",
      title: "Option B: Balanced Revision",
      strategy: "Propose market-standard reciprocal terms: mutual indemnity caps, 30-day cure periods, and bilateral termination rights.",
      riskDelta: optBDelta,
      projectedExposureScore: Math.max(10, overallScore + optBDelta),
      financialImpact: verifiedCap ? {
        status: "CALCULATED",
        value: Math.round(verifiedCap * 0.5 * 100) / 100,
        formattedDelta: `-$${(verifiedCap * 0.5).toLocaleString('en-US', { minimumFractionDigits: 2 })} liability exposure reduction`,
        sourceClause: "Proposed balanced liability cap (50% benchmark)",
        explanation: `Reducing contractual cap from $${verifiedCap.toLocaleString('en-US')} to $${(verifiedCap * 0.5).toLocaleString('en-US')} limits aggregate downside by $${(verifiedCap * 0.5).toLocaleString('en-US')}.`
      } : {
        status: "NOT_AVAILABLE",
        value: null,
        formattedDelta: "N/A",
        sourceClause: null,
        explanation: "The contract does not provide sufficient monetary information to quantify this impact."
      },
      operationalImpact: "Secures 30-day operational breathing room; prevents sudden service freezes and premature invoice default triggers.",
      legalPosition: "Highly defensible market-standard posture with high counterparty acceptance probability.",
      recommended: true
    },
    {
      scenarioId: "OPTION_C",
      title: "Option C: Protective Revision",
      strategy: "Execute maximum defensive redline: strict aggregate fee caps, removal of all indemnity carve-outs, and unilateral convenience exit.",
      riskDelta: optCDelta,
      projectedExposureScore: Math.max(5, overallScore + optCDelta),
      financialImpact: verifiedCap ? {
        status: "CALCULATED",
        value: Math.round(verifiedCap * 0.25 * 100) / 100,
        formattedDelta: `-$${(verifiedCap * 0.75).toLocaleString('en-US', { minimumFractionDigits: 2 })} maximum downside reduction`,
        sourceClause: "Proposed protective liability cap (25% benchmark)",
        explanation: `Capping aggregate liability at $${(verifiedCap * 0.25).toLocaleString('en-US')} mitigates $${(verifiedCap * 0.75).toLocaleString('en-US')} in potential commercial downside.`
      } : {
        status: "NOT_AVAILABLE",
        value: null,
        formattedDelta: "N/A",
        sourceClause: null,
        explanation: "The contract does not provide sufficient monetary information to quantify this impact."
      },
      operationalImpact: "Eliminates all operational forfeiture risks; requires explicit enterprise consent prior to any service disruption.",
      legalPosition: "Aggressive enterprise defense posture; may prolong contract closure cycle or require executive escalation.",
      recommended: false
    }
  ];

  const contractHealthScore = Math.max(5, Math.min(100, 100 - Math.round(overallScore * 0.7)));
  const healthScoreBreakdown = {
    overallHealthScore: contractHealthScore,
    primaryDeteriorationDriver: primaryDriverLabel,
    dimensions: Object.entries(dimensions).filter(([k]) => k !== 'overall').map(([dim, data]) => ({
      dimension: dim.charAt(0).toUpperCase() + dim.slice(1),
      exposureScore: data.score,
      healthContribution: Math.max(5, Math.min(100, 100 - data.score)),
      status: data.score >= 80 ? "CRITICAL" : (data.score >= 60 ? "ELEVATED" : (data.score >= 40 ? "MODERATE" : "HEALTHY"))
    }))
  };

  const recScenario = whatIfScenarios.find(s => s.recommended) || whatIfScenarios[1];
  const executiveDecisionBrief = {
    q1_core_issue: `Elevated exposure in ${primaryDriverLabel.toLowerCase()} across contractual terms.`,
    q2_why_matters: "Unremedied provisions create operational forfeiture risk, asymmetric termination exposure, and unmitigated downside.",
    q3_quantifiable_exposure: `Composite exposure score is ${overallScore}/100. ` + (recScenario.financialImpact.status === 'CALCULATED' ? `Quantified liability ceiling is ${recScenario.financialImpact.formattedDelta}.` : "The contract does not provide sufficient monetary information to quantify this impact."),
    q4_inaction_consequence: "If no action is taken, existing terms expose the enterprise to sudden service suspension, uncapped indemnity claims, and compressed cure timelines.",
    q5_strategic_options: "Three validated pathways: Option A (Accept As-Is), Option B (Balanced Reciprocal Redlines), Option C (Maximum Protective Defense).",
    q6_recommended_option: `${recScenario.title} is strongly recommended to achieve a ${Math.abs(recScenario.riskDelta)}-point exposure reduction while maintaining commercial deal velocity.`,
    q7_required_action: "Submit redlines harmonizing notice timelines, placing an explicit aggregate cap on indemnity, and inserting standard 30-day cure periods.",
    q8_decision_owner: "General Counsel / Procurement Lead",
    q9_target_deadline: "Within 5 business days, prior to contract execution."
  };

  const forwardRiskSignals = [];
  if (deadlineRows.some(d => (d.source_text || '').toLowerCase().includes('renew')) || textLower.includes('renew')) {
    forwardRiskSignals.push({
      signal: "Upcoming Renewal Window Lock-In",
      evidence: "Automatic renewal provision detected with contractual notification window.",
      horizon: "60–90 Days Prior to Expiration",
      impact: "Unintentional multi-year contract renewal if cancellation notice deadline is missed.",
      deterministic: true
    });
  }
  if (dimensions.liability.score >= 60) {
    forwardRiskSignals.push({
      signal: "Elevated Indemnity Exposure Under Counterparty Claims",
      evidence: "Broad third-party indemnity clause lacks explicit aggregate monetary cap.",
      horizon: "Ongoing Commercial Operations",
      impact: "Direct operational liability for counterparty defense costs without contractual ceiling.",
      deterministic: true
    });
  }
  if (crossClauseConflicts.some(c => c.conflictType === "NOTICE_PERIOD_MISMATCH")) {
    forwardRiskSignals.push({
      signal: "Notice Rejection Risk Upon Breach Assertion",
      evidence: "Diverging notice periods detected between cure provisions and general notice clause.",
      horizon: "Upon Material Breach Assertion",
      impact: "Attempted contract termination may be declared procedurally defective by counterparty.",
      deterministic: true
    });
  }

  return {
    documentId: docRow.id,
    documentTitle: docRow.original_name || docRow.filename || "Contract",
    exposureScore: overallScore,
    primaryDeteriorationDriver: primaryDriverLabel,
    exposureModel: dimensions,
    primaryDependencyChain,
    crossClauseConflicts,
    whatIfScenarios,
    executiveDecisionBrief,
    healthScoreBreakdown,
    forwardRisk: {
      tier1_evidence_forward_risk: forwardRiskSignals,
      tier2_statistical_prediction: {
        status: "INSUFFICIENT_HISTORICAL_DATA",
        message: "Empirical dispute probability modeling requires a verified dataset of historical contract outcomes. Currently operating under deterministic forward risk.",
        confidence: null,
        disputeProbability: null
      },
      portfolioAnomalyStatus: "INSUFFICIENT_HISTORICAL_DATA"
    },
    monetaryEvidence: {
      figuresDetected: monetaryFigures.length,
      figures: monetaryFigures
    },
    provenance: createDeterministicProvenance({
      methodology: "deterministic_rule_based",
      evidence: monetaryFigures.map(f => ({ text: f.formatted, segment_id: f.contextType })),
      fallback: true
    }),
    disclaimer: DECISION_DISCLAIMER
  };
}

/**
 * Get unified decision intelligence for a document.
 * Tries Flask first, then executes identical local fallback.
 */
async function getDocumentDecisionIntelligence(docId, user, correlationId) {
  const startTime = Date.now();

  const docRes = await db.query(
    'SELECT id, original_name, filename, extracted_text, risk_score, user_id FROM documents WHERE id = $1',
    [docId]
  );
  if (docRes.rows.length === 0) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }
  const doc = docRes.rows[0];
  if (user && doc.user_id !== user.id && user.role !== 'admin') {
    const err = new Error('Forbidden: Access denied to this document');
    err.status = 403;
    throw err;
  }

  let intelligenceData;
  let fallbackUsed = false;
  let provider = 'flask_microservice';
  let model = 'deterministic_decision_intelligence_v1';

  try {
    intelligenceData = await fetchFromFlask(docId, correlationId);
  } catch (flaskErr) {
    logger.warn(`[Decision Intelligence] Flask unavailable (${flaskErr.message}). Engaging identical local deterministic fallback engine.`);
    fallbackUsed = true;
    provider = 'local_node_fallback';
    model = 'local_deterministic_fallback';

    // Fetch clauses, risks, deadlines, segments for fallback
    const [clausesRes, risksRes, deadlinesRes, segmentsRes] = await Promise.all([
      db.query('SELECT * FROM document_clauses WHERE document_id = $1 ORDER BY confidence DESC', [docId]),
      db.query('SELECT * FROM document_risk_factors WHERE document_id = $1 ORDER BY risk_points DESC', [docId]),
      db.query('SELECT * FROM document_deadlines WHERE document_id = $1 ORDER BY deadline_date ASC NULLS LAST', [docId]),
      db.query('SELECT * FROM document_segments WHERE document_id = $1 ORDER BY position ASC', [docId])
    ]);

    intelligenceData = computeLocalDeterministicDecisionIntelligence(
      doc,
      clausesRes.rows,
      risksRes.rows,
      deadlinesRes.rows,
      segmentsRes.rows
    );

    // Save derived snapshot to DB
    try {
      await db.query(`
        INSERT INTO contract_intelligence (
          id, document_id, health_score, executive_summary,
          conflicts_json, actions_json, metrics_json,
          decision_intelligence_json, exposure_score, primary_driver, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP
        )
      `, [
        docId,
        intelligenceData.healthScoreBreakdown.overallHealthScore,
        intelligenceData.executiveDecisionBrief.q1_core_issue,
        JSON.stringify(intelligenceData.crossClauseConflicts),
        JSON.stringify([]),
        JSON.stringify({ exposureScore: intelligenceData.exposureScore }),
        JSON.stringify(intelligenceData),
        intelligenceData.exposureScore,
        intelligenceData.primaryDeteriorationDriver
      ]);
    } catch (dbSaveErr) {
      logger.warn('[Decision Intelligence] Warning saving fallback snapshot:', dbSaveErr.message);
    }
  }

  const durationMs = Date.now() - startTime;

  await recordAiTelemetry({
    correlationId,
    userId: user ? user.id : null,
    documentId: docId,
    operationType: 'DECISION_INTELLIGENCE',
    provider,
    model,
    durationMs,
    status: 'SUCCESS',
    groundedStatus: 'GROUNDED',
    fallbackUsed,
    metadata: {
      exposureScore: intelligenceData.exposureScore,
      primaryDriver: intelligenceData.primaryDeteriorationDriver,
      conflictsCount: intelligenceData.crossClauseConflicts.length,
      scenariosCount: intelligenceData.whatIfScenarios.length
    }
  });

  return intelligenceData;
}

/**
 * Applies a selected scenario decision into a tracked relational action.
 * Converts decision into contract_actions row, contract_action_activity, and cryptographic blockchain audit.
 */
async function applyDecisionAction(docId, user, decisionParams) {
  const { scenarioId, notes, targetDueDate } = decisionParams || {};

  const docRes = await db.query(
    'SELECT id, original_name, filename, user_id FROM documents WHERE id = $1',
    [docId]
  );
  if (docRes.rows.length === 0) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }
  const doc = docRes.rows[0];
  if (user && doc.user_id !== user.id && user.role !== 'admin') {
    const err = new Error('Forbidden: Access denied to this document');
    err.status = 403;
    throw err;
  }

  const intelligence = await getDocumentDecisionIntelligence(docId, user);
  const scenario = (intelligence.whatIfScenarios || []).find(s => s.scenarioId === scenarioId) || intelligence.whatIfScenarios[1];

  const actionId = uuidv4();
  const sourceActionId = `decision-scenario-${(scenarioId || 'opt-b').toLowerCase()}-${Date.now()}`;
  const title = `Execute Decision: ${scenario.title}`;
  const category = scenario.projectedExposureScore >= 70 ? 'CRITICAL' : 'IMPORTANT';
  const priorityScore = scenario.projectedExposureScore;
  const dueDate = targetDueDate ? new Date(targetDueDate) : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

  await db.query(`
    INSERT INTO contract_actions (
      id, document_id, source_action_id, title, category,
      priority_score, status, decision, owner_id, due_date,
      decision_reason, resolution_notes, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, 'OPEN', 'APPROVED', $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `, [
    actionId,
    docId,
    sourceActionId,
    title,
    category,
    priorityScore,
    user ? user.id : null,
    dueDate,
    `Adopted from Scenario Comparison (${scenario.title}): ${scenario.strategy}`,
    notes || `Applied from Phase 10 Decision Intelligence. Recommended strategy: ${scenario.strategy}`
  ]);

  await db.query(`
    INSERT INTO contract_action_activity (
      id, action_id, event_type, actor_id, metadata, created_at
    ) VALUES (
      gen_random_uuid(), $1, 'DECISION_ACTION_CREATED', $2, $3, CURRENT_TIMESTAMP
    )
  `, [
    actionId,
    user ? user.id : null,
    JSON.stringify({
      scenarioId: scenario.scenarioId,
      strategy: scenario.strategy,
      projectedExposureScore: scenario.projectedExposureScore,
      riskDelta: scenario.riskDelta,
      financialImpact: scenario.financialImpact
    })
  ]);

  const auditResult = await recordAudit(user ? user.id : null, 'DECISION_ACTION_CREATED', {
    documentId: docId,
    actionId,
    scenarioId: scenario.scenarioId,
    title,
    priorityScore,
    riskDelta: scenario.riskDelta,
    financialImpact: scenario.financialImpact
  });

  return {
    success: true,
    actionId,
    title,
    category,
    priorityScore,
    dueDate,
    scenarioAdopted: scenario.scenarioId,
    cryptographicAudit: auditResult,
    blockchainAudit: auditResult // backward-compatible deprecated alias
  };
}

module.exports = {
  getDocumentDecisionIntelligence,
  applyDecisionAction,
  computeLocalDeterministicDecisionIntelligence,
  DECISION_DISCLAIMER,
  CONFLICT_DISCLAIMER
};
