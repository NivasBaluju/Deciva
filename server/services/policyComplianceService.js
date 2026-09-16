/**
 * Deciva — Enterprise Policy, Compliance & Governance Control Engine
 * ---------------------------------------------------------------------------
 * Enforces deterministic organizational contract policies, controls, exact clause
 * evidence quotes, explainable compliance scoring, dry-runs, and exception governance
 * with strict separation of duties and concurrency locking.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { recordAudit } = require('../utils/audit');
const { recordAiTelemetry } = require('../utils/aiTelemetry');
const logger = require('../utils/logger');

// Allowed rule types
const ALLOWED_RULE_TYPES = [
  'numeric_threshold',
  'string_match',
  'presence_check',
  'set_membership',
  'pattern_match',
  'boolean_flag'
];

// Allowed operators by type
const ALLOWED_OPERATORS = {
  numeric_threshold: ['>=', '<=', '>', '<', '==', '!=', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL', 'EQUALS', 'NOT_EQUALS', 'NOT_UNCAPPED'],
  string_match: ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS'],
  presence_check: ['EXISTS', 'NOT_EXISTS'],
  set_membership: ['IN', 'NOT_IN'],
  pattern_match: ['CONTAINS', 'MATCHES', 'NOT_CONTAINS'],
  boolean_flag: ['EQUALS', 'NOT_EQUALS']
};

const ALLOWED_ON_MISSING = ['INSUFFICIENT_EVIDENCE', 'NON_COMPLIANT', 'NOT_ASSESSED'];

// Forbidden properties to prevent script execution or prototype pollution
const FORBIDDEN_KEYS = ['eval', 'exec', 'function', 'script', 'code', '__proto__', 'constructor', 'prototype'];

/**
 * Validates a machine-readable rule definition strictly.
 * Prohibits arbitrary executable expressions.
 */
function validateRuleDefinition(ruleDef) {
  if (!ruleDef || typeof ruleDef !== 'object' || Array.isArray(ruleDef)) {
    const err = new Error('Rule definition must be a valid JSON object');
    err.status = 400;
    throw err;
  }

  // Check for forbidden executable or injection keys
  for (const key of Object.keys(ruleDef)) {
    if (FORBIDDEN_KEYS.includes(key.toLowerCase())) {
      const err = new Error(`Forbidden key '${key}' in rule definition: arbitrary execution is prohibited`);
      err.status = 400;
      throw err;
    }
  }

  const { type, evidence_field, operator, expected_value, on_missing } = ruleDef;

  if (!type || !ALLOWED_RULE_TYPES.includes(type)) {
    const err = new Error(`Invalid rule type '${type}'. Allowed types: ${ALLOWED_RULE_TYPES.join(', ')}`);
    err.status = 400;
    throw err;
  }

  if (!evidence_field || typeof evidence_field !== 'string' || !evidence_field.trim()) {
    const err = new Error('Rule definition requires a non-empty evidence_field string');
    err.status = 400;
    throw err;
  }

  const allowedOps = ALLOWED_OPERATORS[type] || [];
  if (!operator || !allowedOps.includes(operator)) {
    const err = new Error(`Invalid operator '${operator}' for rule type '${type}'. Allowed: ${allowedOps.join(', ')}`);
    err.status = 400;
    throw err;
  }

  if (on_missing && !ALLOWED_ON_MISSING.includes(on_missing)) {
    const err = new Error(`Invalid on_missing status '${on_missing}'. Allowed: ${ALLOWED_ON_MISSING.join(', ')}`);
    err.status = 400;
    throw err;
  }

  // Type-specific expected_value validations
  if (type === 'numeric_threshold') {
    if (operator !== 'NOT_UNCAPPED') {
      const num = Number(expected_value);
      if (isNaN(num) || expected_value === null || expected_value === undefined) {
        const err = new Error('Numeric threshold rule requires a valid numeric expected_value');
        err.status = 400;
        throw err;
      }
    }
  } else if (type === 'set_membership') {
    if (!Array.isArray(expected_value) || expected_value.length === 0) {
      const err = new Error('Set membership rule requires a non-empty expected_value array');
      err.status = 400;
      throw err;
    }
  } else if (type === 'pattern_match') {
    if (typeof expected_value !== 'string' || !expected_value.trim()) {
      const err = new Error('Pattern match rule requires a valid string pattern');
      err.status = 400;
      throw err;
    }
    try {
      new RegExp(expected_value);
    } catch (regErr) {
      const err = new Error(`Invalid regex pattern in expected_value: ${regErr.message}`);
      err.status = 400;
      throw err;
    }
  }

  return {
    version: String(ruleDef.version || '1.0'),
    type,
    evidence_field: evidence_field.trim(),
    operator,
    expected_value,
    on_missing: on_missing || 'INSUFFICIENT_EVIDENCE'
  };
}

/**
 * Extracts deterministic facts, quotes, and locations from raw contract text.
 */
function extractContractFacts(text = '', intelligence = {}) {
  const facts = {};
  const evidenceSnippets = {};
  const lowerText = text.toLowerCase();

  let uncappedMatch = false;
  if (/liability\s+(?:shall\s+be\s+|is\s+)?unlimited|uncapped\s+liability|without\s+limitation\s+of\s+liability/i.test(text)) {
    uncappedMatch = true;
    facts.liability_cap = 'UNCAPPED';
    const match = text.match(/liability\s+(?:shall\s+be\s+|is\s+)?unlimited|uncapped\s+liability|without\s+limitation\s+of\s+liability/i);
    evidenceSnippets.liability_cap = {
      quote: match ? match[0] : 'Liability without limitation',
      location: 'Liability Clause'
    };
  } else {
    const capRegex = /(?:liability|aggregate\s+liability|maximum\s+liability|cap).*?(?:exceed|capped\s+at|limited\s+to|limit\s+of|is)\s*\$?([0-9,]+)/i;
    const match = text.match(capRegex);
    if (match && match[1]) {
      const parsedNum = parseInt(match[1].replace(/,/g, ''), 10);
      if (!isNaN(parsedNum)) {
        facts.liability_cap = parsedNum;
        const startIdx = Math.max(0, match.index - 20);
        const endIdx = Math.min(text.length, match.index + match[0].length + 40);
        evidenceSnippets.liability_cap = {
          quote: text.substring(startIdx, endIdx).trim(),
          location: `Offset ${match.index}`
        };
      }
    }
  }

  const lawRegex = /(?:governed\s+by|laws\s+of|jurisdiction\s+of)\s*(?:the\s+(?:State|Commonwealth)\s+of\s+)?([A-Za-z\s]+?)(?:,|\.|\sand\s|without|courts)/i;
  const lawMatch = text.match(lawRegex);
  const knownJurisdictions = ['Delaware', 'New York', 'California', 'England and Wales', 'Texas', 'Illinois', 'Washington', 'Florida'];
  
  let detectedLaw = null;
  let lawQuote = null;
  let lawIdx = null;

  for (const j of knownJurisdictions) {
    const jRegex = new RegExp(`\\b${j}\\b`, 'i');
    if (jRegex.test(text)) {
      detectedLaw = j;
      const jMatch = text.match(jRegex);
      lawIdx = jMatch ? jMatch.index : 0;
      lawQuote = text.substring(Math.max(0, lawIdx - 30), Math.min(text.length, lawIdx + 50)).trim();
      break;
    }
  }

  if (detectedLaw) {
    facts.governing_law = detectedLaw;
    evidenceSnippets.governing_law = {
      quote: lawQuote,
      location: `Section: Governing Law (Offset ${lawIdx})`
    };
  } else if (lawMatch && lawMatch[1]) {
    const candidate = lawMatch[1].trim();
    if (candidate.length > 2 && candidate.length < 50) {
      facts.governing_law = candidate;
      evidenceSnippets.governing_law = {
        quote: lawMatch[0],
        location: 'Governing Law Clause'
      };
    }
  }

  const noticeRegex = /([0-9]+)\s*(?:calendar\s*|business\s*)?days(?:\s+(?:prior|written|advance))*?\s+(?:written\s+)?notice/i;
  const noticeMatch = text.match(noticeRegex);
  if (noticeMatch && noticeMatch[1]) {
    const days = parseInt(noticeMatch[1], 10);
    if (!isNaN(days)) {
      facts.notice_days = days;
      evidenceSnippets.notice_days = {
        quote: noticeMatch[0],
        location: `Notice Section (Offset ${noticeMatch.index})`
      };
    }
  }

  const paymentRegex = /(?:net\s*([0-9]+)|within\s*([0-9]+)\s*days\s*of\s*invoice)/i;
  const payMatch = text.match(paymentRegex);
  if (payMatch) {
    const term = parseInt(payMatch[1] || payMatch[2], 10);
    if (!isNaN(term)) {
      facts.payment_term_days = term;
      evidenceSnippets.payment_term_days = {
        quote: payMatch[0],
        location: 'Payment Terms'
      };
    }
  }

  const indemRegex = /indemnif(?:y|ication|ied)|defend\s+and\s+hold\s+harmless/i;
  const indemMatch = text.match(indemRegex);
  if (indemMatch) {
    facts.indemnity_present = true;
    const startIdx = Math.max(0, indemMatch.index - 20);
    const endIdx = Math.min(text.length, indemMatch.index + 120);
    evidenceSnippets.indemnity_present = {
      quote: text.substring(startIdx, endIdx).trim(),
      location: `Indemnification Clause (Offset ${indemMatch.index})`
    };
  } else {
    facts.indemnity_present = false;
  }

  const dataRegex = /gdpr|ccpa|data\s+protection|personal\s+data|confidential\s+information|information\s+security/i;
  const dataMatch = text.match(dataRegex);
  if (dataMatch) {
    facts.data_protection_present = true;
    const startIdx = Math.max(0, dataMatch.index - 20);
    const endIdx = Math.min(text.length, dataMatch.index + 100);
    evidenceSnippets.data_protection_present = {
      quote: text.substring(startIdx, endIdx).trim(),
      location: `Data Protection / Confidentiality (Offset ${dataMatch.index})`
    };
  } else {
    facts.data_protection_present = false;
  }

  const termConvRegex = /terminate.*?for\s+convenience|without\s+cause/i;
  const termConvMatch = text.match(termConvRegex);
  if (termConvMatch) {
    facts.termination_for_convenience = true;
    evidenceSnippets.termination_for_convenience = {
      quote: termConvMatch[0],
      location: 'Termination Clause'
    };
  } else {
    facts.termination_for_convenience = false;
  }

  const auditRegex = /right\s+to\s+audit|inspect\s+(?:the\s+)?books\s+and\s+records/i;
  const auditMatch = text.match(auditRegex);
  if (auditMatch) {
    facts.audit_rights_present = true;
    evidenceSnippets.audit_rights_present = {
      quote: auditMatch[0],
      location: 'Audit Clause'
    };
  } else {
    facts.audit_rights_present = false;
  }

  return { facts, evidenceSnippets };
}

/**
 * Deterministically evaluates a single control rule against extracted facts.
 */
function evaluateControlRule(control, facts, evidenceSnippets) {
  const rule = validateRuleDefinition(control.rule_definition_json);
  const { type, evidence_field, operator, expected_value, on_missing } = rule;

  const detectedValue = facts[evidence_field];
  const snippet = evidenceSnippets[evidence_field] || null;

  // Insufficient / Missing evidence case
  if (detectedValue === undefined || detectedValue === null) {
    return {
      finding_status: on_missing || 'INSUFFICIENT_EVIDENCE',
      clause_evidence_quote: null,
      clause_evidence_location: 'NOT_FOUND',
      failure_reason: `Required evidence field '${evidence_field}' was not found in contract text.`,
      remediation_suggested: control.remediation_guidance || `Add required ${evidence_field} clause to contract draft.`,
      is_blocking: Boolean(control.is_blocking)
    };
  }

  let passed = false;
  let failureReason = null;

  switch (type) {
    case 'numeric_threshold': {
      if (operator === 'NOT_UNCAPPED') {
        if (detectedValue === 'UNCAPPED') {
          passed = false;
          failureReason = 'Contract specifies uncapped or unlimited liability.';
        } else {
          passed = true;
        }
      } else if (detectedValue === 'UNCAPPED') {
        // If contract is uncapped and we required a specific cap, it fails
        passed = false;
        failureReason = `Contract liability is uncapped; requires bounded limit of at least ${expected_value}.`;
      } else {
        const numVal = Number(detectedValue);
        const targetNum = Number(expected_value);
        if (operator === '>=' || operator === 'GREATER_THAN_OR_EQUAL') {
          passed = numVal >= targetNum;
          if (!passed) failureReason = `Detected value (${numVal}) is below the required threshold of ${targetNum}.`;
        } else if (operator === '<=' || operator === 'LESS_THAN_OR_EQUAL') {
          passed = numVal <= targetNum;
          if (!passed) failureReason = `Detected value (${numVal}) exceeds maximum allowed threshold of ${targetNum}.`;
        } else if (operator === '>' ) {
          passed = numVal > targetNum;
          if (!passed) failureReason = `Detected value (${numVal}) must be strictly greater than ${targetNum}.`;
        } else if (operator === '<') {
          passed = numVal < targetNum;
          if (!passed) failureReason = `Detected value (${numVal}) must be strictly less than ${targetNum}.`;
        } else if (operator === '==' || operator === 'EQUALS') {
          passed = numVal === targetNum;
          if (!passed) failureReason = `Detected value (${numVal}) does not equal expected ${targetNum}.`;
        } else if (operator === '!=' || operator === 'NOT_EQUALS') {
          passed = numVal !== targetNum;
          if (!passed) failureReason = `Detected value (${numVal}) must not equal ${targetNum}.`;
        }
      }
      break;
    }

    case 'set_membership': {
      const allowedList = expected_value.map(v => String(v).trim().toLowerCase());
      const currentValStr = String(detectedValue).trim().toLowerCase();
      const inSet = allowedList.includes(currentValStr);

      if (operator === 'IN') {
        passed = inSet;
        if (!passed) failureReason = `Detected value '${detectedValue}' is not in approved list: [${expected_value.join(', ')}].`;
      } else if (operator === 'NOT_IN') {
        passed = !inSet;
        if (!passed) failureReason = `Detected value '${detectedValue}' is in forbidden list: [${expected_value.join(', ')}].`;
      }
      break;
    }

    case 'presence_check': {
      const isPresent = Boolean(detectedValue);
      if (operator === 'EXISTS') {
        passed = isPresent;
        if (!passed) failureReason = `Required contract element '${evidence_field}' is not present.`;
      } else if (operator === 'NOT_EXISTS') {
        passed = !isPresent;
        if (!passed) failureReason = `Prohibited contract element '${evidence_field}' is present.`;
      }
      break;
    }

    case 'boolean_flag': {
      const boolVal = Boolean(detectedValue);
      const expectedBool = Boolean(expected_value);
      if (operator === 'EQUALS') {
        passed = boolVal === expectedBool;
        if (!passed) failureReason = `Field '${evidence_field}' is ${boolVal}, expected ${expectedBool}.`;
      } else if (operator === 'NOT_EQUALS') {
        passed = boolVal !== expectedBool;
        if (!passed) failureReason = `Field '${evidence_field}' must not be ${expectedBool}.`;
      }
      break;
    }

    case 'string_match': {
      const sVal = String(detectedValue).toLowerCase();
      const sExp = String(expected_value).toLowerCase();
      if (operator === 'EQUALS') {
        passed = sVal === sExp;
        if (!passed) failureReason = `Value '${detectedValue}' does not equal expected '${expected_value}'.`;
      } else if (operator === 'CONTAINS') {
        passed = sVal.includes(sExp);
        if (!passed) failureReason = `Value '${detectedValue}' does not contain expected substring '${expected_value}'.`;
      } else if (operator === 'NOT_CONTAINS') {
        passed = !sVal.includes(sExp);
        if (!passed) failureReason = `Value '${detectedValue}' contains prohibited substring '${expected_value}'.`;
      }
      break;
    }

    case 'pattern_match': {
      const reg = new RegExp(expected_value, 'i');
      const testString = snippet ? snippet.quote : String(detectedValue);
      const matches = reg.test(testString);
      if (operator === 'MATCHES' || operator === 'CONTAINS') {
        passed = matches;
        if (!passed) failureReason = `Text does not match required pattern '${expected_value}'.`;
      } else if (operator === 'NOT_CONTAINS') {
        passed = !matches;
        if (!passed) failureReason = `Text matches prohibited pattern '${expected_value}'.`;
      }
      break;
    }

    default:
      passed = false;
      failureReason = `Unsupported rule type ${type}`;
  }

  return {
    finding_status: passed ? 'COMPLIANT' : 'NON_COMPLIANT',
    clause_evidence_quote: snippet ? snippet.quote : (passed ? String(detectedValue) : null),
    clause_evidence_location: snippet ? snippet.location : 'Contract Text',
    failure_reason: passed ? null : failureReason,
    remediation_suggested: passed ? null : (control.remediation_guidance || 'Revise contract language to comply with policy rule.'),
    is_blocking: Boolean(control.is_blocking)
  };
}

/**
 * Creates a default enterprise contract governance policy if none exists.
 */
async function ensureDefaultPolicy(tenantId, userId) {
  const existing = await db.query(
    'SELECT * FROM contract_governance_policies WHERE tenant_id = $1 AND is_active = TRUE LIMIT 1',
    [tenantId]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const policyId = uuidv4();
  const insertPolicy = await db.query(
    `INSERT INTO contract_governance_policies (
      id, tenant_id, name, description, version, is_active, applicability_rules_json, created_by
    ) VALUES ($1, $2, $3, $4, 1, TRUE, $5, $6) RETURNING *`,
    [
      policyId,
      tenantId,
      'Standard Enterprise Contract Governance Policy',
      'Organizational baseline policy governing liability limits, approved governing law jurisdictions, notice windows, and mandatory indemnification protection.',
      JSON.stringify({ default_for_all: true }),
      userId || null
    ]
  );
  const policy = insertPolicy.rows[0];

  // Default baseline controls
  const defaultControls = [
    {
      control_code: 'GOV-LIAB-01',
      title: 'Liability Cap Threshold',
      description: 'Contract must establish a bounded liability cap of at least $1,000,000.',
      severity: 'HIGH',
      is_blocking: true,
      rule_definition_json: {
        version: '1.0',
        type: 'numeric_threshold',
        evidence_field: 'liability_cap',
        operator: '>=',
        expected_value: 1000000,
        on_missing: 'INSUFFICIENT_EVIDENCE'
      },
      remediation_guidance: 'Negotiate setting aggregate liability cap to at least $1,000,000 or obtain an approved executive exception.'
    },
    {
      control_code: 'GOV-JUR-01',
      title: 'Approved Governing Law Jurisdiction',
      description: 'Governing jurisdiction must reside within an approved state or common-law forum.',
      severity: 'MEDIUM',
      is_blocking: false,
      rule_definition_json: {
        version: '1.0',
        type: 'set_membership',
        evidence_field: 'governing_law',
        operator: 'IN',
        expected_value: ['Delaware', 'New York', 'California', 'England and Wales', 'Texas', 'Illinois'],
        on_missing: 'INSUFFICIENT_EVIDENCE'
      },
      remediation_guidance: 'Align governing law clause with one of the approved corporate legal jurisdictions.'
    },
    {
      control_code: 'GOV-NOT-01',
      title: 'Termination Notice Period Window',
      description: 'Contract must provide a minimum written notice window of at least 30 days for termination or non-renewal.',
      severity: 'MEDIUM',
      is_blocking: false,
      rule_definition_json: {
        version: '1.0',
        type: 'numeric_threshold',
        evidence_field: 'notice_days',
        operator: '>=',
        expected_value: 30,
        on_missing: 'INSUFFICIENT_EVIDENCE'
      },
      remediation_guidance: 'Increase the prior written notice period to at least 30 calendar days.'
    },
    {
      control_code: 'GOV-INDEM-01',
      title: 'Mandatory Indemnification Protection',
      description: 'Contract must contain explicit mutual or vendor indemnification protection.',
      severity: 'HIGH',
      is_blocking: true,
      rule_definition_json: {
        version: '1.0',
        type: 'presence_check',
        evidence_field: 'indemnity_present',
        operator: 'EXISTS',
        expected_value: true,
        on_missing: 'NON_COMPLIANT'
      },
      remediation_guidance: 'Incorporate standard corporate indemnification and hold harmless language.'
    }
  ];

  for (const c of defaultControls) {
    const cid = uuidv4();
    await db.query(
      `INSERT INTO contract_governance_controls (
        id, tenant_id, policy_id, control_code, title, description, severity,
        rule_definition_json, remediation_guidance, is_blocking
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        cid,
        tenantId,
        policyId,
        c.control_code,
        c.title,
        c.description,
        c.severity,
        JSON.stringify(c.rule_definition_json),
        c.remediation_guidance,
        c.is_blocking
      ]
    );
  }

  return policy;
}

/**
 * Creates a new governance policy.
 */
async function createPolicy(tenantId, userId, policyData) {
  const { name, description, applicability_rules_json } = policyData;
  if (!name || typeof name !== 'string' || !name.trim()) {
    const err = new Error('Policy name is required');
    err.status = 400;
    throw err;
  }

  const id = uuidv4();
  const rulesJson = applicability_rules_json ? JSON.stringify(applicability_rules_json) : '{}';

  const res = await db.query(
    `INSERT INTO contract_governance_policies (
      id, tenant_id, name, description, version, is_active, applicability_rules_json, created_by, updated_by
    ) VALUES ($1, $2, $3, $4, 1, TRUE, $5, $6, $6) RETURNING *`,
    [id, tenantId, name.trim(), description || null, rulesJson, userId || null]
  );

  await recordAudit(userId, 'GOVERNANCE_POLICY_CREATED', {
    policyId: id,
    tenantId,
    name: name.trim()
  });

  return res.rows[0];
}

/**
 * Gets a policy by ID, scoped to tenant.
 */
async function getPolicy(tenantId, policyId) {
  const res = await db.query(
    'SELECT * FROM contract_governance_policies WHERE id = $1 AND tenant_id = $2',
    [policyId, tenantId]
  );
  if (res.rows.length === 0) {
    const err = new Error('Governance policy not found');
    err.status = 404;
    throw err;
  }
  const policy = res.rows[0];

  const controlsRes = await db.query(
    'SELECT * FROM contract_governance_controls WHERE policy_id = $1 ORDER BY control_code ASC',
    [policyId]
  );
  policy.controls = controlsRes.rows;

  return policy;
}

/**
 * Lists policies for a tenant.
 */
async function listPolicies(tenantId, query = {}) {
  let sql = 'SELECT * FROM contract_governance_policies WHERE tenant_id = $1';
  const params = [tenantId];

  if (query.active_only === 'true' || query.is_active === 'true') {
    sql += ' AND is_active = TRUE';
  }
  sql += ' ORDER BY created_at DESC';

  const res = await db.query(sql, params);
  return res.rows;
}

/**
 * Updates a policy, automatically incrementing the policy version.
 */
async function updatePolicy(tenantId, userId, policyId, updateData) {
  const current = await getPolicy(tenantId, policyId);
  const { name, description, is_active, applicability_rules_json } = updateData;

  const newVersion = current.version + 1;
  const newName = name !== undefined ? String(name).trim() : current.name;
  const newDesc = description !== undefined ? description : current.description;
  const newActive = is_active !== undefined ? Boolean(is_active) : current.is_active;
  const newRules = applicability_rules_json !== undefined ? JSON.stringify(applicability_rules_json) : JSON.stringify(current.applicability_rules_json);

  const res = await db.query(
    `UPDATE contract_governance_policies SET
      name = $1,
      description = $2,
      version = $3,
      is_active = $4,
      applicability_rules_json = $5,
      updated_by = $6,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $7 AND tenant_id = $8 RETURNING *`,
    [newName, newDesc, newVersion, newActive, newRules, userId || null, policyId, tenantId]
  );

  await recordAudit(userId, 'GOVERNANCE_POLICY_UPDATED', {
    policyId,
    tenantId,
    previousVersion: current.version,
    newVersion
  });

  return res.rows[0];
}

/**
 * Adds a control to a policy with strict rule definition validation.
 */
async function addControl(tenantId, policyId, controlData) {
  const policy = await getPolicy(tenantId, policyId);

  const { control_code, title, description, severity, rule_definition_json, remediation_guidance, is_blocking } = controlData;

  if (!control_code || typeof control_code !== 'string' || !control_code.trim()) {
    const err = new Error('Control code is required');
    err.status = 400;
    throw err;
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    const err = new Error('Control title is required');
    err.status = 400;
    throw err;
  }

  // Validate rule definition schema strictly
  const validatedRule = validateRuleDefinition(rule_definition_json);

  const id = uuidv4();
  const res = await db.query(
    `INSERT INTO contract_governance_controls (
      id, tenant_id, policy_id, control_code, title, description, severity,
      rule_definition_json, remediation_guidance, is_blocking
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [
      id,
      tenantId,
      policyId,
      control_code.trim().toUpperCase(),
      title.trim(),
      description || null,
      (severity || 'MEDIUM').toUpperCase(),
      JSON.stringify(validatedRule),
      remediation_guidance || null,
      Boolean(is_blocking)
    ]
  );

  return res.rows[0];
}

/**
 * Updates an existing control.
 */
async function updateControl(tenantId, controlId, controlData) {
  const check = await db.query(
    'SELECT * FROM contract_governance_controls WHERE id = $1 AND tenant_id = $2',
    [controlId, tenantId]
  );
  if (check.rows.length === 0) {
    const err = new Error('Governance control not found');
    err.status = 404;
    throw err;
  }
  const current = check.rows[0];

  let validatedRule = current.rule_definition_json;
  if (controlData.rule_definition_json) {
    validatedRule = validateRuleDefinition(controlData.rule_definition_json);
  }

  const newTitle = controlData.title !== undefined ? String(controlData.title).trim() : current.title;
  const newDesc = controlData.description !== undefined ? controlData.description : current.description;
  const newSev = controlData.severity !== undefined ? String(controlData.severity).toUpperCase() : current.severity;
  const newRem = controlData.remediation_guidance !== undefined ? controlData.remediation_guidance : current.remediation_guidance;
  const newBlock = controlData.is_blocking !== undefined ? Boolean(controlData.is_blocking) : current.is_blocking;

  const res = await db.query(
    `UPDATE contract_governance_controls SET
      title = $1,
      description = $2,
      severity = $3,
      rule_definition_json = $4,
      remediation_guidance = $5,
      is_blocking = $6,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $7 AND tenant_id = $8 RETURNING *`,
    [newTitle, newDesc, newSev, JSON.stringify(validatedRule), newRem, newBlock, controlId, tenantId]
  );

  return res.rows[0];
}

/**
 * Evaluates document compliance against applicable policies.
 * Supports is_dry_run flag for previewing evaluations without persistence.
 */
async function evaluateDocumentCompliance(tenantId, documentId, userId, options = {}) {
  const isDryRun = Boolean(options.is_dry_run);

  const docRes = await db.query(
    'SELECT id, user_id, original_name, filename, extracted_text FROM documents WHERE id = $1',
    [documentId]
  );
  if (docRes.rows.length === 0) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }
  const doc = docRes.rows[0];
  if (doc.user_id !== tenantId && doc.user_id !== userId) {
    const userRes = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0 || userRes.rows[0].role !== 'admin') {
      const err = new Error('Forbidden: Access denied to document');
      err.status = 403;
      throw err;
    }
  }

  let policy = null;
  if (options.policy_id) {
    const pRes = await db.query(
      'SELECT * FROM contract_governance_policies WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE',
      [options.policy_id, tenantId]
    );
    if (pRes.rows.length > 0) policy = pRes.rows[0];
  }

  if (!policy) {
    const pRes = await db.query(
      'SELECT * FROM contract_governance_policies WHERE tenant_id = $1 AND is_active = TRUE ORDER BY created_at ASC LIMIT 1',
      [tenantId]
    );
    if (pRes.rows.length > 0) {
      policy = pRes.rows[0];
    } else {
      policy = await ensureDefaultPolicy(tenantId, userId);
    }
  }

  if (!policy) {
    return {
      evaluation_status: 'POLICY_NOT_CONFIGURED',
      compliance_score: 0,
      evaluated_controls_count: 0,
      compliant_controls_count: 0,
      partially_compliant_controls_count: 0,
      non_compliant_controls_count: 0,
      not_assessed_controls_count: 0,
      insufficient_evidence_controls_count: 0,
      findings: []
    };
  }

  const controlsRes = await db.query(
    'SELECT * FROM contract_governance_controls WHERE policy_id = $1 ORDER BY control_code ASC',
    [policy.id]
  );
  const controls = controlsRes.rows;

  if (controls.length === 0) {
    return {
      policy_id: policy.id,
      policy_version: policy.version,
      evaluation_status: 'POLICY_NOT_CONFIGURED',
      compliance_score: 0,
      evaluated_controls_count: 0,
      compliant_controls_count: 0,
      partially_compliant_controls_count: 0,
      non_compliant_controls_count: 0,
      not_assessed_controls_count: 0,
      insufficient_evidence_controls_count: 0,
      findings: []
    };
  }

  const text = doc.extracted_text || '';
  const { facts, evidenceSnippets } = extractContractFacts(text);

  let compliantCount = 0;
  let partialCount = 0;
  let nonCompliantCount = 0;
  let notAssessedCount = 0;
  let insufficientCount = 0;
  let hasBlockingFailure = false;

  const findings = [];

  // Check active approved exceptions for this document
  const activeExceptionsRes = await db.query(
    `SELECT control_id, status FROM contract_governance_exceptions 
     WHERE document_id = $1 AND status = 'APPROVED' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
    [documentId]
  );
  const activeExceptionControlIds = new Set(activeExceptionsRes.rows.map(r => r.control_id));

  for (const control of controls) {
    const evalResult = evaluateControlRule(control, facts, evidenceSnippets);
    const hasActiveException = activeExceptionControlIds.has(control.id);

    let findingStatus = evalResult.finding_status;
    if (hasActiveException && findingStatus === 'NON_COMPLIANT') {
      findingStatus = 'PARTIALLY_COMPLIANT';
    }

    if (findingStatus === 'COMPLIANT') {
      compliantCount++;
    } else if (findingStatus === 'PARTIALLY_COMPLIANT') {
      partialCount++;
    } else if (findingStatus === 'NON_COMPLIANT') {
      nonCompliantCount++;
      if (evalResult.is_blocking && !hasActiveException) {
        hasBlockingFailure = true;
      }
    } else if (findingStatus === 'INSUFFICIENT_EVIDENCE') {
      insufficientCount++;
    } else {
      notAssessedCount++;
    }

    findings.push({
      id: uuidv4(),
      control_id: control.id,
      control_code: control.control_code,
      title: control.title,
      severity: control.severity,
      is_blocking: control.is_blocking,
      finding_status: findingStatus,
      clause_evidence_quote: evalResult.clause_evidence_quote,
      clause_evidence_location: evalResult.clause_evidence_location,
      failure_reason: evalResult.failure_reason,
      remediation_suggested: evalResult.remediation_suggested,
      has_active_exception: hasActiveException
    });
  }

  // Score = round(((Compliant * 1.0 + Partially_Compliant * 0.5) / Evaluated_Controls) * 100)
  const evaluatedCount = compliantCount + partialCount + nonCompliantCount;
  const complianceScore = evaluatedCount > 0
    ? Math.min(100, Math.max(0, Math.round(((compliantCount * 1.0 + partialCount * 0.5) / evaluatedCount) * 100)))
    : 0;

  // Overall Evaluation Status
  let overallStatus = 'COMPLIANT';
  if (evaluatedCount === 0) {
    overallStatus = insufficientCount > 0 ? 'INSUFFICIENT_EVIDENCE' : 'NOT_ASSESSED';
  } else if (hasBlockingFailure || nonCompliantCount === evaluatedCount) {
    overallStatus = 'NON_COMPLIANT';
  } else if (nonCompliantCount > 0 || partialCount > 0) {
    overallStatus = 'PARTIALLY_COMPLIANT';
  } else {
    overallStatus = 'COMPLIANT';
  }

  const evaluationResult = {
    id: uuidv4(),
    tenant_id: tenantId,
    document_id: documentId,
    policy_id: policy.id,
    policy_name: policy.name,
    policy_version: policy.version,
    evaluation_status: overallStatus,
    compliance_score: complianceScore,
    evaluated_controls_count: evaluatedCount,
    compliant_controls_count: compliantCount,
    partially_compliant_controls_count: partialCount,
    non_compliant_controls_count: nonCompliantCount,
    not_assessed_controls_count: notAssessedCount,
    insufficient_evidence_controls_count: insufficientCount,
    evaluated_by: userId || null,
    evaluated_at: new Date().toISOString(),
    is_dry_run: isDryRun,
    findings
  };

  // If dry-run, do not persist to database
  if (isDryRun) {
    return evaluationResult;
  }

  const evalInsert = await db.query(
    `INSERT INTO contract_compliance_evaluations (
      id, tenant_id, document_id, policy_id, policy_version, evaluation_status,
      compliance_score, evaluated_controls_count, compliant_controls_count,
      partially_compliant_controls_count, non_compliant_controls_count,
      not_assessed_controls_count, insufficient_evidence_controls_count,
      evaluated_by, evaluated_at, metadata_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP, $15)
    RETURNING *`,
    [
      evaluationResult.id,
      tenantId,
      documentId,
      policy.id,
      policy.version,
      overallStatus,
      complianceScore,
      evaluatedCount,
      compliantCount,
      partialCount,
      nonCompliantCount,
      notAssessedCount,
      insufficientCount,
      userId || null,
      JSON.stringify({ triggered_by: userId || 'system', source: 'governance_engine' })
    ]
  );

  for (const f of findings) {
    await db.query(
      `INSERT INTO contract_compliance_findings (
        id, tenant_id, evaluation_id, document_id, control_id, finding_status,
        clause_evidence_quote, clause_evidence_location, failure_reason,
        remediation_suggested, is_blocking, has_active_exception
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        f.id,
        tenantId,
        evaluationResult.id,
        documentId,
        f.control_id,
        f.finding_status,
        f.clause_evidence_quote,
        f.clause_evidence_location,
        f.failure_reason,
        f.remediation_suggested,
        f.is_blocking,
        f.has_active_exception
      ]
    );
  }

  try {
    if (overallStatus === 'NON_COMPLIANT' || hasBlockingFailure) {
      const dedupKey = `GOVERNANCE_COMPLIANCE_${documentId}_${policy.id}_${policy.version}`;
      await db.query(
        `INSERT INTO contract_monitoring_events (
          id, document_id, user_id, event_type, severity, priority_score,
          title, description, evidence_reference, previous_value, current_value,
          risk_delta, affected_dimension, deduplication_key, status, detected_at
        ) VALUES (
          $1, $2, $3, 'GOVERNANCE_VIOLATION', 'HIGH', 80,
          $4, $5, $6, 'COMPLIANT', 'NON_COMPLIANT', 25, 'GOVERNANCE', $7, 'OPEN', CURRENT_TIMESTAMP
        )
        ON CONFLICT (document_id, deduplication_key) DO UPDATE SET
          detected_at = CURRENT_TIMESTAMP,
          priority_score = EXCLUDED.priority_score`,
        [
          uuidv4(),
          documentId,
          doc.user_id,
          `Policy Violation: ${policy.name}`,
          `Contract evaluated as NON_COMPLIANT (${complianceScore}% score) with ${nonCompliantCount} failing control(s).`,
          findings.find(f => f.finding_status === 'NON_COMPLIANT')?.clause_evidence_quote || 'Policy controls breached.',
          dedupKey
        ]
      );
    }
  } catch (bridgeErr) {
    logger.warn('Phase 11 Monitoring bridge error:', bridgeErr.message);
  }

  try {
    if (hasBlockingFailure) {
      const dedupKey = `ACTION_GOV_BLOCK_${documentId}_${policy.id}`;
      await db.query(
        `INSERT INTO contract_actions (
          id, document_id, owner_id, source_action_id, title, category, priority_score,
          status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, 'GOVERNANCE', 90, 'OPEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT DO NOTHING`,
        [
          uuidv4(),
          documentId,
          doc.user_id,
          dedupKey,
          `Remediate Policy Block: ${policy.name}`
        ]
      );
    }
  } catch (actionErr) {
    logger.warn('Action Center bridge error:', actionErr.message);
  }

  await recordAudit(userId, 'GOVERNANCE_POLICY_EVALUATED', {
    evaluationId: evaluationResult.id,
    documentId,
    policyId: policy.id,
    policyVersion: policy.version,
    score: complianceScore,
    status: overallStatus,
    blocking: hasBlockingFailure
  });

  await recordAiTelemetry({
    userId,
    documentId,
    operationType: 'POLICY_COMPLIANCE_EVALUATION',
    provider: 'local',
    model: 'deterministic_rule_engine',
    durationMs: 45,
    status: 'SUCCESS',
    groundedStatus: 'GROUNDED',
    metadata: {
      policyId: policy.id,
      score: complianceScore,
      evaluatedControls: evaluatedCount
    }
  });

  return evaluationResult;
}

/**
 * Gets latest compliance evaluation for a document.
 */
async function getDocumentCompliance(tenantId, documentId) {
  const res = await db.query(
    `SELECT e.*, p.name AS policy_name 
     FROM contract_compliance_evaluations e
     JOIN contract_governance_policies p ON p.id = e.policy_id
     WHERE e.document_id = $1 AND e.tenant_id = $2
     ORDER BY e.evaluated_at DESC LIMIT 1`,
    [documentId, tenantId]
  );
  if (res.rows.length === 0) {
    return null;
  }
  const evalRec = res.rows[0];

  const findingsRes = await db.query(
    `SELECT f.*, c.control_code, c.title, c.severity 
     FROM contract_compliance_findings f
     JOIN contract_governance_controls c ON c.id = f.control_id
     WHERE f.evaluation_id = $1
     ORDER BY c.control_code ASC`,
    [evalRec.id]
  );
  evalRec.findings = findingsRes.rows;

  return evalRec;
}

/**
 * Lists all findings for a document.
 */
async function getDocumentFindings(tenantId, documentId) {
  const res = await db.query(
    `SELECT f.*, c.control_code, c.title, c.severity, e.policy_version, e.evaluated_at
     FROM contract_compliance_findings f
     JOIN contract_governance_controls c ON c.id = f.control_id
     JOIN contract_compliance_evaluations e ON e.id = f.evaluation_id
     WHERE f.document_id = $1 AND f.tenant_id = $2
     ORDER BY e.evaluated_at DESC, c.control_code ASC`,
    [documentId, tenantId]
  );
  return res.rows;
}

/**
 * Requests an exception for a finding.
 */
async function requestException(tenantId, documentId, findingId, userId, reason) {
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    const err = new Error('Exception reason is required');
    err.status = 400;
    throw err;
  }

  const findRes = await db.query(
    'SELECT * FROM contract_compliance_findings WHERE id = $1 AND document_id = $2 AND tenant_id = $3',
    [findingId, documentId, tenantId]
  );
  if (findRes.rows.length === 0) {
    const err = new Error('Finding not found');
    err.status = 404;
    throw err;
  }
  const finding = findRes.rows[0];

  // Check if there is already a pending exception for this finding
  const existingRes = await db.query(
    `SELECT * FROM contract_governance_exceptions 
     WHERE finding_id = $1 AND status = 'PENDING'`,
    [findingId]
  );
  if (existingRes.rows.length > 0) {
    const err = new Error('An exception request is already pending for this finding');
    err.status = 400;
    throw err;
  }

  const id = uuidv4();
  const res = await db.query(
    `INSERT INTO contract_governance_exceptions (
      id, tenant_id, document_id, finding_id, control_id, reason, status, requested_by
    ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7) RETURNING *`,
    [id, tenantId, documentId, findingId, finding.control_id, reason.trim(), userId]
  );

  await recordAudit(userId, 'GOVERNANCE_EXCEPTION_REQUESTED', {
    exceptionId: id,
    findingId,
    documentId
  });

  return res.rows[0];
}

/**
 * Approves an exception with strict separation of duties and concurrency locking.
 */
async function approveException(tenantId, exceptionId, approverUser, notes = '', expiresAt = null) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // SELECT ... FOR UPDATE concurrency lock
    const checkRes = await client.query(
      'SELECT * FROM contract_governance_exceptions WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [exceptionId, tenantId]
    );
    if (checkRes.rows.length === 0) {
      const err = new Error('Governance exception not found');
      err.status = 404;
      throw err;
    }
    const exception = checkRes.rows[0];

    if (exception.status !== 'PENDING') {
      const err = new Error(`Cannot approve exception with status ${exception.status}`);
      err.status = 400;
      throw err;
    }

    // STRICT SEPARATION OF DUTIES: Requester CANNOT approve their own exception
    if (exception.requested_by === approverUser.id) {
      const err = new Error('Separation of duties violation: Exception requester cannot approve their own exception request');
      err.status = 403;
      throw err;
    }

    // Update exception status to APPROVED
    const updateRes = await client.query(
      `UPDATE contract_governance_exceptions SET
        status = 'APPROVED',
        approved_by = $1,
        approval_notes = $2,
        expires_at = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 RETURNING *`,
      [approverUser.id, notes || null, expiresAt || null, exceptionId]
    );
    const updated = updateRes.rows[0];

    // Mark finding as having active exception
    await client.query(
      'UPDATE contract_compliance_findings SET has_active_exception = TRUE WHERE id = $1',
      [exception.finding_id]
    );

    await client.query('COMMIT');

    await recordAudit(approverUser.id, 'GOVERNANCE_EXCEPTION_APPROVED', {
      exceptionId,
      documentId: exception.document_id,
      findingId: exception.finding_id,
      approverId: approverUser.id
    });

    return updated;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Rejects an exception with concurrency locking.
 */
async function rejectException(tenantId, exceptionId, rejectorUser, notes = '') {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query(
      'SELECT * FROM contract_governance_exceptions WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [exceptionId, tenantId]
    );
    if (checkRes.rows.length === 0) {
      const err = new Error('Governance exception not found');
      err.status = 404;
      throw err;
    }
    const exception = checkRes.rows[0];

    if (exception.status !== 'PENDING') {
      const err = new Error(`Cannot reject exception with status ${exception.status}`);
      err.status = 400;
      throw err;
    }

    const updateRes = await client.query(
      `UPDATE contract_governance_exceptions SET
        status = 'REJECTED',
        rejected_by = $1,
        approval_notes = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 RETURNING *`,
      [rejectorUser.id, notes || null, exceptionId]
    );
    const updated = updateRes.rows[0];

    await client.query('COMMIT');

    await recordAudit(rejectorUser.id, 'GOVERNANCE_EXCEPTION_REJECTED', {
      exceptionId,
      rejectorId: rejectorUser.id
    });

    return updated;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Revokes an approved exception.
 */
async function revokeException(tenantId, exceptionId, revokerUser) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query(
      'SELECT * FROM contract_governance_exceptions WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [exceptionId, tenantId]
    );
    if (checkRes.rows.length === 0) {
      const err = new Error('Governance exception not found');
      err.status = 404;
      throw err;
    }
    const exception = checkRes.rows[0];

    const updateRes = await client.query(
      `UPDATE contract_governance_exceptions SET
        status = 'REVOKED',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING *`,
      [exceptionId]
    );
    const updated = updateRes.rows[0];

    // Reset finding active exception flag
    await client.query(
      'UPDATE contract_compliance_findings SET has_active_exception = FALSE WHERE id = $1',
      [exception.finding_id]
    );

    await client.query('COMMIT');

    await recordAudit(revokerUser.id, 'GOVERNANCE_EXCEPTION_REVOKED', {
      exceptionId,
      revokerId: revokerUser.id
    });

    return updated;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Scans and invalidates expired exceptions.
 */
async function recheckExpiredExceptions() {
  const { rows: expired } = await db.query(
    `UPDATE contract_governance_exceptions SET
      status = 'EXPIRED',
      updated_at = CURRENT_TIMESTAMP
     WHERE status = 'APPROVED' AND expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP
     RETURNING id, finding_id`
  );

  for (const item of expired) {
    await db.query(
      'UPDATE contract_compliance_findings SET has_active_exception = FALSE WHERE id = $1',
      [item.finding_id]
    );
  }

  return expired.length;
}

/**
 * Lists exceptions for a tenant or document.
 */
async function listExceptions(tenantId, filters = {}) {
  let sql = `
    SELECT e.*, c.control_code, c.title AS control_title, d.original_name AS document_name,
           u_req.name AS requester_name, u_app.name AS approver_name
    FROM contract_governance_exceptions e
    JOIN contract_governance_controls c ON c.id = e.control_id
    JOIN documents d ON d.id = e.document_id
    LEFT JOIN users u_req ON u_req.id = e.requested_by
    LEFT JOIN users u_app ON u_app.id = e.approved_by
    WHERE e.tenant_id = $1
  `;
  const params = [tenantId];

  if (filters.document_id) {
    params.push(filters.document_id);
    sql += ` AND e.document_id = $${params.length}`;
  }
  if (filters.status) {
    params.push(filters.status.toUpperCase());
    sql += ` AND e.status = $${params.length}`;
  }

  sql += ' ORDER BY e.created_at DESC';
  const res = await db.query(sql, params);
  return res.rows;
}

/**
 * Gets organization-wide governance compliance overview.
 */
async function getGovernanceOverview(tenantId) {
  const policiesRes = await db.query(
    'SELECT COUNT(*) AS count FROM contract_governance_policies WHERE tenant_id = $1 AND is_active = TRUE',
    [tenantId]
  );
  const activePoliciesCount = parseInt(policiesRes.rows[0].count, 10);

  const controlsRes = await db.query(
    'SELECT COUNT(*) AS count FROM contract_governance_controls WHERE tenant_id = $1',
    [tenantId]
  );
  const totalControlsCount = parseInt(controlsRes.rows[0].count, 10);

  const evaluationsRes = await db.query(
    `SELECT evaluation_status, COUNT(*) AS count, AVG(compliance_score) AS avg_score
     FROM contract_compliance_evaluations
     WHERE tenant_id = $1
     GROUP BY evaluation_status`,
    [tenantId]
  );

  const statusBreakdown = {
    COMPLIANT: 0,
    PARTIALLY_COMPLIANT: 0,
    NON_COMPLIANT: 0,
    INSUFFICIENT_EVIDENCE: 0,
    NOT_ASSESSED: 0
  };

  let totalEvaluations = 0;
  let scoreSum = 0;

  for (const row of evaluationsRes.rows) {
    const c = parseInt(row.count, 10);
    statusBreakdown[row.evaluation_status] = c;
    totalEvaluations += c;
    scoreSum += (parseFloat(row.avg_score) || 0) * c;
  }

  const overallAvgScore = totalEvaluations > 0 ? Math.round(scoreSum / totalEvaluations) : 0;

  const exceptionsRes = await db.query(
    `SELECT status, COUNT(*) AS count FROM contract_governance_exceptions WHERE tenant_id = $1 GROUP BY status`,
    [tenantId]
  );
  const exceptionBreakdown = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
    EXPIRED: 0,
    REVOKED: 0
  };
  for (const row of exceptionsRes.rows) {
    exceptionBreakdown[row.status] = parseInt(row.count, 10);
  }

  return {
    active_policies_count: activePoliciesCount,
    total_controls_count: totalControlsCount,
    total_evaluations_count: totalEvaluations,
    average_compliance_score: overallAvgScore,
    evaluations_by_status: statusBreakdown,
    exceptions_by_status: exceptionBreakdown
  };
}

module.exports = {
  validateRuleDefinition,
  extractContractFacts,
  evaluateControlRule,
  ensureDefaultPolicy,
  createPolicy,
  getPolicy,
  listPolicies,
  updatePolicy,
  addControl,
  updateControl,
  evaluateDocumentCompliance,
  getDocumentCompliance,
  getDocumentFindings,
  requestException,
  approveException,
  rejectException,
  revokeException,
  recheckExpiredExceptions,
  listExceptions,
  getGovernanceOverview
};
