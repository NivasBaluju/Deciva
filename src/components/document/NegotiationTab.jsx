import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import Icon from '../common/Icon';
import EmptyState from '../common/EmptyState';
import SkeletonLoader from '../common/SkeletonLoader';
import { buttonMotion, EASE_OUT } from '../../styles/motion';
import LegalSideBySideRedline from './LegalSideBySideRedline';

const MODES = [
  { id: 'balanced', label: 'Balanced', icon: '🟢', desc: 'Fair, mutual compromise' },
  { id: 'protective', label: 'Protective', icon: '🛡️', desc: 'Risk-minimizing & capped liability' },
  { id: 'aggressive', label: 'Aggressive', icon: '🔥', desc: 'Strong counter-positions & strict cure' },
  { id: 'collaborative', label: 'Collaborative', icon: '🤝', desc: 'Win-win dialogue & dispute escalation' }
];

export const NegotiationTab = ({ doc }) => {
  const [opportunities, setOpportunities] = useState([]);
  const [selectedClauseId, setSelectedClauseId] = useState(null);
  const [activeMode, setActiveMode] = useState('balanced');
  const [negotiationResult, setNegotiationResult] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [acceptedClauses, setAcceptedClauses] = useState({});
  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;
    async function loadOpportunities() {
      try {
        const res = await Api.get(`/api/documents/${doc.id}/negotiation-suggestions`);
        if (isMounted) {
          const opps = res.opportunities || [];
          setOpportunities(opps);
          if (opps.length > 0) {
            setSelectedClauseId(opps[0].clauseId);
          }
        }
      } catch (err) {
        if (isMounted) toast(err.message || 'Failed to load negotiation suggestions', 'error');
      } finally {
        if (isMounted) setLoadingList(false);
      }
    }
    loadOpportunities();
    return () => {
      isMounted = false;
    };
  }, [doc.id, toast]);

  useEffect(() => {
    if (!selectedClauseId) return;

    let isMounted = true;
    async function fetchNegotiation() {
      setGenerating(true);
      try {
        const selectedOpp = opportunities.find((o) => o.clauseId === selectedClauseId);
        const res = await Api.post(`/api/documents/${doc.id}/negotiate`, {
          clauseId: selectedClauseId,
          clauseType: selectedOpp?.clauseType,
          mode: activeMode
        });
        if (isMounted) {
          setNegotiationResult(res);
        }
      } catch (err) {
        if (isMounted) toast(err.message || 'Failed to generate negotiation redline', 'error');
      } finally {
        if (isMounted) setGenerating(false);
      }
    }
    fetchNegotiation();
    return () => {
      isMounted = false;
    };
  }, [doc.id, selectedClauseId, activeMode, opportunities, toast]);

  const handleCopyText = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast('Negotiated revision copied to clipboard', 'ok');
  };

  const handleAccept = (clauseId) => {
    setAcceptedClauses((prev) => ({ ...prev, [clauseId]: true }));
    toast('Clause revision marked as accepted for execution draft', 'ok');
  };

  if (loadingList) {
    return <SkeletonLoader.Card count={2} height="180px" />;
  }

  if (opportunities.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<Icon.check />}
          title="No high-risk clauses flagged for negotiation"
          sub="This contract currently contains standard, commercially balanced terms."
        />
      </div>
    );
  }

  const selectedOpp = opportunities.find((o) => o.clauseId === selectedClauseId) || opportunities[0];
  const isAccepted = acceptedClauses[selectedClauseId];

  return (
    <div className="card">
      <div className="card-header-flex">
        <div className="card-title">
          <span className="dot dot-gold" />
          AI Contract Negotiation &amp; Redline Copilot
        </div>
        <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
          Word-Level Redline Engine
        </span>
      </div>

      <p className="text-lo mt-4 mb-16" style={{ fontSize: '13px' }}>
        Select a contract clause to inspect legal imbalances, choose your strategic negotiation posture, and generate evidence-grounded redlines.
      </p>

      <div className="mb-20">
        <div className="text-lo" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
          Strategic Negotiation Posture
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          {MODES.map((m) => {
            const isActive = activeMode === m.id;
            return (
              <motion.button
                key={m.id}
                type="button"
                onClick={() => setActiveMode(m.id)}
                style={{
                  background: isActive ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                  border: isActive ? '1px solid var(--royal)' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease'
                }}
                {...buttonMotion}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: isActive ? 'var(--hi)' : 'var(--mid)', fontSize: '13px' }}>
                  <span>{m.icon}</span>
                  <span>{m.label}</span>
                </div>
                <div className="text-lo" style={{ fontSize: '11px', marginTop: '4px' }}>
                  {m.desc}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="divider" />

      <div className="mb-20">
        <div className="text-lo" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
          Identified Clauses ({opportunities.length})
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {opportunities.map((opp) => {
            const isSelected = opp.clauseId === selectedClauseId;
            const accepted = acceptedClauses[opp.clauseId];
            return (
              <motion.button
                key={opp.clauseId}
                type="button"
                onClick={() => setSelectedClauseId(opp.clauseId)}
                style={{
                  background: isSelected ? 'var(--royal)' : 'rgba(255, 255, 255, 0.04)',
                  color: isSelected ? '#fff' : 'var(--mid)',
                  border: isSelected ? '1px solid var(--royal)' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
                {...buttonMotion}
              >
                {accepted && <span>✓</span>}
                <span>{opp.clauseType}</span>
                <span
                  style={{
                    fontSize: '9.5px',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    background: isSelected ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.08)'
                  }}
                >
                  {opp.riskLevel}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`btn btn-sm ${activeMode === m.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveMode(m.id)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px', height: 'auto', textAlign: 'left' }}
          >
            <div style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{m.icon}</span> {m.label}
            </div>
            <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '2px' }}>{m.desc}</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '16px', borderBottom: '1px solid var(--line)' }}>
        {opportunities.map((opp) => (
          <button
            key={opp.clauseId}
            type="button"
            className={`btn btn-sm ${selectedClauseId === opp.clauseId ? 'btn-secondary active' : 'btn-ghost'}`}
            onClick={() => setSelectedClauseId(opp.clauseId)}
            style={{
              whiteSpace: 'nowrap',
              fontSize: '12px',
              borderBottom: selectedClauseId === opp.clauseId ? '2px solid var(--gold)' : 'none',
              borderRadius: '4px 4px 0 0'
            }}
          >
            {opp.clauseType}
            <span className={`badge ${opp.riskSeverity === 'HIGH' ? 'badge-danger' : 'badge-warn'}`} style={{ marginLeft: '6px', fontSize: '10px' }}>
              {opp.riskSeverity}
            </span>
          </button>
        ))}
      </div>

      {generating ? (
        <SkeletonLoader.Card count={2} height="120px" />
      ) : negotiationResult ? (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '16px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontWeight: 600, color: 'var(--mid)', fontSize: '12px', letterSpacing: '0.05em' }}>
                ORIGINAL DOCUMENT CLAUSE (DOCUMENT FACT)
              </span>
              <span className="source-tag" style={{ fontSize: '11px' }}>
                Segment ID: {negotiationResult.documentEvidence?.clauseId || selectedClauseId}
              </span>
            </div>
            <div
              style={{
                fontFamily: 'Georgia, serif',
                fontSize: '13.5px',
                lineHeight: '1.6',
                color: 'var(--hi)',
                fontStyle: 'italic',
                padding: '8px 12px',
                borderLeft: '3px solid var(--gold)',
                background: 'rgba(0, 0, 0, 0.2)'
              }}
            >
              "{negotiationResult.documentEvidence?.clause}"
            </div>
          </div>

          <LegalSideBySideRedline
            originalText={negotiationResult.documentEvidence?.clause || negotiationResult.originalClause || ''}
            proposedText={negotiationResult.aiRecommendation?.suggestedRevision || negotiationResult.proposedClause || ''}
            diffOperations={negotiationResult.redline?.operations || []}
            clauseType={selectedOpp?.clauseType || 'Negotiated Provision'}
            clauseId={selectedClauseId || 'CL-01'}
            riskSeverity={negotiationResult.aiRecommendation?.riskSeverity || 'MEDIUM'}
            rationale={negotiationResult.aiRecommendation?.strategy || 'Balanced risk allocation'}
            evidenceRef={`Segment ${selectedClauseId}`}
            onAccept={() => handleAccept(selectedClauseId)}
            isAccepted={isAccepted}
            onExportDocx={handleExportDocx}
            exportingDocx={exportingDocx}
            beforeScore={negotiationResult.beforeScore ?? negotiationResult.before_score}
            afterScore={negotiationResult.afterScore ?? negotiationResult.after_score}
            riskDelta={negotiationResult.riskDelta ?? negotiationResult.risk_delta}
            riskDirection={negotiationResult.riskDirection ?? negotiationResult.risk_direction}
            riskFindings={negotiationResult.riskFindings ?? negotiationResult.risk_findings}
          />
        </div>
      ) : null}
    </div>
  );
};

export default NegotiationTab;
