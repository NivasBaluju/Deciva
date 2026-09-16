import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Icon from '../common/Icon';
import { fmtDate } from '../../utils/formatters';
import { buttonMotion } from '../../styles/motion';

export const LedgerExplorer = ({
  auditBlocks = [],
  onVerifyChain,
  verifyingChain,
  chainVerifyResult
}) => {
  const [filter, setFilter] = useState('all');
  const [copiedHash, setCopiedHash] = useState(null);
  const [visibleCount, setVisibleCount] = useState(8);

  const blocks = auditBlocks || [];

  const getActionCategory = (action) => {
    const str = String(action || '');
    if (str.includes('LOGIN') || str.includes('LOGOUT') || str.includes('USER')) return 'auth';
    if (str.includes('DOCUMENT')) return 'doc';
    return 'system';
  };

  const getActionBadge = (action) => {
    const str = String(action || '');
    if (str.includes('LOGIN_SUCCESS')) return { color: '#10B981', bg: 'rgba(16,185,129,0.12)', label: 'AUTH_SUCCESS' };
    if (str.includes('DOCUMENT_UPLOADED')) return { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', label: 'DOC_ENCRYPTED' };
    if (str.includes('DOCUMENT_COMPARED')) return { color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', label: 'DIFF_AUDIT' };
    if (str.includes('DOCUMENT_VIEWED')) return { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', label: 'DOC_ACCESS' };
    if (str.includes('LOGOUT')) return { color: '#94A3B8', bg: 'rgba(148,163,184,0.12)', label: 'SESSION_END' };
    return { color: '#60A5FA', bg: 'rgba(96,165,250,0.12)', label: str || 'SYSTEM' };
  };

  const filteredBlocks = blocks.filter(b => {
    if (filter === 'all') return true;
    return getActionCategory(b.action) === filter;
  });

  const displayedBlocks = filteredBlocks.slice(0, visibleCount);

  const handleCopyHash = (hash, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1800);
  };

  return (
    <div className="card mt-24">
      <div className="flex-between mb-16">
        <div>
          <div className="card-title" style={{ marginBottom: '2px' }}>
            <span className="dot dot-emerald" />
            Tamper-Evident Cryptographic Audit Ledger
          </div>
          <p className="text-lo small" style={{ margin: 0 }}>
            Cryptographically sealed SHA-256 hash chain providing legal non-repudiation.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <motion.button
            className="btn btn-outline btn-sm"
            onClick={onVerifyChain}
            disabled={verifyingChain}
            {...buttonMotion}
          >
            <Icon.shield /> {verifyingChain ? 'Scanning Blocks…' : 'Verify Ledger Integrity'}
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {chainVerifyResult && (
          <motion.div
            className="ledger-verify-banner"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              background: chainVerifyResult.valid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${chainVerifyResult.valid ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`badge ${chainVerifyResult.valid ? 'badge-ok' : 'badge-danger'}`}>
                {chainVerifyResult.valid ? '✓ CHAIN INTEGRITY 100% VALID' : '⚠ TAMPERING DETECTED'}
              </span>
              <span style={{ fontSize: '13px', color: '#D4D4D8' }}>
                {chainVerifyResult.totalBlocks} consecutive blocks cryptographically verified with zero hash discrepancies.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="ledger-filter-row">
        <div className="session-filter-tabs">
          <button
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Ledger Events ({blocks.length})
          </button>
          <button
            className={`filter-tab ${filter === 'doc' ? 'active' : ''}`}
            onClick={() => setFilter('doc')}
          >
            Document Actions ({blocks.filter(b => getActionCategory(b.action) === 'doc').length})
          </button>
          <button
            className={`filter-tab ${filter === 'auth' ? 'active' : ''}`}
            onClick={() => setFilter('auth')}
          >
            Authentication ({blocks.filter(b => getActionCategory(b.action) === 'auth').length})
          </button>
        </div>
      </div>

      <div className="ledger-block-table">
        <div className="ledger-table-header">
          <span>BLOCK HEIGHT</span>
          <span>ACTION EVENT</span>
          <span>LEDGER HASH (SHA-256)</span>
          <span>TIMESTAMP</span>
        </div>

        <div className="ledger-table-body">
          {displayedBlocks.map((b) => {
            const badge = getActionBadge(b.action);
            const isCopied = copiedHash === b.hash;

            return (
              <div key={b.id || b.block_index} className="ledger-row-item">
                <div className="ledger-col-height">
                  <span className="mono ledger-height-pill">#{b.block_index}</span>
                </div>

                <div className="ledger-col-action">
                  <span
                    className="badge"
                    style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}33`, fontSize: '11px' }}
                  >
                    {badge.label}
                  </span>
                  <strong className="ledger-action-title">{b.action}</strong>
                </div>

                <div className="ledger-col-hash">
                  <span className="mono ledger-hash-code">
                    {b.hash ? `${b.hash.slice(0, 16)}…${b.hash.slice(-8)}` : 'N/A'}
                  </span>
                  {b.hash && (
                    <button
                      className="ledger-copy-btn"
                      onClick={(e) => handleCopyHash(b.hash, e)}
                      title="Copy full cryptographic hash"
                    >
                      {isCopied ? '✓' : '⧉'}
                    </button>
                  )}
                </div>

                <div className="ledger-col-time">
                  <span className="text-lo small">{fmtDate(b.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {filteredBlocks.length > visibleCount && (
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setVisibleCount(visibleCount + 10)}
          >
            Load More Blocks ({filteredBlocks.length - visibleCount} remaining) ↓
          </button>
        </div>
      )}
    </div>
  );
};

export default LedgerExplorer;
