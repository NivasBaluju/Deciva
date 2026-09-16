import React, { useState, useEffect } from 'react';
import Api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import Icon from '../common/Icon';
import EmptyState from '../common/EmptyState';
import SkeletonLoader from '../common/SkeletonLoader';
import { fmtDate } from '../../utils/formatters';

export const DeadlinesTab = ({ doc, refreshTrigger }) => {
  const [deadlinesData, setDeadlinesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;
    async function loadDeadlines() {
      setLoading(true);
      try {
        const res = await Api.get(`/api/documents/${doc.id}/deadlines`);
        if (isMounted) setDeadlinesData(res);
      } catch (err) {
        if (isMounted) toast(err.message || 'Failed to extract deadlines', 'error');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadDeadlines();
    return () => {
      isMounted = false;
    };
  }, [doc.id, refreshTrigger, toast]);

  if (loading) {
    return <SkeletonLoader.Card count={2} height="140px" />;
  }

  const rawDeadlines = deadlinesData?.deadlines || [];

  const sorted = [...rawDeadlines].sort((a, b) => {
    if (a.deadlineDate && b.deadlineDate) {
      return new Date(a.deadlineDate) - new Date(b.deadlineDate);
    }
    if (a.deadlineDate && !b.deadlineDate) return -1;
    if (!a.deadlineDate && b.deadlineDate) return 1;
    return 0;
  });

  const getDeadlineBadge = (type) => {
    if (type === 'EXPIRATION') return <span className="badge badge-danger">Expiration Date</span>;
    if (type === 'PAYMENT_DUE') return <span className="badge badge-warn">Payment Milestone</span>;
    if (type === 'EFFECTIVE_DATE') return <span className="badge badge-ok">Effective Date</span>;
    return <span className="badge badge-info">{type.replace('_', ' ')}</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="card">
        <div className="flex-between">
          <div>
            <div className="card-title">
              <span className="dot dot-gold" />
              Contract Milestones &amp; Deadline Calendar
            </div>
            <p className="text-mid small">
              Automated extraction of chronological expirations, renewal notices, and payment terms.
            </p>
          </div>
          <span className="badge badge-neutral" style={{ fontSize: '12px' }}>
            {sorted.length} Milestones Detected
          </span>
        </div>

        {sorted.length === 0 ? (
          <div style={{ marginTop: '16px' }}>
            <EmptyState
              icon={<Icon.calendar />}
              title="No critical deadlines detected"
              sub="No explicit calendar milestones or relative payment terms were detected in this agreement."
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '20px', position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                top: '20px',
                bottom: '20px',
                left: '23px',
                width: '2px',
                background: 'var(--border)',
                zIndex: 0
              }}
            />

            {sorted.map((d, idx) => {
              const isExplicit = Boolean(d.deadlineDate);
              const displayDate = isExplicit ? fmtDate(d.deadlineDate) : d.relativeDeadline || 'Relative Term';

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    position: 'relative',
                    zIndex: 1
                  }}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: 'var(--radius-sm)',
                      background: isExplicit ? 'var(--royal)' : 'var(--navy)',
                      color: '#FFFFFF',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '11px',
                      lineHeight: 1.1,
                      textAlign: 'center',
                      flexShrink: 0,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                  >
                    <Icon.calendar stroke="white" />
                  </div>

                  <div
                    className="card"
                    style={{
                      flex: 1,
                      margin: 0,
                      padding: '14px 18px',
                      borderLeft: isExplicit ? '3px solid var(--royal)' : '3px solid var(--gold)'
                    }}
                  >
                    <div className="flex-between mb-6" style={{ alignItems: 'flex-start' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: 'var(--navy)' }}>{displayDate}</strong>
                        {!isExplicit && (
                          <span className="badge badge-neutral" style={{ marginLeft: '8px', fontSize: '10.5px' }}>
                            RELATIVE NOTICE
                          </span>
                        )}
                      </div>
                      <div>{getDeadlineBadge(d.deadlineType)}</div>
                    </div>

                    {d.sourceText && (
                      <p
                        className="text-mid small"
                        style={{
                          background: 'var(--off-white)',
                          padding: '8px 12px',
                          borderRadius: '4px',
                          margin: '8px 0 0',
                          border: '1px solid var(--border)',
                          fontFamily: 'var(--font-mono, monospace)'
                        }}
                      >
                        "{d.sourceText}"
                      </p>
                    )}

                    <div className="text-lo small mt-6" style={{ fontSize: '11px' }}>
                      Extraction Confidence: {Math.round((d.confidence || 0.9) * 100)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DeadlinesTab;
