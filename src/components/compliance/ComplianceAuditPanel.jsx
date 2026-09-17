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
      {/* Top Header & Sub-tabs */}
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
            <Icon name="fileText" size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-head)' }}>
              Compliance Audit &amp; Evidence Export
            </h3>
            <span className="text-lo small" style={{ fontSize: '12px' }}>
              Deterministic, tamper-verifiable governance record for this contract
            </span>
          </div>
        </div>

        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
          {[
            { id: 'OVERVIEW', label: 'Overview', icon: 'activity' },
            { id: 'EVIDENCE', label: 'Evidence Data', icon: 'database' },
            { id: 'INTEGRITY', label: 'Hash Integrity', icon: 'shield' },
            { id: 'EXPORTS', label: 'Export Artifacts', icon: 'download' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`btn btn-sm ${subTab === tab.id ? 'btn-primary' : 'btn-outline'}`}
              style={{
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px'
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
            <div className="card" style={{ padding: '20px', margin: 0, background: 'var(--card-bg)', border: '1px solid var(--rule)' }}>
              <div className="text-mid small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Operational Health</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '8px 0 6px' }}>
                <span style={{ fontFamily: 'var(--font-head)', fontSize: '28px', fontWeight: 700, color: 'var(--ink)' }}>
                  {health.healthScore ?? 'N/A'}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--text-lo)' }}>/ 100</span>
                <span className={`badge ${health.healthScore >= 80 ? 'badge-ok' : health.healthScore >= 50 ? 'badge-warn' : 'badge-neutral'}`} style={{ marginLeft: 'auto', fontSize: '11px' }}>
                  {health.healthGrade || 'N/A'}
                </span>
              </div>
              <span className="text-lo small">Automated Governance Index</span>
            </div>

            <div className="card" style={{ padding: '20px', margin: 0, background: 'var(--card-bg)', border: '1px solid var(--rule)' }}>
              <div className="text-mid small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action Resolution</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '8px 0 6px' }}>
                <span style={{ fontFamily: 'var(--font-head)', fontSize: '28px', fontWeight: 700, color: 'var(--ink)' }}>
                  {health.resolutionMetrics?.resolutionRate || 0}%
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-lo)' }}>
                  ({health.resolutionMetrics?.resolvedActions || 0}/{health.resolutionMetrics?.totalActions || 0})
                </span>
              </div>
              <span className="text-lo small">Resolved vs Assigned</span>
            </div>

            <div className="card" style={{ padding: '20px', margin: 0, background: 'var(--card-bg)', border: '1px solid var(--rule)' }}>
              <div className="text-mid small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Decision Ledger</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '8px 0 6px' }}>
                <span style={{ fontFamily: 'var(--font-head)', fontSize: '28px', fontWeight: 700, color: 'var(--ink)' }}>
                  {decisions.length}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-lo)' }}>Recorded Decisions</span>
              </div>
              <span className="text-lo small">Append-Only Governance</span>
            </div>

            <div className="card" style={{ padding: '20px', margin: 0, background: 'var(--card-bg)', border: '1px solid var(--rule)' }}>
              <div className="text-mid small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activity Trail</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '8px 0 6px' }}>
                <span style={{ fontFamily: 'var(--font-head)', fontSize: '28px', fontWeight: 700, color: 'var(--ink)' }}>
                  {activities.length}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-lo)' }}>Audit Log Events</span>
              </div>
              <span className="text-lo small">Tamper-Proof Audit Events</span>
            </div>
          </div>
        </div>
      )}

      {subTab === 'EVIDENCE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card" style={{ padding: '22px 24px', background: 'var(--card-bg)', border: '1px solid var(--rule)', margin: 0 }}>
            <div className="card-title" style={{ margin: '0 0 14px 0' }}>
              <span className="dot dot-gold" />
              Historical AI Intelligence Snapshot
            </div>
            {intel ? (
              <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <span className="text-lo" style={{ marginRight: '6px' }}>Snapshot ID:</span>
                  <span style={{ fontFamily: 'monospace, var(--font-mono)', background: 'var(--paper-wash)', padding: '2px 8px', border: '1px solid var(--rule)' }}>{intel.snapshotId}</span>
                </div>
                <div>
                  <span className="text-lo" style={{ marginRight: '6px' }}>AI Health Score:</span>
                  <strong style={{ color: 'var(--ink)' }}>{intel.healthScore}/100</strong>
                  <span style={{ margin: '0 8px', color: 'var(--rule-strong)' }}>|</span>
                  <span className="text-lo" style={{ marginRight: '6px' }}>Critical Risks:</span>
                  <strong style={{ color: intel.criticalCount > 0 ? 'var(--signal)' : 'var(--ink)' }}>{intel.criticalCount}</strong>
                  <span style={{ margin: '0 8px', color: 'var(--rule-strong)' }}>|</span>
                  <span className="text-lo" style={{ marginRight: '6px' }}>Important:</span>
                  <strong style={{ color: 'var(--ink)' }}>{intel.importantCount}</strong>
                </div>
                {intel.executiveSummary && (
                  <div style={{ background: 'var(--paper-wash)', borderLeft: '2px solid var(--rule-strong)', padding: '12px 16px', marginTop: '6px', color: 'var(--ink)' }}>
                    <em style={{ fontStyle: 'normal', fontSize: '13px', lineHeight: 1.6 }}>"{intel.executiveSummary}"</em>
                  </div>
                )}
              </div>
            ) : (
              <span className="text-lo small" style={{ fontStyle: 'italic' }}>
                No historical AI snapshot associated with this document.
              </span>
            )}
          </div>

          <div className="card" style={{ padding: '22px 24px', background: 'var(--card-bg)', border: '1px solid var(--rule)', margin: 0 }}>
            <div className="card-title" style={{ margin: '0 0 14px 0' }}>
              <span className="dot dot-gold" />
              Workflow Actions Evidence ({actions.length})
            </div>
            {actions.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', color: 'var(--ink-soft)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--rule)', textAlign: 'left', color: 'var(--text-lo)' }}>
                      <th style={{ padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Title</th>
                      <th style={{ padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Category</th>
                      <th style={{ padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Score / Band</th>
                      <th style={{ padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</th>
                      <th style={{ padding: '10px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Escalated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actions.map(a => (
                      <tr key={a.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 500, color: 'var(--ink)' }}>{a.title}</td>
                        <td style={{ padding: '10px 8px', color: 'var(--text-lo)' }}>{a.category}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <strong style={{ color: 'var(--ink)' }}>{a.priorityScore}</strong> <span style={{ fontSize: '10.5px', color: 'var(--text-lo)' }}>({a.priorityBand})</span>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span className={`badge ${a.status === 'RESOLVED' ? 'badge-ok' : 'badge-warn'}`}>{a.status}</span>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          {a.isEscalated ? (
                            <span style={{ color: 'var(--signal)', fontWeight: 600 }}>YES ({a.escalationRule})</span>
                          ) : (
                            <span className="text-lo">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <span className="text-lo small" style={{ fontStyle: 'italic' }}>No workflow actions present.</span>
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
              padding: '22px 24px',
              background: 'var(--card-bg)',
              border: '1px solid var(--rule)',
              fontSize: '13px',
              color: 'var(--ink-soft)',
              lineHeight: '1.7',
              margin: 0
            }}
          >
            <div className="card-title" style={{ margin: '0 0 12px 0' }}>
              <span className="dot dot-gold" />
              How Canonical Integrity Hashing Works
            </div>
            <p style={{ margin: '0 0 10px 0' }}>
              1. All evidence records (intelligence snapshots, action items, recorded decisions, audit log events, and comments) are sorted into a strictly deterministic sequence.
            </p>
            <p style={{ margin: '0 0 10px 0' }}>
              2. Object keys are sorted alphabetically and all timestamps are standardized to strict ISO-8601 UTC representation.
            </p>
            <p style={{ margin: 0 }}>
              3. A cryptographic SHA-256 digest is generated over the normalized payload. Any tampering, post-export modification, or unauthorized alteration invalidates this digital proof.
            </p>
          </div>
        </div>
      )}

      {subTab === 'EXPORTS' && (
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
                <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--ink)', fontFamily: 'var(--font-head)' }}>Executive Compliance PDF</h4>
              </div>
              <p className="text-lo small" style={{ margin: '0 0 20px 0', lineHeight: 1.6 }}>
                Formatted executive summary containing the SHA-256 hash box, action resolutions, decision history, and health scores.
              </p>
            </div>
            <button
              onClick={() => handleDownload('pdf', ComplianceAuditApi.downloadContractPdf, 'pdf')}
              disabled={downloading['pdf']}
              className="btn btn-primary"
              style={{ width: '100%', fontSize: '12px', fontWeight: 600, padding: '10px 14px' }}
            >
              {downloading['pdf'] ? 'Generating PDF...' : 'Download Executive PDF'}
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
                <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--ink)', fontFamily: 'var(--font-head)' }}>Canonical JSON Package</h4>
              </div>
              <p className="text-lo small" style={{ margin: '0 0 20px 0', lineHeight: 1.6 }}>
                Complete machine-readable JSON package with manifest and exact payload for cryptographic hash verification.
              </p>
            </div>
            <button
              onClick={() => handleDownload('json', ComplianceAuditApi.downloadContractJson, 'json')}
              disabled={downloading['json']}
              className="btn btn-outline"
              style={{ width: '100%', fontSize: '12px', fontWeight: 600, padding: '10px 14px' }}
            >
              {downloading['json'] ? 'Generating JSON...' : 'Download Canonical JSON'}
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
                <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--ink)', fontFamily: 'var(--font-head)' }}>Action Items CSV</h4>
              </div>
              <p className="text-lo small" style={{ margin: '0 0 20px 0', lineHeight: 1.6 }}>
                Spreadsheet-ready CSV of all workflow actions, priority bands, resolution status, and escalation tags.
              </p>
            </div>
            <button
              onClick={() => handleDownload('actions_csv', ComplianceAuditApi.downloadContractActionsCsv, 'actions_csv')}
              disabled={downloading['actions_csv']}
              className="btn btn-outline"
              style={{ width: '100%', fontSize: '12px', fontWeight: 600, padding: '10px 14px' }}
            >
              {downloading['actions_csv'] ? 'Generating CSV...' : 'Download Actions CSV'}
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
                  <Icon name="check" size={16} />
                </div>
                <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--ink)', fontFamily: 'var(--font-head)' }}>Decision Ledger CSV</h4>
              </div>
              <p className="text-lo small" style={{ margin: '0 0 20px 0', lineHeight: 1.6 }}>
                Append-only decision records with timestamps, decision makers, and recorded rationale.
              </p>
            </div>
            <button
              onClick={() => handleDownload('decisions_csv', ComplianceAuditApi.downloadContractDecisionsCsv, 'decisions_csv')}
              disabled={downloading['decisions_csv']}
              className="btn btn-outline"
              style={{ width: '100%', fontSize: '12px', fontWeight: 600, padding: '10px 14px' }}
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
