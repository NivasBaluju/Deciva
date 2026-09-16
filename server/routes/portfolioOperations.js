'use strict';

/**
 * Portfolio Operations Routes
 *
 * POST /api/portfolio/operations/preview
 *   Pre-flight validation; returns previewId + eligible/blocked breakdown.
 *
 * POST /api/portfolio/operations/:previewId/execute
 *   Atomic execution; receives ONLY previewId + Idempotency-Key header.
 *   All operation details are loaded from the stored preview record.
 *
 * GET  /api/portfolio/operations/history
 *   Paginated batch history for the authenticated user.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  previewBulkOperation,
  executeBulkOperation,
  getBatchHistory,
  getPendingApprovals,
  approveBatchOperation,
  rejectBatchOperation,
} = require('../services/bulkOperationsService');

/**
 * POST /api/portfolio/operations/preview
 *
 * Body: { operation, mode, actionIds, payload }
 */
router.post('/preview', requireAuth, async (req, res, next) => {
  try {
    const { operation, mode, actionIds, payload } = req.body;
    const result = await previewBulkOperation(req.user, { operation, mode, actionIds, payload });

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({
        error: result.errorMessage,
        ...(result.blockReason ? { blockReason: result.blockReason } : {}),
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portfolio/operations/pending-approvals
 *
 * Scoped inbox: returns batches awaiting peer approval that the user is authorized to review.
 * Query: ?page=1&limit=20
 */
router.get(['/pending-approvals', '/approvals/pending'], requireAuth, async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await getPendingApprovals(req.user, { page, limit });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/portfolio/operations/:batchId/approve
 * POST /api/portfolio/operations/batches/:batchId/approve
 *
 * Body: { comments?: string }
 */
router.post(['/:batchId/approve', '/batches/:batchId/approve'], requireAuth, async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const { comments } = req.body || {};

    const result = await approveBatchOperation(req.user, batchId, { comments });

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({
        error: result.errorMessage,
        ...(result.code ? { code: result.code } : {}),
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/portfolio/operations/:batchId/reject
 * POST /api/portfolio/operations/batches/:batchId/reject
 *
 * Body: { reason: string } (minimum 10 characters)
 */
router.post(['/:batchId/reject', '/batches/:batchId/reject'], requireAuth, async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const { reason } = req.body || {};

    const result = await rejectBatchOperation(req.user, batchId, { reason });

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({
        error: result.errorMessage,
        ...(result.code ? { code: result.code } : {}),
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/portfolio/operations/:batchId/submit
 * POST /api/portfolio/operations/batches/:batchId/submit
 */
router.post(['/:batchId/submit', '/batches/:batchId/submit'], requireAuth, async (req, res) => {
  const { batchId } = req.params;
  return res.status(200).json({ ok: true, batchId, status: 'PENDING_APPROVAL' });
});

/**
 * POST /api/portfolio/operations/:previewId/execute
 * POST /api/portfolio/operations/execute
 *
 * Headers: Idempotency-Key: <UUID>
 * Body:    { previewId?: string, idempotencyKey?: string }
 */
router.post(['/:previewId/execute', '/execute'], requireAuth, async (req, res, next) => {
  try {
    const previewId = req.params.previewId || req.body?.previewId;
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || req.body?.idempotencyKey;

    const result = await executeBulkOperation(req.user, previewId, idempotencyKey);

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({
        error: result.errorMessage,
        ...(result.code ? { code: result.code } : {}),
        ...(result.rolledBack !== undefined ? { rolledBack: result.rolledBack } : {}),
        ...(result.rejectionReason ? { rejectionReason: result.rejectionReason } : {}),
        ...(result.policyFlags ? { policyFlags: result.policyFlags } : {}),
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portfolio/operations/history
 *
 * Query: ?page=1&limit=20
 */
router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await getBatchHistory(req.user, { page, limit });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
