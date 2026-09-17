import React, { useState, useEffect } from 'react';
import Icon from '../common/Icon';
import SkeletonLoader from '../common/SkeletonLoader';
import { useToast } from '../../context/ToastContext';
import ComplianceAuditApi from '../../services/complianceAuditApi';
import EvidenceIntegrityCard from './EvidenceIntegrityCard';

export const PortfolioCompliancePanel = () => {
  const [evidencePackage, setEvidencePackage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState({});
  const { toast } = useToast();

  const loadPortfolioEvidence = async () => {
    setLoading(true);
    try {
      const data = await ComplianceAuditApi.getPortfolioEvidence();
      setEvidencePackage(data);
    } catch (err) {
      toast(err.message || 'Failed to load portfolio compliance evidence', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortfolioEvidence();
  }, []);

  const handleDownload = async (exportKey, downloadFn) => {
    setDownloading(prev => ({ ...prev, [exportKey]: true }));
    try {
      await downloadFn();
      toast(`Portfolio export ${exportKey.toUpperCase()} downloaded successfully`, 'success');
    } catch (err) {
      toast(err.message || `Failed to download ${exportKey}`, 'error');
    } finally {
      setDownloading(prev => ({ ...prev, [exportKey]: false }));
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '16px' }}>
        <SkeletonLoader.Card count={3} height="120px" />
      </div>
    );
  }

  const manifest = evidencePackage?.manifest;
  const evidence = evidencePackage?.evidence;
  const summary = evidence?.portfolioSummary || {};
  const health = evidence?.portfolioHealth || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        className="card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'var(--card-bg)',
          border: '1px solid var(--rule)',
          margin: 0
        }}
      >
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
            <Icon name="layers" size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-head)' }}>
              Portfolio Governance Audit &amp; Compliance Export
            </h3>
            <span className="text-lo small" style={{ fontSize: '12px' }}>
              Cryptographically integrity-verifiable audit bundle covering your full contract portfolio
            </span>
          </div>
        </div>

        <button
          onClick={loadPortfolioEvidence}
          className="btn btn-outline btn-sm"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 600
          }}
        >
          <Icon name="refresh" size={13} /> Refresh
        </button>
      </div>

      <EvidenceIntegrityCard manifest={manifest} evidence={evidence} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div className="card" style={{ padding: '20px', margin: 0, background: 'var(--card-bg)', border: '1px solid var(--rule)' }}>
          <div className="text-mid small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Portfolio Health</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '8px 0 6px' }}>
            <span style={{ fontFamily: 'var(--font-head)', fontSize: '28px', fontWeight: 700, color: 'var(--ink)' }}>
              {health.portfolioHealthScore ?? 'N/A'}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-lo)' }}>/ 100</span>
            <span className={`badge ${health.portfolioHealthScore >= 80 ? 'badge-ok' : health.portfolioHealthScore >= 50 ? 'badge-warn' : 'badge-neutral'}`} style={{ marginLeft: 'auto', fontSize: '11px' }}>
              {health.grade || 'N/A'}
            </span>
          </div>
          <span className="text-lo small">Aggregate Health Score</span>
        </div>

        <div className="card" style={{ padding: '20px', margin: 0, background: 'var(--card-bg)', border: '1px solid var(--rule)' }}>
          <div className="text-mid small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Managed Contracts</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '8px 0 6px' }}>
            <span style={{ fontFamily: 'var(--font-head)', fontSize: '28px', fontWeight: 700, color: 'var(--ink)' }}>
              {summary.totalContracts || 0}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-lo)' }}>Contracts</span>
          </div>
          <span className="text-lo small">Active Portfolio Scope</span>
        </div>

        <div className="card" style={{ padding: '20px', margin: 0, background: 'var(--card-bg)', border: '1px solid var(--rule)' }}>
          <div className="text-mid small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Backlog</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '8px 0 6px' }}>
            <span style={{ fontFamily: 'var(--font-head)', fontSize: '28px', fontWeight: 700, color: 'var(--ink)' }}>
              {summary.activeActions || 0}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-lo)' }}>/ {summary.totalActions || 0} Total</span>
          </div>
          <span className="text-lo small">Pending Governance Items</span>
        </div>

        <div className="card" style={{ padding: '20px', margin: 0, background: 'var(--card-bg)', border: '1px solid var(--rule)' }}>
          <div className="text-mid small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Escalations</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '8px 0 6px' }}>
            <span style={{ fontFamily: 'var(--font-head)', fontSize: '28px', fontWeight: 700, color: summary.escalatedActions > 0 ? 'var(--signal)' : 'var(--ink)' }}>
              {summary.escalatedActions || 0}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-lo)' }}>Escalated Items</span>
          </div>
          <span className="text-lo small">{summary.escalatedActions > 0 ? 'Requires Immediate Review' : 'Zero Critical Escalations'}</span>
        </div>
      </div>

      <div className="card-title" style={{ margin: '8px 0 0 0' }}>
        <span className="dot dot-gold" />
        Portfolio Audit Export Artifacts
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        <div
          className="card"
          style={{
            padding: '24px',
            background: 'var(--card-bg)',
            border: '1px solid var(--rule)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            margin: 0
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper-wash)', border: '1px solid var(--rule)', color: 'var(--ink)' }}>
                <Icon name="fileText" size={16} />
              </div>
              <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--ink)', fontFamily: 'var(--font-head)' }}>Portfolio Executive PDF</h4>
            </div>
            <p className="text-lo small" style={{ margin: '0 0 20px 0', lineHeight: 1.6 }}>
              Executive PDF summary containing portfolio health index, contract risk rankings, and SHA-256 evidence integrity box.
            </p>
          </div>
          <button
            onClick={() => handleDownload('pdf', ComplianceAuditApi.downloadPortfolioPdf)}
            disabled={downloading['pdf']}
            className="btn btn-primary"
            style={{ width: '100%', fontSize: '12px', fontWeight: 600, padding: '10px 14px' }}
          >
            {downloading['pdf'] ? 'Generating PDF...' : 'Download Portfolio PDF'}
          </button>
        </div>

        <div
          className="card"
          style={{
            padding: '24px',
            background: 'var(--card-bg)',
            border: '1px solid var(--rule)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            margin: 0
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper-wash)', border: '1px solid var(--rule)', color: 'var(--ink)' }}>
                <Icon name="code" size={16} />
              </div>
              <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--ink)', fontFamily: 'var(--font-head)' }}>Portfolio Canonical JSON</h4>
            </div>
            <p className="text-lo small" style={{ margin: '0 0 20px 0', lineHeight: 1.6 }}>
              Complete machine-verifiable portfolio evidence package including attention queue, team workload, and deadline analytics.
            </p>
          </div>
          <button
            onClick={() => handleDownload('json', ComplianceAuditApi.downloadPortfolioJson)}
            disabled={downloading['json']}
            className="btn btn-outline"
            style={{ width: '100%', fontSize: '12px', fontWeight: 600, padding: '10px 14px' }}
          >
            {downloading['json'] ? 'Generating JSON...' : 'Download Portfolio JSON'}
          </button>
        </div>

        <div
          className="card"
          style={{
            padding: '24px',
            background: 'var(--card-bg)',
            border: '1px solid var(--rule)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            margin: 0
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper-wash)', border: '1px solid var(--rule)', color: 'var(--ink)' }}>
                <Icon name="table" size={16} />
              </div>
              <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--ink)', fontFamily: 'var(--font-head)' }}>Attention Queue CSV</h4>
            </div>
            <p className="text-lo small" style={{ margin: '0 0 20px 0', lineHeight: 1.6 }}>
              Portfolio-wide attention queue CSV with attention scores, reasons, and overdue days.
            </p>
          </div>
          <button
            onClick={() => handleDownload('actions_csv', ComplianceAuditApi.downloadPortfolioActionsCsv)}
            disabled={downloading['actions_csv']}
            className="btn btn-outline"
            style={{ width: '100%', fontSize: '12px', fontWeight: 600, padding: '10px 14px' }}
          >
            {downloading['actions_csv'] ? 'Generating CSV...' : 'Download Queue CSV'}
          </button>
        </div>

        <div
          className="card"
          style={{
            padding: '24px',
            background: 'var(--card-bg)',
            border: '1px solid var(--rule)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            margin: 0
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper-wash)', border: '1px solid var(--rule)', color: 'var(--ink)' }}>
                <Icon name="chart" size={16} />
              </div>
              <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--ink)', fontFamily: 'var(--font-head)' }}>Contracts Health CSV</h4>
            </div>
            <p className="text-lo small" style={{ margin: '0 0 20px 0', lineHeight: 1.6 }}>
              Portfolio contracts ranking CSV with individual health scores, grades, and resolution metrics.
            </p>
          </div>
          <button
            onClick={() => handleDownload('contracts_csv', ComplianceAuditApi.downloadPortfolioContractsCsv)}
            disabled={downloading['contracts_csv']}
            className="btn btn-outline"
            style={{ width: '100%', fontSize: '12px', fontWeight: 600, padding: '10px 14px' }}
          >
            {downloading['contracts_csv'] ? 'Generating CSV...' : 'Download Contracts CSV'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PortfolioCompliancePanel;
