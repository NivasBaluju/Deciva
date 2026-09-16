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
          background: 'rgba(15, 23, 42, 0.65)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818CF8'
            }}
          >
            <Icon name="layers" size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#F8FAFC' }}>
              Portfolio Governance Audit & Compliance Export
            </h3>
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>
              Cryptographically integrity-verifiable audit bundle covering your full contract portfolio
            </span>
          </div>
        </div>

        <button
          onClick={loadPortfolioEvidence}
          className="btn btn-sm"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#CBD5E1',
            fontSize: '12px'
          }}
        >
          <Icon name="refresh-cw" size={13} /> Refresh
        </button>
      </div>

      <EvidenceIntegrityCard manifest={manifest} evidence={evidence} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div className="card" style={{ padding: '16px', background: 'rgba(15, 23, 42, 0.5)' }}>
          <span style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase' }}>Portfolio Health</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span style={{ fontSize: '24px', fontWeight: 700, color: '#38BDF8' }}>{health.portfolioHealthScore ?? 'N/A'}</span>
            <span style={{ fontSize: '12px', color: '#64748B' }}>/ 100</span>
            <span className="badge badge-info" style={{ marginLeft: 'auto', fontSize: '11px' }}>
              {health.grade || 'N/A'}
            </span>
          </div>
        </div>

        <div className="card" style={{ padding: '16px', background: 'rgba(15, 23, 42, 0.5)' }}>
          <span style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase' }}>Managed Contracts</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span style={{ fontSize: '24px', fontWeight: 700, color: '#F8FAFC' }}>{summary.totalContracts || 0}</span>
            <span style={{ fontSize: '12px', color: '#64748B' }}>Contracts</span>
          </div>
        </div>

        <div className="card" style={{ padding: '16px', background: 'rgba(15, 23, 42, 0.5)' }}>
          <span style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase' }}>Active Backlog</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span style={{ fontSize: '24px', fontWeight: 700, color: '#FBBF24' }}>{summary.activeActions || 0}</span>
            <span style={{ fontSize: '12px', color: '#64748B' }}>/ {summary.totalActions || 0} Total</span>
          </div>
        </div>

        <div className="card" style={{ padding: '16px', background: 'rgba(15, 23, 42, 0.5)' }}>
          <span style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase' }}>Active Escalations</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span style={{ fontSize: '24px', fontWeight: 700, color: summary.escalatedActions > 0 ? '#F87171' : '#34D399' }}>
              {summary.escalatedActions || 0}
            </span>
            <span style={{ fontSize: '12px', color: '#64748B' }}>Escalated Items</span>
          </div>
        </div>
      </div>

      <h4 style={{ margin: '8px 0 0 0', fontSize: '14px', fontWeight: 600, color: '#E2E8F0' }}>
        Portfolio Audit Export Artifacts
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        <div
          className="card"
          style={{
            padding: '20px',
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            border: '1px solid rgba(99, 102, 241, 0.25)'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Icon name="file-text" size={20} color="#818CF8" />
              <h4 style={{ margin: 0, fontSize: '15px', color: '#F8FAFC' }}>Portfolio Executive PDF</h4>
            </div>
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Executive PDF summary containing portfolio health index, contract risk rankings, and SHA-256 evidence integrity box.
            </p>
          </div>
          <button
            onClick={() => handleDownload('pdf', ComplianceAuditApi.downloadPortfolioPdf)}
            disabled={downloading['pdf']}
            className="btn btn-primary"
            style={{ width: '100%', fontSize: '12px', fontWeight: 600, padding: '8px 14px' }}
          >
            {downloading['pdf'] ? 'Generating PDF...' : 'Download Portfolio PDF'}
          </button>
        </div>

        <div
          className="card"
          style={{
            padding: '20px',
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            border: '1px solid rgba(16, 185, 129, 0.25)'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Icon name="code" size={20} color="#34D399" />
              <h4 style={{ margin: 0, fontSize: '15px', color: '#F8FAFC' }}>Portfolio Canonical JSON</h4>
            </div>
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Complete machine-verifiable portfolio evidence package including attention queue, team workload, and deadline analytics.
            </p>
          </div>
          <button
            onClick={() => handleDownload('json', ComplianceAuditApi.downloadPortfolioJson)}
            disabled={downloading['json']}
            className="btn"
            style={{
              width: '100%',
              fontSize: '12px',
              fontWeight: 600,
              padding: '8px 14px',
              background: 'rgba(16, 185, 129, 0.2)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#34D399'
            }}
          >
            {downloading['json'] ? 'Generating JSON...' : 'Download Portfolio JSON'}
          </button>
        </div>

        <div
          className="card"
          style={{
            padding: '20px',
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            border: '1px solid rgba(245, 158, 11, 0.25)'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Icon name="table" size={20} color="#FBBF24" />
              <h4 style={{ margin: 0, fontSize: '15px', color: '#F8FAFC' }}>Attention Queue CSV</h4>
            </div>
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Portfolio-wide attention queue CSV with attention scores, reasons, and overdue days.
            </p>
          </div>
          <button
            onClick={() => handleDownload('actions_csv', ComplianceAuditApi.downloadPortfolioActionsCsv)}
            disabled={downloading['actions_csv']}
            className="btn"
            style={{
              width: '100%',
              fontSize: '12px',
              fontWeight: 600,
              padding: '8px 14px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              color: '#FBBF24'
            }}
          >
            {downloading['actions_csv'] ? 'Generating CSV...' : 'Download Queue CSV'}
          </button>
        </div>

        <div
          className="card"
          style={{
            padding: '20px',
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            border: '1px solid rgba(59, 130, 246, 0.25)'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Icon name="bar-chart-2" size={20} color="#60A5FA" />
              <h4 style={{ margin: 0, fontSize: '15px', color: '#F8FAFC' }}>Contracts Health CSV</h4>
            </div>
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Portfolio contracts ranking CSV with individual health scores, grades, and resolution metrics.
            </p>
          </div>
          <button
            onClick={() => handleDownload('contracts_csv', ComplianceAuditApi.downloadPortfolioContractsCsv)}
            disabled={downloading['contracts_csv']}
            className="btn"
            style={{
              width: '100%',
              fontSize: '12px',
              fontWeight: 600,
              padding: '8px 14px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              color: '#60A5FA'
            }}
          >
            {downloading['contracts_csv'] ? 'Generating CSV...' : 'Download Contracts CSV'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PortfolioCompliancePanel;
