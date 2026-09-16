import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import Api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import Icon from '../common/Icon';
import EmptyState from '../common/EmptyState';
import SkeletonLoader from '../common/SkeletonLoader';
import { buttonMotion, EASE_OUT } from '../../styles/motion';

export const IntelligenceTab = ({ doc, refreshTrigger }) => {
  const [intelData, setIntelData] = useState(null);
  const [decisionIntel, setDecisionIntel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('BRIEF');
  const [applyingScenarioId, setApplyingScenarioId] = useState(null);
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDim, setExpandedDim] = useState(null);
  const [expandedConflictId, setExpandedConflictId] = useState(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const loadAllIntelligence = async (showToast = false) => {
    if (!doc?.id) return;
    if (showToast) setRefreshing(true);
    try {
      const [intelRes, decRes] = await Promise.allSettled([
        Api.get(`/api/documents/${doc.id}/intelligence`),
        Api.get(`/api/documents/${doc.id}/decision-intelligence`)
      ]);

      if (intelRes.status === 'fulfilled') {
        setIntelData(intelRes.value);
      }
      if (decRes.status === 'fulfilled') {
        setDecisionIntel(decRes.value);
      }
      if (showToast) toast('Contract Decision Intelligence updated successfully', 'ok');
    } catch (err) {
      toast(err.message || 'Failed to load contract decision intelligence', 'error');
    } finally {
      setLoading(false);
      if (showToast) setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllIntelligence(false);
  }, [doc?.id, refreshTrigger]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Api.post(`/api/documents/${doc.id}/intelligence/refresh`, {});
      await loadAllIntelligence(false);
      toast('Contract Decision Intelligence re-computed', 'ok');
    } catch (err) {
      toast(err.message || 'Failed to refresh decision intelligence', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleApplyScenarioAction = async (scenario) => {
    setApplyingScenarioId(scenario.scenarioId);
    try {
      const res = await Api.post(`/api/documents/${doc.id}/decisions/act`, {
        scenarioId: scenario.scenarioId,
        notes: `Selected strategy: ${scenario.strategy}. Target delta: ${scenario.riskDelta} points.`
      });
      toast(`Decision applied to Action Center: ${scenario.title}`, 'ok');
      setTimeout(() => {
        navigate(`/document/${doc.id}/actions`);
      }, 800);
    } catch (err) {
      toast(err.message || 'Failed to convert scenario into action item', 'error');
    } finally {
      setApplyingScenarioId(null);
    }
  };

  const handleExportBrief = () => {
    const activeData = decisionIntel || intelData;
    if (!activeData) return;
    const dateStr = new Date().toISOString().split('T')[0];
    const docName = doc.original_name || doc.filename || 'Contract';

    let briefMd = `# EXECUTIVE CONTRACT DECISION INTELLIGENCE BRIEF\n`;
    briefMd += `**Document:** ${docName}\n`;
    briefMd += `**Overall Exposure Score:** ${activeData.exposureScore || 50}/100\n`;
    briefMd += `**Primary Deterioration Driver:** ${activeData.primaryDeteriorationDriver || 'Liability'}\n`;
    briefMd += `**Date:** ${dateStr}\n\n`;

    if (decisionIntel?.executiveDecisionBrief) {
      const b = decisionIntel.executiveDecisionBrief;
      briefMd += `## 9-Question Executive Decision Brief\n`;
      briefMd += `1. **Core Issue:** ${b.q1_core_issue}\n`;
      briefMd += `2. **Why It Matters:** ${b.q2_why_matters}\n`;
      briefMd += `3. **Quantifiable Exposure:** ${b.q3_quantifiable_exposure}\n`;
      briefMd += `4. **Inaction Consequence:** ${b.q4_inaction_consequence}\n`;
      briefMd += `5. **Strategic Options:** ${b.q5_strategic_options}\n`;
      briefMd += `6. **Recommended Option:** ${b.q6_recommended_option}\n`;
      briefMd += `7. **Required Action:** ${b.q7_required_action}\n`;
      briefMd += `8. **Decision Owner:** ${b.q8_decision_owner}\n`;
      briefMd += `9. **Target Deadline:** ${b.q9_target_deadline}\n\n`;
    }

    if (decisionIntel?.whatIfScenarios) {
      briefMd += `## What-If Negotiation Scenarios\n`;
      decisionIntel.whatIfScenarios.forEach((s) => {
        briefMd += `### ${s.title} (${s.riskDelta >= 0 ? '+' : ''}${s.riskDelta} pts)\n`;
        briefMd += `- **Strategy:** ${s.strategy}\n`;
        briefMd += `- **Projected Exposure:** ${s.projectedExposureScore}/100\n`;
        briefMd += `- **Financial Impact:** ${s.financialImpact.explanation}\n`;
        briefMd += `- **Operational Impact:** ${s.operationalImpact}\n`;
        briefMd += `- **Legal Position:** ${s.legalPosition}\n\n`;
      });
    }

    briefMd += `---\n*Deciva Deterministic Decision Intelligence Engine. ${activeData.disclaimer}*\n`;

    const blob = new Blob([briefMd], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Deciva_Decision_Brief_${docName.replace(/\.[^/.]+$/, '')}_${dateStr}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('Executive decision brief exported successfully', 'ok');
  };

  if (loading) {
    return (
      <div className="card">
        <SkeletonLoader.Text lines={2} width="320px" />
        <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          <SkeletonLoader.Card count={3} height="140px" />
        </div>
        <div style={{ marginTop: '20px' }}>
          <SkeletonLoader.Card count={2} height="200px" />
        </div>
      </div>
    );
  }

  const primaryDriver = decisionIntel?.primaryDeteriorationDriver || 'Liability Exposure';
  const exposureScore = decisionIntel?.exposureScore ?? (100 - (intelData?.healthScore || 50));
  const healthScore = decisionIntel?.healthScoreBreakdown?.overallHealthScore ?? (intelData?.healthScore || 50);

  const getSeverityBadge = (score) => {
    if (score >= 80) return { label: 'CRITICAL', class: 'badge-danger', color: 'var(--red)' };
    if (score >= 60) return { label: 'ELEVATED', class: 'badge-warn', color: 'var(--amber)' };
    if (score >= 40) return { label: 'MODERATE', class: 'badge-neutral', color: 'var(--text-lo)' };
    return { label: 'HEALTHY', class: 'badge-ok', color: 'var(--green)' };
  };

  const exposureBadge = getSeverityBadge(exposureScore);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="card" style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="dot dot-gold" />
              <h2 className="card-title" style={{ margin: 0, fontSize: '18px' }}>
                Contract Decision Intelligence Layer
              </h2>
              <span className="badge badge-neutral" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>
                Phase 10 Core Engine
              </span>
            </div>
            <p className="text-lo mt-4" style={{ fontSize: '13px', maxWidth: '720px', marginBottom: 0 }}>
              Evidence-derived forward risk, deterministic 9-dimension scoring, linear dependency propagation, and audited decision support.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <motion.button
              className="btn btn-royal btn-sm"
              onClick={() => navigate(`/document/${doc.id}/actions`)}
              title="Open human workflow action center"
              {...buttonMotion}
            >
              <Icon.zap width={14} height={14} /> Action Center
            </motion.button>

            <motion.button
              className="btn btn-outline btn-sm"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Re-compute decision intelligence"
              {...buttonMotion}
            >
              <Icon.trending width={14} height={14} /> {refreshing ? 'Evaluating…' : 'Re-Evaluate'}
            </motion.button>

            <motion.button
              className="btn btn-primary btn-sm"
              onClick={handleExportBrief}
              title="Download executive decision brief report"
              {...buttonMotion}
            >
              <Icon.download width={14} height={14} /> Export Brief
            </motion.button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '20px' }}>
          <div
            style={{
              padding: '16px 20px',
              borderRadius: '8px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                border: `3px solid ${exposureBadge.color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column'
              }}
            >
              <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-hi)' }}>{exposureScore}</span>
              <span style={{ fontSize: '9px', color: 'var(--text-lo)', marginTop: '-3px' }}>/100</span>
            </div>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-lo)' }}>
                Exposure Index
              </div>
              <span className={`badge ${exposureBadge.class} mt-4`} style={{ fontSize: '11px' }}>
                {exposureBadge.label} EXPOSURE
              </span>
            </div>
          </div>

          <div
            style={{
              padding: '16px 20px',
              borderRadius: '8px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}
          >
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-lo)' }}>
              Primary Deterioration Driver
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-hi)', marginTop: '4px' }}>
              {primaryDriver}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-lo)', marginTop: '2px' }}>
              Largest contributing factor to overall contract risk
            </div>
          </div>

          <div
            style={{
              padding: '16px 20px',
              borderRadius: '8px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}
          >
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-lo)' }}>
              Overall Contract Health
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: healthScore >= 70 ? 'var(--green)' : (healthScore >= 50 ? 'var(--amber)' : 'var(--red)'), marginTop: '2px' }}>
              {healthScore} <span style={{ fontSize: '12px', color: 'var(--text-lo)', fontWeight: 400 }}>/ 100</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-lo)', marginTop: '2px' }}>
              {decisionIntel?.healthScoreBreakdown?.dimensions?.length || 8} underlying dimensions assessed
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginTop: '20px',
            borderTop: '1px solid var(--border-color)',
            paddingTop: '16px',
            overflowX: 'auto'
          }}
        >
          {[
            { id: 'BRIEF', label: 'Decision Brief (9 Questions)', icon: <Icon.document width={14} height={14} /> },
            { id: 'SCENARIOS', label: 'What-If Scenarios', icon: <Icon.zap width={14} height={14} /> },
            { id: 'DEPENDENCY', label: 'Primary Dependency Chain', icon: <Icon.trending width={14} height={14} /> },
            { id: 'EXPOSURE', label: '9-Dimension Exposure', icon: <Icon.shield width={14} height={14} /> },
            { id: 'CONFLICTS', label: `Conflicts (${decisionIntel?.crossClauseConflicts?.length || intelData?.conflicts?.length || 0})`, icon: <Icon.alertTriangle width={14} height={14} /> },
            { id: 'ACTIONS', label: `Action Center (${intelData?.actionPlan?.length || 0})`, icon: <Icon.checkCircle width={14} height={14} /> }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`btn btn-sm ${activeSubTab === tab.id ? 'btn-primary' : 'btn-outline'}`}
              style={{
                fontSize: '12px',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeSubTab === 'BRIEF' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card">
            <h3 style={{ fontSize: '15px', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="dot dot-gold" /> Executive Decision Brief (9 Critical Questions)
            </h3>

            {decisionIntel?.executiveDecisionBrief ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
                {[
                  { q: '1. What is the core contractual issue?', a: decisionIntel.executiveDecisionBrief.q1_core_issue, badge: 'Core Issue' },
                  { q: '2. Why does it matter to the business?', a: decisionIntel.executiveDecisionBrief.q2_why_matters, badge: 'Business Rationale' },
                  { q: '3. What is the quantifiable exposure?', a: decisionIntel.executiveDecisionBrief.q3_quantifiable_exposure, badge: 'Quantified Exposure' },
                  { q: '4. What happens if no action is taken?', a: decisionIntel.executiveDecisionBrief.q4_inaction_consequence, badge: 'Inaction Risk' },
                  { q: '5. What strategic options exist?', a: decisionIntel.executiveDecisionBrief.q5_strategic_options, badge: 'Strategic Options' },
                  { q: '6. Which option is recommended?', a: decisionIntel.executiveDecisionBrief.q6_recommended_option, badge: 'Recommendation', highlight: true },
                  { q: '7. What specific action is required?', a: decisionIntel.executiveDecisionBrief.q7_required_action, badge: 'Action Required' },
                  { q: '8. Who should own this decision?', a: decisionIntel.executiveDecisionBrief.q8_decision_owner, badge: 'Owner' },
                  { q: '9. What is the target completion deadline?', a: decisionIntel.executiveDecisionBrief.q9_target_deadline, badge: 'Timeline' }
                ].map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '6px',
                      background: item.highlight ? 'rgba(37, 99, 235, 0.04)' : 'var(--bg-elevated)',
                      border: `1px solid ${item.highlight ? 'rgba(37, 99, 235, 0.3)' : 'var(--border-color)'}`
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-lo)' }}>
                        {item.badge}
                      </span>
                      <span className="badge badge-neutral" style={{ fontSize: '10px' }}>Q{idx + 1}</span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-hi)', marginBottom: '6px' }}>
                      {item.q}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-hi)', lineHeight: 1.5 }}>
                      {item.a}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-lo" style={{ fontSize: '13px' }}>
                Executive Decision Brief not generated yet. Click "Re-Evaluate" to synthesize.
              </p>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: '15px', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="dot dot-blue" /> Forward-Looking Risk Intelligence (Two-Tier Model)
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              <div style={{ padding: '14px', borderRadius: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <span className="badge badge-ok" style={{ fontSize: '10px' }}>TIER 1</span>
                  <strong style={{ fontSize: '13px' }}>Evidence-Derived Forward Risk (Deterministic)</strong>
                </div>
                <p className="text-lo" style={{ fontSize: '12px', marginBottom: '12px' }}>
                  Forward exposure deterministically inferred from verified contract terms without hypothetical claims.
                </p>

                {decisionIntel?.forwardRisk?.tier1_evidence_forward_risk?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {decisionIntel.forwardRisk.tier1_evidence_forward_risk.map((sig, idx) => (
                      <div key={idx} style={{ padding: '10px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-hi)' }}>{sig.signal}</div>
                        <div style={{ color: 'var(--text-lo)', marginTop: '2px' }}>{sig.evidence}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: 'var(--text-lo)' }}>
                          <span><strong>Horizon:</strong> {sig.horizon}</span>
                          <span className="badge badge-neutral" style={{ fontSize: '9px' }}>DETERMINISTIC</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-lo)' }}>
                    No acute forward renewal or forfeiture hazards detected in current provisions.
                  </div>
                )}
              </div>

              <div style={{ padding: '14px', borderRadius: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <span className="badge badge-neutral" style={{ fontSize: '10px' }}>TIER 2</span>
                  <strong style={{ fontSize: '13px' }}>Statistical / ML Prediction Status</strong>
                </div>
                <p className="text-lo" style={{ fontSize: '12px', marginBottom: '12px' }}>
                  Strict No-Fabrication Rule: Statistical models require verified empirical historical dispute datasets.
                </p>

                <div style={{ padding: '12px', borderRadius: '4px', background: 'rgba(234, 179, 8, 0.05)', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px' }}>⚖️</span>
                    <span className="badge badge-warn" style={{ fontSize: '10px' }}>INSUFFICIENT_HISTORICAL_DATA</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-hi)', lineHeight: 1.4 }}>
                    {decisionIntel?.forwardRisk?.tier2_statistical_prediction?.message ||
                      'Empirical dispute probability modeling requires a verified dataset of historical contract outcomes. Currently operating under deterministic forward risk.'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'SCENARIOS' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '15px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="dot dot-gold" /> What-If Multi-Scenario Negotiation Comparison
              </h3>
              <p className="text-lo mt-4" style={{ fontSize: '12px', margin: '4px 0 0 0' }}>
                Side-by-side impact simulation. Convert preferred scenario directly into tracked action items.
              </p>
            </div>
            <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
              No-Fabrication Financial Quantification
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {(decisionIntel?.whatIfScenarios || []).map((scenario) => {
              const isRec = scenario.recommended;
              return (
                <div
                  key={scenario.scenarioId}
                  style={{
                    padding: '18px',
                    borderRadius: '8px',
                    background: isRec ? 'rgba(37, 99, 235, 0.04)' : 'var(--bg-elevated)',
                    border: `1.5px solid ${isRec ? 'var(--primary)' : 'var(--border-color)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-hi)' }}>
                        {scenario.title}
                      </h4>
                      {isRec && (
                        <span className="badge badge-ok" style={{ fontSize: '10px' }}>
                          RECOMMENDED
                        </span>
                      )}
                    </div>

                    <p style={{ fontSize: '12px', color: 'var(--text-lo)', lineHeight: 1.4, marginBottom: '14px' }}>
                      {scenario.strategy}
                    </p>

                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-lo)' }}>
                          Projected Exposure
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-hi)' }}>
                          {scenario.projectedExposureScore} / 100
                        </div>
                      </div>
                      <span
                        className={`badge ${scenario.riskDelta < 0 ? 'badge-ok' : 'badge-neutral'}`}
                        style={{ fontSize: '12px', fontWeight: 700 }}
                      >
                        {scenario.riskDelta > 0 ? `+${scenario.riskDelta}` : scenario.riskDelta} pts
                      </span>
                    </div>

                    <div style={{ marginBottom: '12px', fontSize: '12px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-hi)', marginBottom: '2px' }}>
                        Financial Quantification
                      </div>
                      <div style={{ color: scenario.financialImpact.status === 'CALCULATED' ? 'var(--green)' : 'var(--text-lo)' }}>
                        {scenario.financialImpact.status === 'CALCULATED' ? (
                          <>
                            <strong>{scenario.financialImpact.formattedDelta}</strong>
                            <div style={{ fontSize: '11px', color: 'var(--text-lo)', marginTop: '2px' }}>
                              {scenario.financialImpact.explanation}
                            </div>
                          </>
                        ) : (
                          <span style={{ fontStyle: 'italic' }}>
                            {scenario.financialImpact.explanation}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ marginBottom: '12px', fontSize: '12px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-hi)', marginBottom: '2px' }}>
                        Operational Impact
                      </div>
                      <div style={{ color: 'var(--text-lo)' }}>
                        {scenario.operationalImpact}
                      </div>
                    </div>

                    <div style={{ marginBottom: '16px', fontSize: '12px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-hi)', marginBottom: '2px' }}>
                        Legal Posture
                      </div>
                      <div style={{ color: 'var(--text-lo)' }}>
                        {scenario.legalPosition}
                      </div>
                    </div>
                  </div>

                  <motion.button
                    className={`btn btn-sm ${isRec ? 'btn-primary' : 'btn-outline'}`}
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => handleApplyScenarioAction(scenario)}
                    disabled={applyingScenarioId === scenario.scenarioId}
                    {...buttonMotion}
                  >
                    <Icon.checkCircle width={14} height={14} />
                    {applyingScenarioId === scenario.scenarioId ? 'Applying…' : 'Apply to Action Center'}
                  </motion.button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeSubTab === 'DEPENDENCY' && (
        <div className="card">
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="dot dot-blue" /> Primary Linear Dependency Chain
            </h3>
            <p className="text-lo mt-4" style={{ fontSize: '12px', margin: '4px 0 0 0' }}>
              Clean sequential risk propagation: Clause &rarr; Notice Window &rarr; Deadline &rarr; Operational Impact &rarr; Escalation.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
            {(decisionIntel?.primaryDependencyChain || []).map((node, idx) => (
              <div
                key={idx}
                style={{
                  padding: '16px',
                  borderRadius: '6px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-color)',
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr',
                  gap: '16px',
                  alignItems: 'start'
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'var(--bg-card)',
                    border: '1.5px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '13px',
                    color: 'var(--text-hi)'
                  }}
                >
                  {node.step}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                      {node.nodeType}
                    </span>
                    <strong style={{ fontSize: '14px', color: 'var(--text-hi)' }}>
                      {node.title}
                    </strong>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-lo)', marginBottom: '8px' }}>
                    {node.description}
                  </div>
                  <div style={{ padding: '8px 12px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', fontSize: '12px', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-hi)' }}>Contract Evidence: </span>
                    <span style={{ fontStyle: 'italic', color: 'var(--text-lo)' }}>"{node.evidence}"</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Icon.alertTriangle width={12} height={12} />
                    <strong>Risk Propagation: </strong> {node.riskPropagation}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'EXPOSURE' && (
        <div className="card">
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="dot dot-gold" /> Deterministic 9-Dimension Exposure Model
            </h3>
            <p className="text-lo mt-4" style={{ fontSize: '12px', margin: '4px 0 0 0' }}>
              Traceable mathematical calculation where every score is computed from explicit contributing signals and deductions.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            {decisionIntel?.exposureModel ? (
              Object.entries(decisionIntel.exposureModel).map(([dimKey, dimData]) => {
                const badge = getSeverityBadge(dimData.score);
                const isExp = expandedDim === dimKey;
                return (
                  <div
                    key={dimKey}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '6px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer'
                    }}
                    onClick={() => setExpandedDim(isExp ? null : dimKey)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-hi)', textTransform: 'capitalize' }}>
                        {dimKey}
                      </span>
                      <span className={`badge ${badge.class}`} style={{ fontSize: '10px' }}>
                        {dimData.score} / 100
                      </span>
                    </div>

                    <div style={{ width: '100%', height: '6px', background: 'var(--bg-card)', borderRadius: '3px', overflow: 'hidden', marginBottom: '10px' }}>
                      <div style={{ width: `${dimData.score}%`, height: '100%', background: badge.color }} />
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--text-lo)', marginBottom: '8px' }}>
                      <strong>Formula: </strong> {dimData.calculation}
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>{isExp ? '▲ Hide contributors' : '▼ View contributing signals'}</span>
                    </div>

                    {isExp && (
                      <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-hi)', marginBottom: '6px' }}>
                          Contributing Signals:
                        </div>
                        {dimData.contributors.map((c, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                            <span style={{ color: 'var(--text-lo)' }}>&bull; {c.factor}</span>
                            <strong style={{ color: c.weight > 0 ? 'var(--red)' : 'var(--green)' }}>
                              {c.weight > 0 ? `+${c.weight}` : c.weight}
                            </strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-lo" style={{ fontSize: '13px' }}>Exposure model loading...</p>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'CONFLICTS' && (
        <div className="card">
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="dot dot-amber" /> Cross-Clause Conflict &amp; Contradiction Detection
            </h3>
            <p className="text-lo mt-4" style={{ fontSize: '12px', margin: '4px 0 0 0' }}>
              Side-by-side reconciliation of diverging provisions. Requires human legal review.
            </p>
          </div>

          {(decisionIntel?.crossClauseConflicts || intelData?.conflicts || []).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {(decisionIntel?.crossClauseConflicts || intelData?.conflicts || []).map((conflict, idx) => (
                <div
                  key={conflict.id || idx}
                  style={{
                    padding: '16px',
                    borderRadius: '6px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '14px', color: 'var(--text-hi)' }}>
                      {conflict.title}
                    </strong>
                    <span className="badge badge-warn" style={{ fontSize: '10px' }}>
                      {conflict.conflictType}
                    </span>
                  </div>

                  <p style={{ fontSize: '12px', color: 'var(--text-lo)', marginBottom: '12px' }}>
                    {conflict.description}
                  </p>

                  {conflict.evidenceA && conflict.evidenceB ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div style={{ padding: '10px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-hi)', marginBottom: '4px' }}>
                          Evidence A ({conflict.evidenceA.section})
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--amber)', marginBottom: '4px', fontWeight: 600 }}>
                          Stated: {conflict.evidenceA.identifiedValue}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-lo)', fontStyle: 'italic' }}>
                          "{conflict.evidenceA.excerpt}"
                        </div>
                      </div>

                      <div style={{ padding: '10px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-hi)', marginBottom: '4px' }}>
                          Evidence B ({conflict.evidenceB.section})
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--amber)', marginBottom: '4px', fontWeight: 600 }}>
                          Stated: {conflict.evidenceB.identifiedValue}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-lo)', fontStyle: 'italic' }}>
                          "{conflict.evidenceB.excerpt}"
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {conflict.potentialImpact && (
                    <div style={{ fontSize: '12px', color: 'var(--text-hi)', marginBottom: '8px' }}>
                      <strong>Potential Impact: </strong> {conflict.potentialImpact}
                    </div>
                  )}

                  <div style={{ fontSize: '12px', color: 'var(--primary)', marginBottom: '8px' }}>
                    <strong>Recommendation: </strong> {conflict.recommendation}
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-lo)', fontStyle: 'italic' }}>
                    * {conflict.disclaimer || 'Potential conflict requiring review — not an absolute legal conclusion.'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-lo" style={{ fontSize: '13px' }}>
              No contractual inconsistencies or contradictory timeline clauses identified.
            </p>
          )}
        </div>
      )}

      {activeSubTab === 'ACTIONS' && intelData?.actionPlan && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '15px', margin: 0 }}>
                Prioritized Action Items ({intelData.actionPlan.length})
              </h3>
              <p className="text-lo mt-4" style={{ fontSize: '12px', margin: '4px 0 0 0' }}>
                Ranked by deterministic multi-factor priority score.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {['ALL', 'CRITICAL', 'IMPORTANT', 'MONITORING'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`btn btn-sm ${filterCategory === cat ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {intelData.actionPlan
              .filter((item) => filterCategory === 'ALL' || item.category === filterCategory)
              .map((action, idx) => {
                const isCrit = action.category === 'CRITICAL';
                return (
                  <div
                    key={action.actionId || idx}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '6px',
                      background: 'var(--bg-elevated)',
                      border: `1px solid ${isCrit ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-color)'}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '16px'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span className={`badge ${isCrit ? 'badge-danger' : (action.category === 'IMPORTANT' ? 'badge-warn' : 'badge-neutral')}`} style={{ fontSize: '10px' }}>
                          {action.category} ({action.priorityScore}/100)
                        </span>
                        <strong style={{ fontSize: '14px', color: 'var(--text-hi)' }}>
                          {action.title}
                        </strong>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-hi)', marginBottom: '6px' }}>
                        {action.intelligenceAssessment?.recommendedAction}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-lo)' }}>
                        <strong>Why it matters: </strong> {action.intelligenceAssessment?.whyItMatters}
                      </div>
                    </div>

                    <motion.button
                      className="btn btn-outline btn-sm"
                      onClick={() => navigate(`/document/${doc.id}/actions`)}
                      {...buttonMotion}
                    >
                      View in Action Center
                    </motion.button>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};

export default IntelligenceTab;
