const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { calculateOperationalHealthScore, FORMULA_VERSION, safePercentage } = require('./workflowAnalyticsService');
const portfolioService = require('./portfolioAnalyticsService');
const { generateEvidenceHash } = require('./evidenceIntegrityService');

const EVIDENCE_SCHEMA_VERSION = '1.0';

const PRIORITY_BANDS = {
  CRITICAL_MIN: 80,
  HIGH_MIN: 70,
  MEDIUM_MIN: 40
};

function getPriorityBand(score) {
  const s = Number(score) || 0;
  if (s >= PRIORITY_BANDS.CRITICAL_MIN) return 'CRITICAL';
  if (s >= PRIORITY_BANDS.HIGH_MIN) return 'HIGH';
  if (s >= PRIORITY_BANDS.MEDIUM_MIN) return 'MEDIUM';
  return 'LOW';
}

/**
 * Standardizes a portfolio_operation_batches row into canonical evidence format.
 */
function formatGovernedBatch(b) {
  return {
    batchId: b.id,
    operationType: b.operation_type,
    mode: b.mode,
    status: b.status,
    requestedCount: Number(b.requested_count) || 0,
    eligibleCount: Number(b.eligible_count) || 0,
    executedCount: Number(b.executed_count) || 0,
    blockedCount: Number(b.blocked_count) || 0,
    previewHash: b.preview_hash || null,
    requestHash: b.request_hash || null,
    policyVersion: b.policy_version || '1.0',
    policyFlags: Array.isArray(b.policy_flags) ? b.policy_flags : (typeof b.policy_flags === 'string' ? JSON.parse(b.policy_flags) : []),
    policyDetails: (b.policy_details && typeof b.policy_details === 'object') ? b.policy_details : (typeof b.policy_details === 'string' ? JSON.parse(b.policy_details) : {}),
    requesterId: b.requester_id,
    approvedBy: b.approved_by || null,
    approvedAt: b.approved_at ? new Date(b.approved_at).toISOString() : null,
    approvalComments: b.approval_comments || null,
    rejectedBy: b.rejected_by || null,
    rejectedAt: b.rejected_at ? new Date(b.rejected_at).toISOString() : null,
    rejectionReason: b.rejection_reason || null,
    createdAt: b.created_at ? new Date(b.created_at).toISOString() : null,
    completedAt: b.completed_at ? new Date(b.completed_at).toISOString() : null
  };
}

/**
 * Collects and canonicalizes complete compliance evidence for a single document.
 * Read-only: executes zero database mutations.
 */
async function getContractEvidence(documentId, user) {
  if (!documentId) {
    const err = new Error('Document ID is required');
    err.status = 400;
    throw err;
  }

  const { rows: docRows } = await db.query(
    `SELECT id, filename, original_name, mime_type, size, created_at, user_id
     FROM documents
     WHERE id = $1`,
    [documentId]
  );

  if (docRows.length === 0) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }

  const doc = docRows[0];
  if (doc.user_id !== user.id && user.role !== 'admin') {
    const err = new Error('Unauthorized access to contract evidence');
    err.status = 403;
    throw err;
  }

  const { rows: intelRows } = await db.query(
    `SELECT id, document_id, user_id, health_score, critical_count, important_count,
            monitoring_count, healthy_count, executive_summary, conflicts_json,
            actions_json, metrics_json, created_at
     FROM contract_intelligence
     WHERE document_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [documentId]
  );
  const intelligence = intelRows.length > 0 ? intelRows[0] : null;

  const { rows: actionRows } = await db.query(
    `SELECT id, document_id, title, category, priority_score, status,
            decision, owner_id, due_date, is_escalated, escalation_rule,
            escalation_reason, escalated_at, resolved_at, created_at
     FROM contract_actions
     WHERE document_id = $1
     ORDER BY priority_score DESC, created_at ASC, id ASC`,
    [documentId]
  );

  const { rows: decisionRows } = await db.query(
    `SELECT d.id, d.action_id, d.previous_status, d.new_status, d.decision, d.reason, d.decided_by, d.created_at AS decided_at
     FROM contract_action_decisions d
     JOIN contract_actions a ON d.action_id = a.id
     WHERE a.document_id = $1
     ORDER BY d.created_at ASC, d.id ASC`,
    [documentId]
  );

  const { rows: activityRows } = await db.query(
    `SELECT act.id, act.action_id, act.event_type AS activity_type, act.actor_id, act.metadata, act.created_at
     FROM contract_action_activity act
     JOIN contract_actions a ON act.action_id = a.id
     WHERE a.document_id = $1
     ORDER BY act.created_at ASC, act.id ASC`,
    [documentId]
  );

  const { rows: commentRows } = await db.query(
    `SELECT c.id, c.action_id, c.parent_comment_id, c.author_id, c.body AS content, c.created_at
     FROM contract_action_comments c
     JOIN contract_actions a ON c.action_id = a.id
     WHERE a.document_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.created_at ASC, c.id ASC`,
    [documentId]
  );

  // 6.5 Fetch governed operation batches affecting actions in this contract (deterministic sort: created_at ASC, id ASC)
  const { rows: batchRows } = await db.query(
    `SELECT DISTINCT b.id, b.user_id AS requester_id, b.operation_type, b.mode, b.status,
            b.requested_count, b.eligible_count, b.executed_count, b.blocked_count,
            b.preview_hash, b.request_hash, b.policy_version, b.policy_flags, b.policy_details,
            b.approved_by, b.approved_at, b.approval_comments,
            b.rejected_by, b.rejected_at, b.rejection_reason,
            b.created_at, b.completed_at
     FROM portfolio_operation_batches b
     WHERE EXISTS (
       SELECT 1 FROM contract_action_activity act
       JOIN contract_actions a ON act.action_id = a.id
       WHERE a.document_id = $1 AND (act.metadata->>'batchId')::text = b.id::text
     )
     ORDER BY b.created_at ASC, b.id ASC`,
    [documentId]
  );

  // Nest comments into parent-reply hierarchy deterministically
  const commentMap = new Map();
  const topLevelComments = [];
  for (const c of commentRows) {
    const commentObj = {
      commentId: c.id,
      actionId: c.action_id,
      parentCommentId: c.parent_comment_id || null,
      authorId: c.author_id,
      content: c.content,
      mentions: c.mentions || [],
      createdAt: c.created_at ? new Date(c.created_at).toISOString() : null,
      replies: []
    };
    commentMap.set(c.id, commentObj);
  }

  for (const c of commentRows) {
    const commentObj = commentMap.get(c.id);
    if (c.parent_comment_id && commentMap.has(c.parent_comment_id)) {
      commentMap.get(c.parent_comment_id).replies.push(commentObj);
    } else {
      topLevelComments.push(commentObj);
    }
  }

  const now = new Date();
  const totalActions = actionRows.length;
  const resolvedActions = actionRows.filter(a => a.status === 'RESOLVED').length;
  const actionsWithDeadlines = actionRows.filter(a => a.due_date !== null).length;
  const overdueActions = actionRows.filter(
    a => a.due_date && new Date(a.due_date) < now && a.status !== 'RESOLVED' && a.status !== 'DISMISSED'
  ).length;
  const activeCritical = actionRows.filter(
    a => (Number(a.priority_score) || 0) >= PRIORITY_BANDS.CRITICAL_MIN && a.status !== 'RESOLVED' && a.status !== 'DISMISSED'
  ).length;
  const activeHigh = actionRows.filter(
    a => {
      const p = Number(a.priority_score) || 0;
      return p >= PRIORITY_BANDS.HIGH_MIN && p < PRIORITY_BANDS.CRITICAL_MIN && a.status !== 'RESOLVED' && a.status !== 'DISMISSED';
    }
  ).length;
  const onTimeResolved = actionRows.filter(
    a => a.status === 'RESOLVED' && a.due_date && a.resolved_at && new Date(a.resolved_at) <= new Date(a.due_date)
  ).length;
  const resolvedWithDeadlines = actionRows.filter(a => a.status === 'RESOLVED' && a.due_date).length;
  const onTimeRate = resolvedWithDeadlines > 0 ? Math.round((onTimeResolved / resolvedWithDeadlines) * 100) : 100;
  const reopenRate = 0; // Standardized baseline

  const liveHealth = calculateOperationalHealthScore({
    totalActions,
    resolvedActions,
    actionsWithDeadlines,
    onTimeRate,
    activeCritical,
    activeHigh,
    overdueActions,
    reopenRate
  });

  const evidenceContent = {
    subject: {
      documentId: doc.id,
      filename: doc.original_name || doc.filename,
      mimeType: doc.mime_type || 'application/octet-stream',
      sizeBytes: Number(doc.size) || 0,
      createdAt: doc.created_at ? new Date(doc.created_at).toISOString() : null,
      ownerId: doc.user_id
    },
    historicalIntelligenceSnapshot: intelligence ? {
      snapshotId: intelligence.id,
      healthScore: Number(intelligence.health_score) || 0,
      criticalCount: Number(intelligence.critical_count) || 0,
      importantCount: Number(intelligence.important_count) || 0,
      monitoringCount: Number(intelligence.monitoring_count) || 0,
      healthyCount: Number(intelligence.healthy_count) || 0,
      executiveSummary: intelligence.executive_summary || '',
      conflicts: Array.isArray(intelligence.conflicts_json) ? intelligence.conflicts_json : [],
      actions: Array.isArray(intelligence.actions_json) ? intelligence.actions_json : [],
      metrics: (intelligence.metrics_json && typeof intelligence.metrics_json === 'object') ? intelligence.metrics_json : {},
      createdAt: intelligence.created_at ? new Date(intelligence.created_at).toISOString() : null
    } : null,
    workflowActions: actionRows.map(a => ({
      id: a.id,
      title: a.title,
      category: a.category,
      priorityScore: Number(a.priority_score) || 0,
      priorityBand: getPriorityBand(a.priority_score),
      status: a.status,
      decision: a.decision || null,
      ownerId: a.owner_id || null,
      dueDate: a.due_date ? new Date(a.due_date).toISOString() : null,
      isEscalated: Boolean(a.is_escalated),
      escalationRule: a.escalation_rule || null,
      escalationReason: a.escalation_reason || null,
      escalatedAt: a.escalated_at ? new Date(a.escalated_at).toISOString() : null,
      resolvedAt: a.resolved_at ? new Date(a.resolved_at).toISOString() : null,
      createdAt: a.created_at ? new Date(a.created_at).toISOString() : null
    })),
    decisionLedger: decisionRows.map(d => ({
      decisionId: d.id,
      actionId: d.action_id,
      decision: d.decision,
      reason: d.reason || '',
      metadata: (d.metadata && typeof d.metadata === 'object') ? d.metadata : {},
      decidedBy: d.decided_by || null,
      decidedAt: d.decided_at ? new Date(d.decided_at).toISOString() : null
    })),
    activityAuditTrail: activityRows.map(act => ({
      activityId: act.id,
      actionId: act.action_id,
      activityType: act.activity_type,
      actorId: act.actor_id || null,
      metadata: (act.metadata && typeof act.metadata === 'object') ? act.metadata : {},
      createdAt: act.created_at ? new Date(act.created_at).toISOString() : null
    })),
    collaborationHistory: topLevelComments,
    governedOperationsHistory: batchRows.map(formatGovernedBatch),
    operationalHealthAtExport: {
      healthScore: liveHealth.healthScore,
      healthGrade: liveHealth.healthGrade,
      formulaVersion: FORMULA_VERSION,
      componentBreakdown: liveHealth.breakdown,
      resolutionMetrics: {
        totalActions,
        resolvedActions,
        resolutionRate: safePercentage(resolvedActions, totalActions)
      },
      deadlineMetrics: {
        actionsWithDeadlines,
        overdueActions,
        onTimeRate
      },
      priorityMetrics: {
        activeCritical,
        activeHigh
      }
    }
  };

  const canonicalHash = generateEvidenceHash(evidenceContent);

  const manifest = {
    evidenceId: uuidv4(),
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    exportType: 'CONTRACT_GOVERNANCE_AUDIT',
    generatedAt: new Date().toISOString(),
    subject: {
      documentId: doc.id,
      documentName: doc.original_name || doc.filename,
      documentCreatedAt: doc.created_at ? new Date(doc.created_at).toISOString() : null
    },
    integrity: {
      algorithm: 'SHA-256',
      canonicalHash
    }
  };

  return {
    manifest,
    evidence: evidenceContent
  };
}

/**
 * Collects and canonicalizes complete portfolio governance evidence for authenticated user.
 * Reuses Phase 7.8 portfolio analytics service directly to eliminate calculation drift.
 */
async function getPortfolioEvidence(user) {
  // Reusable portfolio analytics calls (all read-only, user-isolated)
  const [summary, attentionQueue, contractsHealth, priorityDist, workload, deadlines, escalations] = await Promise.all([
    portfolioService.getPortfolioSummary(user),
    portfolioService.getPortfolioAttentionQueue(user, { limit: 100 }),
    portfolioService.getPortfolioContractHealth(user, { limit: 100 }),
    portfolioService.getPortfolioPriorityDistribution(user),
    portfolioService.getPortfolioWorkload(user),
    portfolioService.getPortfolioDeadlineAnalytics(user),
    portfolioService.getPortfolioEscalationAnalytics(user)
  ]);

  // Fetch governed operation batches created by or approved by this user
  const { rows: portfolioBatchRows } = await db.query(
    `SELECT b.id, b.user_id AS requester_id, b.operation_type, b.mode, b.status,
            b.requested_count, b.eligible_count, b.executed_count, b.blocked_count,
            b.preview_hash, b.request_hash, b.policy_version, b.policy_flags, b.policy_details,
            b.approved_by, b.approved_at, b.approval_comments,
            b.rejected_by, b.rejected_at, b.rejection_reason,
            b.created_at, b.completed_at
     FROM portfolio_operation_batches b
     WHERE ${user.role === 'admin' ? '1=1' : '(b.user_id = $1 OR b.approved_by = $1)'}
     ORDER BY b.created_at ASC, b.id ASC`,
    user.role === 'admin' ? [] : [user.id]
  );

  const portfolioEvidenceContent = {
    portfolioOwnerId: user.id,
    portfolioSummary: {
      totalContracts: summary.totalContracts ?? 0,
      totalActions: summary.totalActions ?? 0,
      activeActions: summary.activeActions ?? 0,
      resolvedActions: summary.resolvedActions ?? 0,
      criticalActions: summary.criticalActions ?? 0,
      overdueActions: summary.overdueActions ?? 0,
      escalatedActions: summary.escalatedActions ?? 0,
      resolutionRate: summary.resolutionRate ?? 0
    },
    portfolioHealth: {
      portfolioHealthScore: summary.portfolioHealthScore ?? (summary.operationalHealth?.score ?? 100),
      grade: summary.portfolioHealthGrade ?? (summary.operationalHealth?.grade ?? 'EXCELLENT'),
      weightedBase: summary.operationalHealth?.weightedBase ?? 100,
      escalationPenalty: summary.operationalHealth?.penalties?.escalationPenalty ?? 0,
      criticalOverduePenalty: summary.operationalHealth?.penalties?.criticalOverduePenalty ?? 0,
      formulaVersion: summary.operationalHealth?.formulaVersion ?? FORMULA_VERSION
    },
    attentionQueue: (attentionQueue.queue || []).map(item => ({
      documentId: item.documentId,
      documentName: item.documentName,
      actionId: item.actionId,
      actionTitle: item.actionTitle,
      priorityScore: item.priorityScore,
      priorityBand: item.priorityBand,
      attentionScore: item.attentionScore,
      attentionReasons: item.attentionReasons || [],
      daysOverdue: item.daysOverdue || 0,
      status: item.status,
      isEscalated: Boolean(item.isEscalated),
      ownerId: item.ownerId || null
    })),
    contractsHealth: (contractsHealth.contracts || []).map(c => ({
      documentId: c.documentId,
      documentName: c.documentName,
      healthScore: c.healthScore,
      healthGrade: c.healthGrade,
      totalActions: c.totalActions,
      activeActions: c.activeActions,
      criticalActions: c.criticalActions,
      overdueActions: c.overdueActions,
      resolutionRate: c.resolutionRate
    })),
    priorityDistribution: {
      critical: priorityDist.bands?.critical ?? 0,
      high: priorityDist.bands?.high ?? 0,
      medium: priorityDist.bands?.medium ?? 0,
      low: priorityDist.bands?.low ?? 0,
      averagePriorityScore: priorityDist.averagePriorityScore ?? 0,
      highestPriorityScore: priorityDist.highestActivePriority ?? 0
    },
    deadlineAnalytics: {
      overdueActions: deadlines.overdueActions ?? 0,
      dueToday: deadlines.dueToday ?? 0,
      dueSoon: deadlines.dueSoon ?? 0,
      upcoming: deadlines.upcoming ?? 0,
      averageDaysOverdue: deadlines.averageDaysOverdue ?? 0
    },
    escalationAnalytics: {
      totalEscalatedActions: escalations.totalEscalatedActions ?? 0,
      overdueEscalations: escalations.overdueEscalations ?? 0,
      ignoredCriticalEscalations: escalations.ignoredCriticalEscalations ?? 0,
      unassignedHighRiskEscalations: escalations.unassignedHighRiskEscalations ?? 0,
      escalationRate: escalations.escalationRate ?? 0
    },
    workloadDistribution: {
      teamMembers: (workload.owners || []).map(m => ({
        ownerId: m.ownerId,
        ownerEmail: m.ownerEmail || null,
        activeActions: m.activeActions,
        criticalActions: m.criticalActions,
        overdueActions: m.overdueActions,
        resolvedActions: m.resolvedActions
      })),
      unassignedBacklog: workload.unassigned || {}
    },
    governedBatches: portfolioBatchRows.map(formatGovernedBatch)
  };

  const canonicalHash = generateEvidenceHash(portfolioEvidenceContent);

  const manifest = {
    evidenceId: uuidv4(),
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    exportType: 'PORTFOLIO_GOVERNANCE_AUDIT',
    generatedAt: new Date().toISOString(),
    subject: {
      portfolioOwnerId: user.id,
      totalContracts: summary.totalContracts ?? 0
    },
    integrity: {
      algorithm: 'SHA-256',
      canonicalHash
    }
  };

  return {
    manifest,
    evidence: portfolioEvidenceContent
  };
}

module.exports = {
  EVIDENCE_SCHEMA_VERSION,
  PRIORITY_BANDS,
  getPriorityBand,
  getContractEvidence,
  getPortfolioEvidence
};
