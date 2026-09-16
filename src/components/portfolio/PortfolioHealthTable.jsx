import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../common/Icon';
import EmptyState from '../common/EmptyState';
import SkeletonLoader from '../common/SkeletonLoader';
import { PortfolioAnalyticsApi } from '../../services/portfolioAnalyticsApi';
import { useToast } from '../../context/ToastContext';
import { fmtDate } from '../../utils/formatters';

export const PortfolioHealthTable = () => {
  const [contracts, setContracts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 10;
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchContracts = async () => {
    setLoading(true);
    try {
      const res = await PortfolioAnalyticsApi.getPortfolioContractHealth({ page, limit });
      setContracts(res.contracts || []);
      setTotal(res.total || 0);
    } catch (err) {
      toast(err.message || 'Failed to load contract health rankings', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, [page]);

  const getHealthBadge = (grade) => {
    switch (grade) {
      case 'EXCELLENT':
        return { color: '#10B981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' };
      case 'GOOD':
        return { color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)' };
      case 'ATTENTION':
        return { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' };
      case 'AT_RISK':
        return { color: '#F97316', bg: 'rgba(249, 115, 22, 0.12)', border: 'rgba(249, 115, 22, 0.3)' };
      case 'CRITICAL':
      default:
        return { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)' };
    }
  };

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div className="flex-between" style={{ alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div className="flex gap-8" style={{ alignItems: 'center' }}>
            <span className="dot dot-cyan" />
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>
              Contract Governance Health Ranking
            </h3>
          </div>
          <p className="text-muted small" style={{ margin: '4px 0 0 0' }}>
            Individual contracts ranked by operational risk, unresolved backlog, and completion rate.
          </p>
        </div>
        <span className="text-muted small">{total} Contracts</span>
      </div>

      {loading ? (
        <div style={{ padding: '20px 0' }}>
          <SkeletonLoader.Card count={2} height="80px" />
        </div>
      ) : contracts.length === 0 ? (
        <EmptyState
          icon="document"
          title="No Contracts in Portfolio"
          desc="Upload contracts to begin automated portfolio governance tracking."
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-soft)', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Contract Name</th>
                <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'center' }}>Health Score</th>
                <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'center' }}>Active Actions</th>
                <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'center' }}>Critical / Overdue</th>
                <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'center' }}>Resolution %</th>
                <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => {
                const badge = getHealthBadge(c.healthGrade);
                return (
                  <tr
                    key={c.documentId}
                    onClick={() => navigate(`/document/${c.documentId}/actions`)}
                    style={{
                      borderBottom: '1px solid var(--rule)',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--paper-dim)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px', minWidth: '220px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.documentName}</div>
                      <div className="text-muted small" style={{ fontSize: '11px' }}>
                        Last activity {fmtDate(c.lastActivityAt)}
                      </div>
                    </td>

                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '0px',
                          background: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                          fontWeight: 700,
                          fontSize: '12.5px'
                        }}
                      >
                        {c.healthScore} <span style={{ fontSize: '10px', opacity: 0.8 }}>({c.healthGrade})</span>
                      </span>
                    </td>

                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: 'var(--ink)' }}>
                      {c.activeActions} <span className="text-muted small">/ {c.totalActions}</span>
                    </td>

                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                        {c.criticalActions > 0 && (
                          <span className="badge badge-danger" style={{ fontSize: '10.5px' }}>
                            {c.criticalActions} Critical
                          </span>
                        )}
                        {c.overdueActions > 0 && (
                          <span className="badge badge-warn" style={{ fontSize: '10.5px' }}>
                            {c.overdueActions} Overdue
                          </span>
                        )}
                        {c.escalatedActions > 0 && (
                          <span className="badge badge-danger" style={{ fontSize: '10.5px' }}>
                            {c.escalatedActions} Escalated
                          </span>
                        )}
                        {c.criticalActions === 0 && c.overdueActions === 0 && c.escalatedActions === 0 && (
                          <span className="badge badge-ok" style={{ fontSize: '10.5px' }}>
                            ✓ Clean
                          </span>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                        <div style={{ width: '60px', height: '6px', background: 'var(--rule)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${c.resolutionRate}%`, background: '#10B981' }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)' }}>
                          {c.resolutionRate}%
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ padding: '4px 10px', fontSize: '11.5px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/document/${c.documentId}/actions`);
                        }}
                      >
                        Action Center →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {total > limit && (
            <div className="flex-between mt-16" style={{ alignItems: 'center' }}>
              <span className="text-muted small">
                Showing {contracts.length} of {total} contracts
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
    </div>
  );
};

export default PortfolioHealthTable;
