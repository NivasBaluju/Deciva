import React, { useState, useEffect } from 'react';
import Icon from '../common/Icon';
import SkeletonLoader from '../common/SkeletonLoader';
import { PortfolioAnalyticsApi } from '../../services/portfolioAnalyticsApi';
import { useToast } from '../../context/ToastContext';

export const PortfolioWorkload = () => {
  const [workloadData, setWorkloadData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;
    async function fetchWorkload() {
      try {
        const res = await PortfolioAnalyticsApi.getPortfolioWorkload();
        if (isMounted) setWorkloadData(res);
      } catch (err) {
        if (isMounted) toast(err.message || 'Failed to load team workload', 'error');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchWorkload();
    return () => { isMounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="card" style={{ padding: '24px' }}>
        <SkeletonLoader.Text lines={2} width="240px" />
        <div style={{ marginTop: '16px' }}>
          <SkeletonLoader.Card count={2} height="60px" />
        </div>
      </div>
    );
  }

  const { owners = [], unassigned = {} } = workloadData || {};

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div className="flex-between" style={{ alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div className="flex gap-8" style={{ alignItems: 'center' }}>
            <span className="dot dot-indigo" />
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>
              Team Workload &amp; Capacity
            </h3>
          </div>
          <p className="text-muted small" style={{ margin: '4px 0 0 0' }}>
            Action allocation, active risk backlog, and completion across assigned team members.
          </p>
        </div>
      </div>

      {unassigned.unassignedActions > 0 && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '0px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>👤</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#F59E0B' }}>
                {unassigned.unassignedActions} Unassigned Active Actions
              </div>
              <div className="text-muted small">
                Includes {unassigned.unassignedCriticalActions} critical and {unassigned.unassignedOverdueActions} overdue items.
              </div>
            </div>
          </div>
          <span className="badge badge-warn" style={{ fontSize: '11px' }}>
            Needs Assignment
          </span>
        </div>
      )}

      {owners.length === 0 ? (
        <p className="text-muted small" style={{ margin: '8px 0' }}>
          No actions are currently assigned to team members.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {owners.map((owner) => (
            <div
              key={owner.ownerId}
              style={{
                padding: '12px 16px',
                borderRadius: '0px',
                background: 'var(--paper-dim)',
                border: '1px solid var(--rule)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '14px' }}>
                  {owner.ownerName}
                </div>
                {owner.ownerEmail && (
                  <div className="text-muted small" style={{ fontSize: '11px' }}>
                    {owner.ownerEmail}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ textAlign: 'center', minWidth: '60px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#60A5FA' }}>
                    {owner.activeActions}
                  </div>
                  <div className="text-muted small" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                    Active
                  </div>
                </div>

                <div style={{ textAlign: 'center', minWidth: '60px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: owner.criticalActions > 0 ? '#EF4444' : '#A1A1AA' }}>
                    {owner.criticalActions}
                  </div>
                  <div className="text-muted small" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                    Critical
                  </div>
                </div>

                <div style={{ textAlign: 'center', minWidth: '60px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: owner.overdueActions > 0 ? '#F59E0B' : '#A1A1AA' }}>
                    {owner.overdueActions}
                  </div>
                  <div className="text-muted small" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                    Overdue
                  </div>
                </div>

                <div style={{ textAlign: 'center', minWidth: '60px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#10B981' }}>
                    {owner.resolvedActions}
                  </div>
                  <div className="text-muted small" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                    Resolved
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PortfolioWorkload;
