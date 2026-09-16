const db = require('../db');

const FORMULA_VERSION = '1.0';

/**
 * Helper to safely calculate percentage
 */
function safePercentage(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  const val = (numerator / denominator) * 100;
  return Number(val.toFixed(2));
}

/**
 * Calculates median from array of numbers
 */
function calculateMedian(numbers) {
  if (!numbers || numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return Number(sorted[mid].toFixed(2));
  }
  return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
}

/**
 * Calculates deterministic Operational Health Score (Bounded 0–100)
 */
function calculateOperationalHealthScore({
  totalActions,
  resolvedActions,
  actionsWithDeadlines,
  onTimeRate,
  activeCritical,
  activeHigh,
  overdueActions,
  reopenRate
}) {
  // If no actions exist at all, return safe default good state (100)
  if (totalActions === 0) {
    return {
      score: 100,
      grade: 'EXCELLENT',
      components: {
        resolutionPerformance: 30,
        deadlinePerformance: 25,
        priorityManagement: 20,
        overduePenalty: 0,
        reopenPenalty: 0
      },
      formulaVersion: FORMULA_VERSION
    };
  }

  const resolutionPerformance = Number(((resolvedActions / totalActions) * 30).toFixed(2));

  // If no actions have deadlines, award full 25 pts
  const deadlinePerformance = actionsWithDeadlines > 0
    ? Number(((onTimeRate / 100) * 25).toFixed(2))
    : 25;

  // Penalize unaddressed critical and high priority items in backlog
  const priorityDeduction = (activeCritical * 4) + (activeHigh * 2);
  const priorityManagement = Math.max(0, Number((20 - priorityDeduction).toFixed(2)));

  const overduePenalty = -Math.min(15, overdueActions * 5);

  const reopenPenalty = -Math.min(10, Math.round((reopenRate / 100) * 10));

  const rawScore = resolutionPerformance + deadlinePerformance + priorityManagement + overduePenalty + reopenPenalty;
  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  let grade = 'CRITICAL';
  if (finalScore >= 90) grade = 'EXCELLENT';
  else if (finalScore >= 75) grade = 'GOOD';
  else if (finalScore >= 60) grade = 'ATTENTION';
  else if (finalScore >= 40) grade = 'AT_RISK';

  return {
    score: finalScore,
    grade,
    components: {
      resolutionPerformance,
      deadlinePerformance,
      priorityManagement,
      overduePenalty,
      reopenPenalty
    },
    formulaVersion: FORMULA_VERSION
  };
}

/**
 * Retrieves comprehensive deterministic workflow analytics for a document.
 * Strictly read-only query and computation. Zero side effects or mutations.
 */
async function getDocumentWorkflowAnalytics(documentId, user) {
  if (!documentId) {
    return { errorStatus: 400, errorMessage: 'Document ID is required' };
  }

  const { rows: docRows } = await db.query(
    'SELECT id, user_id, filename, original_name FROM documents WHERE id = $1',
    [documentId]
  );

  if (docRows.length === 0) {
    return { errorStatus: 404, errorMessage: 'Document not found' };
  }

  const doc = docRows[0];
  if (doc.user_id !== user.id && user.role !== 'admin') {
    return { errorStatus: 403, errorMessage: 'Unauthorized access to document' };
  }

  const [actionsRes, decisionsRes, activityRes, commentsRes] = await Promise.all([
    db.query(
      `SELECT a.id, a.document_id, a.source_action_id, a.title, a.category,
              a.priority_score, a.status, a.decision, a.owner_id,
              a.due_date, a.is_escalated, a.escalation_rule, a.escalation_reason, a.escalated_at,
              a.created_at, a.updated_at, a.resolved_at,
              u.name AS owner_name, u.email AS owner_email, u.role AS owner_role
       FROM contract_actions a
       LEFT JOIN users u ON u.id = a.owner_id
       WHERE a.document_id = $1
       ORDER BY a.created_at ASC;`,
      [documentId]
    ),
    db.query(
      `SELECT d.id, d.action_id, d.previous_status, d.new_status, d.decision, d.reason, d.created_at
       FROM contract_action_decisions d
       JOIN contract_actions a ON a.id = d.action_id
       WHERE a.document_id = $1
       ORDER BY d.created_at ASC;`,
      [documentId]
    ),
    db.query(
      `SELECT act.id, act.action_id, act.event_type, act.metadata, act.created_at,
              a.category
       FROM contract_action_activity act
       JOIN contract_actions a ON a.id = act.action_id
       WHERE a.document_id = $1
       ORDER BY act.created_at ASC;`,
      [documentId]
    ),
    db.query(
      `SELECT c.id, c.action_id, c.parent_comment_id, c.created_at, c.deleted_at
       FROM contract_action_comments c
       JOIN contract_actions a ON a.id = c.action_id
       WHERE a.document_id = $1;`,
      [documentId]
    )
  ]);

  const actions = actionsRes.rows;
  const decisions = decisionsRes.rows;
  const activityLogs = activityRes.rows;
  const comments = commentsRes.rows;

  const now = new Date();
  const upcoming3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  let openCount = 0;
  let inReviewCount = 0;
  let resolvedCount = 0;
  let dismissedCount = 0;
  let overdueCount = 0;
  let dueSoonCount = 0;
  let escalatedCount = 0;

  actions.forEach((a) => {
    if (a.status === 'OPEN') openCount++;
    else if (a.status === 'IN_REVIEW') inReviewCount++;
    else if (a.status === 'RESOLVED') resolvedCount++;
    else if (a.status === 'DISMISSED') dismissedCount++;

    if (a.is_escalated) escalatedCount++;

    if (a.due_date && a.status !== 'RESOLVED' && a.status !== 'DISMISSED') {
      const d = new Date(a.due_date);
      if (d < now) overdueCount++;
      else if (d <= upcoming3d) dueSoonCount++;
    }
  });

  const totalActions = actions.length;
  const resolutionRate = safePercentage(resolvedCount, totalActions);

  const overview = {
    totalActions,
    openActions: openCount,
    inReviewActions: inReviewCount,
    resolvedActions: resolvedCount,
    dismissedActions: dismissedCount,
    overdueActions: overdueCount,
    dueSoonActions: dueSoonCount,
    escalatedActions: escalatedCount,
    resolutionRate
  };

  const validResolutionHours = [];

  actions.forEach((a) => {
    if (a.status === 'RESOLVED' && a.resolved_at && a.created_at) {
      const createdTime = new Date(a.created_at).getTime();
      const resolvedTime = new Date(a.resolved_at).getTime();
      const diffMs = resolvedTime - createdTime;
      if (diffMs >= 0) {
        const hours = diffMs / (1000 * 60 * 60);
        validResolutionHours.push(hours);
      }
    }
  });

  let resolutionPerformance = {
    resolvedCount: validResolutionHours.length,
    averageHours: 0,
    medianHours: 0,
    fastestHours: 0,
    slowestHours: 0
  };

  if (validResolutionHours.length > 0) {
    const sumHours = validResolutionHours.reduce((acc, h) => acc + h, 0);
    resolutionPerformance = {
      resolvedCount: validResolutionHours.length,
      averageHours: Number((sumHours / validResolutionHours.length).toFixed(2)),
      medianHours: calculateMedian(validResolutionHours),
      fastestHours: Number(Math.min(...validResolutionHours).toFixed(2)),
      slowestHours: Number(Math.max(...validResolutionHours).toFixed(2))
    };
  }

  let actionsWithDeadlines = 0;
  let resolvedWithDeadlines = 0;
  let resolvedOnTime = 0;
  let resolvedLate = 0;

  actions.forEach((a) => {
    if (a.due_date) {
      actionsWithDeadlines++;
      if (a.status === 'RESOLVED' && a.resolved_at) {
        resolvedWithDeadlines++;
        const resolvedTime = new Date(a.resolved_at).getTime();
        const dueTime = new Date(a.due_date).getTime();
        if (resolvedTime <= dueTime) {
          resolvedOnTime++;
        } else {
          resolvedLate++;
        }
      }
    }
  });

  const onTimeRate = safePercentage(resolvedOnTime, resolvedWithDeadlines);

  const deadlinePerformance = {
    actionsWithDeadlines,
    resolvedWithDeadlines,
    resolvedOnTime,
    resolvedLate,
    currentlyOverdue: overdueCount,
    dueSoon: dueSoonCount,
    onTimeRate
  };

  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  let activeCritical = 0;
  let activeHigh = 0;

  const priorityScores = [];
  const activePriorityScores = [];
  const resolvedPriorityScores = [];
  const overduePriorityScores = [];

  actions.forEach((a) => {
    const score = Number(a.priority_score) || 0;
    priorityScores.push(score);

    if (score >= 80) criticalCount++;
    else if (score >= 70) highCount++;
    else if (score >= 40) mediumCount++;
    else lowCount++;

    const isActive = a.status !== 'RESOLVED' && a.status !== 'DISMISSED';
    if (isActive) {
      activePriorityScores.push(score);
      if (score >= 80) activeCritical++;
      else if (score >= 70) activeHigh++;
    }

    if (a.status === 'RESOLVED') {
      resolvedPriorityScores.push(score);
    }

    if (a.due_date && isActive && new Date(a.due_date) < now) {
      overduePriorityScores.push(score);
    }
  });

  const avgPriority = (arr) => arr.length > 0 ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : 0;

  const priorityDistribution = {
    bands: {
      critical: criticalCount,
      high: highCount,
      medium: mediumCount,
      low: lowCount
    },
    averagePriorityScore: avgPriority(priorityScores),
    highestActivePriority: activePriorityScores.length > 0 ? Math.max(...activePriorityScores) : 0,
    averageResolvedPriority: avgPriority(resolvedPriorityScores),
    averageOverduePriority: avgPriority(overduePriorityScores)
  };

  let acceptDecisions = 0;
  let negotiateDecisions = 0;
  let escalateDecisions = 0;
  let dismissDecisions = 0;

  decisions.forEach((d) => {
    if (d.decision === 'ACCEPT') acceptDecisions++;
    else if (d.decision === 'NEGOTIATE') negotiateDecisions++;
    else if (d.decision === 'ESCALATE') escalateDecisions++;
    else if (d.decision === 'DISMISS') dismissDecisions++;
  });

  const totalDecisions = decisions.length;
  const escalationRate = safePercentage(escalateDecisions, totalDecisions);

  const decisionMetrics = {
    totalDecisions,
    accept: acceptDecisions,
    negotiate: negotiateDecisions,
    escalate: escalateDecisions,
    dismiss: dismissDecisions,
    escalationRate
  };

  const ownerMap = new Map();
  let unassignedCount = 0;

  actions.forEach((a) => {
    if (!a.owner_id) {
      unassignedCount++;
    } else {
      if (!ownerMap.has(a.owner_id)) {
        ownerMap.set(a.owner_id, {
          userId: a.owner_id,
          name: a.owner_name || 'Assigned User',
          email: a.owner_email || '',
          role: a.owner_role || 'user',
          openActions: 0,
          inReviewActions: 0,
          overdueActions: 0,
          dueSoonActions: 0,
          resolvedActions: 0,
          resolutionDurations: []
        });
      }
      const owner = ownerMap.get(a.owner_id);
      if (a.status === 'OPEN') owner.openActions++;
      else if (a.status === 'IN_REVIEW') owner.inReviewActions++;
      else if (a.status === 'RESOLVED') {
        owner.resolvedActions++;
        if (a.resolved_at && a.created_at) {
          const diff = new Date(a.resolved_at).getTime() - new Date(a.created_at).getTime();
          if (diff >= 0) owner.resolutionDurations.push(diff / (1000 * 60 * 60));
        }
      }

      if (a.due_date && a.status !== 'RESOLVED' && a.status !== 'DISMISSED') {
        const d = new Date(a.due_date);
        if (d < now) owner.overdueActions++;
        else if (d <= upcoming3d) owner.dueSoonActions++;
      }
    }
  });

  const ownerWorkload = {
    unassignedActions: unassignedCount,
    owners: Array.from(ownerMap.values()).map((o) => {
      const avgH = o.resolutionDurations.length > 0
        ? Number((o.resolutionDurations.reduce((a, b) => a + b, 0) / o.resolutionDurations.length).toFixed(2))
        : 0;
      return {
        userId: o.userId,
        name: o.name,
        email: o.email,
        role: o.role,
        openActions: o.openActions,
        inReviewActions: o.inReviewActions,
        overdueActions: o.overdueActions,
        dueSoonActions: o.dueSoonActions,
        resolvedActions: o.resolvedActions,
        averageResolutionHours: avgH
      };
    })
  };

  const reopenedActionIds = new Set();
  const reopenedCategoryCounts = {};

  activityLogs.forEach((log) => {
    if (log.event_type === 'ACTION_REOPENED') {
      reopenedActionIds.add(log.action_id);
      const cat = log.category || 'GENERAL';
      reopenedCategoryCounts[cat] = (reopenedCategoryCounts[cat] || 0) + 1;
    }
  });

  const reopenedCount = reopenedActionIds.size;
  const reopenRate = safePercentage(reopenedCount, resolvedCount);

  const reopenMetrics = {
    reopenedActions: reopenedCount,
    reopenRate,
    reopenedCategories: reopenedCategoryCounts
  };

  const activeComments = comments.filter((c) => !c.deleted_at);
  const totalComments = activeComments.length;
  const totalReplies = activeComments.filter((c) => c.parent_comment_id !== null).length;

  const commentsByAction = new Map();
  activeComments.forEach((c) => {
    commentsByAction.set(c.action_id, (commentsByAction.get(c.action_id) || 0) + 1);
  });

  const actionsWithDiscussion = commentsByAction.size;
  const averageCommentsPerAction = actionsWithDiscussion > 0
    ? Number((totalComments / actionsWithDiscussion).toFixed(2))
    : 0;

  let mostDiscussedAction = null;
  if (actionsWithDiscussion > 0) {
    let maxCount = 0;
    let maxActionId = null;
    commentsByAction.forEach((cnt, actId) => {
      if (cnt > maxCount) {
        maxCount = cnt;
        maxActionId = actId;
      }
    });
    const matchAct = actions.find((a) => a.id === maxActionId);
    if (matchAct) {
      mostDiscussedAction = {
        actionId: matchAct.id,
        title: matchAct.title,
        commentCount: maxCount
      };
    }
  }

  const collaborationMetrics = {
    totalComments,
    totalReplies,
    actionsWithDiscussion,
    averageCommentsPerAction,
    mostDiscussedAction
  };

  const categoryMap = new Map();

  actions.forEach((a) => {
    const cat = a.category || 'GENERAL';
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, {
        category: cat,
        total: 0,
        open: 0,
        inReview: 0,
        resolved: 0,
        dismissed: 0,
        overdue: 0,
        resolutionDurations: []
      });
    }
    const catData = categoryMap.get(cat);
    catData.total++;
    if (a.status === 'OPEN') catData.open++;
    else if (a.status === 'IN_REVIEW') catData.inReview++;
    else if (a.status === 'RESOLVED') {
      catData.resolved++;
      if (a.resolved_at && a.created_at) {
        const diff = new Date(a.resolved_at).getTime() - new Date(a.created_at).getTime();
        if (diff >= 0) catData.resolutionDurations.push(diff / (1000 * 60 * 60));
      }
    } else if (a.status === 'DISMISSED') {
      catData.dismissed++;
    }

    if (a.due_date && a.status !== 'RESOLVED' && a.status !== 'DISMISSED' && new Date(a.due_date) < now) {
      catData.overdue++;
    }
  });

  const categoryMetrics = Array.from(categoryMap.values()).map((c) => ({
    category: c.category,
    total: c.total,
    open: c.open,
    inReview: c.inReview,
    resolved: c.resolved,
    dismissed: c.dismissed,
    overdue: c.overdue,
    averageResolutionHours: c.resolutionDurations.length > 0
      ? Number((c.resolutionDurations.reduce((a, b) => a + b, 0) / c.resolutionDurations.length).toFixed(2))
      : 0
  }));

  const operationalHealth = calculateOperationalHealthScore({
    totalActions,
    resolvedActions: resolvedCount,
    actionsWithDeadlines,
    onTimeRate,
    activeCritical,
    activeHigh,
    overdueActions: overdueCount,
    reopenRate
  });

  return {
    success: true,
    documentId,
    generatedAt: now.toISOString(),
    overview,
    resolutionPerformance,
    deadlinePerformance,
    priorityDistribution,
    decisionMetrics,
    ownerWorkload,
    reopenMetrics,
    collaborationMetrics,
    categoryMetrics,
    operationalHealth
  };
}

module.exports = {
  FORMULA_VERSION,
  safePercentage,
  calculateMedian,
  calculateOperationalHealthScore,
  getDocumentWorkflowAnalytics
};
