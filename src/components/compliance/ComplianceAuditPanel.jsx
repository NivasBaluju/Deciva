import React, { useState, useEffect } from 'react';
import Icon from '../common/Icon';
import SkeletonLoader from '../common/SkeletonLoader';
import { useToast } from '../../context/ToastContext';
import ComplianceAuditApi from '../../services/complianceAuditApi';
import EvidenceIntegrityCard from './EvidenceIntegrityCard';

export const ComplianceAuditPanel = ({ doc }) => {
  const [evidencePackage, setEvidencePackage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('OVERVIEW');
  const [downloading, setDownloading] = useState({});
  const { toast } = useToast();

  const loadEvidence = async () => {
    if (!doc?.id) return;
    setLoading(true);
    try {
      const data = await ComplianceAuditApi.getContractEvidence(doc.id);
      setEvidencePackage(data);
    } catch (err) {
      toast(err.message || 'Failed to load contract compliance evidence', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvidence();
  }, [doc?.id]);

  const handleDownload = async (exportType, downloadFn, filenameKey) => {
    setDownloading(prev => ({ ...prev, [exportType]: true }));
    try {
      const docName = doc?.original_name || doc?.filename || 'contract';
      await downloadFn(doc.id, docName);
      toast(`Export ${exportType.toUpperCase()} generated successfully`, 'success');
    } catch (err) {
      toast(err.message || `Failed to download ${exportType}`, 'error');
    } finally {
      setDownloading(prev => ({ ...prev, [exportType]: false }));
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
  const health = evidence?.operationalHealthAtExport || {};
  const intel = evidence?.historicalIntelligenceSnapshot;
  const actions = evidence?.workflowActions || [];
  const decisions = evidence?.decisionLedger || [];
  const activities = evidence?.activityAuditTrail || [];
  const comments = evidence?.collaborationHistory || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px 0' }}>
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
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38BDF8'
            }}
          >
            <Icon name="file-text" size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#F8FAFC' }}>
              Compliance Audit & Evidence Export
            </h3>
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>
              Deterministic, tamper-verifiable governance record for this contract
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', background: 'rgba(2, 6, 23, 0.6)', padding: '4px', borderRadius: '8px' }}>
          {[
            { id: 'OVERVIEW', label: 'Overview', icon: 'activity' },
            { id: 'EVIDENCE', label: 'Evidence Data', icon: 'database' },
            { id: 'INTEGRITY', label: 'Hash Integrity', icon: 'shield' },
            { id: 'EXPORTS', label: 'Export Artifacts', icon: 'download' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: subTab === tab.id ? 600 : 500,
                background: subTab === tab.id ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                border: subTab === tab.id ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
                color: subTab === tab.id ? '#60A5FA' : '#94A3B8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Icon name={tab.icon} size={13} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'OVERVIEW' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <EvidenceIntegrityCard manifest={manifest} evidence={evidence} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div className="card" style={{ padding: '16px', background: 'rgba(15, 23, 42, 0.5)' }}>
              <span style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase' }}>Operational Health</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: 700, color: '#38BDF8' }}>{health.healthScore ?? 'N/A'}</span>
                <span style={{ fontSize: '12px', color: '#64748B' }}>/ 100</span>
                <span className="badge badge-info" style={{ marginLeft: 'auto', fontSize: '11px' }}>
                  {health.healthGrade || 'N/A'}
                </span>
              </div>
            </div>

            <div className="card" style={{ padding: '16px', background: 'rgba(15, 23, 42, 0.5)' }}>
              <span style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase' }}>Action Resolution</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: 700, color: '#34D399' }}>
                  {health.resolutionMetrics?.resolutionRate || 0}%
                </span>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  ({health.resolutionMetrics?.resolvedActions || 0}/{health.resolutionMetrics?.totalActions || 0})
                </span>
              </div>
            </div>

            <div className="card" style={{ padding: '16px', background: 'rgba(15, 23, 42, 0.5)' }}>
              <span style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase' }}>Decision Ledger</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: 700, color: '#A78BFA' }}>{decisions.length}</span>
                <span style={{ fontSize: '12px', color: '#64748B' }}>Recorded Decisions</span>
              </div>
            </div>

            <div className="card" style={{ padding: '16px', background: 'rgba(15, 23, 42, 0.5)' }}>
              <span style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase' }}>Activity Trail</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: 700, color: '#FBBF24' }}>{activities.length}</span>
                <span style={{ fontSize: '12px', color: '#64748B' }}>Audit Log Events</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'EVIDENCE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card" style={{ padding: '16px 20px', background: 'rgba(15, 23, 42, 0.6)' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#38BDF8' }}>
              Historical AI Intelligence Snapshot (Phase 6.4)
            </h4>
            {intel ? (
              <div style={{ fontSize: '12px', color: '#CBD5E1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <strong>Snapshot ID:</strong> <span style={{ fontFamily: 'monospace' }}>{intel.snapshotId}</span>
                </div>
                <div>
                  <strong>AI Health Score:</strong> {intel.healthScore}/100 | Critical Risks: {intel.criticalCount} | Important: {intel.importantCount}
                </div>
                {intel.executiveSummary && (
                  <div style={{ background: 'rgba(2, 6, 23, 0.5)', padding: '10px', borderRadius: '6px', marginTop: '4px' }}>
                    <em>"{intel.executiveSummary}"</em>
                  </div>
                )}
              </div>
            ) : (
              <span style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic' }}>
                No historical AI snapshot associated with this document.
              </span>
            )}
          </div>

          <div className="card" style={{ padding: '16px 20px', background: 'rgba(15, 23, 42, 0.6)' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#E2E8F0' }}>
              Workflow Actions Evidence ({actions.length})
            </h4>
            {actions.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#CBD5E1' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'left', color: '#94A3B8' }}>
                      <th style={{ padding: '8px' }}>Title</th>
                      <th style={{ padding: '8px' }}>Category</th>
                      <th style={{ padding: '8px' }}>Score / Band</th>
                      <th style={{ padding: '8px' }}>Status</th>
                      <th style={{ padding: '8px' }}>Escalated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actions.map(a => (
                      <tr key={a.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '8px', fontWeight: 500 }}>{a.title}</td>
                        <td style={{ padding: '8px', color: '#94A3B8' }}>{a.category}</td>
                        <td style={{ padding: '8px' }}>
                          <strong>{a.priorityScore}</strong> <span style={{ fontSize: '10px', color: '#64748B' }}>({a.priorityBand})</span>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <span className={`badge ${a.status === 'RESOLVED' ? 'badge-ok' : 'badge-warn'}`}>{a.status}</span>
                        </td>
                        <td style={{ padding: '8px' }}>
                          {a.isEscalated ? (
                            <span style={{ color: '#F87171', fontWeight: 600 }}>YES ({a.escalationRule})</span>
                          ) : (
                            <span style={{ color: '#64748B' }}>No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <span style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic' }}>No workflow actions present.</span>
            )}
          </div>
        </div>
      )}

      {subTab === 'INTEGRITY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <EvidenceIntegrityCard manifest={manifest} evidence={evidence} />
          <div
            className="card"
            style={{
              padding: '16px 20px',
              background: 'rgba(15, 23, 42, 0.5)',
              fontSize: '12px',
              color: '#94A3B8',
              lineHeight: '1.6'
            }}
          >
            <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#E2E8F0' }}>
              How Canonical Integrity Hashing Works
            </h4>
            <p style={{ margin: '0 0 8px 0' }}>
              1. All evidence records (intelligence, actions, decisions, audit logs, comments) are sorted into a strictly deterministic order.
            </p>
            <p style={{ margin: '0 0 8px 0' }}>
              2. Object keys are sorted alphabetically and dates are standardized to ISO-8601 UTC representation.
            </p>
            <p style={{ margin: '0 0 8px 0' }}>
              3. A cryptographic SHA-256 digest is generated over the normalized payload. Any tampering or modification to the exported evidence alters this hash.
            </p>
          </div>
        </div>
      )}

      {subTab === 'EXPORTS' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
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
                <Icon name="file-text" size={20} color="#38BDF8" />
                <h4 style={{ margin: 0, fontSize: '15px', color: '#F8FAFC' }}>Executive Compliance PDF</h4>
              </div>
              <p style={{ fontSize: '12px', color: '#94A3B8', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                Formatted executive summary containing the SHA-256 hash box, action resolutions, decision history, and health scores.
              </p>
            </div>
            <button
              onClick={() => handleDownload('pdf', ComplianceAuditApi.downloadContractPdf, 'pdf')}
              disabled={downloading['pdf']}
              className="btn btn-primary"
              style={{ width: '100%', fontSize: '12px', fontWeight: 600, padding: '8px 14px' }}
            >
              {downloading['pdf'] ? 'Generating PDF...' : 'Download Executive PDF'}
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
                <h4 style={{ margin: 0, fontSize: '15px', color: '#F8FAFC' }}>Canonical JSON Package</h4>
              </div>
              <p style={{ fontSize: '12px', color: '#94A3B8', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                Complete machine-readable JSON package with manifest and exact payload for cryptographic hash verification.
              </p>
            </div>
            <button
              onClick={() => handleDownload('json', ComplianceAuditApi.downloadContractJson, 'json')}
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
              {downloading['json'] ? 'Generating JSON...' : 'Download Canonical JSON'}
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
                <h4 style={{ margin: 0, fontSize: '15px', color: '#F8FAFC' }}>Action Items CSV</h4>
              </div>
              <p style={{ fontSize: '12px', color: '#94A3B8', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                Spreadsheet-ready CSV of all workflow actions, priority bands, resolution status, and escalation tags.
              </p>
            </div>
            <button
              onClick={() => handleDownload('actions_csv', ComplianceAuditApi.downloadContractActionsCsv, 'actions_csv')}
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
              {downloading['actions_csv'] ? 'Generating CSV...' : 'Download Actions CSV'}
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
              border: '1px solid rgba(167, 139, 250, 0.25)'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Icon name="check-circle" size={20} color="#A78BFA" />
                <h4 style={{ margin: 0, fontSize: '15px', color: '#F8FAFC' }}>Decision Ledger CSV</h4>
              </div>
              <p style={{ fontSize: '12px', color: '#94A3B8', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                Append-only decision records with timestamps, decision makers, and recorded rationale.
              </p>
            </div>
            <button
              onClick={() => handleDownload('decisions_csv', ComplianceAuditApi.downloadContractDecisionsCsv, 'decisions_csv')}
              disabled={downloading['decisions_csv']}
              className="btn"
              style={{
                width: '100%',
                fontSize: '12px',
                fontWeight: 600,
                padding: '8px 14px',
                background: 'rgba(167, 139, 250, 0.15)',
                border: '1px solid rgba(167, 139, 250, 0.4)',
                color: '#A78BFA'
              }}
            >
              {downloading['decisions_csv'] ? 'Generating CSV...' : 'Download Decisions CSV'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplianceAuditPanel;
