import React, { useState, useEffect } from 'react';
import SkeletonLoader from '../common/SkeletonLoader';
import { PortfolioAnalyticsApi } from '../../services/portfolioAnalyticsApi';
import { useToast } from '../../context/ToastContext';

export const PortfolioDeadlinesAndEscalations = () => {
  const [deadlines, setDeadlines] = useState(null);
  const [escalations, setEscalations] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;
    async function fetchMetrics() {
      try {
        const [dRes, eRes] = await Promise.all([
          PortfolioAnalyticsApi.getPortfolioDeadlines(),
          PortfolioAnalyticsApi.getPortfolioEscalations()
        ]);
        if (isMounted) {
          setDeadlines(dRes);
          setEscalations(eRes);
        }
      } catch (err) {
        if (isMounted) toast(err.message || 'Failed to load deadlines & escalations', 'error');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchMetrics();
    return () => { isMounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-2 gap-16">
        <SkeletonLoader.Card count={1} height="160px" />
        <SkeletonLoader.Card count={1} height="160px" />
      </div>
    );
  }

  const { overdueActions = 0, dueToday = 0, dueSoon = 0, upcoming = 0, averageDaysOverdue = 0, longestOverdueAction } = deadlines || {};
  const { totalEscalatedActions = 0, overdueEscalations = 0, ignoredCriticalEscalations = 0, unassignedHighRiskEscalations = 0, documentsWithEscalations = 0, escalationRate = 0 } = escalations || {};

  return (
    <div className="grid grid-2 gap-16">
      <div className="card" style={{ padding: '20px' }}>
        <div className="flex-between" style={{ alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <div className="flex gap-8" style={{ alignItems: 'center' }}>
              <span className="dot dot-amber" />
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>
                Portfolio Deadline Schedule
              </h4>
            </div>
            <p className="text-muted small" style={{ margin: '2px 0 0 0' }}>
              Active contract deadlines grouped by urgency.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '12px', borderRadius: '0px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <span className="text-muted small" style={{ display: 'block', color: '#EF4444', fontWeight: 600 }}>Overdue</span>
            <span style={{ fontSize: '22px', fontWeight: 800, color: '#EF4444' }}>
              {overdueActions}
            </span>
            <span className="text-muted small" style={{ display: 'block', fontSize: '11px' }}>
              Avg: {averageDaysOverdue}d overdue
            </span>
          </div>

          <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '12px', borderRadius: '0px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
            <span className="text-muted small" style={{ display: 'block', color: '#F59E0B', fontWeight: 600 }}>Due Soon (0-3d)</span>
            <span style={{ fontSize: '22px', fontWeight: 800, color: '#F59E0B' }}>
              {dueSoon + dueToday}
            </span>
            <span className="text-muted small" style={{ display: 'block', fontSize: '11px' }}>
              {dueToday} due today
            </span>
          </div>

          <div style={{ background: 'var(--paper-dim)', padding: '12px', borderRadius: '0px', border: '1px solid var(--rule)' }}>
            <span className="text-muted small" style={{ display: 'block' }}>Upcoming (&gt; 3d)</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)' }}>
              {upcoming}
            </span>
          </div>

          <div style={{ background: 'var(--paper-dim)', padding: '12px', borderRadius: '0px', border: '1px solid var(--rule)' }}>
            <span className="text-muted small" style={{ display: 'block' }}>Max Overdue Action</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: longestOverdueAction ? '#F87171' : 'var(--ink-soft)', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {longestOverdueAction ? `${longestOverdueAction.daysOverdue}d: ${longestOverdueAction.title}` : 'None'}
            </span>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '20px' }}>
        <div className="flex-between" style={{ alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <div className="flex gap-8" style={{ alignItems: 'center' }}>
              <span className="dot dot-red" />
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>
                Portfolio Escalation Intelligence
              </h4>
            </div>
            <p className="text-muted small" style={{ margin: '2px 0 0 0' }}>
              Unresolved risks triggered by deterministic escalation rules.
            </p>
          </div>
          <span className="badge badge-danger" style={{ fontSize: '11px' }}>
            {escalationRate}% Rate
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div style={{ background: 'var(--paper-dim)', padding: '12px', borderRadius: '0px', border: '1px solid var(--rule)' }}>
            <span className="text-muted small" style={{ display: 'block' }}>Total Escalated</span>
            <span style={{ fontSize: '22px', fontWeight: 800, color: totalEscalatedActions > 0 ? '#EF4444' : '#10B981' }}>
              {totalEscalatedActions}
            </span>
            <span className="text-muted small" style={{ display: 'block', fontSize: '11px' }}>
              Across {documentsWithEscalations} contracts
            </span>
          </div>

          <div style={{ background: 'var(--paper-dim)', padding: '12px', borderRadius: '0px', border: '1px solid var(--rule)' }}>
            <span className="text-muted small" style={{ display: 'block' }}>Overdue &gt; 3d</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: overdueEscalations > 0 ? '#F59E0B' : 'var(--ink-soft)' }}>
              {overdueEscalations}
            </span>
            <span className="text-muted small" style={{ display: 'block', fontSize: '11px' }}>
              Rule: OVERDUE_3D
            </span>
          </div>

          <div style={{ background: 'var(--paper-dim)', padding: '12px', borderRadius: '0px', border: '1px solid var(--rule)' }}>
            <span className="text-muted small" style={{ display: 'block' }}>Ignored Critical &gt; 5d</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: ignoredCriticalEscalations > 0 ? '#EF4444' : 'var(--ink-soft)' }}>
              {ignoredCriticalEscalations}
            </span>
            <span className="text-muted small" style={{ display: 'block', fontSize: '11px' }}>
              Rule: IGNORED_CRITICAL_5D
            </span>
          </div>

          <div style={{ background: 'var(--paper-dim)', padding: '12px', borderRadius: '0px', border: '1px solid var(--rule)' }}>
            <span className="text-muted small" style={{ display: 'block' }}>Unassigned High-Risk</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: unassignedHighRiskEscalations > 0 ? '#60A5FA' : 'var(--ink-soft)' }}>
              {unassignedHighRiskEscalations}
            </span>
            <span className="text-muted small" style={{ display: 'block', fontSize: '11px' }}>
              Rule: UNASSIGNED_HIGH_RISK_3D
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortfolioDeadlinesAndEscalations;
