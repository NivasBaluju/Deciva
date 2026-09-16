import React from 'react';
import { motion } from 'motion/react';
import Icon from '../common/Icon';

export const SecurityGauge = ({ score = 100, mfaEnabled = false, auditValid = true, reasons = [] }) => {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

  const scoreColor = clampedScore >= 90 ? '#10B981' : clampedScore >= 70 ? '#3B82F6' : clampedScore >= 50 ? '#F59E0B' : '#EF4444';
  const grade = clampedScore >= 95 ? 'INSTITUTIONAL A+' : clampedScore >= 80 ? 'ENTERPRISE A' : clampedScore >= 60 ? 'COMMERCIAL B' : 'VULNERABLE C';

  return (
    <div className="card security-gauge-card">
      <div className="security-gauge-header">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#FFFFFF', margin: '2px 0 0' }}>
            Zero-Trust Enclave Posture
          </h3>
        </div>
        <span className="badge badge-ok" style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#10B981' }}>
          <Icon.check /> {grade}
        </span>
      </div>

      <div className="security-gauge-body">
        <div className="gauge-circle-container">
          <svg className="gauge-svg" viewBox="0 0 140 140">
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.07)"
              strokeWidth="10"
            />
            <motion.circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={scoreColor}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              style={{
                transformOrigin: 'center',
                transform: 'rotate(-90deg)'
              }}
            />
          </svg>
          <div className="gauge-score-overlay">
            <span className="gauge-score-number" style={{ color: scoreColor }}>{clampedScore}</span>
            <span className="gauge-score-label">/ 100</span>
          </div>
        </div>

        <div className="gauge-pillars-list">
          <div className="gauge-pillar-item">
            <div className="gauge-pillar-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10B981' }}>
              <Icon.shield />
            </div>
            <div className="gauge-pillar-text">
              <strong>Cryptographic Non-Repudiation</strong>
              <p>{auditValid ? 'SHA-256 cryptographic hash chain intact' : 'Chain integrity warning'}</p>
            </div>
            <span className={`badge ${auditValid ? 'badge-ok' : 'badge-danger'}`} style={{ fontSize: '11px' }}>
              {auditValid ? 'VERIFIED' : 'TAMPERED'}
            </span>
          </div>

          <div className="gauge-pillar-item">
            <div className="gauge-pillar-icon" style={{ background: mfaEnabled ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)', color: mfaEnabled ? '#10B981' : '#F59E0B' }}>
              <Icon.lock />
            </div>
            <div className="gauge-pillar-text">
              <strong>Multi-Factor Hardware Auth</strong>
              <p>{mfaEnabled ? 'RFC 6238 TOTP Active & Enforced' : 'MFA not currently configured'}</p>
            </div>
            <span className={`badge ${mfaEnabled ? 'badge-ok' : 'badge-warn'}`} style={{ fontSize: '11px' }}>
              {mfaEnabled ? 'ACTIVE' : 'OPTIONAL'}
            </span>
          </div>

          <div className="gauge-pillar-item">
            <div className="gauge-pillar-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3B82F6' }}>
              <Icon.document />
            </div>
            <div className="gauge-pillar-text">
              <strong>At-Rest Data Cipher</strong>
              <p>AES-256-GCM hardware key isolation</p>
            </div>
            <span className="badge badge-ok" style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60A5FA', fontSize: '11px' }}>
              256-BIT
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityGauge;
