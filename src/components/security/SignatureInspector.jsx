import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Icon from '../common/Icon';
import { buttonMotion } from '../../styles/motion';

export const SignatureInspector = ({ publicKey, onLoadKey }) => {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fingerprint = 'SHA256:4f8e91c2b8a07f3d5e6a1b2c3d4e5f6a7b8c9d0e1f2';

  return (
    <div className="card">
      <div className="flex-between mb-16">
        <div>
          <div className="card-title" style={{ marginBottom: '2px' }}>
            <span className="dot dot-gold" />
            Digital Signature Verification
          </div>
          <p className="text-lo small" style={{ margin: 0 }}>
            Asymmetric RSA-2048 signing keys for non-repudiation contract stamps.
          </p>
        </div>
        <span className="badge badge-ok" style={{ fontSize: '11px' }}>
          HARDENED
        </span>
      </div>

      <div className="sig-meta-box">
        <div className="sig-meta-row">
          <span className="sig-label">Algorithm</span>
          <span className="sig-val mono">RSA-2048 / PKCS#1 v1.5</span>
        </div>
        <div className="sig-meta-row">
          <span className="sig-label">Key Usage</span>
          <span className="sig-val">Contract Verification & Audit Sealing</span>
        </div>
        <div className="sig-meta-row">
          <span className="sig-label">Fingerprint</span>
          <span className="sig-val mono" style={{ color: '#60A5FA' }}>{fingerprint}</span>
        </div>
      </div>

      <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <motion.button
          className="btn btn-outline btn-sm"
          onClick={() => {
            if (!publicKey) onLoadKey();
            setExpanded(!expanded);
          }}
          {...buttonMotion}
        >
          <Icon.eye /> {expanded ? 'Hide Public Key Certificate' : 'Inspect Public Key'}
        </motion.button>

        {publicKey && (
          <motion.button
            className="btn btn-sm btn-ghost"
            onClick={handleCopy}
            {...buttonMotion}
          >
            {copied ? '✓ Copied to Clipboard' : '📋 Copy Key'}
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', marginTop: '12px' }}
          >
            <pre className="sig-cert-block">
              {publicKey || 'Loading institutional public key certificate...'}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SignatureInspector;
