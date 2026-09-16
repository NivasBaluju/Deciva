import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Icon from '../common/Icon';
import SkeletonLoader from '../common/SkeletonLoader';
import EmptyState from '../common/EmptyState';
import { ActionStatusBadge, DueDateBadge, CategoryBadge } from '../actions/ActionStatusBadge';
import WorkflowAnalyticsApi from '../../services/workflowAnalyticsApi';
import { useToast } from '../../context/ToastContext';
import { buttonMotion } from '../../styles/motion';

export const ExecutiveAttentionQueue = ({ documentId, onSelectAction }) => {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState(null);

  const { toast } = useToast();

  const loadAttentionQueue = async (showToast = false) => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await WorkflowAnalyticsApi.getExecutiveAttentionQueue(documentId);
      setQueue(res.attentionQueue || []);
      if (showToast) toast('Attention queue updated', 'ok');
    } catch (err) {
      setError(err.message || 'Failed to load attention queue');
      toast(err.message || 'Failed to load attention queue', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttentionQueue(false);
  }, [documentId]);

  const handleEvaluateEscalations = async () => {
    if (!documentId) return;
    setEvaluating(true);
    try {
      const res = await WorkflowAnalyticsApi.evaluateEscalations(documentId);
      toast(
        res.newlyEscalatedCount > 0
          ? `Escalation evaluation complete: ${res.newlyEscalatedCount} new action(s) escalated`
          : 'Escalation evaluation complete: No new escalations',
        'ok'
      );
      await loadAttentionQueue(false);
    } catch (err) {
      toast(err.message || 'Failed to evaluate escalations', 'error');
    } finally {
      setEvaluating(false);
    }
  };

  if (loading && queue.length === 0) {
    return (
      <div className="card">
        <SkeletonLoader.Text lines={2} width="300px" />
        <div style={{ marginTop: '20px' }}>
          <SkeletonLoader.Card count={3} height="120px" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <p className="text-danger mb-16">{error}</p>
        <motion.button className="btn btn-secondary" onClick={() => loadAttentionQueue(true)} {...buttonMotion}>
          <Icon.refresh width={14} height={14} /> Retry
        </motion.button>
      </div>
    );
  }

  return (
    <div className="attention-queue-container">
      <div
        className="card mb-20"
        style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(15,23,42,0.6))',
          border: '1px solid rgba(239,68,68,0.3)'
        }}
      >
        <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div className="flex gap-8" style={{ alignItems: 'center', marginBottom: '6px' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#EF4444',
                  boxShadow: '0 0 8px #EF4444'
                }}
              />
              <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: '#FFF' }}>
                Executive Attention & Escalation Queue
              </h2>
            </div>
            <p className="text-mid small" style={{ margin: 0, maxWidth: '640px' }}>
              Surfacing high-risk items requiring urgent leadership review: actions that have breached deadlines, remained unattended, or reached critical thresholds.
            </p>
          </div>

          <div className="flex gap-8" style={{ alignItems: 'center' }}>
            <motion.button
              className="btn btn-secondary"
              onClick={handleEvaluateEscalations}
              disabled={evaluating}
              {...buttonMotion}
            >
              <Icon.refresh width={14} height={14} className={evaluating ? 'spin' : ''} />
              {evaluating ? 'Evaluating...' : 'Evaluate Escalations'}
            </motion.button>
          </div>
        </div>
      </div>

      {queue.length === 0 ? (
        <EmptyState
          icon="check"
          title="No Urgent Items in Attention Queue"
          message="All high-priority actions and contract deadlines are currently under active management with zero breached escalation thresholds."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {queue.map((item) => {
            const isCritical = item.priorityScore >= 80;
            const isOverdue = item.dueDate && new Date(item.dueDate) < new Date();

            return (
              <motion.div
                key={item.id}
                className="card"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  padding: '16px 20px',
                  border: item.isEscalated
                    ? '1px solid rgba(239, 68, 68, 0.4)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  background: item.isEscalated
                    ? 'rgba(239, 68, 68, 0.04)'
                    : 'rgba(255, 255, 255, 0.02)',
                  cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s'
                }}
                onClick={() => onSelectAction && onSelectAction(item.id)}
              >
                <div className="flex-between" style={{ alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '260px' }}>
                    <div className="flex gap-8" style={{ alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: isCritical ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: isCritical ? '#EF4444' : '#F59E0B',
                          border: `1px solid ${isCritical ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                        }}
                      >
                        Score: {item.priorityScore}
                      </span>

                      {item.isEscalated && (
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '4px',
                            background: '#EF4444',
                            color: '#FFF',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em'
                          }}
                        >
                          ESCALATED ({item.escalationRule || 'CRITICAL'})
                        </span>
                      )}

                      <ActionStatusBadge status={item.status} />
                      <CategoryBadge category={item.category} />
                      <DueDateBadge dueDate={item.dueDate} />
                    </div>

                    <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 600, color: '#FFF' }}>
                      {item.title}
                    </h3>

                    {item.isEscalated && item.escalationReason && (
                      <div
                        style={{
                          margin: '8px 0',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          fontSize: '12px',
                          color: '#FCA5A5'
                        }}
                      >
                        <strong>Escalation Trigger:</strong> {item.escalationReason}
                      </div>
                    )}

                    <div className="flex gap-16" style={{ alignItems: 'center', marginTop: '6px', fontSize: '12px', color: '#A1A1AA' }}>
                      <span>
                        <strong>Owner:</strong> {item.owner ? item.owner.name : 'Unassigned'}
                      </span>
                      <span>
                        <strong>Created:</strong> {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', alignSelf: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#60A5FA', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Open in Action Center <Icon.arrowRight width={13} height={13} />
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ExecutiveAttentionQueue;
