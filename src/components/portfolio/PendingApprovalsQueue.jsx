import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PortfolioOperationsApi } from '../../services/portfolioOperationsApi';
import { useToast } from '../../context/ToastContext';

const POLICY_FLAG_LABELS = {
  CRITICAL_PRIORITY_INCLUDED: { label: 'Critical Priority (≥80)', color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  HIGH_IMPACT_TRANSITION:     { label: 'High-Impact Transition',  color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  LARGE_BATCH_THRESHOLD:      { label: 'Large Batch (>10)',      color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  CROSS_CONTRACT_MASS_TRIAGE: { label: 'Multi-Contract (>3 docs)', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
};

const OPERATION_ICONS = {
  BULK_ASSIGN:     '👤',
  BULK_DEADLINE:   '📅',
  BULK_TRANSITION: '🔄',
};

export const PendingApprovalsQueue = ({ onDecided }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [pendingBatches, setPendingBatches] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });

  const [activeBatch, setActiveBatch] = useState(null);
  const [dialogType, setDialogType] = useState(null);
  const [decisionComment, setDecisionComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await PortfolioOperationsApi.getPendingApprovals({ page: pagination.page, limit: pagination.limit });
      setPendingBatches(res.pending || []);
      setPagination(prev => ({ ...prev, ...(res.pagination || {}) }));
    } catch (err) {
      toast(err.message || 'Failed to load pending approvals', 'error');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, toast]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const handleOpenApprove = (batch) => {
    setActiveBatch(batch);
    setDialogType('approve');
    setDecisionComment('');
  };

  const handleOpenReject = (batch) => {
    setActiveBatch(batch);
    setDialogType('reject');
    setDecisionComment('');
  };

  const handleCloseDialog = () => {
    setActiveBatch(null);
    setDialogType(null);
    setDecisionComment('');
  };

  const handleSubmitDecision = async () => {
    if (!activeBatch) return;
    setSubmitting(true);
    try {
      if (dialogType === 'approve') {
        await PortfolioOperationsApi.approveBatch(activeBatch.id, decisionComment);
        toast(`Batch approved successfully. Ready for execution.`, 'ok');
      } else if (dialogType === 'reject') {
        if (!decisionComment || decisionComment.trim().length < 10) {
          toast('Rejection requires a reason with at least 10 characters', 'error');
          setSubmitting(false);
          return;
        }
        await PortfolioOperationsApi.rejectBatch(activeBatch.id, decisionComment);
        toast(`Batch rejected. Rejection is terminal.`, 'info');
      }
      handleCloseDialog();
      fetchPending();
      if (onDecided) onDecided();
    } catch (err) {
      toast(err.message || 'Decision failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🛡️</span> Governed Operations: Pending Approvals
            <span style={{
              fontSize: '11px', padding: '2px 8px', borderRadius: '0px',
              background: pendingBatches.length > 0 ? 'var(--signal-soft)' : 'var(--paper-dim)',
              color: pendingBatches.length > 0 ? 'var(--signal)' : 'var(--ink-soft)',
              fontWeight: 600,
            }}>
              {pagination.total} pending
            </span>
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--ink-soft)' }}>
            Four-eyes principle: Independent peer authorization required for high-consequence operations.
          </p>
        </div>
        <button
          onClick={fetchPending}
          disabled={loading}
          className="btn btn-outline btn-sm"
        >
          🔄 {loading ? 'Refreshing…' : 'Refresh Queue'}
        </button>
      </div>

      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '13px' }}>
          Loading pending approvals queue…
        </div>
      )}

      {!loading && pendingBatches.length === 0 && (
        <div style={{
          padding: '48px 24px', textAlign: 'center', borderRadius: '0px',
          background: 'var(--paper-dim)', border: '1px dashed var(--rule)',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>✅</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>
            No Operations Awaiting Your Approval
          </div>
          <div style={{ fontSize: '13px', color: 'var(--ink-soft)', maxWidth: '400px', margin: '0 auto' }}>
            All high-impact bulk operations have either been decided or executed. New batches triggering Governance Policy v1.0 will appear here.
          </div>
        </div>
      )}

      {!loading && pendingBatches.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {pendingBatches.map((batch) => {
            const flags = Array.isArray(batch.policy_flags) ? batch.policy_flags : [];
            const details = batch.policy_details || {};
            return (
              <motion.div
                key={batch.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  padding: '18px 20px', borderRadius: '0px',
                  background: 'var(--paper)', border: '1px solid var(--rule)',
                  display: 'flex', flexDirection: 'column', gap: '14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>{OPERATION_ICONS[batch.operation_type] || '⚡'}</span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>{batch.operation_type.replace('_', ' ')}</strong>
                        <span style={{
                          fontSize: '10px', padding: '1px 6px', borderRadius: '0px',
                          background: 'rgba(99,102,241,0.15)', color: '#6366F1', fontWeight: 600,
                        }}>
                          MODE: {batch.mode}
                        </span>
                        <span style={{
                          fontSize: '10px', padding: '1px 6px', borderRadius: '0px',
                          background: 'rgba(245,158,11,0.15)', color: '#F59E0B', fontWeight: 600,
                        }}>
                          POLICY v{batch.policy_version || '1.0'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                        Requested by <strong style={{ color: 'var(--ink)' }}>{batch.requester_name || batch.requester_email || 'Peer User'}</strong> · {new Date(batch.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleOpenApprove(batch)}
                      style={{
                        padding: '6px 14px', borderRadius: '0px', fontSize: '12px', fontWeight: 600,
                        background: '#E8F5E9', border: '1px solid #C8E6C9',
                        color: '#1B5E20', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => handleOpenReject(batch)}
                      style={{
                        padding: '6px 14px', borderRadius: '0px', fontSize: '12px', fontWeight: 600,
                        background: 'var(--signal-soft)', border: '1px solid #E0B4B0',
                        color: 'var(--signal)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>

                {flags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--ink-soft)', marginRight: '2px' }}>Triggers:</span>
                    {flags.map((flagKey) => {
                      const cfg = POLICY_FLAG_LABELS[flagKey] || { label: flagKey, color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' };
                      return (
                        <span
                          key={flagKey}
                          style={{
                            padding: '2px 8px', borderRadius: '0px', fontSize: '11px', fontWeight: 600,
                            background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`,
                          }}
                        >
                          ⚠ {cfg.label}
                        </span>
                      );
                    })}
                  </div>
                )}

                <div style={{
                  padding: '10px 14px', borderRadius: '0px',
                  background: 'var(--paper-dim)', border: '1px solid var(--rule)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px',
                  color: 'var(--ink-soft)', flexWrap: 'wrap', gap: '10px',
                }}>
                  <div>
                    Eligible Actions: <strong style={{ color: '#10B981' }}>{batch.eligible_count}</strong> · Blocked: <strong style={{ color: batch.blocked_count > 0 ? 'var(--signal)' : 'var(--ink-soft)' }}>{batch.blocked_count}</strong>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--ink-soft)' }}>
                    PREVIEW HASH: {batch.preview_hash?.slice(0, 16)}…
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {activeBatch && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(10, 10, 10, 0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                background: 'var(--paper)',
                border: '1px solid var(--rule)', borderRadius: '0px',
                width: '100%', maxWidth: '480px', padding: '24px',
              }}
            >
              <h4 style={{ margin: '0 0 8px', fontSize: '17px', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {dialogType === 'approve' ? '✅ Approve Governed Operation' : '🛑 Reject Governed Operation'}
              </h4>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.5' }}>
                {dialogType === 'approve'
                  ? 'Your approval grants authorization for this batch to be executed atomically under row-level locking. Stale actions will be safely re-validated.'
                  : 'Rejection is strictly terminal. The requester cannot execute or re-open this batch and must generate a new preview.'}
              </p>

              <label style={{ display: 'block', fontSize: '12px', color: 'var(--ink)', marginBottom: '6px' }}>
                {dialogType === 'approve' ? 'Review Comments (Optional)' : 'Rejection Reason (Required, min 10 characters)'}
              </label>
              <textarea
                value={decisionComment}
                onChange={(e) => setDecisionComment(e.target.value)}
                placeholder={dialogType === 'approve' ? 'Add sign-off notes…' : 'Explain why this operation is rejected…'}
                style={{
                  width: '100%', minHeight: '90px', padding: '10px 12px', boxSizing: 'border-box',
                  background: 'var(--paper-dim)', border: '1px solid var(--rule)',
                  borderRadius: '0px', color: 'var(--ink)', fontSize: '13px', outline: 'none', resize: 'vertical',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  onClick={handleCloseDialog}
                  disabled={submitting}
                  style={{
                    padding: '8px 16px', borderRadius: '0px', fontSize: '13px', fontWeight: 600,
                    background: 'transparent', border: '1px solid var(--rule)',
                    color: 'var(--ink)', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitDecision}
                  disabled={submitting || (dialogType === 'reject' && decisionComment.trim().length < 10)}
                  style={{
                    padding: '8px 20px', borderRadius: '0px', fontSize: '13px', fontWeight: 600,
                    border: 'none', cursor: 'pointer',
                    background: dialogType === 'approve' ? 'var(--ink)' : 'var(--signal)',
                    color: 'var(--paper)',
                    opacity: (dialogType === 'reject' && decisionComment.trim().length < 10) ? 0.5 : 1,
                  }}
                >
                  {submitting ? 'Submitting…' : (dialogType === 'approve' ? 'Confirm Approval' : 'Confirm Rejection')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PendingApprovalsQueue;
