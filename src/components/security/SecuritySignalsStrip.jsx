import React from 'react';
import Icon from '../common/Icon';

export const SecuritySignalsStrip = ({ zt, isAuditValid, activeSessionsCount }) => {
  const mfaActive = !!zt?.mfaEnabled;
  const reasons = zt?.reasons || [];
  const hasFpChange = reasons.some(r => r.toLowerCase().includes('fingerprint'));
  const hasOldSession = reasons.some(r => r.toLowerCase().includes('12 hours'));

  const signals = [
    {
      id: 'mfa',
      label: mfaActive ? 'MFA Hardware Verified' : 'MFA Optional',
      status: mfaActive ? 'ok' : 'warn',
      icon: mfaActive ? '✓' : '!'
    },
    {
      id: 'vault',
      label: 'AES-256-GCM Vault Active',
      status: 'ok',
      icon: '✓'
    },
    {
      id: 'ledger',
      label: isAuditValid ? 'Cryptographic Chain Intact' : 'Ledger Anomaly',
      status: isAuditValid ? 'ok' : 'danger',
      icon: isAuditValid ? '✓' : '⚠'
    },
    {
      id: 'network',
      label: hasFpChange ? 'Network Fingerprint Shift' : 'Network Fingerprint Stable',
      status: hasFpChange ? 'warn' : 'ok',
      icon: hasFpChange ? '!' : '✓'
    },
    {
      id: 'sessions',
      label: `${activeSessionsCount || 1} Enclave${activeSessionsCount === 1 ? '' : 's'} Authorized`,
      status: 'ok',
      icon: '✓'
    },
    ...(hasOldSession ? [{
      id: 'age',
      label: 'Session Active > 12h',
      status: 'warn',
      icon: '!'
    }] : [])
  ];

  return (
    <div className="security-signals-strip">
      <div className="signals-label">
        <span className="dot dot-emerald" />
        <span>SECURITY SIGNALS</span>
      </div>
      <div className="signals-list">
        {signals.map((s) => (
          <div key={s.id} className={`signal-chip signal-${s.status}`}>
            <span className="signal-icon">{s.icon}</span>
            <span className="signal-text">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SecuritySignalsStrip;
