/**
 * Portfolio Analytics Routes
 * 
 * Provides authenticated, strictly read-only endpoints for cross-contract
 * portfolio intelligence, health scoring, attention queue, and workload oversight.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
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
} = require('../services/portfolioAnalyticsService');
const {
  runPortfolioMonitoring,
  getPortfolioMonitoringEvents,
  getPortfolioAttentionQueue: getMonitoringAttentionQueue,
  getPortfolioLifecycleCalendar
} = require('../services/contractMonitoringService');

/**
 * GET /api/portfolio/summary
 * Strictly read-only portfolio summary metrics and weighted health score.
 */
router.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const summary = await getPortfolioSummary(req.user);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portfolio/attention-queue
 * Strictly read-only unified cross-contract triage queue.
 */
router.get('/attention-queue', requireAuth, async (req, res, next) => {
  try {
    const queue = await getPortfolioAttentionQueue(req.user, req.query);
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portfolio/contracts/health
 * Strictly read-only ranked contracts by workflow health / risk.
 */
router.get('/contracts/health', requireAuth, async (req, res, next) => {
  try {
    const health = await getPortfolioContractHealth(req.user, req.query);
    res.json(health);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portfolio/priority-distribution
 * Strictly read-only priority band breakdown across all contracts.
 */
router.get('/priority-distribution', requireAuth, async (req, res, next) => {
  try {
    const distribution = await getPortfolioPriorityDistribution(req.user);
    res.json(distribution);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portfolio/workload
 * Strictly read-only team member workload distribution.
 */
router.get('/workload', requireAuth, async (req, res, next) => {
  try {
    const workload = await getPortfolioWorkload(req.user);
    res.json(workload);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portfolio/deadlines
 * Strictly read-only portfolio-wide deadline categorization.
 */
router.get('/deadlines', requireAuth, async (req, res, next) => {
  try {
    const deadlines = await getPortfolioDeadlineAnalytics(req.user);
    res.json(deadlines);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portfolio/escalations
 * Strictly read-only active escalation analytics by rule type.
 */
router.get('/escalations', requireAuth, async (req, res, next) => {
  try {
    const escalations = await getPortfolioEscalationAnalytics(req.user);
    res.json(escalations);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portfolio/concentration
 * Evaluates empirical concentration across governing law, liability caps, vendors, and renewals.
 */
router.get('/concentration', requireAuth, async (req, res, next) => {
  try {
    const concentration = await getPortfolioConcentrationAnalytics(req.user);
    res.json(concentration);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portfolio/anomalies
 * Evaluates baseline-grounded anomalies across the user's contract portfolio.
 * Returns INSUFFICIENT_HISTORICAL_DATA when user has < 2 contracts.
 */
router.get('/anomalies', requireAuth, async (req, res, next) => {
  try {
    const anomalies = await getPortfolioAnomalyAnalytics(req.user);
    res.json(anomalies);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portfolio/monitoring
 * Returns recent material contract monitoring events across the portfolio.
 */
router.get('/monitoring', requireAuth, async (req, res, next) => {
  try {
    const events = await getPortfolioMonitoringEvents(req.user, req.query);
    res.json({
      success: true,
      events,
      count: events.length
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portfolio/attention
 * Returns prioritized contracts requiring immediate action.
 */
router.get('/attention', requireAuth, async (req, res, next) => {
  try {
    const attentionQueue = await getMonitoringAttentionQueue(req.user);
    res.json({
      success: true,
      attentionQueue,
      count: attentionQueue.length
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portfolio/lifecycle
 * Returns upcoming contract lifecycle events, renewal windows, and deadlines.
 */
router.get('/lifecycle', requireAuth, async (req, res, next) => {
  try {
    const calendar = await getPortfolioLifecycleCalendar(req.user);
    res.json({
      success: true,
      ...calendar
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/portfolio/monitoring/run
 * Executes an idempotent continuous monitoring cycle across the portfolio.
 */
router.post('/monitoring/run', requireAuth, async (req, res, next) => {
  try {
    const correlationId = req.headers['x-correlation-id'];
    const result = await runPortfolioMonitoring(req.user, correlationId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portfolio/change-intelligence
 * Answers: "What materially changed across the portfolio?"
 */
router.get('/change-intelligence', requireAuth, async (req, res, next) => {
  try {
    const intel = await getPortfolioChangeIntelligence(req.user);
    res.json(intel);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portfolio/roi
 * Phase L: Transparent, un-fabricated business ROI analytics.
 */
router.get('/roi', requireAuth, async (req, res, next) => {
  try {
    const { getBusinessRoiAnalytics } = require('../services/businessRoiService');
    const tenantId = req.user.tenant_id;
    const { manual_minutes, hourly_rate } = req.query;

    const data = await getBusinessRoiAnalytics({
      tenantId,
      assumptions: {
        manualReviewMinutes: manual_minutes,
        hourlyRateUsd: hourly_rate
      }
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
