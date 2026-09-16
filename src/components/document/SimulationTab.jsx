import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import Icon from '../common/Icon';
import EmptyState from '../common/EmptyState';
import SkeletonLoader from '../common/SkeletonLoader';
import { buttonMotion, EASE_OUT } from '../../styles/motion';

const SUGGESTED_SCENARIOS = [
  { id: 'payment', icon: '💰', title: 'Payment Delay', query: 'What happens if the client pays the invoice 45 days late?' },
  { id: 'termination', icon: '🚪', title: 'Unilateral Exit', query: 'What happens if either party terminates immediately without prior notice?' },
  { id: 'confidentiality', icon: '🔒', title: 'Data Leak', query: 'What is the contractual exposure if confidential technical information is leaked?' },
  { id: 'dispute', icon: '⚖️', title: 'Deliverable Dispute', query: 'What happens if a dispute arises regarding deliverable acceptance?' }
];

const DISCLAIMER_TEXT = "This is a hypothetical scenario analysis based on provisions identified in the document. It does not constitute formal legal advice.";

export const SimulationTab = ({ doc }) => {
  const [activeMode, setActiveMode] = useState('clause'); // 'clause' | 'whatif'
  const [scenarioInput, setScenarioInput] = useState('');
  const [originalClauseInput, setOriginalClauseInput] = useState('');
  const [proposedClauseInput, setProposedClauseInput] = useState('');
  const [selectedClauseId, setSelectedClauseId] = useState('');
  
  const [activeSimulation, setActiveSimulation] = useState(null);
  const [history, setHistory] = useState([]);
  const [simulating, setSimulating] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const { toast } = useToast();

  const detectedClauses = doc?.clauses || doc?.intelligence?.clauses || [];

  useEffect(() => {
    let isMounted = true;
    async function loadHistory() {
      try {
        const res = await Api.get(`/api/documents/${doc.id}/simulations`);
        if (isMounted) {
          setHistory(res.simulations || []);
        }
      } catch (err) {
        if (isMounted) console.warn('Simulation history fetch notice:', err.message);
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    }
    loadHistory();
    return () => {
      isMounted = false;
    };
  }, [doc.id]);

  const handleSelectPredefinedClause = (e) => {
    const cId = e.target.value;
    setSelectedClauseId(cId);
    if (!cId) {
      setOriginalClauseInput('');
      return;
    }
    const found = detectedClauses.find(c => (c.id === cId || c._id === cId));
    if (found) {
      setOriginalClauseInput(found.extracted_snippet || found.snippet || found.text || '');
    }
  };

  const handleSimulate = async (customQuery) => {
    let payload = {};

    if (activeMode === 'clause') {
      const original = originalClauseInput.trim();
      const proposed = proposedClauseInput.trim();
      if (!original && !doc?.extracted_text) {
        toast('Please provide or select the original clause to modify', 'error');
        return;
      }
      if (!proposed) {
        toast('Please provide the proposed replacement clause text', 'error');
        return;
      }
      payload = {
        clauseId: selectedClauseId || undefined,
        originalClause: original || undefined,
        proposedClause: proposed,
        scenario: `Clause Modification: ${proposed.slice(0, 60)}...`
      };
    } else {
      const query = (customQuery || scenarioInput || '').trim();
      if (!query) {
        toast('Please enter a hypothetical scenario to simulate', 'error');
        return;
      }
      payload = { scenario: query };
    }

    setSimulating(true);
    try {
      const res = await Api.post(`/api/documents/${doc.id}/simulate`, payload);
      setActiveSimulation(res);
      if (activeMode === 'whatif') {
        setScenarioInput('');
      }

      if (res.grounded !== false) {
        setHistory((prev) => [
          {
            id: res.simulationId || Date.now().toString(),
            scenario: res.scenario || payload.scenario,
            clauseId: res.clauseId,
            originalClause: res.originalClause,
            proposedClause: res.proposedClause,
            beforeScore: res.beforeScore,
            afterScore: res.afterScore,
            riskDelta: res.riskDelta,
            riskDirection: res.riskDirection,
            riskFindings: res.riskFindings,
            grounded: true,
            documentEvidence: res.documentEvidence,
            simulationAnalysis: res.simulationAnalysis,
            riskLevel: res.afterLevel || res.simulationAnalysis?.riskLevel,
            provenance: res.provenance,
            createdAt: new Date().toISOString()
          },
          ...prev
        ]);
      }
    } catch (err) {
      toast(err.message || 'Simulation engine error', 'error');
    } finally {
      setSimulating(false);
    }
  };

  const getDeltaBadge = (delta, direction) => {
    if (delta < 0 || direction === 'REDUCED') {
      return {
        label: `REDUCED ${delta} pts`,
        className: 'badge badge-ok',
        color: '#10b981',
        icon: '↓'
      };
    }
    if (delta > 0 || direction === 'INCREASED') {
      return {
        label: `INCREASED +${delta} pts`,
        className: 'badge badge-danger',
        color: '#ef4444',
        icon: '↑'
      };
    }
    return {
      label: 'UNCHANGED 0 pts',
      className: 'badge badge-neutral',
      color: 'var(--mid)',
      icon: '='
    };
  };

  return (
    <div className="card">
      <div className="card-header-flex">
        <div className="card-title">
          <span className="dot dot-gold" />
          Contract Risk Recalculation &amp; What-If Simulation
        </div>
        <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
          Deterministic Calculation Authority
        </span>
      </div>

      <p className="text-lo mt-4 mb-16" style={{ fontSize: '13px' }}>
        Perform deterministic risk recalculations by modifying contract clauses in memory, or query hypothetical scenarios grounded in document provisions.
      </p>

      {/* Mode Switcher */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          type="button"
          onClick={() => setActiveMode('clause')}
          className={`btn ${activeMode === 'clause' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '6px' }}
        >
          ✏️ Clause Modification (Score Delta)
        </button>
        <button
          type="button"
          onClick={() => setActiveMode('whatif')}
          className={`btn ${activeMode === 'whatif' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '6px' }}
        >
          🔮 What-If Scenario Inquiry
        </button>
      </div>

      {activeMode === 'clause' ? (
        <div style={{ display: 'grid', gap: '12px', marginBottom: '20px' }}>
          {detectedClauses.length > 0 && (
            <div>
              <label className="text-lo" style={{ fontSize: '11.5px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Select Detected Clause to Modify (Optional)
              </label>
              <select
                className="input"
                value={selectedClauseId}
                onChange={handleSelectPredefinedClause}
                style={{ width: '100%', fontSize: '13px', padding: '8px 12px' }}
                disabled={simulating}
              >
                <option value="">-- Or enter custom clause text below --</option>
                {detectedClauses.map((c, i) => (
                  <option key={c.id || c._id || i} value={c.id || c._id || i}>
                    [{c.clauseType || c.clause_type || 'Clause'}] {(c.extracted_snippet || c.snippet || c.text || '').slice(0, 80)}...
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-lo" style={{ fontSize: '11.5px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              Original Clause Text in Contract
            </label>
            <textarea
              className="input"
              rows={3}
              style={{ width: '100%', fontSize: '13px', fontFamily: 'var(--font-mono, monospace)', padding: '10px' }}
              placeholder="Paste exact wording of the clause currently in the document..."
              value={originalClauseInput}
              onChange={(e) => setOriginalClauseInput(e.target.value)}
              disabled={simulating}
            />
          </div>

          <div>
            <label className="text-lo" style={{ fontSize: '11.5px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              Proposed Replacement Clause Text
            </label>
            <textarea
              className="input"
              rows={3}
              style={{ width: '100%', fontSize: '13px', fontFamily: 'var(--font-mono, monospace)', padding: '10px' }}
              placeholder="Enter the proposed amended or capped clause wording..."
              value={proposedClauseInput}
              onChange={(e) => setProposedClauseInput(e.target.value)}
              disabled={simulating}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
            <motion.button
              type="button"
              className="btn btn-primary"
              onClick={() => handleSimulate()}
              disabled={simulating || !proposedClauseInput.trim()}
              style={{ minWidth: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              {...buttonMotion}
            >
              {simulating ? (
                <>
                  <span className="spin">✦</span> Calculating Delta…
                </>
              ) : (
                <>
                  <span>⚡</span> Calculate Risk Delta
                </>
              )}
            </motion.button>
          </div>
        </div>
      ) : (
        <div className="mb-20">
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              className="input"
              style={{ flex: 1, padding: '10px 14px', fontSize: '13.5px' }}
              placeholder="e.g., What happens if the client pays 60 days late? What if we terminate without notice?"
              value={scenarioInput}
              onChange={(e) => setScenarioInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !simulating) handleSimulate();
              }}
              disabled={simulating}
            />
            <motion.button
              type="button"
              className="btn btn-primary"
              onClick={() => handleSimulate()}
              disabled={simulating || !scenarioInput.trim()}
              style={{ minWidth: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              {...buttonMotion}
            >
              {simulating ? (
                <>
                  <span className="spin">✦</span> Simulating…
                </>
              ) : (
                <>
                  <span>🔮</span> Run Scenario
                </>
              )}
            </motion.button>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
            <span className="text-lo" style={{ fontSize: '11px', alignSelf: 'center', fontWeight: 600 }}>
              Suggested:
            </span>
            {SUGGESTED_SCENARIOS.map((s) => (
              <motion.button
                key={s.id}
                type="button"
                className="source-tag"
                onClick={() => {
                  setScenarioInput(s.query);
                  handleSimulate(s.query);
                }}
                disabled={simulating}
                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                {...buttonMotion}
              >
                <span>{s.icon}</span>
                <span>{s.title}</span>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      <div className="divider" />

      {simulating ? (
        <div style={{ padding: '36px 0', textAlign: 'center' }}>
          <SkeletonLoader.Card count={1} height="180px" />
          <div className="text-lo mt-12" style={{ fontSize: '12px' }}>
            ⚙️ Executing in-memory risk recalculation and synthesizing legal impact narrative…
          </div>
        </div>
      ) : activeSimulation ? (
        <div style={{ display: 'grid', gap: '16px', marginBottom: '24px' }}>
          {activeSimulation.grounded === false ? (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                padding: '18px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontWeight: 600, fontSize: '13.5px' }}>
                <span>⚠</span>
                <span>Information Not Found in Document — Speculative Simulation Refused</span>
              </div>
              <p className="text-mid small mt-8" style={{ lineHeight: '1.6' }}>
                {activeSimulation.simulationAnalysis?.potentialImpact ||
                  'The scenario could not be grounded in detected contract provisions. Deciva strictly prevents ungrounded speculative hallucinations.'}
              </p>
            </div>
          ) : (
            <>
              {/* Quantitative Risk Score Delta Card */}
              {activeSimulation.beforeScore !== undefined && (
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(20, 24, 33, 0.95), rgba(15, 18, 26, 0.95))',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '10px',
                    padding: '20px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>⚖️</span>
                      <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--hi)' }}>
                        Deterministic Risk Recalculation
                      </span>
                    </div>
                    {(() => {
                      const badge = getDeltaBadge(activeSimulation.riskDelta, activeSimulation.riskDirection);
                      return (
                        <span
                          className={badge.className}
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '4px 10px',
                            borderRadius: '12px',
                            letterSpacing: '0.04em'
                          }}
                        >
                          {badge.icon} {badge.label}
                        </span>
                      );
                    })()}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px' }}>
                    <div
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '8px',
                        padding: '14px',
                        textAlign: 'center'
                      }}
                    >
                      <div className="text-lo" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                        Baseline Risk
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--hi)', marginTop: '4px' }}>
                        {activeSimulation.beforeScore}
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--lo)' }}>/100</span>
                      </div>
                      <span
                        className={`badge ${
                          activeSimulation.beforeLevel === 'HIGH' ? 'badge-danger' : activeSimulation.beforeLevel === 'LOW' ? 'badge-ok' : 'badge-warn'
                        }`}
                        style={{ fontSize: '10px', marginTop: '6px' }}
                      >
                        {activeSimulation.beforeLevel || 'BASELINE'}
                      </span>
                    </div>

                    <div
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '8px',
                        padding: '14px',
                        textAlign: 'center'
                      }}
                    >
                      <div className="text-lo" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                        Recalculated Risk
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--hi)', marginTop: '4px' }}>
                        {activeSimulation.afterScore}
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--lo)' }}>/100</span>
                      </div>
                      <span
                        className={`badge ${
                          activeSimulation.afterLevel === 'HIGH' ? 'badge-danger' : activeSimulation.afterLevel === 'LOW' ? 'badge-ok' : 'badge-warn'
                        }`}
                        style={{ fontSize: '10px', marginTop: '6px' }}
                      >
                        {activeSimulation.afterLevel || 'AFTER'}
                      </span>
                    </div>

                    <div
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '8px',
                        padding: '14px',
                        textAlign: 'center'
                      }}
                    >
                      <div className="text-lo" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                        Net Shift (Delta)
                      </div>
                      <div
                        style={{
                          fontSize: '24px',
                          fontWeight: 800,
                          marginTop: '4px',
                          color: activeSimulation.riskDelta < 0 ? '#10b981' : activeSimulation.riskDelta > 0 ? '#ef4444' : 'var(--hi)'
                        }}
                      >
                        {activeSimulation.riskDelta > 0 ? `+${activeSimulation.riskDelta}` : activeSimulation.riskDelta}
                        <span style={{ fontSize: '13px', fontWeight: 500 }}> pts</span>
                      </div>
                      <div className="text-lo" style={{ fontSize: '10.5px', marginTop: '6px', fontWeight: 600 }}>
                        Direction: {activeSimulation.riskDirection || 'UNCHANGED'}
                      </div>
                    </div>
                  </div>

                  {/* Findings Diff: Resolved & Introduced Hazards */}
                  {activeSimulation.riskFindings && (
                    <div style={{ marginTop: '16px', display: 'grid', gap: '8px' }}>
                      {activeSimulation.riskFindings.resolvedHazards?.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#10b981' }}>
                            ✓ Resolved Hazards:
                          </span>
                          {activeSimulation.riskFindings.resolvedHazards.map((hz, idx) => (
                            <span key={idx} className="badge badge-ok" style={{ fontSize: '10.5px' }}>
                              {hz}
                            </span>
                          ))}
                        </div>
                      )}

                      {activeSimulation.riskFindings.introducedHazards?.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#ef4444' }}>
                            ⚠ Introduced Hazards:
                          </span>
                          {activeSimulation.riskFindings.introducedHazards.map((hz, idx) => (
                            <span key={idx} className="badge badge-danger" style={{ fontSize: '10.5px' }}>
                              {hz}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Truthful AI Provenance Badge */}
                  <div
                    style={{
                      marginTop: '16px',
                      paddingTop: '12px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px',
                      fontSize: '11px',
                      color: 'var(--lo)'
                    }}
                  >
                    <span>
                      Engine: <strong style={{ color: 'var(--mid)' }}>{activeSimulation.provenance?.engine || 'Deterministic Risk Engine'}</strong>
                    </span>
                    <span>
                      Confidence:{' '}
                      <strong style={{ color: 'var(--mid)' }}>
                        {activeSimulation.provenance?.confidence?.score === null || activeSimulation.confidenceScore === null
                          ? 'Mathematically Verified (Rule-Based)'
                          : `${activeSimulation.confidenceScore}%`}
                      </strong>
                    </span>
                    <span>
                      Original Document: <strong style={{ color: '#10b981' }}>Immutable</strong>
                    </span>
                  </div>
                </div>
              )}

              {/* Evidence Section */}
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '16px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--gold)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📄 Target Provision &amp; Context ({activeSimulation.documentEvidence?.length || 0} Excerpts)
                  </span>
                  <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                    Immutable Contract Facts
                  </span>
                </div>

                <div style={{ display: 'grid', gap: '8px' }}>
                  {activeSimulation.documentEvidence?.map((ev, evIdx) => (
                    <div
                      key={evIdx}
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        borderLeft: '3px solid var(--gold)',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '12px',
                        color: 'var(--mid)',
                        lineHeight: '1.5'
                      }}
                    >
                      <strong style={{ color: 'var(--hi)', display: 'block', marginBottom: '4px' }}>
                        {ev.section || 'Referenced Section'}
                      </strong>
                      "{ev.excerpt}"
                    </div>
                  ))}
                </div>
              </div>

              {/* Narrative Analysis Card */}
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.04)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  borderRadius: '8px',
                  padding: '18px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--royal)', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🔮 Narrative Analysis: "{activeSimulation.scenario}"
                  </span>
                  <span
                    className={`badge ${
                      (activeSimulation.afterLevel || activeSimulation.simulationAnalysis?.riskLevel) === 'HIGH'
                        ? 'badge-danger'
                        : (activeSimulation.afterLevel || activeSimulation.simulationAnalysis?.riskLevel) === 'LOW'
                        ? 'badge-ok'
                        : 'badge-warn'
                    }`}
                    style={{ fontSize: '10.5px' }}
                  >
                    {activeSimulation.afterLevel || activeSimulation.simulationAnalysis?.riskLevel} RISK
                  </span>
                </div>

                <div className="mb-14">
                  <div className="text-lo" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                    Legal &amp; Commercial Impact
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--hi)', lineHeight: '1.6', margin: 0 }}>
                    {activeSimulation.simulationAnalysis?.potentialImpact}
                  </p>
                </div>

                {activeSimulation.simulationAnalysis?.affectedAreas?.length > 0 && (
                  <div className="mb-14">
                    <div className="text-lo" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                      Affected Contract Areas
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {activeSimulation.simulationAnalysis.affectedAreas.map((area, aIdx) => (
                        <span key={aIdx} className="source-tag" style={{ fontSize: '11px' }}>
                          📌 {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {activeSimulation.simulationAnalysis?.possibleConsequences?.length > 0 && (
                  <div className="mb-14">
                    <div className="text-lo" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                      Potential Consequences
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: 'var(--mid)', display: 'grid', gap: '4px' }}>
                      {activeSimulation.simulationAnalysis.possibleConsequences.map((c, cIdx) => (
                        <li key={cIdx}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {activeSimulation.simulationAnalysis?.recommendedNextSteps?.length > 0 && (
                  <div>
                    <div className="text-lo" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                      🧭 Recommended Mitigation Steps
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: 'var(--hi)', display: 'grid', gap: '4px' }}>
                      {activeSimulation.simulationAnalysis.recommendedNextSteps.map((step, sIdx) => (
                        <li key={sIdx}>{step}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--lo)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  textAlign: 'center'
                }}
              >
                ⚖️ {activeSimulation.simulationAnalysis?.disclaimer || DISCLAIMER_TEXT}
              </div>
            </>
          )}
        </div>
      ) : null}

      {history.length > 0 && (
        <div>
          <div className="text-lo mb-10" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Past Scenarios &amp; Recalculations ({history.length})
          </div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {history.map((h, hIdx) => {
              const deltaBadge = h.beforeScore !== undefined ? getDeltaBadge(h.riskDelta, h.riskDirection) : null;
              return (
                <div
                  key={h.id || hIdx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer'
                  }}
                  onClick={() => setActiveSimulation(h)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ fontSize: '12.5px', color: 'var(--hi)', fontWeight: 500 }}>
                      🔮 {h.scenario}
                    </div>
                    {deltaBadge && (
                      <span className={deltaBadge.className} style={{ fontSize: '10px' }}>
                        {deltaBadge.icon} {deltaBadge.label}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {h.beforeScore !== undefined && (
                      <span style={{ fontSize: '11px', color: 'var(--mid)', fontFamily: 'var(--font-mono, monospace)' }}>
                        {h.beforeScore} → {h.afterScore}
                      </span>
                    )}
                    <span
                      className={`badge ${
                        h.riskLevel === 'HIGH' ? 'badge-danger' : h.riskLevel === 'LOW' ? 'badge-ok' : 'badge-warn'
                      }`}
                      style={{ fontSize: '10px' }}
                    >
                      {h.riskLevel || 'MEDIUM'}
                    </span>
                    <span className="text-lo" style={{ fontSize: '11px' }}>
                      View →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationTab;
