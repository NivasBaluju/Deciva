/**
 * Deciva — Phase 12 Approval Policy Engine
 * ---------------------------------------------------------------------------
 * Deterministically evaluates whether a contract decision requires approval,
 * independent review, and distinct reviewer/approver roles based on grounded
 * risk signals, liability exposure, priority, and decision type.
 *
 * Configurable thresholds ensure policy adaptability across organizations
 * without rigid hard-coding or role fabrication.
 */

const DEFAULT_POLICY = {
  HIGH_RISK_THRESHOLD: Number(process.env.POLICY_HIGH_RISK_THRESHOLD) || 50,
  LIABILITY_THRESHOLD: Number(process.env.POLICY_LIABILITY_THRESHOLD) || 1000000,
  CRITICAL_PRIORITY_TRIGGERS_INDEPENDENT: true,
  HIGH_RISK_DECISION_TYPES: [
    'LIABILITY_CAP_REVISION',
    'MATERIAL_CONTRACT_CHANGE',
    'INDEMNITY_REVISION',
    'GOVERNING_LAW_REVISION'
  ]
};

/**
 * Evaluates approval requirements for a contract decision.
 *
 * @param {Object} context
 * @param {number} [context.riskScore] - Overall risk or exposure score (0-100)
 * @param {number} [context.liabilityExposure] - Numeric liability amount in USD
 * @param {string} [context.priority] - 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
 * @param {string} [context.decisionType] - e.g. 'LIABILITY_CAP_REVISION', 'RENEWAL_NOTICE_DECISION'
 * @param {Object} [customPolicy] - Optional tenant/override policy settings
 * @returns {Object} Policy evaluation outcome
 */
function evaluateApprovalPolicy(context = {}, customPolicy = {}) {
  const policy = {
    ...DEFAULT_POLICY,
    ...customPolicy
  };

  const riskScore = Number(context.riskScore) || 0;
  const liabilityExposure = Number(context.liabilityExposure) || 0;
  const priority = String(context.priority || 'MEDIUM').toUpperCase();
  const decisionType = String(context.decisionType || 'STANDARD_DECISION').toUpperCase();

  const rulesTriggered = [];
  let requiresApproval = false;
  let requiresIndependentApproval = false;

  if (riskScore >= policy.HIGH_RISK_THRESHOLD) {
    requiresApproval = true;
    rulesTriggered.push(`Risk score (${riskScore}) meets or exceeds organizational high-risk threshold (${policy.HIGH_RISK_THRESHOLD}).`);
    if (riskScore >= policy.HIGH_RISK_THRESHOLD + 20) {
      requiresIndependentApproval = true;
      rulesTriggered.push(`Severe risk level (${riskScore}) mandates independent approval separation.`);
    }
  }

  if (liabilityExposure >= policy.LIABILITY_THRESHOLD) {
    requiresApproval = true;
    requiresIndependentApproval = true;
    rulesTriggered.push(`Aggregate liability exposure ($${liabilityExposure.toLocaleString('en-US')}) meets or exceeds liability threshold ($${policy.LIABILITY_THRESHOLD.toLocaleString('en-US')}). Independent approval required.`);
  }

  if (priority === 'CRITICAL') {
    requiresApproval = true;
    if (policy.CRITICAL_PRIORITY_TRIGGERS_INDEPENDENT) {
      requiresIndependentApproval = true;
      rulesTriggered.push('Critical attention priority mandates independent approver authorization.');
    }
  } else if (priority === 'HIGH') {
    requiresApproval = true;
    rulesTriggered.push('High attention priority requires formal reviewer verification.');
  }

  if (policy.HIGH_RISK_DECISION_TYPES.includes(decisionType)) {
    requiresApproval = true;
    rulesTriggered.push(`Decision type '${decisionType}' is classified as material contractual modification requiring review.`);
    if (decisionType === 'LIABILITY_CAP_REVISION' || decisionType === 'MATERIAL_CONTRACT_CHANGE') {
      requiresIndependentApproval = true;
      rulesTriggered.push(`Material alteration under '${decisionType}' requires creator ≠ approver separation of duties.`);
    }
  }

  // If no triggers fired, standard review applies
  if (!requiresApproval) {
    rulesTriggered.push('Standard operational decision under established risk thresholds. Standard review applies.');
  }

  const minimumReviewers = requiresIndependentApproval ? 2 : (requiresApproval ? 1 : 0);
  const requiredRoles = requiresIndependentApproval
    ? ['REVIEWER', 'APPROVER']
    : (requiresApproval ? ['REVIEWER'] : []);

  let rationale = rulesTriggered.join(' ');

  return {
    policyVersion: '2026.1-enterprise',
    requiresApproval,
    requiresIndependentApproval,
    minimumReviewers,
    requiredRoles,
    rulesTriggered,
    rationale,
    thresholdsApplied: {
      highRiskThreshold: policy.HIGH_RISK_THRESHOLD,
      liabilityThreshold: policy.LIABILITY_THRESHOLD,
      criticalPriorityIndependent: policy.CRITICAL_PRIORITY_TRIGGERS_INDEPENDENT
    }
  };
}

module.exports = {
  DEFAULT_POLICY,
  evaluateApprovalPolicy
};
