import React, { useState } from 'react';
import Icon from '../common/Icon';
import ComplianceAuditApi from '../../services/complianceAuditApi';

export const EvidenceIntegrityCard = ({ manifest, evidence, onVerificationResult }) => {
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);

  const hash = manifest?.integrity?.canonicalHash || 'N/A';
  const algorithm = manifest?.integrity?.algorithm || 'SHA-256';
  const schemaVersion = manifest?.evidenceSchemaVersion || '1.0';
  const generatedAt = manifest?.generatedAt ? new Date(manifest.generatedAt).toLocaleString() : 'N/A';

  const handleCopyHash = () => {
    if (hash && hash !== 'N/A') {
      navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleVerifyNow = async () => {
    if (!evidence || !hash || hash === 'N/A') return;
    setVerifying(true);
    try {
      const res = await ComplianceAuditApi.verifyEvidence(evidence, hash);
      setVerificationResult(res);
      if (onVerificationResult) onVerificationResult(res);
    } catch (err) {
      setVerificationResult({ valid: false, error: err.message });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      className="card"
      style={{
        padding: '22px 24px',
        background: 'var(--card-bg)',
        border: '1px solid var(--rule)',
        position: 'relative',
        margin: 0
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              background: 'var(--paper-wash)',
              border: '1px solid var(--rule)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink)'
            }}
          >
            <Icon name="shield" size={18} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-head)' }}>
              Cryptographic Evidence Integrity
            </h4>
            <span className="text-lo small" style={{ fontSize: '12px' }}>
              Canonical SHA-256 Content Hash &amp; Schema Specification
            </span>
          </div>
        </div>

        <button
          onClick={handleVerifyNow}
          disabled={verifying}
          className="btn btn-outline btn-sm"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 600
          }}
        >
          <Icon name="check" size={14} />
          {verifying ? 'Verifying...' : 'Verify Hash Now'}
        </button>
      </div>

      <div
        style={{
          background: 'var(--paper-wash)',
          padding: '12px 16px',
          border: '1px solid var(--rule)',
          fontFamily: 'monospace, var(--font-mono)',
          fontSize: '12px',
          color: 'var(--ink-soft)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          wordBreak: 'break-all',
          marginBottom: '14px'
        }}
      >
        <span style={{ letterSpacing: '0.5px' }}>{hash}</span>
        <button
          onClick={handleCopyHash}
          title="Copy SHA-256 hash"
          className="btn btn-ghost btn-sm"
          style={{
            color: copied ? 'var(--emerald, #10B981)' : 'var(--ink-soft)',
            cursor: 'pointer',
            padding: '4px 8px',
            marginLeft: '12px',
            flexShrink: 0,
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {verificationResult && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '14px',
            fontSize: '12.5px',
            background: verificationResult.valid ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
            border: `1px solid ${verificationResult.valid ? 'rgba(16, 185, 129, 0.3)' : 'var(--signal)'}`,
            color: verificationResult.valid ? '#10B981' : 'var(--signal)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <Icon name={verificationResult.valid ? 'check' : 'alertTriangle'} size={16} />
          <span>
            {verificationResult.valid
              ? 'Integrity Verified: Canonical SHA-256 hash strictly matches generated payload (Zero modification detected).'
              : 'Integrity Warning: Canonical hash mismatch or corrupted payload detected!'}
          </span>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          fontSize: '11.5px',
          borderTop: '1px solid var(--rule)',
          paddingTop: '12px'
        }}
      >
        <div>
          <span className="text-lo" style={{ marginRight: '6px' }}>Algorithm:</span>
          <strong style={{ color: 'var(--ink)' }}>{algorithm}</strong>
        </div>
        <div>
          <span className="text-lo" style={{ marginRight: '6px' }}>Schema Version:</span>
          <strong style={{ color: 'var(--ink)' }}>v{schemaVersion}</strong>
        </div>
        <div>
          <span className="text-lo" style={{ marginRight: '6px' }}>Export Type:</span>
          <strong style={{ color: 'var(--ink)' }}>{manifest?.exportType || 'CONTRACT_GOVERNANCE_AUDIT'}</strong>
        </div>
        <div>
          <span className="text-lo" style={{ marginRight: '6px' }}>Snapshot Time:</span>
          <span style={{ color: 'var(--ink-soft)' }}>{generatedAt}</span>
        </div>
      </div>
    </div>
  );
};

export default EvidenceIntegrityCard;
