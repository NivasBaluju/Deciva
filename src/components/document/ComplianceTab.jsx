import React, { useState, useEffect } from 'react';
import Api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import Icon from '../common/Icon';
import SkeletonLoader from '../common/SkeletonLoader';

export const ComplianceTab = ({ doc, refreshTrigger }) => {
  const [clausesData, setClausesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;
    async function loadCompliance() {
      setLoading(true);
      try {
        const res = await Api.get(`/api/documents/${doc.id}/clauses`);
        if (isMounted) setClausesData(res);
      } catch (err) {
        if (isMounted) toast(err.message || 'Failed to check compliance audit', 'error');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadCompliance();
    return () => {
      isMounted = false;
    };
  }, [doc.id, refreshTrigger, toast]);

  if (loading) {
    return <SkeletonLoader.Card count={3} height="130px" />;
  }

  const STANDARD_CHECKLIST = [
    { key: 'CONFIDENTIALITY', label: 'Confidentiality & Non-Disclosure', weight: 'High' },
    { key: 'TERMINATION', label: 'Termination for Cause & Convenience', weight: 'Critical' },
    { key: 'PAYMENT', label: 'Payment Terms & Consideration', weight: 'High' },
    { key: 'LIABILITY', label: 'Limitation of Liability & Damages', weight: 'Critical' },
    { key: 'INDEMNIFICATION', label: 'Indemnification & Hold Harmless', weight: 'High' },
    { key: 'GOVERNING_LAW', label: 'Governing Law & Jurisdiction', weight: 'Medium' },
    { key: 'DISPUTE_RESOLUTION', label: 'Dispute Resolution & Arbitration', weight: 'Medium' },
    { key: 'DATA_PRIVACY', label: 'Data Protection & Privacy (GDPR/CCPA)', weight: 'Critical' },
    { key: 'FORCE_MAJEURE', label: 'Force Majeure & Unforeseen Events', weight: 'Low' },
    { key: 'IP_ASSIGNMENT', label: 'Intellectual Property Ownership', weight: 'High' }
  ];

  const detectedMap = {};
  (clausesData?.clauses?.detected || []).forEach((c) => {
    const k = c.clauseType || c.primaryClauseType;
    if (k) detectedMap[k] = c;
  });

  const checklistItems = STANDARD_CHECKLIST.map((item) => {
    const match = detectedMap[item.key];
    if (match) {
      if (match.status === 'CONFIRMED') return { ...item, status: 'CONFIRMED', badge: 'badge-ok', text: 'Confirmed', icon: '✓' };
      if (match.status === 'LIKELY_PRESENT') return { ...item, status: 'LIKELY_PRESENT', badge: 'badge-info', text: 'Likely Present', icon: '◐' };
      return { ...item, status: 'UNCERTAIN', badge: 'badge-warn', text: 'Needs Review', icon: '⚠' };
    }
    return { ...item, status: 'NOT_DETECTED', badge: 'badge-danger', text: 'Not Detected', icon: '✕' };
  });

  const confirmedCount = checklistItems.filter((i) => i.status === 'CONFIRMED' || i.status === 'LIKELY_PRESENT').length;
  const complianceScore = Math.round((confirmedCount / STANDARD_CHECKLIST.length) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="card" style={{ padding: '24px' }}>
        <div className="flex-between">
          <div>
            <div className="card-title">
              <span className="dot dot-emerald" />
              Institutional Contract Compliance Audit
            </div>
            <p className="text-mid small">
              Standard commercial contract audit verifying essential protections across 10 vital domains.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: complianceScore >= 70 ? 'var(--emerald)' : 'var(--amber)' }}>
              {complianceScore}%
            </div>
            <div className="text-lo small">{confirmedCount} of 10 Required Provisions</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title mb-16">
          <span className="dot" />
          Provisions Checklist
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {checklistItems.map((item, idx) => (
            <div
              key={idx}
              className="flex-between"
              style={{
                padding: '12px 16px',
                background: idx % 2 === 0 ? 'var(--off-white)' : 'var(--white)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 700,
                    background: item.status === 'CONFIRMED' ? '#D1FAE5' : item.status === 'LIKELY_PRESENT' ? '#DBEAFE' : item.status === 'UNCERTAIN' ? '#FEF3C7' : '#FEE2E2',
                    color: item.status === 'CONFIRMED' ? '#065F46' : item.status === 'LIKELY_PRESENT' ? '#1E40AF' : item.status === 'UNCERTAIN' ? '#92400E' : '#991B1B'
                  }}
                >
                  {item.icon}
                </span>
                <div>
                  <strong style={{ fontSize: '13.5px', color: 'var(--navy)' }}>{item.label}</strong>
                  <div className="text-lo small">Priority: {item.weight}</div>
                </div>
              </div>

              <div>
                <span className={`badge ${item.badge}`} style={{ fontSize: '12px', padding: '4px 10px' }}>
                  {item.text}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ComplianceTab;
