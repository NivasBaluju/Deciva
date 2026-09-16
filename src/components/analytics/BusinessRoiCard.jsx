import React, { useState, useEffect } from 'react';
import Api from '../../services/api';
import { useToast } from '../../context/ToastContext';

export const BusinessRoiCard = () => {
  const [roiData, setRoiData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [manualMinutes, setManualMinutes] = useState(90);
  const [hourlyRate, setHourlyRate] = useState(250);
  const { toast } = useToast();

  const fetchRoi = async () => {
    setLoading(true);
    try {
      const res = await Api.get(`/api/portfolio/roi?manual_minutes=${manualMinutes}&hourly_rate=${hourlyRate}`);
      setRoiData(res);
    } catch (err) {
      toast(err.message || 'Failed to load ROI analytics', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoi();
  }, [manualMinutes, hourlyRate]);

  const getCategoryBadge = (category) => {
    switch (category) {
      case 'OBSERVED':
        return { label: 'OBSERVED', bg: '#D1FAE5', color: '#047857', border: '#10B981' };
      case 'CALCULATED':
        return { label: 'CALCULATED', bg: '#DBEAFE', color: '#1D4ED8', border: '#3B82F6' };
      case 'CONFIGURED ASSUMPTION':
        return { label: 'CONFIGURED ASSUMPTION', bg: '#FEF3C7', color: '#B45309', border: '#F59E0B' };
      case 'NOT_AVAILABLE':
      default:
        return { label: 'NOT_AVAILABLE', bg: '#F3F4F6', color: '#6B7280', border: '#9CA3AF' };
    }
  };

  return (
    <div
      style={{
        border: '1px solid rgba(255, 255, 255, 0.12)',
        backgroundColor: '#0A0A0E',
        color: '#FFFFFF',
        fontFamily: 'var(--font-sans, "Public Sans", sans-serif)',
        padding: '24px',
        marginBottom: '24px'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          paddingBottom: '16px',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '1px',
                background: '#FFFFFF',
                color: '#000000',
                padding: '2px 6px'
              }}
            >
              VALUE &amp; EFFICIENCY
            </span>
            <h3
              style={{
                margin: 0,
                fontSize: '20px',
                fontFamily: 'var(--font-serif, "Fraunces", Georgia, serif)',
                fontWeight: 600,
                color: '#FFFFFF'
              }}
            >
              Transparent Business ROI &amp; Operational Analytics
            </h3>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#A1A1AA' }}>
            Verifiable observed metrics separated from modeled assumptions. Zero fabricated financial claims.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            background: '#121218',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            padding: '8px 12px',
            fontSize: '12px'
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '10.5px', color: '#A1A1AA', fontWeight: 600 }}>
              Manual Review (Mins/Doc):
            </label>
            <input
              type="number"
              min="15"
              max="600"
              value={manualMinutes}
              onChange={(e) => setManualMinutes(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={{ width: '60px', padding: '3px 6px', border: '1px solid rgba(255, 255, 255, 0.2)', background: '#0A0A0E', color: '#FFFFFF', fontSize: '12px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '10.5px', color: '#A1A1AA', fontWeight: 600 }}>
              Counsel Rate ($/Hr):
            </label>
            <input
              type="number"
              min="50"
              max="2000"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={{ width: '70px', padding: '3px 6px', border: '1px solid rgba(255, 255, 255, 0.2)', background: '#0A0A0E', color: '#FFFFFF', fontSize: '12px' }}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#A1A1AA' }}>
          Loading transparent business ROI metrics…
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '14px',
            marginBottom: '20px'
          }}
        >
          {roiData?.metrics?.map((m) => {
            const badge = getCategoryBadge(m.category);
            return (
              <div
                key={m.id}
                style={{
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  backgroundColor: '#121218',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#E4E4E7' }}>
                      {m.label}
                    </span>
                    <span
                      style={{
                        fontSize: '9.5px',
                        fontWeight: 700,
                        padding: '1px 5px',
                        background: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: '22px',
                      fontWeight: 700,
                      color: m.category === 'NOT_AVAILABLE' ? '#71717A' : '#FFFFFF',
                      margin: '8px 0 4px',
                      fontFamily: 'var(--font-serif, "Fraunces", Georgia, serif)'
                    }}
                  >
                    {typeof m.value === 'number' ? m.value.toLocaleString() : m.value}
                  </div>
                </div>

                <div style={{ fontSize: '11px', color: '#A1A1AA', borderTop: '1px dotted rgba(255, 255, 255, 0.12)', paddingTop: '6px', marginTop: '6px' }}>
                  {m.source ? (
                    <span>Source: <code style={{ color: '#FFFFFF', background: 'rgba(255,255,255,0.08)', padding: '1px 4px' }}>{m.source}</code></span>
                  ) : m.reason ? (
                    <span style={{ fontStyle: 'italic' }}>{m.reason}</span>
                  ) : (
                    <span>Modeled: {manualMinutes}m baseline @ ${hourlyRate}/hr</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          border: '1px solid rgba(255, 255, 255, 0.1)',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          padding: '12px 16px',
          fontSize: '11.5px',
          color: '#A1A1AA',
          lineHeight: '1.6'
        }}
      >
        <strong style={{ color: '#FFFFFF' }}>Methodology &amp; Truthfulness Invariant: </strong>
        {roiData?.methodology?.disclaimer ||
          'Observed metrics represent factual database records. Cost avoidance is an estimation derived strictly from user-configured baseline assumptions. It does not represent realized cash savings or audited financial yield.'}
      </div>
    </div>
  );
};

export default BusinessRoiCard;
