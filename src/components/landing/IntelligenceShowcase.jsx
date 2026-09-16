import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import Icon from '../common/Icon';
import { EASE_OUT, cardHoverMotion } from '../../styles/motion';

export const IntelligenceShowcase = () => {
  const [activeTab, setActiveTab] = useState('clauses');
  const shouldReduceMotion = useReducedMotion();

  const tabs = [
    { id: 'clauses', label: 'Clause Intelligence', tag: '98% Confidence' },
    { id: 'risk', label: 'Risk Intelligence', tag: 'Score: 12/100' },
    { id: 'integrity', label: 'Cryptographic Proof', tag: 'SHA-256 Verified' }
  ];

  return (
    <motion.div
      className="intelligence-showcase"
      style={{
        maxWidth: '920px',
        margin: '48px auto 0',
        padding: '0',
        overflow: 'hidden',
        background: '#FFFFFF',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        borderRadius: '24px',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(0, 0, 0, 0.02)',
        textAlign: 'left'
      }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.18, ease: EASE_OUT }}
      {...cardHoverMotion}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: '#F5F5F7',
          borderBottom: '1px solid rgba(0, 0, 0, 0.06)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#FF5F56' }} />
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#FFBD2E' }} />
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#27C93F' }} />
          </div>
          <span className="mono" style={{ marginLeft: '10px', fontSize: '12px', color: '#6E6E73' }}>
            master_services_agreement_v3.pdf
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="badge badge-ok" style={{ fontSize: '11px' }}>
            <Icon.check /> SOC Verified
          </span>
          <span className="badge badge-info" style={{ fontSize: '11px' }}>
            <Icon.shield /> AES-256-GCM
          </span>
        </div>
      </div>

      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid rgba(0, 0, 0, 0.04)',
          background: '#FAFAFC',
          display: 'flex',
          justifyContent: 'center'
        }}
      >
        <div className="tab-bar">
          {tabs.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`tab-btn ${isActive ? 'active' : ''}`}
              >
                <span>{t.label}</span>
                <span
                  style={{
                    fontSize: '10.5px',
                    marginLeft: '6px',
                    padding: '1px 5px',
                    borderRadius: '980px',
                    background: isActive ? 'rgba(0, 113, 227, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                    color: isActive ? '#0071E3' : '#6E6E73'
                  }}
                >
                  {t.tag}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '28px 32px' }}>
        <AnimatePresence mode="wait">
          {activeTab === 'clauses' && (
            <motion.div
              key="clauses"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: EASE_OUT }}
            >
              <div className="flex-between mb-12">
                <span className="eyebrow-bullet">Neural Clause Analysis</span>
                <span className="badge badge-info">Gemini Pro Multi-Pass</span>
              </div>
              <div
                style={{
                  background: '#F5F5F7',
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                  borderRadius: '12px',
                  padding: '18px 20px',
                  fontSize: '14px',
                  lineHeight: '1.7',
                  color: '#1D1D1F',
                  marginBottom: '14px'
                }}
              >
                <strong>Section 11.2 (Limitation of Liability):</strong> In no event shall either party's aggregate liability arising out of or related to this Agreement exceed the total amount paid by Customer hereunder in the{' '}
                <mark style={{ background: 'rgba(0, 113, 227, 0.15)', padding: '2px 5px', borderRadius: '4px', borderBottom: '1.5px solid #0071E3' }}>
                  twelve (12) months
                </mark>{' '}
                preceding the incident. Neither party shall be liable for indirect, punitive, or consequential damages.
              </div>
              <div
                style={{
                  background: 'rgba(52, 199, 89, 0.08)',
                  border: '1px solid rgba(52, 199, 89, 0.22)',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  fontSize: '13.5px',
                  color: '#1D1D1F'
                }}
              >
                <strong style={{ color: '#028A25' }}>Plain English Translation:</strong> Standard bilateral liability cap. Liability is strictly limited to actual fees paid over the previous year, protecting both sides against unlimited punitive damages.
              </div>
            </motion.div>
          )}

          {activeTab === 'risk' && (
            <motion.div
              key="risk"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: EASE_OUT }}
            >
              <div className="flex-between mb-16">
                <span className="eyebrow-bullet">Automated Risk Breakdown</span>
                <span className="badge badge-ok" style={{ fontSize: '13px' }}>
                  Low Risk Score: 12 / 100
                </span>
              </div>
              <div className="grid grid-2" style={{ gap: '14px' }}>
                <div style={{ padding: '16px', background: '#F5F5F7', borderRadius: '12px', border: '1px solid rgba(0, 0, 0, 0.06)' }}>
                  <div className="flex-between small bold mb-8">
                    <span style={{ color: '#1D1D1F' }}>Termination Provisions</span>
                    <span className="badge badge-ok">0% (Safe)</span>
                  </div>
                  <div style={{ height: '6px', background: '#E8E8ED', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: '0%', height: '100%', background: '#34C759' }} />
                  </div>
                  <p className="small mt-8" style={{ fontSize: '12px', color: '#6E6E73' }}>Mutual 30-day notice with immediate termination on material breach.</p>
                </div>

                <div style={{ padding: '16px', background: '#F5F5F7', borderRadius: '12px', border: '1px solid rgba(0, 0, 0, 0.06)' }}>
                  <div className="flex-between small bold mb-8">
                    <span style={{ color: '#1D1D1F' }}>Liability Caps</span>
                    <span className="badge badge-ok">15% (Low)</span>
                  </div>
                  <div style={{ height: '6px', background: '#E8E8ED', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: '15%', height: '100%', background: '#34C759' }} />
                  </div>
                  <p className="small mt-8" style={{ fontSize: '12px', color: '#6E6E73' }}>Bilateral cap tied to 12-month contract value.</p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'integrity' && (
            <motion.div
              key="integrity"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: EASE_OUT }}
            >
              <div className="flex-between mb-12">
                <span className="eyebrow-bullet">Cryptographic Integrity Seal</span>
                <span className="badge badge-ok"><Icon.check /> SHA-256 Validated</span>
              </div>
              <div
                className="mono small"
                style={{
                  background: '#F5F5F7',
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                  padding: '14px 18px',
                  borderRadius: '12px',
                  color: '#424245',
                  wordBreak: 'break-all',
                  fontSize: '12px',
                  lineHeight: '1.6'
                }}
              >
                <strong>SHA-256 Digest:</strong> e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855<br />
                <strong>Block Index:</strong> #114 · <strong>Algorithm:</strong> AES-256-GCM · <strong>Signature:</strong> RSA-2048 PKCS#1v15
              </div>
              <p className="small mt-12" style={{ color: '#6E6E73' }}>
                Every ingested document is fingerprinted with cryptographic SHA-256 hashing and appended to the immutable audit ledger for complete evidentiary non-repudiation.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default IntelligenceShowcase;
