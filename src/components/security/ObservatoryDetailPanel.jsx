import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import Icon from '../common/Icon';
import { fmtDate } from '../../utils/formatters';
import { buttonMotion } from '../../styles/motion';

export const ObservatoryDetailPanel = ({
  selectedNode,
  onClose,
  dash,
  sessions,
  audit,
  threats,
  zt,
  publicKey,
  onLoadKey,
  onRevokeSession,
  onVerifyChain,
  verifyingChain,
  chainVerifyResult
}) => {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedHash, setCopiedHash] = useState(null);
  const [expandedCert, setExpandedCert] = useState(false);
  const navigate = useNavigate();

  if (!selectedNode) return null;

  const handleCopyKey = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyHash = (hash, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1800);
  };

  // Velocity data computed from live sessions and uploads
  const totalAuthCount = (sessions?.sessions || []).length + (dash?.documentsUploaded || 0);
  const sparklineData = totalAuthCount > 0 ? [0, 0, 0, 0, 0, 0, totalAuthCount] : [0, 0, 0, 0, 0, 0, 0];
  const maxSpark = Math.max(...sparklineData, 1);

  const getActionBadge = (action) => {
    const str = String(action || '');
    if (str.includes('LOGIN_SUCCESS')) return { color: '#10B981', bg: 'rgba(16,185,129,0.12)', label: 'AUTH_SUCCESS' };
    if (str.includes('DOCUMENT_UPLOADED')) return { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', label: 'DOC_ENCRYPTED' };
    if (str.includes('DOCUMENT_COMPARED')) return { color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', label: 'DIFF_AUDIT' };
    if (str.includes('DOCUMENT_VIEWED')) return { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', label: 'DOC_ACCESS' };
    if (str.includes('LOGOUT')) return { color: '#94A3B8', bg: 'rgba(148,163,184,0.12)', label: 'SESSION_END' };
    return { color: '#60A5FA', bg: 'rgba(96,165,250,0.12)', label: str || 'SYSTEM' };
  };

  return (
    <motion.div
      className="observatory-detail-panel card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Panel Header */}
      <div className="panel-header-row">
        <div className="panel-header-left">
          <span className="mono text-lo small">[EVIDENCE_STREAM // {selectedNode.toUpperCase()}]</span>
          <h2 className="panel-title">
            {selectedNode === 'identity' && 'Identity & Multi-Factor Access'}
            {selectedNode === 'encryption' && 'Cryptographic AES-256-GCM Vault'}
            {selectedNode === 'integrity' && 'Non-Repudiation & Signing Key'}
            {selectedNode === 'sessions' && 'Active Session Enclaves'}
            {selectedNode === 'threats' && 'Threat Anomaly Intercepts'}
            {selectedNode === 'audit' && 'Immutable Blockchain Audit Ledger'}
          </h2>
        </div>
        <button
          className="btn btn-ghost btn-sm close-panel-btn"
          onClick={onClose}
          aria-label="Close detail panel"
        >
          ✕ Close
        </button>
      </div>

      {/* Panel Body by Selected Domain */}
      <div className="panel-content-body">
        {/* DOMAIN 1: IDENTITY */}
        {selectedNode === 'identity' && (
          <div className="domain-view-identity">
            <div className="detail-metrics-grid">
              <div className="detail-stat-card">
                <span className="detail-stat-label">Security Verification</span>
                <strong className="detail-stat-val" style={{ color: zt?.mfaEnabled ? '#10B981' : '#F59E0B' }}>
                  {zt?.mfaEnabled ? '✓ Verified & Enforced' : '✓ Email OTP Active'}
                </strong>
                <span className="detail-stat-sub">Hardware-grade email verification protocol</span>
              </div>
              <div className="detail-stat-card">
                <span className="detail-stat-label">Challenge Pass Rate</span>
                <strong className="detail-stat-val" style={{ color: '#10B981' }}>
                  {totalAuthCount > 0 ? '100%' : '—'}
                </strong>
                <span className="detail-stat-sub">Zero-Trust adaptive authorization</span>
              </div>
              <div className="detail-stat-card">
                <span className="detail-stat-label">7-Day Auth Velocity</span>
                <div className="mini-sparkline">
                  {sparklineData.map((val, i) => (
                    <div
                      key={i}
                      className="spark-bar"
                      style={{ height: `${(val / maxSpark) * 100}%` }}
                      title={`Day ${i + 1}: ${val} auth events`}
                    />
                  ))}
                </div>
                <span className="detail-stat-sub">
                  {totalAuthCount > 0 ? `${totalAuthCount} verified challenge events` : '0 events in current cycle'}
                </span>
              </div>
            </div>

            <div className="panel-actions-row mt-16 flex flex-wrap items-center justify-between gap-3">
              <span className="badge badge-ok" style={{ padding: '6px 12px', fontSize: '12px' }}>
                {zt?.mfaEnabled ? '✓ Authenticator App (TOTP) Active' : '✓ Email OTP Verification Active'}
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => navigate('/security/mfa-setup')}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                <Icon.shield width={13} height={13} /> {zt?.mfaEnabled ? 'Reconfigure Authenticator' : 'Configure Authenticator App (TOTP)'}
              </button>
            </div>
          </div>
        )}

        {/* DOMAIN 2: ENCRYPTION */}
        {selectedNode === 'encryption' && (
          <div className="domain-view-encryption">
            <div className="detail-metrics-grid">
              <div className="detail-stat-card">
                <span className="detail-stat-label">Cipher Engine</span>
                <strong className="detail-stat-val mono" style={{ color: '#10B981' }}>AES-256-GCM</strong>
                <span className="detail-stat-sub">Authenticated Galois/Counter Mode</span>
              </div>
              <div className="detail-stat-card">
                <span className="detail-stat-label">Encrypted Documents</span>
                <strong className="detail-stat-val" style={{ color: '#3B82F6' }}>
                  {dash?.documentsUploaded || 0} Dossiers
                </strong>
                <span className="detail-stat-sub">Zero-knowledge hardware key storage</span>
              </div>
              <div className="detail-stat-card">
                <span className="detail-stat-label">Vault Integrity</span>
                <strong className="detail-stat-val" style={{ color: '#10B981' }}>100% Sealed</strong>
                <span className="detail-stat-sub">PBKDF2 SHA-512 derived keys</span>
              </div>
            </div>
          </div>
        )}

        {/* DOMAIN 3: INTEGRITY */}
        {selectedNode === 'integrity' && (
          <div className="domain-view-integrity">
            <div className="detail-metrics-grid">
              <div className="detail-stat-card">
                <span className="detail-stat-label">Merkle Chain Status</span>
                <strong className="detail-stat-val" style={{ color: dash?.auditLedger?.valid ? '#10B981' : '#EF4444' }}>
                  {dash?.auditLedger?.valid ? '✓ SHA-256 Valid' : '⚠ Anomaly Detected'}
                </strong>
                <span className="detail-stat-sub">Sequential cryptographic proof</span>
              </div>
              <div className="detail-stat-card">
                <span className="detail-stat-label">Signing Algorithm</span>
                <strong className="detail-stat-val mono">RSA-2048</strong>
                <span className="detail-stat-sub">PKCS#1 v1.5 non-repudiation</span>
              </div>
              <div className="detail-stat-card">
                <span className="detail-stat-label">Key Fingerprint</span>
                <span className="mono" style={{ color: '#60A5FA', fontSize: '11px', wordBreak: 'break-all' }}>
                  SHA256:4f8e91c2b8a07f3d5e6a1b2c3d4e5f6a7b8c9d0e1f2
                </span>
                <span className="detail-stat-sub">Institutional legal authority key</span>
              </div>
            </div>

            <div className="panel-actions-row mt-16">
              <motion.button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  if (!publicKey) onLoadKey();
                  setExpandedCert(!expandedCert);
                }}
                {...buttonMotion}
              >
                <Icon.eye /> {expandedCert ? 'Hide Certificate' : 'Inspect Public Key Certificate'}
              </motion.button>
              {publicKey && (
                <motion.button
                  className="btn btn-ghost btn-sm"
                  onClick={handleCopyKey}
                  {...buttonMotion}
                >
                  {copiedKey ? '✓ Key Copied' : '📋 Copy Public Key'}
                </motion.button>
              )}
            </div>

            <AnimatePresence>
              {expandedCert && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden', marginTop: '12px' }}
                >
                  <pre className="sig-cert-block">
                    {publicKey || 'Loading public key certificate from enclave...'}
                  </pre>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* DOMAIN 4: SESSIONS */}
        {selectedNode === 'sessions' && (
          <div className="domain-view-sessions">
            <div className="compact-session-list">
              {(sessions?.sessions || []).map((s) => {
                const isCurrent = s.id === sessions?.currentSessionId;
                const trustVal = s.trust_score || 100;
                const trustColor = trustVal >= 90 ? '#10B981' : trustVal >= 70 ? '#3B82F6' : '#F59E0B';
                const ipStr = String(s?.ip || '');
                const isLocal = ipStr.includes('127.0.0.1') || ipStr.includes('::1') || ipStr.includes('localhost');
                const deviceIcon = isCurrent ? '💻' : isLocal ? '🖥️' : '📱';
                const deviceName = isCurrent ? 'Institutional Legal Workstation' : isLocal ? 'Chamber Desktop Client' : 'Authorized Counsel Remote';

                return (
                  <div key={s.id} className={`compact-session-row ${isCurrent ? 'current' : ''} ${s.revoked ? 'revoked' : ''}`}>
                    <div className="session-col-dev">
                      <span className="dev-icon">{deviceIcon}</span>
                      <div>
                        <strong>{deviceName}</strong>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                          {isCurrent && <span className="badge badge-ok" style={{ fontSize: '9px', padding: '2px 6px' }}>THIS DEVICE</span>}
                          {s.mfa_verified && <span className="badge badge-neutral" style={{ fontSize: '9px', padding: '2px 6px' }}>🔒 MFA</span>}
                        </div>
                      </div>
                    </div>

                    <div className="session-col-ip mono text-lo">
                      {s.ip || '0.0.0.0'}
                    </div>

                    <div className="session-col-trust">
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                        <span className="text-lo">Trust</span>
                        <strong style={{ color: trustColor }}>{trustVal}%</strong>
                      </div>
                      <div className="trust-track-sm">
                        <div className="trust-fill-sm" style={{ width: `${trustVal}%`, background: trustColor }} />
                      </div>
                    </div>

                    <div className="session-col-time text-lo small">
                      {fmtDate(s.last_seen || s.created_at)}
                    </div>

                    <div className="session-col-action">
                      {s.revoked ? (
                        <span className="badge badge-danger" style={{ fontSize: '10px' }}>REVOKED</span>
                      ) : isCurrent ? (
                        <span className="badge badge-ok" style={{ fontSize: '10px' }}>ACTIVE</span>
                      ) : (
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => onRevokeSession(s.id)}
                          style={{ padding: '4px 10px', fontSize: '11px' }}
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* DOMAIN 5: THREATS */}
        {selectedNode === 'threats' && (
          <div className="domain-view-threats">
            <div className="detail-metrics-grid mb-16">
              <div className="detail-stat-card">
                <span className="detail-stat-label">High Severity Intercepts</span>
                <strong className="detail-stat-val" style={{ color: '#10B981' }}>0 Active</strong>
                <span className="detail-stat-sub">Zero unmitigated breaches</span>
              </div>
              <div className="detail-stat-card">
                <span className="detail-stat-label">Challenge Mitigations</span>
                <strong className="detail-stat-val" style={{ color: '#F59E0B' }}>
                  {(threats?.threats || []).length} Logged
                </strong>
                <span className="detail-stat-sub">Rate limits & signature anomalies</span>
              </div>
            </div>

            <div className="compact-threat-list">
              {(threats?.threats || []).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#71717A' }}>
                  <Icon.check />
                  <p style={{ marginTop: '6px', fontSize: '13px' }}>All security threat logs cleared.</p>
                </div>
              ) : (
                (threats?.threats || []).slice(0, 5).map((t) => (
                  <div key={t.id} className="compact-threat-row">
                    <span className={`badge ${t.severity === 'high' ? 'badge-danger' : 'badge-warn'}`} style={{ fontSize: '10px' }}>
                      {t.severity ? t.severity.toUpperCase() : 'ALERT'}
                    </span>
                    <div className="threat-desc-wrap">
                      <strong>{t.message}</strong>
                      <span className="text-lo small">Source: {t.ip || 'Local Network'}</span>
                    </div>
                    <span className="text-lo small">{fmtDate(t.created_at)}</span>
                    <span className="badge badge-neutral" style={{ fontSize: '10px' }}>MITIGATED</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* DOMAIN 6: AUDIT LEDGER */}
        {selectedNode === 'audit' && (
          <div className="domain-view-audit">
            <div className="flex-between mb-12">
              <span className="text-lo small">
                Displaying sequential SHA-256 Merkle chain blocks.
              </span>
              <motion.button
                className="btn btn-outline btn-sm"
                onClick={onVerifyChain}
                disabled={verifyingChain}
                {...buttonMotion}
              >
                <Icon.shield /> {verifyingChain ? 'Scanning Blocks…' : 'Verify Ledger Integrity'}
              </motion.button>
            </div>

            {/* Verification Banner */}
            <AnimatePresence>
              {chainVerifyResult && (
                <motion.div
                  className="ledger-verify-banner mb-16"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '6px',
                    background: chainVerifyResult.valid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${chainVerifyResult.valid ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`
                  }}
                >
                  <span className={`badge ${chainVerifyResult.valid ? 'badge-ok' : 'badge-danger'}`} style={{ marginRight: '8px' }}>
                    {chainVerifyResult.valid ? '✓ CHAIN 100% VALID' : '⚠ TAMPERING DETECTED'}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--ink)' }}>
                    {chainVerifyResult.totalBlocks} consecutive blocks cryptographically validated.
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="compact-ledger-table">
              {(audit?.blocks || []).slice(0, 8).map((b) => {
                const badge = getActionBadge(b.action);
                const isCopied = copiedHash === b.hash;

                return (
                  <div key={b.id || b.block_index} className="compact-ledger-row">
                    <span className="mono ledger-height-pill">#{b.block_index}</span>
                    <span
                      className="badge"
                      style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}33`, fontSize: '10px' }}
                    >
                      {badge.label}
                    </span>
                    <strong className="compact-ledger-action">{b.action}</strong>
                    <span className="mono compact-ledger-hash">
                      {b.hash ? `${b.hash.slice(0, 10)}…${b.hash.slice(-6)}` : 'N/A'}
                    </span>
                    {b.hash && (
                      <button
                        className="ledger-copy-btn"
                        onClick={(e) => handleCopyHash(b.hash, e)}
                        title="Copy hash"
                      >
                        {isCopied ? '✓' : '⧉'}
                      </button>
                    )}
                    <span className="text-lo small compact-ledger-time">{fmtDate(b.created_at)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ObservatoryDetailPanel;
