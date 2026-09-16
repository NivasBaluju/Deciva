import React, { useState } from 'react';
import { motion } from 'motion/react';

export const ActivityChart = ({ auditBlocks = [], sessions = [] }) => {
  const [activeRange, setActiveRange] = useState('7d');
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const dataPoints = [
    { label: 'Mon', logins: 18, docs: 24, threats: 1, height: 42 },
    { label: 'Tue', logins: 29, docs: 38, threats: 2, height: 68 },
    { label: 'Wed', logins: 22, docs: 19, threats: 0, height: 39 },
    { label: 'Thu', logins: 34, docs: 45, threats: 3, height: 82 },
    { label: 'Fri', logins: 41, docs: 52, threats: 1, height: 95 },
    { label: 'Sat', logins: 15, docs: 12, threats: 0, height: 26 },
    { label: 'Sun (Today)', logins: 38, docs: 49, threats: 1, height: 88 }
  ];

  const totalEvents = auditBlocks.length || 124;
  const activeCount = sessions.filter(s => !s.revoked).length || 11;

  return (
    <div className="card security-chart-card">
      <div className="security-chart-header">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#FFFFFF', margin: '2px 0 0' }}>
            Authentication & Audit Event Velocity
          </h3>
        </div>
        <div className="chart-range-selector">
          {['24h', '7d', '30d'].map((r) => (
            <button
              key={r}
              className={`range-btn ${activeRange === r ? 'active' : ''}`}
              onClick={() => setActiveRange(r)}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-kpi-strip">
        <div className="chart-kpi-item">
          <span className="kpi-label">Ledger Blocks</span>
          <span className="kpi-value">#{totalEvents}</span>
        </div>
        <div className="chart-kpi-item">
          <span className="kpi-label">Active Enclaves</span>
          <span className="kpi-value" style={{ color: '#10B981' }}>{activeCount}</span>
        </div>
        <div className="chart-kpi-item">
          <span className="kpi-label">Challenge Success</span>
          <span className="kpi-value" style={{ color: '#3B82F6' }}>98.6%</span>
        </div>
        <div className="chart-kpi-item">
          <span className="kpi-label">Threats Quarantined</span>
          <span className="kpi-value" style={{ color: '#F59E0B' }}>6</span>
        </div>
      </div>

      <div className="chart-visual-container">
        <div className="chart-bars-wrap">
          {dataPoints.map((dp, i) => {
            const isHovered = hoveredIndex === i;
            return (
              <div
                key={dp.label}
                className="chart-column"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {isHovered && (
                  <motion.div
                    className="chart-tooltip"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <strong style={{ color: '#FFFFFF', fontSize: '11px' }}>{dp.label}</strong>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '3px', fontSize: '10px' }}>
                      <span style={{ color: '#60A5FA' }}>🔑 {dp.logins} Logins</span>
                      <span style={{ color: '#34D399' }}>📄 {dp.docs} Docs</span>
                    </div>
                  </motion.div>
                )}

                <div className="chart-bar-track">
                  <motion.div
                    className="chart-bar-fill"
                    style={{
                      height: `${dp.height}%`,
                      background: isHovered
                        ? 'linear-gradient(to top, #3B82F6, #60A5FA)'
                        : 'linear-gradient(to top, rgba(59, 130, 246, 0.45), rgba(96, 165, 250, 0.8))'
                    }}
                    initial={{ height: 0 }}
                    animate={{ height: `${dp.height}%` }}
                    transition={{ duration: 0.6, delay: i * 0.06 }}
                  />
                </div>
                <span className="chart-col-label">{dp.label.split(' ')[0]}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="chart-legend">
        <span className="legend-item"><span className="legend-dot" style={{ background: '#3B82F6' }} /> Verified Auth Sessions</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: '#10B981' }} /> Document Ledger Hashes</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: '#F59E0B' }} /> Challenge Mitigations</span>
      </div>
    </div>
  );
};

export default ActivityChart;
