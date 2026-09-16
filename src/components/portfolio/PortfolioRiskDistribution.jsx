import React, { useState, useEffect } from 'react';
import SkeletonLoader from '../common/SkeletonLoader';
import { PortfolioAnalyticsApi } from '../../services/portfolioAnalyticsApi';
import { useToast } from '../../context/ToastContext';

export const PortfolioRiskDistribution = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;
    async function fetchDistribution() {
      try {
        const res = await PortfolioAnalyticsApi.getPortfolioPriorityDistribution();
        if (isMounted) setData(res);
      } catch (err) {
        if (isMounted) toast(err.message || 'Failed to load risk distribution', 'error');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchDistribution();
    return () => { isMounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="card" style={{ padding: '24px' }}>
        <SkeletonLoader.Text lines={2} width="220px" />
        <div style={{ marginTop: '16px' }}>
          <SkeletonLoader.Card count={1} height="120px" />
        </div>
      </div>
    );
  }

  const { bands = {}, total = 0, averagePriorityScore = 0, highestActivePriority = 0 } = data || {};
  const { critical = 0, high = 0, medium = 0, low = 0 } = bands;

  const pct = (val) => (total > 0 ? ((val / total) * 100).toFixed(1) : '0.0');

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div className="flex-between" style={{ alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div className="flex gap-8" style={{ alignItems: 'center' }}>
            <span className="dot dot-red" />
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>
              Portfolio Risk &amp; Priority Distribution
            </h3>
          </div>
          <p className="text-muted small" style={{ margin: '4px 0 0 0' }}>
            Cross-contract priority distribution across standardized bands.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Avg. Priority Score</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>
            {averagePriorityScore} <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>/ 100</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
        <div>
          <div className="flex-between" style={{ fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: '#EF4444', fontWeight: 700 }}>Critical (80–100)</span>
            <span style={{ color: 'var(--ink)', fontWeight: 700 }}>
              {critical} <span className="text-muted small" style={{ fontWeight: 400 }}>({pct(critical)}%)</span>
            </span>
          </div>
          <div style={{ height: '8px', background: 'var(--rule)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct(critical)}%`, background: '#EF4444' }} />
          </div>
        </div>

        <div>
          <div className="flex-between" style={{ fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: '#F59E0B', fontWeight: 700 }}>High (70–79)</span>
            <span style={{ color: 'var(--ink)', fontWeight: 700 }}>
              {high} <span className="text-muted small" style={{ fontWeight: 400 }}>({pct(high)}%)</span>
            </span>
          </div>
          <div style={{ height: '8px', background: 'var(--rule)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct(high)}%`, background: '#F59E0B' }} />
          </div>
        </div>

        <div>
          <div className="flex-between" style={{ fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: '#60A5FA', fontWeight: 700 }}>Medium (40–69)</span>
            <span style={{ color: 'var(--ink)', fontWeight: 700 }}>
              {medium} <span className="text-muted small" style={{ fontWeight: 400 }}>({pct(medium)}%)</span>
            </span>
          </div>
          <div style={{ height: '8px', background: 'var(--rule)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct(medium)}%`, background: '#3B82F6' }} />
          </div>
        </div>

        <div>
          <div className="flex-between" style={{ fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--ink-soft)', fontWeight: 700 }}>Low (0–39)</span>
            <span style={{ color: 'var(--ink)', fontWeight: 700 }}>
              {low} <span className="text-muted small" style={{ fontWeight: 400 }}>({pct(low)}%)</span>
            </span>
          </div>
          <div style={{ height: '8px', background: 'var(--rule)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct(low)}%`, background: '#71717A' }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortfolioRiskDistribution;
