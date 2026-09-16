import React from 'react';
import Icon from '../common/Icon';
import { fmtDate } from '../../utils/formatters';

export const ThreatBreakdown = ({ threats = [] }) => {
  const threatList = threats || [];
  const highCount = threatList.filter(t => t.severity === 'high').length;
  const medCount = threatList.filter(t => t.severity === 'medium').length;

  return (
    <div className="card">
      <div className="flex-between mb-16">
        <div>
          <div className="card-title" style={{ marginBottom: '2px' }}>
            <span className="dot dot-gold" />
            Threat Alerts & Quarantine
          </div>
          <p className="text-lo small" style={{ margin: 0 }}>
            Automated rate-limiting and zero-trust challenge intercepts.
          </p>
        </div>
        <span className="badge badge-ok" style={{ fontSize: '11px' }}>
          0 UNRESOLVED
        </span>
      </div>

      <div className="threat-summary-strip">
        <div className="threat-chip">
          <span className="threat-chip-dot" style={{ background: '#EF4444' }} />
          <span>High Severity Intercepts</span>
          <strong>{highCount}</strong>
        </div>
        <div className="threat-chip">
          <span className="threat-chip-dot" style={{ background: '#F59E0B' }} />
          <span>Medium Risk Challenges</span>
          <strong>{medCount}</strong>
        </div>
      </div>

      <div className="threat-feed-list">
        {threatList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: '#71717A' }}>
            <Icon.check />
            <p style={{ marginTop: '8px', fontSize: '13px' }}>No security threats detected.</p>
          </div>
        ) : (
          threatList.slice(0, 5).map((t) => (
            <div key={t.id} className="threat-item-card">
              <div className="threat-item-left">
                <span className={`badge ${t.severity === 'high' ? 'badge-danger' : 'badge-warn'}`} style={{ fontSize: '10px' }}>
                  {t.severity.toUpperCase()}
                </span>
                <div className="threat-item-desc">
                  <strong>{t.message}</strong>
                  <span className="threat-item-time">{fmtDate(t.created_at)}</span>
                </div>
              </div>
              <span className="badge badge-neutral" style={{ fontSize: '10px', background: 'rgba(255,255,255,0.06)' }}>
                MITIGATED
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ThreatBreakdown;
