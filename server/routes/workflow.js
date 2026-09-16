/**
 * Deciva — Contract Decision Workflow Routes
 * ---------------------------------------------------------------------------
 * Authenticated endpoints for enterprise human-in-the-loop decision governance,
 * approval policies, multi-reviewer collaboration, and inbox management.
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  getWorkflowInbox,
  getDecisionWorkflow,
  submitDecisionWorkflow,
  assignReviewer,
  assignApprover,
  requestChanges,
  resubmitDecision,
  approveDecision,
  rejectDecision,
  completeDecision,
  cancelDecision,
  addComment,
  resolveComment,
  getWorkflowTimeline
} = require('../services/contractDecisionWorkflowService');

const router = express.Router();

/**
 * GET /api/workflow/inbox
 * Returns aggregated workflow inbox for the authenticated user.
 */
router.get('/inbox', requireAuth, async (req, res) => {
  try {
    const data = await getWorkflowInbox(req.user, req.query);
    res.json(data);
  } catch (err) {
    console.error('Workflow inbox error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch workflow inbox' });
  }
});

/**
 * GET /api/workflow/pending-approvals
 * Returns pending approvals specifically awaiting this user or admin.
 */
router.get('/pending-approvals', requireAuth, async (req, res) => {
  try {
    const data = await getWorkflowInbox(req.user, req.query);
    res.json({ pendingApprovals: data.pendingApprovals, count: data.pendingApprovals.length });
  } catch (err) {
    console.error('Pending approvals error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch pending approvals' });
  }
});

/**
 * GET /api/workflow/my-decisions
 * Returns decisions created or owned by the authenticated user.
 */
router.get('/my-decisions', requireAuth, async (req, res) => {
  try {
    const data = await getWorkflowInbox(req.user, req.query);
    res.json({ myDecisions: data.myDecisions, count: data.myDecisions.length });
  } catch (err) {
    console.error('My decisions error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch my decisions' });
  }
});

/**
 * GET /api/workflow/decisions/:decisionId
 * Returns full decision details, assigned reviewers, comments, and audit timeline.
 */
router.get('/decisions/:decisionId', requireAuth, async (req, res) => {
  try {
    const decision = await getDecisionWorkflow(req.params.decisionId, req.user);
    res.json(decision);
  } catch (err) {
    console.error('Get decision error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch decision workflow' });
  }
});

/**
 * POST /api/workflow/decisions/:decisionId/submit
 * Submits a decision workflow for formal review.
 */
router.post('/decisions/:decisionId/submit', requireAuth, async (req, res) => {
  try {
    const result = await submitDecisionWorkflow(req.params.decisionId, req.user.id, req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Submit decision error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to submit decision workflow' });
  }
});

/**
 * POST /api/workflow/decisions/:decisionId/assign-reviewer
 * Assigns a reviewer with a specific role.
 */
router.post('/decisions/:decisionId/assign-reviewer', requireAuth, async (req, res) => {
  try {
    const result = await assignReviewer(req.params.decisionId, req.user.id, req.body);
    res.json(result);
  } catch (err) {
    console.error('Assign reviewer error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to assign reviewer' });
  }
});

/**
 * POST /api/workflow/decisions/:decisionId/assign-approver
 * Assigns an approver (with separation of duties verification).
 */
router.post('/decisions/:decisionId/assign-approver', requireAuth, async (req, res) => {
  try {
    const result = await assignApprover(req.params.decisionId, req.user.id, req.body);
    res.json(result);
  } catch (err) {
    console.error('Assign approver error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to assign approver' });
  }
});

/**
 * POST /api/workflow/decisions/:decisionId/request-changes
 * Requests changes on a decision with reasons and optional clause reference.
 */
router.post('/decisions/:decisionId/request-changes', requireAuth, async (req, res) => {
  try {
    const result = await requestChanges(req.params.decisionId, req.user.id, req.body);
    res.json(result);
  } catch (err) {
    console.error('Request changes error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to request changes' });
  }
});

/**
 * POST /api/workflow/decisions/:decisionId/resubmit
 * Resubmits revised decision for review.
 */
router.post('/decisions/:decisionId/resubmit', requireAuth, async (req, res) => {
  try {
    const result = await resubmitDecision(req.params.decisionId, req.user.id, req.body);
    res.json(result);
  } catch (err) {
    console.error('Resubmit decision error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to resubmit decision' });
  }
});

/**
 * POST /api/workflow/decisions/:decisionId/approve
 * Formally approves a decision workflow with concurrency lock and separation-of-duties.
 */
router.post('/decisions/:decisionId/approve', requireAuth, async (req, res) => {
  try {
    const result = await approveDecision(req.params.decisionId, req.user.id, req.body);
    res.json(result);
  } catch (err) {
    console.error('Approve decision error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to approve decision' });
  }
});

/**
 * POST /api/workflow/decisions/:decisionId/reject
 * Formally rejects a decision workflow.
 */
router.post('/decisions/:decisionId/reject', requireAuth, async (req, res) => {
  try {
    const result = await rejectDecision(req.params.decisionId, req.user.id, req.body);
    res.json(result);
  } catch (err) {
    console.error('Reject decision error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to reject decision' });
  }
});

/**
 * POST /api/workflow/decisions/:decisionId/complete
 * Completes an approved decision workflow and synchronizes with Action Center.
 */
router.post('/decisions/:decisionId/complete', requireAuth, async (req, res) => {
  try {
    const result = await completeDecision(req.params.decisionId, req.user.id, req.body);
    res.json(result);
  } catch (err) {
    console.error('Complete decision error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to complete decision workflow' });
  }
});

/**
 * POST /api/workflow/decisions/:decisionId/cancel
 * Cancels a decision workflow.
 */
router.post('/decisions/:decisionId/cancel', requireAuth, async (req, res) => {
  try {
    const result = await cancelDecision(req.params.decisionId, req.user.id, req.body);
    res.json(result);
  } catch (err) {
    console.error('Cancel decision error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to cancel decision workflow' });
  }
});

/**
 * POST /api/workflow/decisions/:decisionId/comments
 * Adds a comment or clause-specific feedback note.
 */
router.post('/decisions/:decisionId/comments', requireAuth, async (req, res) => {
  try {
    const result = await addComment(req.params.decisionId, req.user.id, req.body);
    res.json({ success: true, comment: result });
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to add comment' });
  }
});

/**
 * POST /api/workflow/comments/:commentId/resolve
 * Resolves a comment thread.
 */
router.post('/comments/:commentId/resolve', requireAuth, async (req, res) => {
  try {
    const result = await resolveComment(req.params.commentId, req.user.id, req.body);
    res.json({ success: true, comment: result });
  } catch (err) {
    console.error('Resolve comment error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to resolve comment' });
  }
});

/**
 * GET /api/workflow/decisions/:decisionId/timeline
 * Returns chronological event history.
 */
router.get('/decisions/:decisionId/timeline', requireAuth, async (req, res) => {
  try {
    const timeline = await getWorkflowTimeline(req.params.decisionId, req.user);
    res.json({ timeline });
  } catch (err) {
    console.error('Workflow timeline error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch workflow timeline' });
  }
});

/**
 * POST /api/workflow/decision-feedback
 * Captures human vs AI recommendation disagreement telemetry.
 */
router.post('/decision-feedback', requireAuth, async (req, res) => {
  try {
    const { recordDecisionFeedback } = require('../services/decisionFeedbackService');
    const tenantId = req.user.tenant_id || req.body.tenant_id;
    const {
      document_id,
      decision_id,
      clause_id,
      ai_recommendation,
      ai_risk_score,
      human_decision,
      decision_reason,
      final_outcome,
      metadata
    } = req.body;

    const result = await recordDecisionFeedback({
      tenantId,
      documentId: document_id,
      decisionId: decision_id,
      userId: req.user.id,
      clauseId: clause_id,
      aiRecommendation: ai_recommendation,
      aiRiskScore: ai_risk_score,
      humanDecision: human_decision,
      decisionReason: decision_reason,
      finalOutcome: final_outcome,
      metadata
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('Record decision feedback error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to record decision feedback' });
  }
});

/**
 * GET /api/workflow/decision-feedback
 * Retrieves aggregated telemetry and disagreement analytics.
 */
router.get('/decision-feedback', requireAuth, async (req, res) => {
  try {
    const { getFeedbackAnalytics } = require('../services/decisionFeedbackService');
    const tenantId = req.user.tenant_id || req.query.tenant_id;
    const { document_id, limit } = req.query;

    const result = await getFeedbackAnalytics({
      tenantId,
      documentId: document_id,
      limit: limit ? parseInt(limit, 10) : 50
    });

    res.json(result);
  } catch (err) {
    console.error('Get decision feedback analytics error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch decision feedback analytics' });
  }
});

module.exports = router;
