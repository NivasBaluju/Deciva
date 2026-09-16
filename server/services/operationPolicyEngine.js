'use strict';

/**
 * Governance Policy Engine
 *
 * Deterministic, zero-AI/zero-ML evaluation of bulk portfolio operations.
 * Decides whether an operation is approval-exempt or mandates independent four-eyes review.
 *
 * Governance Policy Version: 1.0
 */

const POLICY_VERSION = '1.0';

const GOVERNANCE_POLICY_FLAGS = {
  CRITICAL_PRIORITY_INCLUDED: 'CRITICAL_PRIORITY_INCLUDED',
  HIGH_IMPACT_TRANSITION:     'HIGH_IMPACT_TRANSITION',
  LARGE_BATCH_THRESHOLD:      'LARGE_BATCH_THRESHOLD',
  CROSS_CONTRACT_MASS_TRIAGE: 'CROSS_CONTRACT_MASS_TRIAGE',
};

// Thresholds defined for Policy Version 1.0
const POLICY_THRESHOLDS_V1 = {
  CRITICAL_PRIORITY_MIN: 80,
  LARGE_BATCH_MIN_ACTIONS: 11, // > 10 actions
  MASS_TRIAGE_MIN_DOCS: 4,     // > 3 distinct documents
  HIGH_IMPACT_STATUSES: ['RESOLVED', 'DISMISSED'],
};

/**
 * Evaluates whether a bulk operation requires independent peer approval under Policy v1.0.
 *
 * @param {Object} params
 * @param {string} params.operation - BULK_ASSIGN, BULK_DEADLINE, BULK_TRANSITION
 * @param {string} params.mode - STRICT or SUBSET
 * @param {Array<Object>} params.eligibleActions - Array of verified eligible action rows
 * @param {Object} params.payload - Operation payload
 * @returns {Object} Evaluation result including policyVersion, requiresApproval, policyFlags, ruleDetails
 */
function evaluateBatchPolicy({ operation, mode, eligibleActions = [], payload = {} }) {
  const policyFlags = [];

  let maxPriorityScore = 0;
  let hasCriticalPriority = false;
  const documentIds = new Set();

  for (const action of eligibleActions) {
    const score = Number(action.priority_score ?? action.priorityScore ?? 0);
    if (score > maxPriorityScore) {
      maxPriorityScore = score;
    }
    if (score >= POLICY_THRESHOLDS_V1.CRITICAL_PRIORITY_MIN) {
      hasCriticalPriority = true;
    }
    const docId = action.document_id || action.documentId;
    if (docId) {
      documentIds.add(docId);
    }
  }

  if (hasCriticalPriority) {
    policyFlags.push(GOVERNANCE_POLICY_FLAGS.CRITICAL_PRIORITY_INCLUDED);
  }

  const targetStatus = (payload.targetStatus || '').toUpperCase();
  const isHighImpactTransition =
    operation === 'BULK_TRANSITION' &&
    POLICY_THRESHOLDS_V1.HIGH_IMPACT_STATUSES.includes(targetStatus);
  if (isHighImpactTransition) {
    policyFlags.push(GOVERNANCE_POLICY_FLAGS.HIGH_IMPACT_TRANSITION);
  }

  const eligibleCount = eligibleActions.length;
  const isLargeBatch = eligibleCount >= POLICY_THRESHOLDS_V1.LARGE_BATCH_MIN_ACTIONS;
  if (isLargeBatch) {
    policyFlags.push(GOVERNANCE_POLICY_FLAGS.LARGE_BATCH_THRESHOLD);
  }

  const distinctDocumentCount = documentIds.size;
  const isCrossContractMassTriage = distinctDocumentCount >= POLICY_THRESHOLDS_V1.MASS_TRIAGE_MIN_DOCS;
  if (isCrossContractMassTriage) {
    policyFlags.push(GOVERNANCE_POLICY_FLAGS.CROSS_CONTRACT_MASS_TRIAGE);
  }

  const requiresApproval = policyFlags.length > 0;

  return {
    policyVersion: POLICY_VERSION,
    requiresApproval,
    policyFlags,
    ruleDetails: {
      hasCriticalPriority,
      maxPriorityScore,
      isHighImpactTransition,
      targetStatus: targetStatus || null,
      isLargeBatch,
      eligibleCount,
      isCrossContractMassTriage,
      distinctDocumentCount,
    },
  };
}

module.exports = {
  POLICY_VERSION,
  GOVERNANCE_POLICY_FLAGS,
  POLICY_THRESHOLDS_V1,
  evaluateBatchPolicy,
};
