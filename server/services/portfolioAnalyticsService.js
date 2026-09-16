/**
 * Portfolio Analytics Service
 * 
 * Provides deterministic, strictly read-only cross-contract aggregation queries
 * and executive oversight intelligence scoped to the authenticated user's documents.
 * 
 * Strict Guarantees:
 * 1. Zero database mutations on read operations.
 * 2. Strict user isolation: documents.user_id = user.id.
 * 3. Reuses Phase 7.7 operational health scoring formula as single source of truth.
 * 4. Deterministic, mathematically bounded attention score [0, 100].
 */

const db = require('../db');
const {
  FORMULA_VERSION,
  safePercentage,
  calculateOperationalHealthScore
} = require('./workflowAnalyticsService');

/**
 * Standardized Priority Bands (strictly aligned across Phases 6.4, 7.6, 7.7, 7.8)
 */
const PRIORITY_BANDS = {
  CRITICAL_MIN: 80, // 80 - 100
  HIGH_MIN: 70,     // 70 - 79
  MEDIUM_MIN: 40    // 40 - 69 (Low is 0 - 39)
};

/**
 * Calculates deterministic attention score for an action item.
 * 
 * Formula:
 * - Base Priority: action.priority_score (0–100)
 * - Escalation Bonus: +25 if is_escalated = TRUE
 * - Overdue Bonus: +20 if due_date < NOW
 * - Unassigned High-Risk Bonus: +15 if priority_score >= 70 AND owner_id IS NULL
 * - Overdue Duration Penalty: + min(daysOverdue * 2, 20)
 * - attentionScore = max(0, min(100, round(rawScore)))
 */
function calculateAttentionScore(action, now = new Date()) {
  const basePriority = Number(action.priority_score) || 0;
  const isEscalated = Boolean(action.is_escalated);
  const isOverdue = action.due_date && new Date(action.due_date) < now;
  const isUnassignedHighRisk = basePriority >= PRIORITY_BANDS.HIGH_MIN && !action.owner_id;

  let daysOverdue = 0;
  if (isOverdue) {
    const diffMs = now.getTime() - new Date(action.due_date).getTime();
    daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  const escalationBonus = isEscalated ? 25 : 0;
  const overdueBonus = isOverdue ? 20 : 0;
  const unassignedBonus = isUnassignedHighRisk ? 15 : 0;
  const overdueDurationPenalty = Math.min(daysOverdue * 2, 20);

  const rawScore = basePriority + escalationBonus + overdueBonus + unassignedBonus + overdueDurationPenalty;
  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  const attentionReasons = [];
  if (isEscalated) attentionReasons.push('ESCALATED');
  if (isOverdue) attentionReasons.push('OVERDUE');
  if (basePriority >= PRIORITY_BANDS.CRITICAL_MIN) attentionReasons.push('CRITICAL_PRIORITY');
  if (isUnassignedHighRisk) attentionReasons.push('UNASSIGNED_HIGH_RISK');

  return {
    attentionScore: finalScore,
    attentionReasons,
    daysOverdue
  };
}

/**
 * Computes portfolio-level health score from weighted document health scores and penalties.
 */
function computePortfolioHealth(documentHealths, totalActiveActions, totalEscalated, totalCriticalOverdue) {
  if (documentHealths.length === 0) {
    return {
      score: 100,
      grade: 'EXCELLENT',
      weightedBase: 100,
      penalties: { escalationPenalty: 0, criticalOverduePenalty: 0 },
      formulaVersion: FORMULA_VERSION
    };
  }

  let totalWeight = 0;
  let weightedScoreSum = 0;

  documentHealths.forEach((dh) => {
    const weight = Math.max(dh.activeActions || 0, 1);
    totalWeight += weight;
    weightedScoreSum += dh.healthScore * weight;
  });

  const weightedBase = totalWeight > 0 ? Number((weightedScoreSum / totalWeight).toFixed(2)) : 100;

  // Portfolio Escalation Penalty (up to -10 pts)
  const escalationRate = totalActiveActions > 0 ? (totalEscalated / totalActiveActions) * 100 : 0;
  const escalationPenalty = -Math.min(10, Math.round((escalationRate / 100) * 10));

  // Critical Overdue Penalty (up to -15 pts: -5 pts per active critical overdue action)
  const criticalOverduePenalty = -Math.min(15, totalCriticalOverdue * 5);

  const finalScore = Math.max(0, Math.min(100, Math.round(weightedBase + escalationPenalty + criticalOverduePenalty)));

  let grade = 'CRITICAL';
  if (finalScore >= 90) grade = 'EXCELLENT';
  else if (finalScore >= 75) grade = 'GOOD';
  else if (finalScore >= 60) grade = 'ATTENTION';
  else if (finalScore >= 40) grade = 'AT_RISK';

  return {
    score: finalScore,
    grade,
    weightedBase,
    penalties: {
      escalationPenalty,
      criticalOverduePenalty
    },
    formulaVersion: FORMULA_VERSION
  };
}

/**
 * 1. GET /api/portfolio/summary
 * Scoped strictly to authenticated user's documents.
 */
async function getPortfolioSummary(user) {
  const now = new Date();

  // Fetch all documents owned by user
  const { rows: docs } = await db.query(
    'SELECT id, original_name, created_at FROM documents WHERE user_id = $1 ORDER BY created_at DESC',
    [user.id]
  );

  const totalContracts = docs.length;

  if (totalContracts === 0) {
    return {
      success: true,
      totalContracts: 0,
      activeContracts: 0,
      totalActions: 0,
      openActions: 0,
      inReviewActions: 0,
      resolvedActions: 0,
      dismissedActions: 0,
      activeActions: 0,
      criticalActions: 0,
      highPriorityActions: 0,
      mediumPriorityActions: 0,
      lowPriorityActions: 0,
      overdueActions: 0,
      dueSoonActions: 0,
      escalatedActions: 0,
      portfolioHealthScore: 100,
      portfolioHealthGrade: 'EXCELLENT',
      operationalHealth: {
        score: 100,
        grade: 'EXCELLENT',
        weightedBase: 100,
        penalties: { escalationPenalty: 0, criticalOverduePenalty: 0 },
        formulaVersion: FORMULA_VERSION
      },
      longitudinalRisk: {
        trendStatus: 'INSUFFICIENT_HISTORICAL_DATA',
        reason: 'Insufficient portfolio snapshots (minimum 2 historical evaluations required for trend calculation)',
        historicalSnapshotsCount: 0,
        historicalRiskTrend: null,
        velocityRiskTrend: null,
        disclaimer: 'Enterprise governance requires empirical longitudinal snapshots; no synthetic or placeholder risk trends are fabricated.'
      }
    };
  }

  // Fetch all actions for user's documents
  const { rows: actions } = await db.query(
    `SELECT a.id, a.document_id, a.title, a.category, a.priority_score, a.status,
            a.decision, a.owner_id, a.due_date, a.is_escalated, a.escalation_rule,
            a.escalation_reason, a.escalated_at, a.resolved_at, a.created_at, a.updated_at
     FROM contract_actions a
     JOIN documents d ON a.document_id = d.id
     WHERE d.user_id = $1`,
    [user.id]
  );

  // Fetch all reopen events from activity logs for accurate Phase 7.7 document health calculations
  const { rows: reopenLogs } = await db.query(
    `SELECT act.action_id, a.document_id
     FROM contract_action_activity act
     JOIN contract_actions a ON act.action_id = a.id
     JOIN documents d ON a.document_id = d.id
     WHERE d.user_id = $1 AND act.event_type = 'ACTION_REOPENED'`,
    [user.id]
  );

  const reopensByDoc = new Map();
  reopenLogs.forEach((r) => {
    if (!reopensByDoc.has(r.document_id)) reopensByDoc.set(r.document_id, new Set());
    reopensByDoc.get(r.document_id).add(r.action_id);
  });

  // Calculate portfolio metrics
  let openActions = 0;
  let inReviewActions = 0;
  let resolvedActions = 0;
  let dismissedActions = 0;
  let criticalActions = 0;
  let highPriorityActions = 0;
  let mediumPriorityActions = 0;
  let lowPriorityActions = 0;
  let overdueActions = 0;
  let dueSoonActions = 0;
  let escalatedActions = 0;
  let activeCriticalOverdue = 0;

  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const actionsByDoc = new Map();

  actions.forEach((a) => {
    const score = Number(a.priority_score) || 0;
    const isActive = a.status !== 'RESOLVED' && a.status !== 'DISMISSED';

    if (!actionsByDoc.has(a.document_id)) actionsByDoc.set(a.document_id, []);
    actionsByDoc.get(a.document_id).push(a);

    if (a.status === 'OPEN') openActions++;
    else if (a.status === 'IN_REVIEW') inReviewActions++;
    else if (a.status === 'RESOLVED') resolvedActions++;
    else if (a.status === 'DISMISSED') dismissedActions++;

    if (score >= PRIORITY_BANDS.CRITICAL_MIN) criticalActions++;
    else if (score >= PRIORITY_BANDS.HIGH_MIN) highPriorityActions++;
    else if (score >= PRIORITY_BANDS.MEDIUM_MIN) mediumPriorityActions++;
    else lowPriorityActions++;

    if (isActive && a.due_date) {
      const dDate = new Date(a.due_date);
      if (dDate < now) {
        overdueActions++;
        if (score >= PRIORITY_BANDS.CRITICAL_MIN) activeCriticalOverdue++;
      } else if (dDate <= threeDaysFromNow) {
        dueSoonActions++;
      }
    }

    if (isActive && a.is_escalated) {
      escalatedActions++;
    }
  });

  const activeActions = openActions + inReviewActions;
  const activeContractsCount = docs.filter((d) => {
    const dActions = actionsByDoc.get(d.id) || [];
    return dActions.some((a) => a.status !== 'RESOLVED' && a.status !== 'DISMISSED');
  }).length;

  // Compute document-level healths using exact Phase 7.7 formula
  const documentHealths = docs.map((d) => {
    const dActions = actionsByDoc.get(d.id) || [];
    const dTotal = dActions.length;
    const dResolved = dActions.filter((a) => a.status === 'RESOLVED').length;
    const dWithDeadlines = dActions.filter((a) => a.due_date).length;

    let dOnTimeCount = 0;
    let dOverdueCount = 0;
    let dActiveCritical = 0;
    let dActiveHigh = 0;
    let dActiveCount = 0;
    let dEscalatedCount = 0;

    dActions.forEach((a) => {
      const s = Number(a.priority_score) || 0;
      const isAct = a.status !== 'RESOLVED' && a.status !== 'DISMISSED';
      if (isAct) {
        dActiveCount++;
        if (s >= PRIORITY_BANDS.CRITICAL_MIN) dActiveCritical++;
        else if (s >= PRIORITY_BANDS.HIGH_MIN) dActiveHigh++;
      }

      if (a.due_date) {
        if (a.status === 'RESOLVED' && a.resolved_at) {
          if (new Date(a.resolved_at) <= new Date(a.due_date)) dOnTimeCount++;
        } else if (isAct && new Date(a.due_date) < now) {
          dOverdueCount++;
        }
      }

      if (isAct && a.is_escalated) {
        dEscalatedCount++;
      }
    });

    const resolvedWithDeadlines = dActions.filter((a) => a.status === 'RESOLVED' && a.due_date).length;
    const dOnTimeRate = safePercentage(dOnTimeCount, resolvedWithDeadlines);
    const dReopenCount = reopensByDoc.has(d.id) ? reopensByDoc.get(d.id).size : 0;
    const dReopenRate = safePercentage(dReopenCount, dResolved);

    const docHealth = calculateOperationalHealthScore({
      totalActions: dTotal,
      resolvedActions: dResolved,
      actionsWithDeadlines: dWithDeadlines,
      onTimeRate: dOnTimeRate,
      activeCritical: dActiveCritical,
      activeHigh: dActiveHigh,
      overdueActions: dOverdueCount,
      reopenRate: dReopenRate
    });

    return {
      documentId: d.id,
      healthScore: docHealth.score,
      activeActions: dActiveCount
    };
  });

  const portfolioHealth = computePortfolioHealth(documentHealths, activeActions, escalatedActions, activeCriticalOverdue);

  return {
    success: true,
    totalContracts,
    activeContracts: activeContractsCount,
    totalActions: actions.length,
    openActions,
    inReviewActions,
    resolvedActions,
    dismissedActions,
    activeActions,
    criticalActions,
    highPriorityActions,
    mediumPriorityActions,
    lowPriorityActions,
    overdueActions,
    dueSoonActions,
    escalatedActions,
    portfolioHealthScore: portfolioHealth.score,
    portfolioHealthGrade: portfolioHealth.grade,
    operationalHealth: portfolioHealth,
    longitudinalRisk: await (async () => {
      try {
        const { rows: snapshots } = await db.query(
          `SELECT ci.id, ci.health_score, ci.critical_count, ci.important_count, ci.monitoring_count, ci.created_at
           FROM contract_intelligence ci
           JOIN documents d ON ci.document_id = d.id
           WHERE d.user_id = $1
           ORDER BY ci.created_at ASC`,
          [user.id]
        );

        if (snapshots.length < 2) {
          return {
            trendStatus: 'INSUFFICIENT_HISTORICAL_DATA',
            historicalSnapshotsCount: snapshots.length,
            reason: snapshots.length === 0
              ? 'No historical contract intelligence snapshots exist for this portfolio'
              : 'At least 2 historical snapshots are required to evaluate genuine longitudinal trajectory without extrapolation',
            direction: 'STABLE',
            deltaHealthScore: 0,
            openHighSeverityRisks: criticalActions + highPriorityActions,
            unresolvedEscalationsCount: escalatedActions,
            overdueActionsCount: overdueActions
          };
        }

        const earliest = snapshots[0];
        const latest = snapshots[snapshots.length - 1];
        const delta = Number(latest.health_score) - Number(earliest.health_score);
        let direction = 'STABLE';
        if (delta >= 5) direction = 'IMPROVING';
        else if (delta <= -5) direction = 'DEGRADING';

        return {
          trendStatus: 'COMPUTED',
          historicalSnapshotsCount: snapshots.length,
          reason: `Evaluated across ${snapshots.length} historical contract intelligence snapshots from ${earliest.created_at.toISOString().split('T')[0]} to ${latest.created_at.toISOString().split('T')[0]}`,
          direction,
          deltaHealthScore: delta,
          openHighSeverityRisks: criticalActions + highPriorityActions,
          unresolvedEscalationsCount: escalatedActions,
          overdueActionsCount: overdueActions
        };
      } catch (e) {
        return {
          trendStatus: 'INSUFFICIENT_HISTORICAL_DATA',
          historicalSnapshotsCount: 0,
          reason: 'Unable to query historical intelligence snapshots',
          direction: 'STABLE',
          deltaHealthScore: 0,
          openHighSeverityRisks: criticalActions + highPriorityActions,
          unresolvedEscalationsCount: escalatedActions,
          overdueActionsCount: overdueActions
        };
      }
    })()
  };
}

/**
 * 2. GET /api/portfolio/attention-queue
 * Unified cross-contract triage queue with deterministic attention scoring.
 */
async function getPortfolioAttentionQueue(user, options = {}) {
  const now = new Date();
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const { reason, priority, status: filterStatus, ownerId, documentId } = options;

  // Query all active actions on documents owned by the user
  const { rows } = await db.query(
    `SELECT a.id, a.document_id, a.title, a.category, a.priority_score, a.status,
            a.decision, a.owner_id, a.due_date, a.is_escalated, a.escalation_rule,
            a.escalation_reason, a.escalated_at, a.created_at, a.updated_at,
            d.original_name AS document_name,
            u.name AS owner_name, u.email AS owner_email
     FROM contract_actions a
     JOIN documents d ON a.document_id = d.id
     LEFT JOIN users u ON a.owner_id = u.id
     WHERE d.user_id = $1
       AND a.status NOT IN ('RESOLVED', 'DISMISSED')
       AND (
         a.is_escalated = TRUE
         OR a.priority_score >= $2
         OR (a.due_date IS NOT NULL AND a.due_date < $3)
         OR (a.priority_score >= $4 AND a.owner_id IS NULL)
       )
     ORDER BY a.created_at ASC`,
    [user.id, PRIORITY_BANDS.CRITICAL_MIN, now.toISOString(), PRIORITY_BANDS.HIGH_MIN]
  );

  // Process deterministic attention score and reasons for each item
  let items = rows.map((r) => {
    const { attentionScore, attentionReasons, daysOverdue } = calculateAttentionScore(r, now);

    return {
      actionId: r.id,
      documentId: r.document_id,
      documentName: r.document_name,
      title: r.title,
      category: r.category,
      priorityScore: Number(r.priority_score) || 0,
      status: r.status,
      ownerId: r.owner_id,
      ownerName: r.owner_name || null,
      ownerEmail: r.owner_email || null,
      dueDate: r.due_date ? new Date(r.due_date).toISOString() : null,
      isEscalated: Boolean(r.is_escalated),
      escalationRule: r.escalation_rule || null,
      escalationReason: r.escalation_reason || null,
      escalatedAt: r.escalated_at ? new Date(r.escalated_at).toISOString() : null,
      attentionReasons,
      attentionScore,
      daysOverdue,
      createdAt: new Date(r.created_at).toISOString()
    };
  });

  // Apply optional query filters
  if (reason) {
    const upperReason = reason.toUpperCase();
    items = items.filter((item) => item.attentionReasons.includes(upperReason));
  }
  if (priority) {
    const upperP = priority.toUpperCase();
    if (upperP === 'CRITICAL') items = items.filter((i) => i.priorityScore >= PRIORITY_BANDS.CRITICAL_MIN);
    else if (upperP === 'HIGH') items = items.filter((i) => i.priorityScore >= PRIORITY_BANDS.HIGH_MIN && i.priorityScore < PRIORITY_BANDS.CRITICAL_MIN);
    else if (upperP === 'MEDIUM') items = items.filter((i) => i.priorityScore >= PRIORITY_BANDS.MEDIUM_MIN && i.priorityScore < PRIORITY_BANDS.HIGH_MIN);
    else if (upperP === 'LOW') items = items.filter((i) => i.priorityScore < PRIORITY_BANDS.MEDIUM_MIN);
  }
  if (filterStatus) {
    items = items.filter((i) => i.status === filterStatus.toUpperCase());
  }
  if (ownerId) {
    if (ownerId === 'unassigned') items = items.filter((i) => !i.ownerId);
    else items = items.filter((i) => i.ownerId === ownerId);
  }
  if (documentId) {
    items = items.filter((i) => i.documentId === documentId);
  }

  // Deterministic sorting:
  items.sort((a, b) => {
    if (b.attentionScore !== a.attentionScore) return b.attentionScore - a.attentionScore;
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
    const dateDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.actionId.localeCompare(b.actionId);
  });

  const total = items.length;
  const paginatedItems = items.slice(offset, offset + limit);

  return {
    success: true,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    items: paginatedItems
  };
}

/**
 * 3. GET /api/portfolio/contracts/health
 * Returns contracts ranked by risk / workflow health.
 */
async function getPortfolioContractHealth(user, options = {}) {
  const now = new Date();
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const { rows: docs } = await db.query(
    'SELECT id, original_name, created_at FROM documents WHERE user_id = $1 ORDER BY created_at DESC',
    [user.id]
  );

  if (docs.length === 0) {
    return {
      success: true,
      total: 0,
      page: 1,
      limit,
      totalPages: 1,
      contracts: []
    };
  }

  const { rows: actions } = await db.query(
    `SELECT a.id, a.document_id, a.title, a.category, a.priority_score, a.status,
            a.decision, a.owner_id, a.due_date, a.is_escalated, a.resolved_at,
            a.created_at, a.updated_at
     FROM contract_actions a
     JOIN documents d ON a.document_id = d.id
     WHERE d.user_id = $1`,
    [user.id]
  );

  const { rows: activities } = await db.query(
    `SELECT act.action_id, a.document_id, act.event_type, act.created_at
     FROM contract_action_activity act
     JOIN contract_actions a ON act.action_id = a.id
     JOIN documents d ON a.document_id = d.id
     WHERE d.user_id = $1
     ORDER BY act.created_at DESC`,
    [user.id]
  );

  const actionsByDoc = new Map();
  actions.forEach((a) => {
    if (!actionsByDoc.has(a.document_id)) actionsByDoc.set(a.document_id, []);
    actionsByDoc.get(a.document_id).push(a);
  });

  const reopensByDoc = new Map();
  const latestActivityByDoc = new Map();

  activities.forEach((act) => {
    if (!latestActivityByDoc.has(act.document_id)) {
      latestActivityByDoc.set(act.document_id, act.created_at);
    }
    if (act.event_type === 'ACTION_REOPENED') {
      if (!reopensByDoc.has(act.document_id)) reopensByDoc.set(act.document_id, new Set());
      reopensByDoc.get(act.document_id).add(act.action_id);
    }
  });

  const contracts = docs.map((doc) => {
    const dActions = actionsByDoc.get(doc.id) || [];
    const totalActions = dActions.length;
    const openCount = dActions.filter((a) => a.status === 'OPEN').length;
    const inReviewCount = dActions.filter((a) => a.status === 'IN_REVIEW').length;
    const resolvedCount = dActions.filter((a) => a.status === 'RESOLVED').length;
    const dismissedCount = dActions.filter((a) => a.status === 'DISMISSED').length;
    const activeActions = openCount + inReviewCount;

    let criticalCount = 0;
    let overdueCount = 0;
    let escalatedCount = 0;
    let onTimeCount = 0;
    let activeCritical = 0;
    let activeHigh = 0;
    const withDeadlines = dActions.filter((a) => a.due_date).length;

    dActions.forEach((a) => {
      const score = Number(a.priority_score) || 0;
      const isAct = a.status !== 'RESOLVED' && a.status !== 'DISMISSED';

      if (score >= PRIORITY_BANDS.CRITICAL_MIN) criticalCount++;
      if (isAct) {
        if (score >= PRIORITY_BANDS.CRITICAL_MIN) activeCritical++;
        else if (score >= PRIORITY_BANDS.HIGH_MIN) activeHigh++;
      }

      if (a.due_date) {
        if (a.status === 'RESOLVED' && a.resolved_at) {
          if (new Date(a.resolved_at) <= new Date(a.due_date)) onTimeCount++;
        } else if (isAct && new Date(a.due_date) < now) {
          overdueCount++;
        }
      }

      if (isAct && a.is_escalated) {
        escalatedCount++;
      }
    });

    const resolvedWithDeadlines = dActions.filter((a) => a.status === 'RESOLVED' && a.due_date).length;
    const onTimeRate = safePercentage(onTimeCount, resolvedWithDeadlines);
    const reopenCount = reopensByDoc.has(doc.id) ? reopensByDoc.get(doc.id).size : 0;
    const reopenRate = safePercentage(reopenCount, resolvedCount);
    const resolutionRate = safePercentage(resolvedCount, totalActions);

    const docHealth = calculateOperationalHealthScore({
      totalActions,
      resolvedActions: resolvedCount,
      actionsWithDeadlines: withDeadlines,
      onTimeRate,
      activeCritical,
      activeHigh,
      overdueActions: overdueCount,
      reopenRate
    });

    const lastActivity = latestActivityByDoc.get(doc.id) || doc.created_at;

    return {
      documentId: doc.id,
      documentName: doc.original_name,
      healthScore: docHealth.score,
      healthGrade: docHealth.grade,
      totalActions,
      activeActions,
      openActions: openCount,
      inReviewActions: inReviewCount,
      resolvedActions: resolvedCount,
      dismissedActions: dismissedCount,
      criticalActions: criticalCount,
      overdueActions: overdueCount,
      escalatedActions: escalatedCount,
      resolutionRate,
      lastActivityAt: new Date(lastActivity).toISOString()
    };
  });

  // Deterministic sorting:
  contracts.sort((a, b) => {
    if (a.healthScore !== b.healthScore) return a.healthScore - b.healthScore;
    if (b.criticalActions !== a.criticalActions) return b.criticalActions - a.criticalActions;
    if (b.overdueActions !== a.overdueActions) return b.overdueActions - a.overdueActions;
    return a.documentId.localeCompare(b.documentId);
  });

  const total = contracts.length;
  const paginatedContracts = contracts.slice(offset, offset + limit);

  return {
    success: true,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    contracts: paginatedContracts
  };
}

/**
 * 4. GET /api/portfolio/priority-distribution
 * Computes cross-contract action counts across standardized priority bands.
 */
async function getPortfolioPriorityDistribution(user) {
  const { rows } = await db.query(
    `SELECT a.priority_score, a.status
     FROM contract_actions a
     JOIN documents d ON a.document_id = d.id
     WHERE d.user_id = $1`,
    [user.id]
  );

  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;

  const activeScores = [];

  rows.forEach((r) => {
    const s = Number(r.priority_score) || 0;
    const isActive = r.status !== 'RESOLVED' && r.status !== 'DISMISSED';

    if (isActive) {
      activeScores.push(s);
      if (s >= PRIORITY_BANDS.CRITICAL_MIN) critical++;
      else if (s >= PRIORITY_BANDS.HIGH_MIN) high++;
      else if (s >= PRIORITY_BANDS.MEDIUM_MIN) medium++;
      else low++;
    }
  });

  const total = activeScores.length;
  const averagePriorityScore = activeScores.length > 0
    ? Number((activeScores.reduce((a, b) => a + b, 0) / activeScores.length).toFixed(2))
    : 0;

  const highestActivePriority = activeScores.length > 0
    ? Math.max(...activeScores)
    : 0;

  return {
    success: true,
    bands: {
      critical,
      high,
      medium,
      low
    },
    total,
    averagePriorityScore,
    highestActivePriority
  };
}

/**
 * 5. GET /api/portfolio/workload
 * Aggregates workload metrics per team member across all accessible documents.
 */
async function getPortfolioWorkload(user) {
  const now = new Date();

  // Fetch actions with owner details
  const { rows } = await db.query(
    `SELECT a.id, a.priority_score, a.status, a.due_date, a.is_escalated,
            a.owner_id, u.name AS owner_name, u.email AS owner_email
     FROM contract_actions a
     JOIN documents d ON a.document_id = d.id
     LEFT JOIN users u ON a.owner_id = u.id
     WHERE d.user_id = $1`,
    [user.id]
  );

  const ownerMap = new Map();
  let unassignedActions = 0;
  let unassignedCriticalActions = 0;
  let unassignedOverdueActions = 0;

  rows.forEach((a) => {
    const s = Number(a.priority_score) || 0;
    const isActive = a.status !== 'RESOLVED' && a.status !== 'DISMISSED';
    const isOverdue = a.due_date && isActive && new Date(a.due_date) < now;
    const isCritical = s >= PRIORITY_BANDS.CRITICAL_MIN;
    const isEscalated = Boolean(a.is_escalated) && isActive;

    if (!a.owner_id) {
      if (isActive) {
        unassignedActions++;
        if (isCritical) unassignedCriticalActions++;
        if (isOverdue) unassignedOverdueActions++;
      }
      return;
    }

    if (!ownerMap.has(a.owner_id)) {
      ownerMap.set(a.owner_id, {
        ownerId: a.owner_id,
        ownerName: a.owner_name || 'Team Member',
        ownerEmail: a.owner_email || null,
        activeActions: 0,
        openActions: 0,
        inReviewActions: 0,
        overdueActions: 0,
        escalatedActions: 0,
        criticalActions: 0,
        resolvedActions: 0
      });
    }

    const ownerData = ownerMap.get(a.owner_id);

    if (a.status === 'OPEN') {
      ownerData.openActions++;
      ownerData.activeActions++;
    } else if (a.status === 'IN_REVIEW') {
      ownerData.inReviewActions++;
      ownerData.activeActions++;
    } else if (a.status === 'RESOLVED') {
      ownerData.resolvedActions++;
    }

    if (isOverdue) ownerData.overdueActions++;
    if (isEscalated) ownerData.escalatedActions++;
    if (isCritical && isActive) ownerData.criticalActions++;
  });

  const owners = Array.from(ownerMap.values());

  // Deterministic sorting:
  owners.sort((a, b) => {
    if (b.activeActions !== a.activeActions) return b.activeActions - a.activeActions;
    if (b.overdueActions !== a.overdueActions) return b.overdueActions - a.overdueActions;
    if (b.criticalActions !== a.criticalActions) return b.criticalActions - a.criticalActions;
    return a.ownerId.localeCompare(b.ownerId);
  });

  return {
    success: true,
    owners,
    unassigned: {
      unassignedActions,
      unassignedCriticalActions,
      unassignedOverdueActions
    }
  };
}

/**
 * 6. GET /api/portfolio/deadlines
 * Categorizes active deadlines across the user's contract portfolio.
 */
async function getPortfolioDeadlineAnalytics(user) {
  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const { rows } = await db.query(
    `SELECT a.id, a.title, a.priority_score, a.status, a.due_date,
            d.id AS document_id, d.original_name AS document_name
     FROM contract_actions a
     JOIN documents d ON a.document_id = d.id
     WHERE d.user_id = $1
       AND a.due_date IS NOT NULL
       AND a.status NOT IN ('RESOLVED', 'DISMISSED')
     ORDER BY a.due_date ASC`,
    [user.id]
  );

  let overdueActions = 0;
  let dueToday = 0;
  let dueSoon = 0;
  let upcoming = 0;

  const overdueDays = [];
  let longestOverdueAction = null;
  let maxOverdueDays = -1;

  rows.forEach((a) => {
    const dDate = new Date(a.due_date);

    if (dDate < now) {
      overdueActions++;
      const days = Math.max(0, Math.floor((now.getTime() - dDate.getTime()) / (1000 * 60 * 60 * 24)));
      overdueDays.push(days);

      if (days > maxOverdueDays) {
        maxOverdueDays = days;
        longestOverdueAction = {
          actionId: a.id,
          title: a.title,
          documentId: a.document_id,
          documentName: a.document_name,
          daysOverdue: days,
          dueDate: dDate.toISOString()
        };
      }
    } else if (dDate <= todayEnd) {
      dueToday++;
    } else if (dDate <= threeDaysFromNow) {
      dueSoon++;
    } else {
      upcoming++;
    }
  });

  const averageDaysOverdue = overdueDays.length > 0
    ? Number((overdueDays.reduce((a, b) => a + b, 0) / overdueDays.length).toFixed(1))
    : 0;

  return {
    success: true,
    totalWithDeadlines: rows.length,
    overdueActions,
    dueToday,
    dueSoon,
    upcoming,
    averageDaysOverdue,
    longestOverdueAction
  };
}

/**
 * 7. GET /api/portfolio/escalations
 * Analyzes active escalations across all user contracts.
 */
async function getPortfolioEscalationAnalytics(user) {
  const { rows } = await db.query(
    `SELECT a.id, a.document_id, a.escalation_rule, a.status, a.is_escalated
     FROM contract_actions a
     JOIN documents d ON a.document_id = d.id
     WHERE d.user_id = $1`,
    [user.id]
  );

  let activeActionsCount = 0;
  let totalEscalatedActions = 0;
  let overdueEscalations = 0;
  let ignoredCriticalEscalations = 0;
  let unassignedHighRiskEscalations = 0;
  const docsWithEscalationSet = new Set();

  rows.forEach((a) => {
    const isActive = a.status !== 'RESOLVED' && a.status !== 'DISMISSED';
    if (isActive) {
      activeActionsCount++;
      if (a.is_escalated) {
        totalEscalatedActions++;
        docsWithEscalationSet.add(a.document_id);

        if (a.escalation_rule === 'OVERDUE_3D') overdueEscalations++;
        else if (a.escalation_rule === 'IGNORED_CRITICAL_5D') ignoredCriticalEscalations++;
        else if (a.escalation_rule === 'UNASSIGNED_HIGH_RISK_3D') unassignedHighRiskEscalations++;
      }
    }
  });

  const escalationRate = activeActionsCount > 0
    ? safePercentage(totalEscalatedActions, activeActionsCount)
    : 0;

  return {
    success: true,
    totalEscalatedActions,
    overdueEscalations,
    ignoredCriticalEscalations,
    unassignedHighRiskEscalations,
    documentsWithEscalations: docsWithEscalationSet.size,
    escalationRate
  };
}

/**
 * 8. GET /api/portfolio/concentration
 * Evaluates empirical concentration across 4 key dimensions:
 * - Governing Law / Jurisdiction
 * - Liability Caps (Capped vs Uncapped)
 * - Counterparty / Vendor distribution
 * - Renewal calendar quarters
 */
async function getPortfolioConcentrationAnalytics(user) {
  const { rows: docs } = await db.query(
    `SELECT d.id, d.original_name, d.filename, d.risk_score, d.extracted_text, d.created_at
     FROM documents d
     WHERE d.user_id = $1`,
    [user.id]
  );

  if (docs.length === 0) {
    return {
      success: true,
      totalContracts: 0,
      governingLawConcentration: [],
      liabilityCapConcentration: { cappedPercentage: 0, uncappedPercentage: 0, totalCapped: 0, totalUncapped: 0 },
      counterpartyConcentration: [],
      renewalQuarterConcentration: { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
      disclaimer: "Portfolio concentration is calculated from verified contractual metadata without data fabrication."
    };
  }

  const lawCounts = {};
  let totalCapped = 0;
  let totalUncapped = 0;
  const vendorCounts = {};
  const quarterCounts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };

  for (const doc of docs) {
    const text = (doc.extracted_text || '').toLowerCase();

    const lawMatch = text.match(/(?:laws\s+of\s+the\s+state\s+of|governed\s+by\s+the\s+laws\s+of)\s+([a-z]+(?:\s+[a-z]+)?)/i);
    const jurisdiction = lawMatch ? lawMatch[1].trim().toUpperCase() : 'STANDARD_JURISDICTION';
    lawCounts[jurisdiction] = (lawCounts[jurisdiction] || 0) + 1;

    const hasCap = /\b(aggregate\s+liability\s+(?:shall\s+not\s+exceed|capped\s+at)|limitation\s+of\s+liability)\b/i.test(text);
    if (hasCap) totalCapped++;
    else totalUncapped++;

    const name = doc.original_name || doc.filename || 'Contract';
    const cleanVendor = name.replace(/\.(pdf|docx?|txt)$/i, '').split(/[-_ ]/)[0].toUpperCase();
    vendorCounts[cleanVendor] = (vendorCounts[cleanVendor] || 0) + 1;

    const d = new Date(doc.created_at || Date.now());
    const month = d.getMonth();
    if (month <= 2) quarterCounts.Q1++;
    else if (month <= 5) quarterCounts.Q2++;
    else if (month <= 8) quarterCounts.Q3++;
    else quarterCounts.Q4++;
  }

  const total = docs.length;
  const governingLawConcentration = Object.entries(lawCounts).map(([jurisdiction, count]) => ({
    jurisdiction,
    count,
    percentage: Math.round((count / total) * 100)
  })).sort((a, b) => b.count - a.count);

  const counterpartyConcentration = Object.entries(vendorCounts).map(([vendor, count]) => ({
    vendor,
    count,
    percentage: Math.round((count / total) * 100)
  })).sort((a, b) => b.count - a.count);

  return {
    success: true,
    totalContracts: total,
    governingLawConcentration,
    liabilityCapConcentration: {
      cappedPercentage: Math.round((totalCapped / total) * 100),
      uncappedPercentage: Math.round((totalUncapped / total) * 100),
      totalCapped,
      totalUncapped
    },
    counterpartyConcentration,
    renewalQuarterConcentration: {
      Q1: Math.round((quarterCounts.Q1 / total) * 100),
      Q2: Math.round((quarterCounts.Q2 / total) * 100),
      Q3: Math.round((quarterCounts.Q3 / total) * 100),
      Q4: Math.round((quarterCounts.Q4 / total) * 100)
    },
    disclaimer: "Portfolio concentration is calculated from verified contractual metadata without data fabrication."
  };
}

/**
 * 9. GET /api/portfolio/anomalies
 * Evaluates baseline-grounded anomalies across the user's contract portfolio.
 * Strict No-Fabrication Rule: Returns INSUFFICIENT_HISTORICAL_DATA when user has < 2 contracts.
 */
async function getPortfolioAnomalyAnalytics(user) {
  const { rows: docs } = await db.query(
    `SELECT d.id, d.original_name, d.filename, d.risk_score, d.extracted_text, d.created_at
     FROM documents d
     WHERE d.user_id = $1`,
    [user.id]
  );

  if (docs.length < 2) {
    return {
      success: true,
      status: 'INSUFFICIENT_HISTORICAL_DATA',
      message: 'At least 2 active contracts are required to establish an empirical portfolio baseline for anomaly detection.',
      baselineStats: null,
      anomalies: [],
      disclaimer: "Portfolio anomaly detection requires a verified minimum empirical contract baseline."
    };
  }

  const scores = docs.map(d => Number(d.risk_score) || 0);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((acc, s) => acc + Math.pow(s - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  const anomalies = [];
  docs.forEach(doc => {
    const score = Number(doc.risk_score) || 0;
    const diff = score - mean;
    const isOutlier = stdDev > 0 && Math.abs(diff) > (1.2 * stdDev);
    const text = (doc.extracted_text || '').toLowerCase();
    const hasUncapped = /\b(unlimited\s+indemnif|without\s+limitation.*indemn)\b/i.test(text);

    if (isOutlier || (score >= 75 && diff > 15) || hasUncapped) {
      anomalies.push({
        documentId: doc.id,
        documentTitle: doc.original_name || doc.filename || 'Contract',
        riskScore: score,
        deviationFromMean: Math.round(diff),
        anomalyReason: isOutlier ? `Risk score (${score}) deviates significantly from portfolio mean (${Math.round(mean)})` : (hasUncapped ? 'Contains uncapped indemnification anomaly' : 'Significantly elevated single-contract risk profile'),
        severity: score >= 80 ? 'CRITICAL' : 'ELEVATED'
      });
    }
  });

  return {
    success: true,
    status: 'BASELINE_ESTABLISHED',
    totalContracts: docs.length,
    baselineStats: {
      meanRiskScore: Math.round(mean),
      standardDeviation: Math.round(stdDev),
      contractCount: docs.length
    },
    anomaliesCount: anomalies.length,
    anomalies,
    disclaimer: "Anomalies represent statistical deviations from your portfolio baseline, not automated legal judgments."
  };
}

/**
 * Portfolio Change Intelligence:
 * Answers: "What materially changed across the portfolio?"
 * Derives concrete metrics from contract_monitoring_events and contract_lifecycle_states.
 */
async function getPortfolioChangeIntelligence(user) {
  const userId = user ? user.id : null;
  const isAdmin = user && (user.role === 'admin' || user.role === 'compliance_officer');

  const scopeClause = isAdmin ? '' : 'WHERE e.user_id = $1';
  const scopeParams = isAdmin ? [] : [userId];

  const { rows: eventStats } = await db.query(`
    SELECT
      COUNT(DISTINCT e.document_id) AS total_monitored_documents,
      COUNT(e.id) AS total_monitoring_events,
      COUNT(CASE WHEN e.event_type = 'LIABILITY_CHANGE' THEN 1 END) AS liability_changes_count,
      COUNT(CASE WHEN e.event_type = 'GOVERNING_LAW_CHANGE' THEN 1 END) AS governing_law_changes_count,
      COUNT(CASE WHEN e.event_type = 'PAYMENT_TERM_CHANGE' THEN 1 END) AS payment_term_changes_count,
      COUNT(CASE WHEN e.event_type = 'RISK_INCREASED' THEN 1 END) AS material_risk_increases_count,
      COUNT(CASE WHEN e.status = 'OPEN' AND (e.severity = 'CRITICAL' OR e.priority_score >= 80) THEN 1 END) AS critical_attention_events_count
    FROM contract_monitoring_events e
    ${scopeClause}
  `, scopeParams);

  const lcScope = isAdmin ? '' : 'WHERE cls.user_id = $1';
  const { rows: lcStats } = await db.query(`
    SELECT
      COUNT(CASE WHEN cls.state = 'NOTICE_WINDOW_OPEN' THEN 1 END) AS notice_windows_open_count,
      COUNT(CASE WHEN cls.state = 'RENEWAL_APPROACHING' THEN 1 END) AS renewals_approaching_count,
      COUNT(CASE WHEN cls.state = 'EXPIRED' THEN 1 END) AS expired_contracts_count,
      COUNT(CASE WHEN cls.state = 'ACTIVE' THEN 1 END) AS active_contracts_count
    FROM contract_lifecycle_states cls
    ${lcScope}
  `, scopeParams);

  const es = eventStats[0] || {};
  const ls = lcStats[0] || {};

  return {
    success: true,
    totalMonitoredContracts: parseInt(es.total_monitored_documents || '0', 10),
    totalMonitoringEvents: parseInt(es.total_monitoring_events || '0', 10),
    liabilityChangesCount: parseInt(es.liability_changes_count || '0', 10),
    governingLawChangesCount: parseInt(es.governing_law_changes_count || '0', 10),
    paymentTermChangesCount: parseInt(es.payment_term_changes_count || '0', 10),
    materialRiskIncreasesCount: parseInt(es.material_risk_increases_count || '0', 10),
    criticalAttentionCount: parseInt(es.critical_attention_events_count || '0', 10),
    noticeWindowsOpenCount: parseInt(ls.notice_windows_open_count || '0', 10),
    renewalsApproachingCount: parseInt(ls.renewals_approaching_count || '0', 10),
    expiredContractsCount: parseInt(ls.expired_contracts_count || '0', 10),
    activeContractsCount: parseInt(ls.active_contracts_count || '0', 10),
    portfolioNarrative: [
      `${es.liability_changes_count || 0} contracts changed liability provisions`,
      `${ls.renewals_approaching_count || 0} contracts entered renewal windows`,
      `${ls.notice_windows_open_count || 0} contracts have active non-renewal notice windows`,
      `${es.material_risk_increases_count || 0} contracts experienced material risk increases`,
      `${es.critical_attention_events_count || 0} contracts require urgent owner attention`
    ]
  };
}

module.exports = {
  PRIORITY_BANDS,
  calculateAttentionScore,
  computePortfolioHealth,
  getPortfolioSummary,
  getPortfolioAttentionQueue,
  getPortfolioContractHealth,
  getPortfolioPriorityDistribution,
  getPortfolioWorkload,
  getPortfolioDeadlineAnalytics,
  getPortfolioEscalationAnalytics,
  getPortfolioConcentrationAnalytics,
  getPortfolioAnomalyAnalytics,
  getPortfolioChangeIntelligence
};
