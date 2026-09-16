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
        padding: '20px',
        background: 'rgba(15, 23, 42, 0.75)',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        borderRadius: '12px',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: 'linear-gradient(90deg, #3B82F6, #10B981, #6366F1)'
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#60A5FA'
            }}
          >
            <Icon name="shield" size={20} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#F8FAFC' }}>
              Cryptographic Evidence Integrity
            </h4>
            <span style={{ fontSize: '11px', color: '#94A3B8' }}>
              Canonical SHA-256 Content Hash & Schema Specification
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleVerifyNow}
            disabled={verifying}
            className="btn btn-sm"
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#34D399',
              fontSize: '12px',
              fontWeight: 500,
              padding: '4px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Icon name="check" size={14} />
            {verifying ? 'Verifying...' : 'Verify Hash Now'}
          </button>
        </div>
      </div>

      <div
        style={{
          background: 'rgba(2, 6, 23, 0.85)',
          padding: '12px 14px',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#38BDF8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          wordBreak: 'break-all',
          marginBottom: '12px'
        }}
      >
        <span style={{ letterSpacing: '0.5px' }}>{hash}</span>
        <button
          onClick={handleCopyHash}
          title="Copy SHA-256 hash"
          style={{
            background: 'transparent',
            border: 'none',
            color: copied ? '#34D399' : '#94A3B8',
            cursor: 'pointer',
            padding: '4px 8px',
            marginLeft: '8px',
            flexShrink: 0,
            fontSize: '12px'
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {verificationResult && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            marginBottom: '12px',
            fontSize: '12px',
            background: verificationResult.valid ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${verificationResult.valid ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: verificationResult.valid ? '#34D399' : '#F87171',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Icon name={verificationResult.valid ? 'check' : 'alert-triangle'} size={16} />
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
          gap: '10px',
          fontSize: '11px',
          color: '#94A3B8',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          paddingTop: '10px'
        }}
      >
        <div>
          <span style={{ color: '#64748B' }}>Algorithm:</span> <strong style={{ color: '#E2E8F0' }}>{algorithm}</strong>
        </div>
        <div>
          <span style={{ color: '#64748B' }}>Schema Version:</span> <strong style={{ color: '#E2E8F0' }}>v{schemaVersion}</strong>
        </div>
        <div>
          <span style={{ color: '#64748B' }}>Export Type:</span> <strong style={{ color: '#E2E8F0' }}>{manifest?.exportType || 'CONTRACT'}</strong>
        </div>
        <div>
          <span style={{ color: '#64748B' }}>Snapshot Time:</span> <span style={{ color: '#CBD5E1' }}>{generatedAt}</span>
        </div>
      </div>
    </div>
  );
};

export default EvidenceIntegrityCard;
