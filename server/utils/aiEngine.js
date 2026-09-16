/**
 * Deciva Engine
 * ---------------------------------------------------------------------------
 * A fast, fully offline, rule/heuristic-based NLP engine that powers clause
 * extraction, plain-language simplification, RAG-style Q&A, negotiation
 * suggestions, risk scoring, compliance checking, deadline extraction and
 * PII detection — with zero external API dependency.
 *
 * If ANTHROPIC_API_KEY is set in the environment, callers may instead route
 * through utils/llm.js for genuine LLM-powered analysis. This file is the
 * default, always-on engine.
 */

const STOPWORDS = new Set(['the','a','an','and','or','of','to','in','on','for','is','are','was','were','be','by','with','as','at','this','that','it','shall','will','which','from','such','any','not']);

function splitSentences(text) {
  return text
    .replace(/\r/g, '')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])|\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => !STOPWORDS.has(w) && w.length > 1);
}

const CLAUSE_PATTERNS = {
  parties: /\b(this agreement is (made|entered into)\s+(between|by and between)|the parties?)\b[^.]{0,300}/i,
  dates: /\b(effective date|dated|commencing on|entered into on)\b[^.]{0,150}/i,
  payment: /\b(payment|fees?|consideration|compensation|salary|remuneration|invoice)\b[^.]{0,300}/i,
  termination: /\b(terminat(e|ion|ing)|expir(e|y|ation))\b[^.]{0,300}/i,
  confidentiality: /\b(confidential(ity)?|non[- ]disclosure|proprietary information)\b[^.]{0,300}/i,
  jurisdiction: /\b(jurisdiction|courts? of)\b[^.]{0,200}/i,
  intellectual_property: /\b(intellectual property|copyright|trademark|patent|IP rights?)\b[^.]{0,300}/i,
  penalties: /\b(penalty|penalties|liquidated damages|indemnif(y|ication)|liability)\b[^.]{0,300}/i,
  governing_law: /\b(governing law|governed by the laws? of|laws? of \w+ shall govern)\b[^.]{0,200}/i
};

const CLAUSE_LABELS = {
  parties: 'Parties',
  dates: 'Key Dates',
  payment: 'Payment Terms',
  termination: 'Termination',
  confidentiality: 'Confidentiality',
  jurisdiction: 'Jurisdiction',
  intellectual_property: 'Intellectual Property',
  penalties: 'Penalties & Liability',
  governing_law: 'Governing Law'
};

function extractClauses(text) {
  const sentences = splitSentences(text);
  const clauses = {};

  for (const [key, pattern] of Object.entries(CLAUSE_PATTERNS)) {
    const matches = [];
    for (let i = 0; i < sentences.length; i++) {
      if (pattern.test(sentences[i])) {
        matches.push({ text: sentences[i].trim(), sentenceIndex: i });
        if (matches.length >= 3) break;
      }
    }
    clauses[key] = {
      label: CLAUSE_LABELS[key],
      found: matches.length > 0,
      excerpts: matches
    };
  }
  return clauses;
}

const JARGON_MAP = [
  [/\bheretofore\b/gi, 'before now'],
  [/\bhereinafter\b/gi, 'from now on'],
  [/\bnotwithstanding\b/gi, 'despite'],
  [/\bin the event that\b/gi, 'if'],
  [/\bprior to\b/gi, 'before'],
  [/\bsubsequent to\b/gi, 'after'],
  [/\bpursuant to\b/gi, 'under'],
  [/\bindemnify and hold harmless\b/gi, 'compensate for losses'],
  [/\bshall\b/gi, 'must'],
  [/\bwaive\b/gi, 'give up'],
  [/\bcovenant\b/gi, 'promise'],
  [/\bconstrued\b/gi, 'interpreted'],
  [/\bnull and void\b/gi, 'invalid'],
  [/\bforce majeure\b/gi, 'unavoidable events (e.g. natural disasters)'],
  [/\bliquidated damages\b/gi, 'a pre-agreed penalty amount'],
  [/\bsole discretion\b/gi, 'complete control'],
  [/\bin perpetuity\b/gi, 'forever'],
  [/\bwithout prejudice to\b/gi, 'without affecting'],
  [/\baforementioned\b/gi, 'mentioned earlier'],
  [/\bexecute this agreement\b/gi, 'sign this agreement']
];

function simplifyText(text) {
  let simplified = text;
  for (const [pattern, replacement] of JARGON_MAP) {
    simplified = simplified.replace(pattern, replacement);
  }
  // Break up long run-on sentences at semicolons for readability.
  simplified = simplified.replace(/;\s*/g, '. ');
  return simplified;
}

const { createDeterministicProvenance } = require('./aiProvenance');

function ragAnswer(question, docText) {
  const q = (question || '').trim();
  const qLower = q.toLowerCase();

  if (/^(hey|hello|hi|greetings|good morning|good afternoon|good evening|hey there|hola|sup)\b/i.test(qLower)) {
    const prov = createDeterministicProvenance({
      methodology: 'conversational_pattern',
      evidence: []
    });
    return {
      answer: "Hello! I am Deciva, your intelligent legal copilot. I have analyzed this document and am ready to answer your questions. You can ask me about the contracting parties, payment terms, termination clauses, governing law, risks, or any specific provision!",
      engine: 'deterministic',
      provider: null,
      model: null,
      confidence: {
        score: null,
        methodology: 'conversational_pattern'
      },
      confidenceScore: null,
      grounded: true,
      groundingStatus: 'CONVERSATIONAL',
      sources: [{ text: "Deciva Assistant", pageRef: "General" }],
      provenance: prov
    };
  }

  if (/^(who are you|what can you do|help|what is your name)\b/i.test(qLower)) {
    const prov = createDeterministicProvenance({
      methodology: 'conversational_pattern',
      evidence: []
    });
    return {
      answer: "I am Deciva, an enterprise-grade AI legal copilot. I analyze contracts, extract key clauses, identify risk exposure, evaluate compliance, and answer natural language questions about your legal documents.",
      engine: 'deterministic',
      provider: null,
      model: null,
      confidence: {
        score: null,
        methodology: 'conversational_pattern'
      },
      confidenceScore: null,
      grounded: true,
      groundingStatus: 'CONVERSATIONAL',
      sources: [{ text: "Deciva Assistant", pageRef: "General" }],
      provenance: prov
    };
  }

  if (!docText || !docText.trim()) {
    const prov = createDeterministicProvenance({
      methodology: 'insufficient_evidence',
      evidence: []
    });
    return {
      answer: "This document appears to have no extractable text. Please ensure you have uploaded a valid PDF, DOCX, or text file.",
      engine: 'deterministic',
      provider: null,
      model: null,
      confidence: {
        score: null,
        methodology: 'insufficient_evidence'
      },
      confidenceScore: null,
      grounded: false,
      groundingStatus: 'NO_DOCUMENT_TEXT',
      answer_status: 'insufficient_evidence',
      sources: [],
      provenance: prov
    };
  }

  const sentences = splitSentences(docText);

  // Helper for deterministic rule-based match returns
  function makeRuleMatch(answer, matches, defaultSource) {
    const sources = matches.length > 0
      ? matches.slice(0, 2).map((s, idx) => ({ text: s.slice(0, 60) + '…', pageRef: `¶${idx + 1}` }))
      : [defaultSource];
    const prov = createDeterministicProvenance({
      methodology: 'deterministic_rule_based',
      evidence: sources
    });
    return {
      answer,
      engine: 'deterministic',
      provider: null,
      model: null,
      confidence: {
        score: null,
        methodology: 'deterministic_rule_based'
      },
      confidenceScore: null,
      grounded: true,
      groundingStatus: 'GROUNDED',
      sources,
      provenance: prov
    };
  }

  // A. Parties / Who is involved
  if (/\b(part(?:y|ies)|who (?:is|are)|contracting|between|employer|employee|client|vendor|contractor|signed by)\b/i.test(qLower)) {
    const partyMatches = sentences.filter(s =>
      /\b(between|by and between|entered into|party|parties|employer|employee|company|contractor|client|vendor|disclosing|receiving)\b/i.test(s)
    );
    if (partyMatches.length > 0) {
      const excerpt = partyMatches.slice(0, 3).join(' ');
      return makeRuleMatch(`According to the document, the contracting parties and preamble details are:\n\n"${excerpt}"`, partyMatches);
    }
  }

  // B. Payment / Compensation / Salary / Fees
  if (/\b(pay(?:ment|ing)?|fee[s]?|salary|compensation|price|amount|cost[s]?|invoice[s]?|remuneration|dollars?|\$|usd|rate)\b/i.test(qLower)) {
    const paymentMatches = sentences.filter(s =>
      /\b(pay(?:ment|ing)?|fee[s]?|salary|compensation|price|amount|cost|invoice|remuneration|dollar|\$|usd|rate|monthly|annually|due|per)\b/i.test(s)
    );
    if (paymentMatches.length > 0) {
      const excerpt = paymentMatches.slice(0, 3).join(' ');
      return makeRuleMatch(`The payment terms and financial provisions stated in the document are:\n\n"${excerpt}"`, paymentMatches);
    }
  }

  // C. Termination / Duration / Expiry
  if (/\b(terminat(?:e|ion|ing)?|expir(?:e|y|ation)?|cancel(?:lation)?|notice period|duration|end date|term)\b/i.test(qLower)) {
    const termMatches = sentences.filter(s =>
      /\b(terminat(?:e|ion|ing)?|expir(?:e|y|ation)?|cancel|notice|effective|period|term|duration|end)\b/i.test(s)
    );
    if (termMatches.length > 0) {
      const excerpt = termMatches.slice(0, 3).join(' ');
      return makeRuleMatch(`The termination and contract duration provisions are:\n\n"${excerpt}"`, termMatches);
    }
  }

  // D. Governing Law / Jurisdiction
  if (/\b(governing law|jurisdiction|court[s]?|state|country|laws of|venue|dispute)\b/i.test(qLower)) {
    const lawMatches = sentences.filter(s =>
      /\b(governing law|jurisdiction|court|state|country|laws of|governed by|venue|dispute)\b/i.test(s)
    );
    if (lawMatches.length > 0) {
      const excerpt = lawMatches.slice(0, 2).join(' ');
      return makeRuleMatch(`The governing law and jurisdiction clause specifies:\n\n"${excerpt}"`, lawMatches);
    }
  }

  // E. Risk Assessment & Vulnerabilities
  if (/\b(risk[s]?|danger|liability|liabilities|exposure|vulnerab|threat[s]?|penalty|penalties|hazard|safe)\b/i.test(qLower)) {
    const riskData = riskScore(docText);
    const riskSentences = sentences.filter(s =>
      /\b(sole discretion|unlimited liability|indemnif|penalty|without cause|late fee|non-?refundable|interest|breach|loss)\b/i.test(s)
    );

    let responseText = `Here is the AI Risk Assessment for this document:\n\n• Overall Risk Exposure: ${riskData.overall}%`;
    const categories = Object.entries(riskData.breakdown).map(([cat, score]) => `• ${cat.charAt(0).toUpperCase() + cat.slice(1)} Risk: ${score}%`).join('\n');
    responseText += `\n${categories}`;

    if (riskSentences.length > 0) {
      responseText += `\n\nKey Risk Provisions Identified:\n"${riskSentences.slice(0, 3).join(' ')}"`;
    }

    return makeRuleMatch(responseText, riskSentences, { text: `Risk Assessment (${riskData.overall}% score)`, pageRef: 'Risk Module' });
  }

  // F. Deadlines & Important Dates
  if (/\b(deadline[s]?|due date[s]?|timeline|date[s]?|schedule|calendar|when is|effective date)\b/i.test(qLower)) {
    const deadlines = extractDeadlines(docText);
    if (deadlines.length > 0) {
      const list = deadlines.map(d => `• ${d.type.toUpperCase()}: ${d.text} (${d.dateStr || 'Specified in text'})`).join('\n');
      const sources = deadlines.map(d => ({ text: d.text.slice(0, 60), pageRef: 'Deadlines' }));
      const prov = createDeterministicProvenance({
        methodology: 'deterministic_rule_based',
        evidence: sources
      });
      return {
        answer: `Important dates and deadlines detected in this document:\n\n${list}`,
        engine: 'deterministic',
        provider: null,
        model: null,
        confidence: {
          score: null,
          methodology: 'deterministic_rule_based'
        },
        confidenceScore: null,
        grounded: true,
        groundingStatus: 'GROUNDED',
        sources,
        provenance: prov
      };
    }
  }

  // G. Negotiation & Recommendations
  if (/\b(negotiat|recommend|suggestion[s]?|advice|improve|clause advice|change[s]? needed|counter)\b/i.test(qLower)) {
    const suggestions = negotiationSuggestions(docText);
    if (suggestions.length > 0) {
      const text = suggestions.map(s => `• Issue: ${s.issue}\n  Risk: ${s.risk.toUpperCase()}\n  Recommendation: ${s.recommendation}`).join('\n\n');
      const sources = [{ text: "Negotiation Engine", pageRef: "Analysis" }];
      const prov = createDeterministicProvenance({
        methodology: 'deterministic_rule_based',
        evidence: sources
      });
      return {
        answer: `Negotiation Recommendations for this document:\n\n${text}`,
        engine: 'deterministic',
        provider: null,
        model: null,
        confidence: {
          score: null,
          methodology: 'deterministic_rule_based'
        },
        confidenceScore: null,
        grounded: true,
        groundingStatus: 'GROUNDED',
        sources,
        provenance: prov
      };
    }
  }

  // H. Compliance & Frameworks
  if (/\b(complian(?:ce|t)|gdpr|hipaa|soc2|ccpa|regulation[s]?|framework[s]?|legal standards)\b/i.test(qLower)) {
    const compliance = complianceCheck(docText);
    const items = Object.entries(compliance).map(([fw, data]) => `• ${fw.toUpperCase()}: ${data.status === 'compliant' ? 'Compliant' : 'Needs Review'} — ${data.notes || ''}`).join('\n');
    const sources = [{ text: "Compliance Checker", pageRef: "Audit" }];
    const prov = createDeterministicProvenance({
      methodology: 'deterministic_rule_based',
      evidence: sources
    });
    return {
      answer: `Compliance Assessment against legal frameworks:\n\n${items}`,
      engine: 'deterministic',
      provider: null,
      model: null,
      confidence: {
        score: null,
        methodology: 'deterministic_rule_based'
      },
      confidenceScore: null,
      grounded: true,
      groundingStatus: 'GROUNDED',
      sources,
      provenance: prov
    };
  }

  // I. PII & Data Privacy
  if (/\b(pii|privacy|sensitive|personal info|data protection|ssn|redact)\b/i.test(qLower)) {
    const piiItems = detectPII(docText);
    if (piiItems.length > 0) {
      const summary = piiItems.map(p => `• ${p.type.toUpperCase()}: ${p.value}`).join('\n');
      const sources = [{ text: `${piiItems.length} PII items detected`, pageRef: "Privacy Engine" }];
      const prov = createDeterministicProvenance({
        methodology: 'deterministic_rule_based',
        evidence: sources
      });
      return {
        answer: `Detected PII and sensitive data items in this document:\n\n${summary}`,
        engine: 'deterministic',
        provider: null,
        model: null,
        confidence: {
          score: null,
          methodology: 'deterministic_rule_based'
        },
        confidenceScore: null,
        grounded: true,
        groundingStatus: 'GROUNDED',
        sources,
        provenance: prov
      };
    } else {
      const sources = [{ text: "PII Scanner", pageRef: "Privacy Engine" }];
      const prov = createDeterministicProvenance({
        methodology: 'deterministic_rule_based',
        evidence: sources
      });
      return {
        answer: "No obvious PII (Personally Identifiable Information) like SSNs, emails, or credit card numbers were detected in this document text.",
        engine: 'deterministic',
        provider: null,
        model: null,
        confidence: {
          score: null,
          methodology: 'deterministic_rule_based'
        },
        confidenceScore: null,
        grounded: true,
        groundingStatus: 'GROUNDED',
        sources,
        provenance: prov
      };
    }
  }

  // J. Document Summary / Overview
  if (/\b(summar(?:y|ize)|overview|explain|what is this|about)\b/i.test(qLower)) {
    const firstFew = sentences.slice(0, 4).join(' ');
    const sources = [{ text: "Document Summary", pageRef: "Preamble" }];
    const prov = createDeterministicProvenance({
      methodology: 'deterministic_rule_based',
      evidence: sources
    });
    return {
      answer: `Here is a summary of the document based on its initial sections:\n\n"${firstFew}"\n\nFor deeper analysis, ask about specific areas such as parties, payment terms, risk evaluation, or termination clauses.`,
      engine: 'deterministic',
      provider: null,
      model: null,
      confidence: {
        score: null,
        methodology: 'deterministic_rule_based'
      },
      confidenceScore: null,
      grounded: true,
      groundingStatus: 'GROUNDED',
      sources,
      provenance: prov
    };
  }

  const qTokens = new Set(tokenize(question));
  if (qTokens.size > 0 && sentences.length > 0) {
    const scored = sentences.map((s, i) => {
      const sTokens = tokenize(s);
      const overlap = sTokens.filter(t => qTokens.has(t)).length;
      const score = overlap / Math.sqrt(sTokens.length + 1);
      return { text: s, index: i, score, overlap };
    }).filter(s => s.overlap > 0);

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 3);

    if (top.length > 0) {
      const retrievalScore = Number(Math.min(1.0, top[0].score).toFixed(3));
      const answer = top.map(t => t.text).join(' ');
      const sources = top.map(t => ({
        text: t.text.slice(0, 60) + '…',
        sentenceIndex: t.index,
        pageRef: `¶${Math.floor(t.index / 4) + 1}`,
        similarity: Number(t.score.toFixed(3))
      }));
      const prov = createDeterministicProvenance({
        methodology: 'deterministic_token_retrieval',
        retrievalScore,
        retrievalMethodology: 'token_overlap',
        evidence: sources
      });
      return {
        answer: `Based on your query, here is the relevant provision found in the document:\n\n"${answer}"`,
        engine: 'deterministic',
        provider: null,
        model: null,
        confidence: {
          score: null,
          methodology: 'deterministic_token_retrieval'
        },
        confidenceScore: null,
        retrieval_score: retrievalScore,
        retrieval_methodology: 'token_overlap',
        grounded: true,
        groundingStatus: 'GROUNDED',
        sources,
        provenance: prov
      };
    }
  }

  const prov = createDeterministicProvenance({
    methodology: 'insufficient_evidence',
    evidence: []
  });
  return {
    answer: `Insufficient grounded evidence: The document does not contain provisions or clauses addressing "${question}". No supporting text was located to ground a contractual assertion.`,
    engine: 'deterministic',
    provider: null,
    model: null,
    confidence: {
      score: null,
      methodology: 'insufficient_evidence'
    },
    confidenceScore: null,
    retrieval_score: null,
    grounded: false,
    groundingStatus: 'INSUFFICIENT_EVIDENCE',
    answer_status: 'insufficient_evidence',
    sources: [],
    provenance: prov
  };
}

const RISK_SIGNALS = {
  termination: [/sole discretion/i, /without cause/i, /immediate(ly)? terminat/i, /no notice/i],
  liability: [/unlimited liability/i, /no limitation of liability/i, /indemnif(y|ication)/i, /consequential damages/i],
  confidentiality: [/perpetual(ly)?/i, /in perpetuity/i, /no confidentiality/i],
  payment: [/non-?refundable/i, /penalty/i, /interest.{0,20}per (month|annum)/i, /late fee/i],
  compliance: [/no data protection/i, /shall not be liable for data breach/i, /waive[s]? all rights/i]
};

function riskScore(text) {
  const breakdown = {};
  let total = 0;
  let maxTotal = 0;

  for (const [category, patterns] of Object.entries(RISK_SIGNALS)) {
    let hits = 0;
    for (const p of patterns) if (p.test(text)) hits++;
    const categoryScore = Math.min(100, Math.round((hits / patterns.length) * 100));
    breakdown[category] = categoryScore;
    total += categoryScore;
    maxTotal += 100;
  }

  const overall = Math.round((total / maxTotal) * 100);
  return {
    overall,
    breakdown,
    traceability: {
      method: 'DETERMINISTIC_SIGNAL_ANALYSIS',
      categoriesEvaluated: Object.keys(RISK_SIGNALS),
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Canonical Calibrated Document Risk (100% Cross-Runtime Parity with Python risk_scoring.py)
 * Formula Version: 2.0.0
 */
const CANONICAL_HAZARD_PATTERNS = [
  {
    pattern: /(unlimited\s+liability|no\s+cap\s+on\s+liability|liability\s+(?:is\s+)?unlimited)/i,
    type: 'CONFIRMED_HAZARD_UNLIMITED_LIABILITY',
    severity: 'HIGH',
    points: 20,
    reason: 'Explicit unlimited liability exposure detected without standard indemnification caps.'
  },
  {
    pattern: /(automatic(?:ally)?\s+renew(?:s|al)?(?!\s+upon\s+notice)|\bin\s+perpetuity\b)/i,
    type: 'CONFIRMED_HAZARD_PERPETUAL_BINDING',
    severity: 'MEDIUM',
    points: 12,
    reason: 'Perpetual duration or automatic renewal lock-in without mandatory prior notice.'
  },
  {
    pattern: /(sole\s+and\s+absolute\s+discretion|unilateral(?:ly)?\s+modify)/i,
    type: 'CONFIRMED_HAZARD_UNILATERAL_DISCRETION',
    severity: 'HIGH',
    points: 15,
    reason: 'Unilateral modification rights granting one party unchecked discretion.'
  },
  {
    pattern: /(non-refundable|waives?\s+all\s+(?:rights|claims|warranties)|non-?compete.{0,30}(?:years|globally))/i,
    type: 'CONFIRMED_HAZARD_RIGHTS_WAIVER',
    severity: 'MEDIUM',
    points: 10,
    reason: 'Broad waiver of claims, onerous non-compete, or statutory warranty protections.'
  },
  {
    pattern: /(immediate\s+termination|terminat(?:es?|ion)\s+immediately|without\s+(?:cause|notice))/i,
    type: 'CONFIRMED_HAZARD_ARBITRARY_TERMINATION',
    severity: 'HIGH',
    points: 15,
    reason: 'Immediate termination without cure period or required default notice.'
  },
  {
    pattern: /(indemnif(?:y|ies|ication)\s+.*?\bwithout\s+limitation|all\s+claims\s+without\s+limitation)/i,
    type: 'CONFIRMED_HAZARD_UNLIMITED_INDEMNITY',
    severity: 'HIGH',
    points: 20,
    reason: 'Uncapped indemnification obligations exposing organization to unlimited third-party claims.'
  }
];

function calculateCalibratedDocumentRisk(fullText, missingClauses = []) {
  const riskFactors = [];
  let hazardPoints = 0;
  let omissionPoints = 0;

  const lowerText = (fullText || '').toLowerCase();
  for (const hazard of CANONICAL_HAZARD_PATTERNS) {
    if (hazard.pattern.test(lowerText)) {
      riskFactors.push({
        riskType: hazard.type,
        category: 'CONFIRMED_HAZARD',
        severity: hazard.severity,
        reason: hazard.reason,
        riskPoints: hazard.points
      });
      hazardPoints += hazard.points;
    }
  }

  for (const missing of missingClauses) {
    const pts = missing.riskPoints || (missing.severity === 'HIGH' ? 15 : missing.severity === 'MEDIUM' ? 10 : 5);
    riskFactors.push({
      riskType: `OMISSION_${missing.type}`,
      category: 'POTENTIAL_OMISSION',
      severity: missing.severity || 'MEDIUM',
      reason: missing.reason || 'Omitted standard protective covenant.',
      riskPoints: pts
    });
    omissionPoints += pts;
  }

  const moderatedOmissions = Math.min(35, omissionPoints);
  const totalRawPoints = hazardPoints + moderatedOmissions;
  const normalizedScore = Math.min(100, Math.max(5, totalRawPoints));

  let level = 'LOW';
  if (normalizedScore <= 25) {
    level = 'LOW';
  } else if (normalizedScore <= 55) {
    level = 'MEDIUM';
  } else {
    level = 'HIGH';
  }

  return {
    score: normalizedScore,
    level,
    totalRiskPoints: totalRawPoints,
    hazardPoints,
    omissionPoints,
    factors: riskFactors,
    formula_version: '2.0.0',
    summary: `${level} Risk (${normalizedScore}/100) identified: ${riskFactors.filter(f => f.category === 'CONFIRMED_HAZARD').length} confirmed hazards, ${riskFactors.filter(f => f.category === 'POTENTIAL_OMISSION').length} potential omissions.`
  };
}

const NEGOTIATION_RULES = [
  {
    test: /sole discretion/i,
    issue: 'Unilateral discretion clause',
    risk: 'high',
    recommendation: 'Replace unilateral "sole discretion" language with mutual agreement or objective, defined criteria.',
    suggestedText: 'Any such decision shall be made reasonably and in good faith, based on objective criteria agreed by both parties.'
  },
  {
    test: /unlimited liability|no limitation of liability/i,
    issue: 'Unlimited liability exposure',
    risk: 'high',
    recommendation: 'Cap liability to a defined multiple of fees paid (e.g. 12 months\' fees), excluding gross negligence/willful misconduct.',
    suggestedText: 'Each party\'s aggregate liability shall not exceed the total fees paid in the preceding 12 months, except in cases of gross negligence, willful misconduct, or breach of confidentiality.'
  },
  {
    test: /terminat(e|ion).{0,40}without cause|terminat(e|ion).{0,40}no notice/i,
    issue: 'Termination without notice',
    risk: 'medium',
    recommendation: 'Require a minimum notice period (e.g. 30-60 days) and a cure period for remediable breaches.',
    suggestedText: 'Either party may terminate this Agreement for cause upon 30 days\' written notice, provided the breaching party has failed to cure such breach within that period.'
  },
  {
    test: /auto(matically)?[- ]renew/i,
    issue: 'Automatic renewal clause',
    risk: 'medium',
    recommendation: 'Require affirmative opt-in renewal or at minimum a clear advance notice window to opt out.',
    suggestedText: 'This Agreement shall renew only upon written confirmation by both parties at least 30 days prior to the expiration of the then-current term.'
  },
  {
    test: /non-?refundable/i,
    issue: 'Non-refundable payment terms',
    risk: 'medium',
    recommendation: 'Negotiate a pro-rated refund or credit mechanism for undelivered services.',
    suggestedText: 'Fees for undelivered services shall be refunded on a pro-rated basis upon early termination.'
  },
  {
    test: /perpetual(ly)?|in perpetuity/i,
    issue: 'Perpetual obligation',
    risk: 'medium',
    recommendation: 'Bound the obligation to a fixed term (e.g. 3-5 years post-termination) rather than indefinitely.',
    suggestedText: 'This obligation shall survive termination of this Agreement for a period of five (5) years.'
  },
  {
    test: /waive[s]? all rights|waive.{0,20}claims/i,
    issue: 'Broad waiver of rights',
    risk: 'high',
    recommendation: 'Narrow the waiver to specific, enumerated claims rather than "all rights."',
    suggestedText: 'The waiver set forth herein applies solely to the specific claims enumerated in Section [X] and shall not be construed as a general waiver.'
  }
];

function negotiationSuggestions(text) {
  const sentences = splitSentences(text);
  const suggestions = [];
  for (const rule of NEGOTIATION_RULES) {
    for (let i = 0; i < sentences.length; i++) {
      if (rule.test.test(sentences[i])) {
        suggestions.push({
          clause: sentences[i].trim(),
          sentenceIndex: i,
          issue: rule.issue,
          risk: rule.risk,
          recommendation: rule.recommendation,
          suggestedText: rule.suggestedText,
          traceability: {
            deterministicRule: rule.issue,
            patternMatched: rule.test.toString(),
            timestamp: new Date().toISOString()
          }
        });
        break; // one hit per rule is enough
      }
    }
  }
  return suggestions;
}

const COMPLIANCE_FRAMEWORKS = {
  indian_contract_act: {
    label: 'Indian Contract Act, 1872',
    checks: [
      { name: 'Free consent identifiable', test: /consent|agree(s|d)?\s+to\s+enter/i },
      { name: 'Lawful consideration stated', test: /consideration|payment|fees?/i },
      { name: 'Competent parties defined', test: /parties?|between .{0,100}and/i }
    ]
  },
  consumer_protection_act: {
    label: 'Consumer Protection Act, 2019',
    checks: [
      { name: 'Grievance / dispute redressal mechanism', test: /grievance|dispute resolution|redressal/i },
      { name: 'Refund/return terms disclosed', test: /refund|return policy|cancellation/i }
    ]
  },
  it_act_2000: {
    label: 'Information Technology Act, 2000',
    checks: [
      { name: 'Electronic record / digital signature validity', test: /electronic record|digital signature|electronic signature/i },
      { name: 'Data security obligations', test: /reasonable security practices|data security|information security/i }
    ]
  },
  gdpr: {
    label: 'GDPR',
    checks: [
      { name: 'Lawful basis for processing referenced', test: /lawful basis|legitimate interest|data processing/i },
      { name: 'Data subject rights addressed', test: /right to (access|erasure|be forgotten)|data subject rights/i },
      { name: 'Data breach notification clause', test: /data breach notification|breach notification/i }
    ]
  },
  corporate_policy: {
    label: 'Internal Corporate Policy',
    checks: [
      { name: 'Confidentiality obligations present', test: /confidential/i },
      { name: 'Code of conduct / compliance reference', test: /code of conduct|compliance with (applicable )?laws/i }
    ]
  }
};

function complianceCheck(text) {
  const results = {};
  for (const [key, fw] of Object.entries(COMPLIANCE_FRAMEWORKS)) {
    const checks = fw.checks.map(c => ({ name: c.name, pass: c.test.test(text) }));
    const passed = checks.filter(c => c.pass).length;
    results[key] = {
      label: fw.label,
      checks,
      score: Math.round((passed / checks.length) * 100)
    };
  }
  return results;
}

const DATE_REGEX = /\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})|(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})|(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4}))\b/gi;

const DEADLINE_CONTEXT = {
  renewal: /renew(al|s|ed)?/i,
  expiry: /expir(y|es|ation|ed)/i,
  payment_due: /payment (is )?due|due date|invoice due/i,
  notice_period: /notice period|days'? (written )?notice|advance notice/i
};

function extractDeadlines(text) {
  const sentences = splitSentences(text);
  const deadlines = [];

  sentences.forEach((sentence, idx) => {
    const dateMatches = sentence.match(DATE_REGEX);
    if (!dateMatches) return;

    let category = 'general';
    for (const [key, pattern] of Object.entries(DEADLINE_CONTEXT)) {
      if (pattern.test(sentence)) { category = key; break; }
    }

    dateMatches.forEach(dateStr => {
      deadlines.push({
        date: dateStr,
        category,
        context: sentence.trim(),
        sentenceIndex: idx
      });
    });
  });

  return deadlines;
}

function luhnCheck(numStr) {
  const digits = numStr.replace(/\D/g, '');
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return digits.length >= 12 && sum % 10 === 0;
}

const PII_PATTERNS = {
  aadhaar: { regex: /\b\d{4}\s?\d{4}\s?\d{4}\b/g, label: 'Aadhaar Number' },
  pan: { regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g, label: 'PAN' },
  passport: { regex: /\b[A-PR-WYa-pr-wy][1-9]\d\s?\d{4}[1-9]\b/g, label: 'Passport Number' },
  email: { regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, label: 'Email Address' },
  phone: { regex: /\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, label: 'Phone Number' },
  credit_card: { regex: /\b(?:\d[ -]?){13,19}\b/g, label: 'Bank/Credit Card Number', validate: luhnCheck }
};

function detectPII(text) {
  const found = [];
  for (const [key, { regex, label, validate }] of Object.entries(PII_PATTERNS)) {
    const matches = [...text.matchAll(regex)];
    for (const m of matches) {
      if (validate && !validate(m[0])) continue;
      found.push({ type: key, label, value: m[0], index: m.index });
    }
  }
  return found;
}

function redactPII(text, customTerms = []) {
  let redacted = text;
  const found = detectPII(text);
  for (const item of found) {
    const mask = item.type === 'email'
      ? item.value.replace(/(.{2}).+(@.+)/, '$1***$2')
      : '█'.repeat(Math.max(4, item.value.length - 4)) + item.value.slice(-4);
    redacted = redacted.split(item.value).join(mask);
  }
  for (const term of customTerms) {
    if (!term) continue;
    redacted = redacted.split(term).join('█'.repeat(term.length));
  }
  return { redacted, itemsFound: found.length, items: found };
}

const { diffWords } = require('diff');

function classifySection(text) {
  for (const [key, pattern] of Object.entries(CLAUSE_PATTERNS)) {
    if (pattern.test(text)) return CLAUSE_LABELS[key];
  }
  return 'General';
}

function diffDocuments(textA, textB) {
  const parts = diffWords(textA, textB);
  const changes = [];
  for (const part of parts) {
    if (part.added || part.removed) {
      changes.push({
        type: part.added ? 'added' : 'removed',
        text: part.value.trim(),
        section: classifySection(part.value),
        impact: part.added
          ? 'New obligation or right introduced — review before accepting.'
          : 'Existing obligation or right removed — confirm this was intentional.'
      });
    }
  }
  return { changes, totalChanges: changes.length };
}

module.exports = {
  extractClauses,
  simplifyText,
  ragAnswer,
  riskScore,
  calculateCalibratedDocumentRisk,
  negotiationSuggestions,
  complianceCheck,
  extractDeadlines,
  detectPII,
  redactPII,
  diffDocuments,
  splitSentences
};
