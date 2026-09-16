import React, { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import Api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import SkeletonLoader from '../common/SkeletonLoader';
import EmptyState from '../common/EmptyState';
import Icon from '../common/Icon';
import { EASE_OUT } from '../../styles/motion';

export const RiskTab = ({ doc, refreshTrigger }) => {
  const [riskData, setRiskData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [displayScore, setDisplayScore] = useState(0);
  const hasAnimatedRef = useRef(false);
  const shouldReduceMotion = useReducedMotion();
  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;
    async function loadRisk() {
      setLoading(true);
      try {
        const res = await Api.get(`/api/documents/${doc.id}/risks`);
        if (isMounted) {
          setRiskData(res);
          const finalScore = res.risk?.score ?? doc.risk_score ?? 0;
          if (shouldReduceMotion || hasAnimatedRef.current) {
            setDisplayScore(finalScore);
          } else {
            hasAnimatedRef.current = true;
            const duration = 450;
            const startTime = performance.now();
            const animateGauge = (now) => {
              const elapsed = now - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const current = Math.round(finalScore * (1 - Math.pow(1 - progress, 3)));
              if (isMounted) setDisplayScore(current);
              if (progress < 1) requestAnimationFrame(animateGauge);
            };
            requestAnimationFrame(animateGauge);
          }
        }
      } catch (err) {
        if (isMounted) toast(err.message || 'Failed to calculate risk score', 'error');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadRisk();
    return () => {
      isMounted = false;
    };
  }, [doc.id, refreshTrigger, toast, shouldReduceMotion]);

  if (loading) {
    return <SkeletonLoader.Card count={2} height="280px" />;
  }

  const score = riskData?.risk?.score ?? doc.risk_score ?? 0;
  const level = riskData?.risk?.level ?? (score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW');
  const hazardPoints = riskData?.risk?.hazardPoints ?? 0;
  const omissionPoints = riskData?.risk?.omissionPoints ?? 0;
  const factors = riskData?.riskFactors || [];

  const hazards = factors.filter((f) => f.severity === 'HIGH' || f.severity === 'CRITICAL' || f.riskType === 'CONFIRMED_HAZARD');
  const omissions = factors.filter((f) => f.severity === 'MEDIUM' || f.severity === 'LOW' || f.riskType === 'POTENTIAL_OMISSION');

  const riskColor = score >= 60 ? 'var(--red)' : score >= 30 ? 'var(--amber)' : 'var(--emerald)';
  const riskBadge = score >= 60 ? 'badge-danger' : score >= 30 ? 'badge-warn' : 'badge-ok';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="grid grid-2">
        <div className="card" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
          <div className="card-title" style={{ justifyContent: 'center' }}>
            <span className="dot" />
            Calibrated Document Risk Score
          </div>
          <div
            style={{
              fontFamily: 'var(--font-head)',
              fontSize: '84px',
              fontWeight: 700,
              color: riskColor,
              lineHeight: 1,
              margin: '12px 0'
            }}
          >
            {displayScore}
          </div>
          <p className="text-lo" style={{ margin: '0 0 16px' }}>
            Score Scale: 0 (Zero Risk) to 100 (Critical Legal Hazard)
          </p>
          <span className={`badge ${riskBadge}`} style={{ fontSize: '14px', padding: '6px 14px' }}>
            {level} RISK PROFILE
          </span>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="card-title">
            <span className="dot dot-gold" />
            Explainable Risk Attribution
          </div>
          <p className="text-mid small mb-16">
            Deciva decouples confirmed textual hazards from clause omissions to prevent false inflation:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ padding: '12px', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 'var(--radius-sm)' }}>
              <div className="flex-between">
                <strong style={{ color: 'var(--red)', fontSize: '13.5px' }}>Confirmed Textual Hazards</strong>
                <span className="badge badge-danger">+{hazardPoints} pts</span>
              </div>
              <p className="text-mid small mt-4">Risks explicitly detected within contract clauses (e.g. unilateral terms, uncapped liability).</p>
            </div>

            <div style={{ padding: '12px', background: '#FFFBEB', border: '1px solid #FEF3C7', borderRadius: 'var(--radius-sm)' }}>
              <div className="flex-between">
                <strong style={{ color: 'var(--amber)', fontSize: '13.5px' }}>Potential Clause Omissions</strong>
                <span className="badge badge-warn">+{omissionPoints} pts</span>
              </div>
              <p className="text-mid small mt-4">Standard protective commercial clauses not confirmed in the text (moderated score cap).</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">
            <span className="dot dot-red" />
            Confirmed Contract Hazards ({hazards.length})
          </div>

          {hazards.length === 0 ? (
            <p className="text-lo small mt-12">No high-severity textual hazards detected.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
              {hazards.map((h, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 12px',
                    background: 'var(--off-white)',
                    borderLeft: '3px solid var(--red)',
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  <div className="flex-between">
                    <strong style={{ fontSize: '13px', color: 'var(--navy)' }}>{h.reason}</strong>
                    <span className="badge badge-danger">+{h.riskPoints || h.risk_points} pts</span>
                  </div>
                  <div className="text-lo small mt-4">Severity: {h.severity}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">
            <span className="dot dot-amber" />
            Potential Clause Omissions ({omissions.length})
          </div>

          {omissions.length === 0 ? (
            <p className="text-lo small mt-12">All standard checklist clauses are accounted for.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
              {omissions.map((o, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 12px',
                    background: 'var(--off-white)',
                    borderLeft: '3px solid var(--amber)',
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  <div className="flex-between">
                    <strong style={{ fontSize: '13px', color: 'var(--navy)' }}>{o.reason}</strong>
                    <span className="badge badge-warn">+{o.riskPoints || o.risk_points} pts</span>
                  </div>
                  <div className="text-lo small mt-4">Severity: {o.severity}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RiskTab;
