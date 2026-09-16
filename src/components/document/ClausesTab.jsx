import React, { useState, useEffect } from 'react';
import Api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import Icon from '../common/Icon';
import SkeletonLoader from '../common/SkeletonLoader';
import EmptyState from '../common/EmptyState';

export const ClausesTab = ({ doc, refreshTrigger }) => {
  const [clausesData, setClausesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const { toast } = useToast();

  const fetchClauses = async () => {
    setLoading(true);
    try {
      const res = await Api.get(`/api/documents/${doc.id}/clauses`);
      setClausesData(res);
    } catch (err) {
      toast(err.message || 'Failed to load detected clauses', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClauses();
  }, [doc.id, refreshTrigger]);

  if (loading) {
    return <SkeletonLoader.Card count={3} height="120px" />;
  }

  const detected = clausesData?.clauses?.detected || [];
  const missing = clausesData?.clauses?.missing || [];
  const auditItems = clausesData?.clauses?.auditItems || [];

  const filteredDetected = detected.filter((c) => {
    if (filter === 'CONFIRMED') return c.status === 'CONFIRMED';
    if (filter === 'DISPUTED') return c.consensus === 'LABEL_DISAGREEMENT' || c.detectionMethod === 'DISPUTED_HYBRID';
    if (filter === 'UNCERTAIN') return c.status === 'UNCERTAIN';
    return true;
  });

  const getStatusBadge = (clause) => {
    if (clause.consensus === 'LABEL_DISAGREEMENT' || clause.detectionMethod === 'DISPUTED_HYBRID') {
      return <span className="badge badge-warn">⚠ Disputed Hybrid</span>;
    }
    if (clause.status === 'CONFIRMED') {
      return <span className="badge badge-ok">✓ Confirmed</span>;
    }
    if (clause.status === 'LIKELY_PRESENT') {
      return <span className="badge badge-info">◐ Likely Present</span>;
    }
    return <span className="badge badge-warn">⚠ Review Needed</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="flex-between" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--navy)' }}>Detected Contract Clauses</h3>
          <p className="text-mid small" style={{ margin: '4px 0 0' }}>
            Hybrid consensus combining regex rule definitions with supervised NLP classification.
          </p>
        </div>

        <div className="flex gap-8">
          {['ALL', 'CONFIRMED', 'DISPUTED', 'UNCERTAIN'].map((f) => (
            <button
              key={f}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFilter(f)}
              style={{ fontSize: '12px' }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filteredDetected.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.document />}
            title="No clauses match this filter"
            sub="Try selecting 'ALL' or run a fresh AI legal analysis on this document."
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredDetected.map((clause, idx) => {
            const isDisputed = clause.consensus === 'LABEL_DISAGREEMENT' || clause.detectionMethod === 'DISPUTED_HYBRID';

            return (
              <div
                key={idx}
                className="card"
                style={{
                  margin: 0,
                  borderLeft: isDisputed ? '4px solid var(--amber)' : clause.status === 'CONFIRMED' ? '4px solid var(--emerald)' : '4px solid var(--royal)',
                  background: isDisputed ? '#FFFDF5' : 'var(--white)'
                }}
              >
                <div className="flex-between mb-8" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <strong style={{ fontSize: '15px', color: 'var(--navy)', letterSpacing: '0.01em' }}>
                      {clause.clauseType || clause.primaryClauseType}
                    </strong>
                    {clause.title && clause.title !== clause.clauseType && (
                      <span className="text-mid small" style={{ marginLeft: '8px' }}>
                        · {clause.title}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-8" style={{ alignItems: 'center' }}>
                    {getStatusBadge(clause)}
                    <span className="badge badge-neutral" style={{ fontSize: '11.5px', fontFamily: 'monospace' }}>
                      {Math.round((clause.effectiveConfidence || clause.confidence || 0) * 100)}% Conf
                    </span>
                  </div>
                </div>

                {isDisputed && clause.rulePrediction && clause.modelPrediction && (
                  <div
                    style={{
                      background: '#FEF3C7',
                      border: '1px solid #FDE68A',
                      borderRadius: 'var(--radius-sm)',
                      padding: '12px 14px',
                      marginBottom: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <span style={{ color: '#D97706', fontWeight: 700 }}>⚠</span>
                      <strong style={{ color: '#92400E', fontSize: '13px' }}>AI System Disagreement Detected</strong>
                    </div>
                    <div className="grid grid-2" style={{ gap: '12px' }}>
                      <div style={{ background: '#FFFFFF', padding: '8px 12px', borderRadius: '4px' }}>
                        <div className="text-mid small" style={{ fontSize: '11px' }}>Rule Engine Prediction</div>
                        <strong style={{ color: 'var(--navy)', fontSize: '13px' }}>{clause.rulePrediction.clauseType}</strong>
                        <div className="text-mid small">{Math.round(clause.rulePrediction.confidence * 100)}% Confidence</div>
                      </div>
                      <div style={{ background: '#FFFFFF', padding: '8px 12px', borderRadius: '4px' }}>
                        <div className="text-mid small" style={{ fontSize: '11px' }}>ML Model Prediction</div>
                        <strong style={{ color: 'var(--royal)', fontSize: '13px' }}>{clause.modelPrediction.clauseType}</strong>
                        <div className="text-mid small">{Math.round(clause.modelPrediction.confidence * 100)}% Confidence</div>
                      </div>
                    </div>
                    <div className="text-mid small mt-8" style={{ color: '#78350F' }}>
                      Consensus Flag: <code>{clause.consensus}</code> · Lead Source: <code>{clause.primaryEvidenceSource}</code>
                    </div>
                  </div>
                )}

                {clause.snippet && (
                  <div
                    style={{
                      background: 'var(--off-white)',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      fontSize: '13px',
                      color: 'var(--text-mid)',
                      lineHeight: '1.6',
                      fontFamily: 'var(--font-mono, monospace)'
                    }}
                  >
                    "{clause.snippet}"
                  </div>
                )}

                <div className="flex-between mt-12" style={{ fontSize: '11.5px', color: 'var(--text-lo)' }}>
                  <span>Source: {clause.primaryEvidenceSource || clause.detectionMethod}</span>
                  {clause.reviewRecommended && (
                    <span style={{ color: 'var(--amber)', fontWeight: 600 }}>Review Recommended by Legal Auditor</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {missing.length > 0 && (
        <div className="card mt-16" style={{ borderColor: 'var(--border)' }}>
          <div className="card-title">
            <span className="dot dot-amber" />
            Missing Standard Clauses Audit
          </div>
          <p className="text-mid small mb-12">
            The following recommended commercial protection clauses were not confirmed in this document:
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
            {missing.map((m, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  background: '#FFF5F5',
                  border: '1px solid #FED7D7',
                  borderRadius: 'var(--radius-sm)'
                }}
              >
                <span style={{ color: 'var(--red)', fontWeight: 700 }}>✕</span>
                <div>
                  <strong style={{ fontSize: '13px', color: 'var(--navy)' }}>{m.replace('_', ' ')}</strong>
                  <div style={{ fontSize: '11px', color: 'var(--red)' }}>Not Detected</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClausesTab;
