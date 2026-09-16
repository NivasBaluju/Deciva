import React, { useState, useEffect } from 'react';
import GovernanceApi from '../../services/governanceApi';
import { useToast } from '../../context/ToastContext';

export const GovernanceConsole = ({ doc }) => {
  const [evaluation, setEvaluation] = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [exceptionReason, setExceptionReason] = useState('');
  const [submittingException, setSubmittingException] = useState(false);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [runningDryRun, setRunningDryRun] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    if (!doc?.id) return;
    try {
      setLoading(true);
      const [evalRes, excRes] = await Promise.all([
        GovernanceApi.getDocumentCompliance(doc.id).catch(() => ({ evaluation: null })),
        GovernanceApi.listExceptions({ document_id: doc.id }).catch(() => ({ exceptions: [] }))
      ]);
      setEvaluation(evalRes?.evaluation || null);
      setExceptions(excRes?.exceptions || []);
    } catch (err) {
      console.error('Failed to load governance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [doc?.id]);

  const handleRunEvaluation = async () => {
    try {
      setEvaluating(true);
      const res = await GovernanceApi.evaluateDocumentCompliance(doc.id);
      if (res?.success) {
        setEvaluation(res.evaluation);
        toast.success('Compliance evaluation completed');
        loadData();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Evaluation failed');
    } finally {
      setEvaluating(false);
    }
  };

  const handleSimulateDryRun = async () => {
    if (!evaluation?.policy_id) return;
    try {
      setRunningDryRun(true);
      const res = await GovernanceApi.simulatePolicyDryRun(evaluation.policy_id, doc.id);
      if (res?.success) {
        setDryRunResult(res.preview);
        toast.info('Dry-run policy simulation calculated');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Dry-run failed');
    } finally {
      setRunningDryRun(false);
    }
  };

  const handleRequestException = async (e) => {
    e.preventDefault();
    if (!selectedFinding || !exceptionReason.trim()) return;

    try {
      setSubmittingException(true);
      const res = await GovernanceApi.requestException(doc.id, selectedFinding.id, exceptionReason);
      if (res?.success) {
        toast.success('Exception request submitted for review');
        setSelectedFinding(null);
        setExceptionReason('');
        loadData();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Failed to request exception');
    } finally {
      setSubmittingException(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLIANT':
        return <span className="badge badge-success">COMPLIANT</span>;
      case 'PARTIALLY_COMPLIANT':
        return <span className="badge badge-warning">PARTIAL</span>;
      case 'NON_COMPLIANT':
        return <span className="badge badge-danger">NON-COMPLIANT</span>;
      case 'INSUFFICIENT_EVIDENCE':
        return <span className="badge badge-neutral">INSUFFICIENT EVIDENCE</span>;
      case 'POLICY_NOT_CONFIGURED':
        return <span className="badge badge-neutral">UNCONFIGURED</span>;
      default:
        return <span className="badge badge-neutral">{status || 'NOT ASSESSED'}</span>;
    }
  };

  const getSeverityBadge = (sev) => {
    switch (sev) {
      case 'CRITICAL':
      case 'HIGH':
        return <span style={{ color: '#F87171', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>{sev}</span>;
      case 'MEDIUM':
        return <span style={{ color: '#FBBF24', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>{sev}</span>;
      default:
        return <span style={{ color: '#D4D4D8', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>{sev || 'LOW'}</span>;
    }
  };

  if (loading) {
    return (
      <div className="card p-24" style={{ textAlign: 'center' }}>
        <p className="text-mid">Loading governance policy evaluation...</p>
      </div>
    );
  }

  return (
    <div className="governance-console">
      <div className="card p-20 mb-16" style={{ borderLeft: '4px solid var(--royal)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>
                Policy Governance & Compliance Control Engine
              </h2>
              {evaluation && getStatusBadge(evaluation.evaluation_status)}
            </div>
            <p className="text-mid small mt-4" style={{ maxWidth: '650px', lineHeight: 1.5, color: '#A1A1AA' }}>
              Deterministic, explainable verification of contractual compliance against organizational legal policies,
              numeric thresholds, and mandatory clauses with audit-grounded clause citations.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {evaluation?.policy_id && (
              <button
                className="btn btn-sm btn-outline"
                onClick={handleSimulateDryRun}
                disabled={runningDryRun}
              >
                {runningDryRun ? 'Simulating...' : 'Policy Dry-Run'}
              </button>
            )}
            <button
              className="btn btn-sm btn-primary"
              onClick={handleRunEvaluation}
              disabled={evaluating}
            >
              {evaluating ? 'Evaluating...' : evaluation ? 'Re-Evaluate Compliance' : 'Run Compliance Evaluation'}
            </button>
          </div>
        </div>

        {evaluation && (
          <div className="mt-16 pt-16" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
            <div style={{ background: '#121218', padding: '10px 14px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#A1A1AA', fontWeight: 600 }}>Compliance Score</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: evaluation.compliance_score >= 80 ? '#34D399' : evaluation.compliance_score >= 50 ? '#FBBF24' : '#F87171' }}>
                {evaluation.compliance_score}%
              </div>
              <div style={{ fontSize: '10px', color: '#71717A' }}>Explainable weighted formula</div>
            </div>

            <div style={{ background: '#121218', padding: '10px 14px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#A1A1AA', fontWeight: 600 }}>Policy Version</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#FFFFFF' }}>
                v{evaluation.policy_version || 1}
              </div>
              <div style={{ fontSize: '10px', color: '#71717A' }}>Immutable evaluation record</div>
            </div>

            <div style={{ background: '#121218', padding: '10px 14px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#A1A1AA', fontWeight: 600 }}>Compliant</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#34D399' }}>
                {evaluation.compliant_controls_count || 0}
              </div>
              <div style={{ fontSize: '10px', color: '#71717A' }}>Full criteria satisfied</div>
            </div>

            <div style={{ background: '#121218', padding: '10px 14px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#A1A1AA', fontWeight: 600 }}>Partial / Exceptions</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#FBBF24' }}>
                {evaluation.partially_compliant_controls_count || 0}
              </div>
              <div style={{ fontSize: '10px', color: '#71717A' }}>Active approved waivers</div>
            </div>

            <div style={{ background: '#121218', padding: '10px 14px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#A1A1AA', fontWeight: 600 }}>Non-Compliant</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#F87171' }}>
                {evaluation.non_compliant_controls_count || 0}
              </div>
              <div style={{ fontSize: '10px', color: '#71717A' }}>Breaches requiring remediation</div>
            </div>

            <div style={{ background: '#121218', padding: '10px 14px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#A1A1AA', fontWeight: 600 }}>Insufficient Evidence</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#A1A1AA' }}>
                {evaluation.insufficient_evidence_controls_count || 0}
              </div>
              <div style={{ fontSize: '10px', color: '#71717A' }}>Zero fabrication posture</div>
            </div>
          </div>
        )}
      </div>

      {dryRunResult && (
        <div className="card p-16 mb-16" style={{ background: 'rgba(34, 197, 94, 0.1)', borderColor: 'rgba(34, 197, 94, 0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ color: '#86EFAC', fontSize: '13.5px' }}>Dry-Run Simulation Complete</strong>
              <div style={{ color: '#BBF7D0', fontSize: '12px', marginTop: '2px' }}>
                Simulated Policy v{dryRunResult.policy_version}: Score {dryRunResult.compliance_score}%, Status: {dryRunResult.evaluation_status}. (Unsaved preview)
              </div>
            </div>
            <button className="btn btn-sm btn-outline" onClick={() => setDryRunResult(null)}>
              Dismiss Preview
            </button>
          </div>
        </div>
      )}

      {evaluation?.findings && evaluation.findings.length > 0 ? (
        <div className="card p-20 mb-16">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>Evaluated Governance Controls ({evaluation.findings.length})</h3>
            <span className="text-mid small" style={{ color: '#A1A1AA' }}>
              Policy: <strong style={{ color: '#FFFFFF' }}>{evaluation.policy_name || 'Standard Enterprise Policy'}</strong>
            </span>
          </div>

          <div className="table-responsive">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(255, 255, 255, 0.15)', textAlign: 'left', fontSize: '12px', color: '#A1A1AA' }}>
                  <th style={{ padding: '8px 12px' }}>Code</th>
                  <th style={{ padding: '8px 12px' }}>Control Title</th>
                  <th style={{ padding: '8px 12px' }}>Severity</th>
                  <th style={{ padding: '8px 12px' }}>Status</th>
                  <th style={{ padding: '8px 12px' }}>Evidence Quote / Grounding</th>
                  <th style={{ padding: '8px 12px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.findings.map((finding) => (
                  <tr key={finding.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', fontSize: '13px' }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600, color: '#FFFFFF' }}>
                      {finding.control_code}
                      {finding.is_blocking && (
                        <span style={{ display: 'block', color: '#F87171', fontSize: '10px', fontWeight: 700 }}>BLOCKING</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600, color: '#FFFFFF' }}>{finding.title}</div>
                      {finding.failure_reason && (
                        <div style={{ color: '#FCA5A5', fontSize: '12px', marginTop: '2px' }}>
                          ⚠ {finding.failure_reason}
                        </div>
                      )}
                      {finding.remediation_suggested && (
                        <div style={{ color: '#A1A1AA', fontSize: '11px', marginTop: '2px', fontStyle: 'italic' }}>
                          Remediation: {finding.remediation_suggested}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {getSeverityBadge(finding.severity)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {getStatusBadge(finding.finding_status)}
                      {finding.has_active_exception && (
                        <span style={{ display: 'block', color: '#FBBF24', fontSize: '10px', fontWeight: 600 }}>WAIVER ACTIVE</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', maxWidth: '320px' }}>
                      {finding.clause_evidence_quote ? (
                        <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.12)', fontSize: '11px', fontStyle: 'italic', color: '#FFFFFF' }}>
                          "{finding.clause_evidence_quote}"
                          <span style={{ display: 'block', color: '#A1A1AA', fontSize: '10px', fontStyle: 'normal', marginTop: '2px' }}>
                            📍 {finding.clause_evidence_location}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#71717A', fontSize: '12px' }}>No clause quote located</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {finding.finding_status === 'NON_COMPLIANT' && !finding.has_active_exception && (
                        <button
                          className="btn btn-sm btn-outline"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => setSelectedFinding(finding)}
                        >
                          Request Exception
                        </button>
                      )}
                      {finding.has_active_exception && (
                        <span style={{ color: '#059669', fontSize: '11px', fontWeight: 600 }}>Exception Granted</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card p-24 text-center mb-16" style={{ background: '#F9FAFB' }}>
          <p className="text-mid">No compliance evaluation has been executed for this contract yet.</p>
          <button className="btn btn-primary mt-12" onClick={handleRunEvaluation} disabled={evaluating}>
            {evaluating ? 'Evaluating...' : 'Run Compliance Evaluation Now'}
          </button>
        </div>
      )}

      {exceptions.length > 0 && (
        <div className="card p-20 mb-16">
          <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 700 }}>Governance Exceptions Log ({exceptions.length})</h3>
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E5E7EB', color: '#6B7280' }}>
                  <th style={{ padding: '6px 8px' }}>Control</th>
                  <th style={{ padding: '6px 8px' }}>Reason</th>
                  <th style={{ padding: '6px 8px' }}>Status</th>
                  <th style={{ padding: '6px 8px' }}>Requester</th>
                  <th style={{ padding: '6px 8px' }}>Approver</th>
                  <th style={{ padding: '6px 8px' }}>Expires</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((exc) => (
                  <tr key={exc.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '8px' }}><strong>{exc.control_code}</strong></td>
                    <td style={{ padding: '8px', maxWidth: '280px' }}>{exc.reason}</td>
                    <td style={{ padding: '8px' }}>
                      <span className={`badge badge-${exc.status === 'APPROVED' ? 'success' : exc.status === 'PENDING' ? 'warning' : 'danger'}`}>
                        {exc.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px' }}>{exc.requester_name || exc.requested_by}</td>
                    <td style={{ padding: '8px' }}>{exc.approver_name || exc.approved_by || '—'}</td>
                    <td style={{ padding: '8px' }}>
                      {exc.expires_at ? new Date(exc.expires_at).toLocaleDateString() : 'Permanent'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedFinding && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card p-24" style={{ maxWidth: '520px', width: '90%', background: '#FFF' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 700 }}>
              Request Policy Exception
            </h3>
            <p className="text-mid small mb-12">
              Control: <strong>{selectedFinding.control_code} — {selectedFinding.title}</strong>
            </p>

            <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', padding: '10px 12px', borderRadius: '4px', marginBottom: '14px', fontSize: '12px', color: '#92400E' }}>
              <strong>Enterprise Separation of Duties Notice:</strong> The exception requester cannot approve their own request. An independent authorized compliance officer or administrator must evaluate and approve this waiver.
            </div>

            <form onSubmit={handleRequestException}>
              <div className="form-group mb-16">
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Business Justification & Mitigation Rationale *
                </label>
                <textarea
                  className="form-control"
                  rows={4}
                  required
                  placeholder="Explain why this contract requires a policy deviation, what commercial trade-offs exist, and how residual risk is mitigated..."
                  value={exceptionReason}
                  onChange={(e) => setExceptionReason(e.target.value)}
                  style={{ width: '100%', padding: '8px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => setSelectedFinding(null)}
                  disabled={submittingException}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
                  disabled={submittingException || !exceptionReason.trim()}
                >
                  {submittingException ? 'Submitting...' : 'Submit Exception Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GovernanceConsole;
