import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import Icon from '../common/Icon';
import EmptyState from '../common/EmptyState';
import SkeletonLoader from '../common/SkeletonLoader';
import { PortfolioAnalyticsApi } from '../../services/portfolioAnalyticsApi';
import { useToast } from '../../context/ToastContext';
import { buttonMotion } from '../../styles/motion';
import BulkOperationModal from './BulkOperationModal';

export const PortfolioAttentionQueue = () => {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterReason, setFilterReason] = useState('ALL');
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const limit = 8;
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchAttentionQueue = async () => {
    setLoading(true);
    try {
      const res = await PortfolioAnalyticsApi.getPortfolioAttentionQueue({
        page,
        limit,
        reason: filterReason !== 'ALL' ? filterReason : undefined,
        priority: filterPriority !== 'ALL' ? filterPriority : undefined
      });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      toast(err.message || 'Failed to load attention queue', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttentionQueue();
  }, [page, filterReason, filterPriority]);

  useEffect(() => { setSelectedIds(new Set()); }, [items]);

  const handleItemClick = (item) => {
    navigate(`/document/${item.documentId}/actions?action=${item.actionId}`);
  };

  const toggleSelect = (e, actionId) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(actionId)) next.delete(actionId); else next.add(actionId);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(items.map(i => i.actionId)));
  const clearSelection = () => setSelectedIds(new Set());

  const getReasonBadge = (reason) => {
    switch (reason) {
      case 'ESCALATED':
        return { label: 'ESCALATED', bg: 'rgba(239, 68, 68, 0.2)', color: '#EF4444', border: 'rgba(239, 68, 68, 0.4)' };
      case 'CRITICAL_PRIORITY':
        return { label: 'CRITICAL', bg: 'rgba(239, 68, 68, 0.15)', color: '#F87171', border: 'rgba(239, 68, 68, 0.3)' };
      case 'OVERDUE':
        return { label: 'OVERDUE', bg: 'rgba(245, 158, 11, 0.2)', color: '#F59E0B', border: 'rgba(245, 158, 11, 0.4)' };
      case 'UNASSIGNED_HIGH_RISK':
        return { label: 'UNASSIGNED', bg: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA', border: 'rgba(59, 130, 246, 0.4)' };
      default:
        return { label: reason, bg: 'var(--paper-dim)', color: 'var(--ink)', border: 'var(--rule)' };
    }
  };

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <div className="flex gap-8" style={{ alignItems: 'center' }}>
            <span className="dot dot-amber" />
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>
              Cross-Contract Attention Queue
            </h3>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#F59E0B',
                background: 'rgba(245, 158, 11, 0.12)',
                padding: '2px 8px',
                borderRadius: '12px',
                border: '1px solid rgba(245, 158, 11, 0.25)'
              }}
            >
              {total} Urgent Items
            </span>
          </div>
          <p className="text-muted small" style={{ margin: '4px 0 0 0' }}>
            Prioritized multi-factor triage list across all contracts. Click any row to navigate directly to its document action center.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <select
            className="input-select input-sm"
            value={filterReason}
            onChange={(e) => { setFilterReason(e.target.value); setPage(1); }}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            <option value="ALL">All Attention Reasons</option>
            <option value="ESCALATED">🚨 Escalated Only</option>
            <option value="CRITICAL_PRIORITY">🔴 Critical Priority Only</option>
            <option value="OVERDUE">⏰ Overdue Only</option>
            <option value="UNASSIGNED_HIGH_RISK">👤 Unassigned High-Risk</option>
          </select>

          <select
            className="input-select input-sm"
            value={filterPriority}
            onChange={(e) => { setFilterPriority(e.target.value); setPage(1); }}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            <option value="ALL">All Priority Bands</option>
            <option value="CRITICAL">Critical (80–100)</option>
            <option value="HIGH">High (70–79)</option>
            <option value="MEDIUM">Medium (40–69)</option>
            <option value="LOW">Low (0–39)</option>
          </select>
        </div>
      </div>

      {items.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 4px',
          borderBottom: selectedIds.size > 0 ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
          marginBottom: '4px', transition: 'border-color 0.2s',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: 'rgba(255,255,255,0.5)', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={items.length > 0 && selectedIds.size === items.length}
              onChange={e => e.target.checked ? selectAll() : clearSelection()}
              style={{ cursor: 'pointer' }}
            />
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
          </label>
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={clearSelection}
                style={{
                  padding: '4px 10px', borderRadius: '6px', fontSize: '11px',
                  background: 'transparent', color: 'rgba(255,255,255,0.4)',
                  border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                }}
              >
                Clear
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => setShowBulkModal(true)}
                style={{
                  padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.8) 0%, rgba(139,92,246,0.8) 100%)',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  boxShadow: '0 0 16px rgba(99,102,241,0.25)',
                }}
              >
                ⚡ Bulk Ops ({selectedIds.size})
              </motion.button>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '20px 0' }}>
          <SkeletonLoader.Card count={3} height="64px" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="check"
          title="Attention Queue Clear"
          desc="No contract actions currently require urgent executive intervention."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <AnimatePresence mode="popLayout">
            {items.map((item) => (
              <motion.div
                key={item.actionId}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                onClick={() => handleItemClick(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  padding: '14px 18px',
                  borderRadius: '10px',
                  background: selectedIds.has(item.actionId)
                    ? 'rgba(99,102,241,0.08)'
                    : item.isEscalated
                    ? 'linear-gradient(90deg, rgba(239, 68, 68, 0.08), rgba(255, 255, 255, 0.02))'
                    : 'rgba(255, 255, 255, 0.02)',
                  border: selectedIds.has(item.actionId)
                    ? '1px solid rgba(99,102,241,0.35)'
                    : item.isEscalated
                    ? '1px solid rgba(239, 68, 68, 0.3)'
                    : '1px solid rgba(255, 255, 255, 0.06)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = item.isEscalated ? '#EF4444' : 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = item.isEscalated ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.06)';
                  e.currentTarget.style.background = item.isEscalated ? 'linear-gradient(90deg, rgba(239, 68, 68, 0.08), rgba(255, 255, 255, 0.02))' : 'rgba(255, 255, 255, 0.02)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.actionId)}
                    onClick={e => toggleSelect(e, item.actionId)}
                    onChange={() => {}}
                    style={{ cursor: 'pointer', flexShrink: 0, width: '16px', height: '16px', accentColor: '#6366F1' }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '44px',
                      height: '44px',
                      borderRadius: '8px',
                      background: item.attentionScore >= 80 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      border: `1px solid ${item.attentionScore >= 80 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`
                    }}
                  >
                    <span style={{ fontSize: '15px', fontWeight: 800, color: item.attentionScore >= 80 ? '#EF4444' : '#F59E0B' }}>
                      {item.attentionScore}
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 600, color: '#A1A1AA', textTransform: 'uppercase' }}>
                      SCORE
                    </span>
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>
                        {item.title}
                      </span>
                      {item.attentionReasons.map((r) => {
                        const style = getReasonBadge(r);
                        return (
                          <span
                            key={r}
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: style.bg,
                              color: style.color,
                              border: `1px solid ${style.border}`
                            }}
                          >
                            {style.label}
                          </span>
                        );
                      })}
                    </div>

                    <div className="flex gap-12 mt-4" style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                      <span>📄 <strong style={{ color: 'var(--ink)' }}>{item.documentName}</strong></span>
                      <span>·</span>
                      <span>Owner: <strong style={{ color: item.ownerName ? 'var(--ink)' : '#F59E0B' }}>{item.ownerName || 'Unassigned'}</strong></span>
                      {item.daysOverdue > 0 && (
                        <>
                          <span>·</span>
                          <span style={{ color: '#EF4444', fontWeight: 600 }}>⏰ {item.daysOverdue}d overdue</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: item.priorityScore >= 80 ? '#EF4444' : item.priorityScore >= 70 ? '#F59E0B' : '#60A5FA' }}>
                      Priority {item.priorityScore}
                    </div>
                    <span className="badge badge-outline" style={{ fontSize: '10px', marginTop: '2px' }}>
                      {item.status}
                    </span>
                  </div>
                  <span style={{ color: '#71717A', fontSize: '16px' }}>→</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {total > limit && (
            <div className="flex-between mt-16" style={{ alignItems: 'center' }}>
              <span className="text-muted small">
                Showing {items.length} of {total} items
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page * limit >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {showBulkModal && (
          <BulkOperationModal
            selectedActionIds={[...selectedIds]}
            actionItems={items.map(i => ({
              actionId: i.actionId,
              title: i.title,
              status: i.status,
              category: i.category || '',
            }))}
            onClose={() => setShowBulkModal(false)}
            onComplete={() => {
              clearSelection();
              fetchAttentionQueue();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default PortfolioAttentionQueue;
