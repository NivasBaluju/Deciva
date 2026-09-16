import React, { useState } from 'react';
import { motion } from 'motion/react';
import Icon from '../common/Icon';

export const ObservatoryRadial = ({
  score = 100,
  mfaEnabled = false,
  isAuditValid = true,
  activeSessionsCount = 1,
  threatsCount = 0,
  auditBlocksCount = 0,
  docsEncryptedCount = 0,
  selectedNode = null,
  onSelectNode
}) => {
  const [hoveredDay, setHoveredDay] = useState(null);

  const clampedScore = Math.max(0, Math.min(100, score));
  const grade = clampedScore >= 95 ? 'INSTITUTIONAL GRADE A+' : clampedScore >= 80 ? 'ENTERPRISE GRADE A' : clampedScore >= 60 ? 'COMMERCIAL GRADE B' : 'PROBATION GRADE C';
  const scoreColor = clampedScore >= 90 ? '#10B981' : clampedScore >= 70 ? '#3B82F6' : clampedScore >= 50 ? '#F59E0B' : '#EF4444';

  const currentDocs = docsEncryptedCount || 0;
  const currentAuth = activeSessionsCount || 1;
  const activityDays = [
    { key: 'Mon', day: 'Monday', auth: 0, docs: 0, total: 0 },
    { key: 'Tue', day: 'Tuesday', auth: 0, docs: 0, total: 0 },
    { key: 'Wed', day: 'Wednesday', auth: 0, docs: 0, total: 0 },
    { key: 'Thu', day: 'Thursday', auth: 0, docs: 0, total: 0 },
    { key: 'Fri', day: 'Friday', auth: 0, docs: 0, total: 0 },
    { key: 'Sat', day: 'Saturday', auth: 0, docs: 0, total: 0 },
    { key: 'Today', day: 'Current Cycle', auth: currentAuth, docs: currentDocs, total: currentAuth + currentDocs }
  ];

  const nodes = [
    {
      id: 'identity',
      title: 'IDENTITY',
      metric: mfaEnabled ? 'MFA ACTIVE' : 'MFA OPTIONAL',
      statusText: mfaEnabled ? 'Healthy' : 'Configurable',
      status: mfaEnabled ? 'ok' : 'warn',
      icon: 'shield',
      angle: -90,
      x: 380,
      y: 76
    },
    {
      id: 'encryption',
      title: 'ENCRYPTION',
      metric: 'AES-256-GCM',
      statusText: 'Healthy',
      status: 'ok',
      icon: 'lock',
      angle: -30,
      x: 554,
      y: 172
    },
    {
      id: 'integrity',
      title: 'INTEGRITY',
      metric: isAuditValid ? 'LEDGER VALID' : 'AUDIT WARNING',
      statusText: isAuditValid ? 'Healthy' : 'Anomaly',
      status: isAuditValid ? 'ok' : 'danger',
      icon: 'check',
      angle: 30,
      x: 554,
      y: 368
    },
    {
      id: 'audit',
      title: 'AUDIT LEDGER',
      metric: `${(auditBlocksCount || 0).toLocaleString()} BLOCKS`,
      statusText: isAuditValid ? 'VALID' : 'TAMPERED',
      status: isAuditValid ? 'ok' : 'danger',
      icon: 'document',
      angle: 90,
      x: 380,
      y: 464
    },
    {
      id: 'threats',
      title: 'THREATS',
      metric: `${threatsCount || 0} HIGH · MITIGATED`,
      statusText: threatsCount > 0 ? 'Active Monitoring' : 'Guarded',
      status: threatsCount > 0 ? 'warn' : 'ok',
      icon: 'alert',
      angle: 150,
      x: 206,
      y: 368
    },
    {
      id: 'sessions',
      title: 'SESSIONS',
      metric: `${activeSessionsCount || 1} ACTIVE`,
      statusText: clampedScore >= 80 ? 'Trust Verified' : 'Fingerprint Shift',
      status: clampedScore >= 80 ? 'ok' : 'warn',
      icon: 'settings',
      angle: 210,
      x: 206,
      y: 172
    }
  ];

  const centerX = 380;
  const centerY = 270;
  const hubRadius = 78;
  const activityRingRadius = 245;

  return (
    <div className="observatory-container">
      <svg
        className="observatory-svg"
        viewBox="0 0 760 540"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={scoreColor} stopOpacity="0.14" />
            <stop offset="60%" stopColor={scoreColor} stopOpacity="0.04" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nodeActiveGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={centerX} cy={centerY} r="260" fill="none" stroke="var(--rule)" strokeWidth="1" strokeOpacity="0.6" />
        <circle cx={centerX} cy={centerY} r={activityRingRadius} fill="none" stroke="var(--rule)" strokeWidth="1" strokeDasharray="3 6" />
        <circle cx={centerX} cy={centerY} r="200" fill="none" stroke="var(--rule)" strokeWidth="1" strokeOpacity="0.8" />
        <circle cx={centerX} cy={centerY} r="140" fill="none" stroke="var(--rule)" strokeWidth="1" strokeDasharray="2 4" strokeOpacity="0.8" />
        <circle cx={centerX} cy={centerY} r="100" fill="none" stroke="var(--rule)" strokeWidth="1" />

        <circle cx={centerX} cy={centerY} r="110" fill="url(#centerGlow)" />
        <circle
          cx={centerX}
          cy={centerY}
          r={hubRadius}
          fill="var(--paper)"
          stroke="var(--ink)"
          strokeWidth="1.5"
        />
        <circle
          cx={centerX}
          cy={centerY}
          r={hubRadius - 6}
          fill="none"
          stroke={scoreColor}
          strokeWidth="1"
          strokeOpacity="0.45"
        />

        {nodes.map((n) => {
          const isSelected = selectedNode === n.id;
          const strokeColor = isSelected ? 'var(--ink)' : 'var(--rule)';
          const strokeWidth = isSelected ? 2 : 1;
          const strokeDash = isSelected ? 'none' : '3 3';

          return (
            <g key={`spoke-${n.id}`}>
              <line
                x1={centerX}
                y1={centerY}
                x2={n.x}
                y2={n.y}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDash}
                style={{ transition: 'all 0.3s ease' }}
              />
              {isSelected && (
                <circle
                  cx={(centerX + n.x) / 2}
                  cy={(centerY + n.y) / 2}
                  r="3"
                  fill="var(--ink)"
                />
              )}
            </g>
          );
        })}

        {activityDays.map((ad, idx) => {
          const angleStep = 360 / 7;
          const startAngle = idx * angleStep - 90;
          const endAngle = (idx + 1) * angleStep - 90 - 4;

          const toRad = (a) => (a * Math.PI) / 180;
          const r = activityRingRadius;
          const x1 = centerX + r * Math.cos(toRad(startAngle));
          const y1 = centerY + r * Math.sin(toRad(startAngle));
          const x2 = centerX + r * Math.cos(toRad(endAngle));
          const y2 = centerY + r * Math.sin(toRad(endAngle));

          const midAngle = (startAngle + endAngle) / 2;
          const labelR = activityRingRadius + 14;
          const lx = centerX + labelR * Math.cos(toRad(midAngle));
          const ly = centerY + labelR * Math.sin(toRad(midAngle));

          const isHovered = hoveredDay?.key === ad.key;
          const arcStroke = isHovered ? 'var(--ink)' : 'var(--rule)';
          const arcWidth = isHovered ? 3.5 : 1.5;

          return (
            <g
              key={ad.key}
              className="activity-day-segment"
              onMouseEnter={() => setHoveredDay(ad)}
              onMouseLeave={() => setHoveredDay(null)}
              style={{ cursor: 'pointer' }}
            >
              <path
                d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
                fill="none"
                stroke={arcStroke}
                strokeWidth={arcWidth}
                strokeLinecap="round"
                style={{ transition: 'all 0.2s ease' }}
              />
              <text
                x={lx}
                y={ly + 3}
                fill={isHovered ? 'var(--ink)' : 'var(--ink-soft)'}
                fontSize="9"
                fontFamily="var(--font-mono, monospace)"
                textAnchor="middle"
                fontWeight={isHovered ? '700' : '500'}
              >
                {ad.key}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="observatory-center-hub" style={{ borderColor: scoreColor }}>
        <span className="hub-tag mono">ZERO-TRUST</span>
        <div className="hub-score-wrap">
          <span className="hub-score-number" style={{ color: scoreColor }}>{clampedScore}</span>
          <span className="hub-score-max">/ 100</span>
        </div>
        <span className="hub-grade">{grade}</span>
        <span className="hub-status-sub">ALL SAFEGUARDS VERIFIED</span>
      </div>

      {hoveredDay && (
        <motion.div
          className="observatory-activity-tooltip"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
        >
          <strong style={{ color: 'var(--ink)', fontSize: '11px' }}>{hoveredDay.day}</strong>
          <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '10px' }}>
            <span style={{ color: '#2563EB' }}>🔑 {hoveredDay.auth} Auth Events</span>
            <span style={{ color: '#059669' }}>📄 {hoveredDay.docs} Encrypted Docs</span>
          </div>
        </motion.div>
      )}

      <div className="observatory-nodes-container">
        {nodes.map((n) => {
          const isSelected = selectedNode === n.id;
          const statusDotClass = n.status === 'ok' ? 'dot-emerald' : n.status === 'warn' ? 'dot-gold' : 'dot-danger';

          const renderIcon = () => {
            if (n.icon === 'shield') return <Icon.shield width={13} height={13} />;
            if (n.icon === 'lock') return <Icon.lock width={13} height={13} />;
            if (n.icon === 'check') return <Icon.check width={13} height={13} />;
            if (n.icon === 'document') return <Icon.document width={13} height={13} />;
            if (n.icon === 'alert') return <Icon.alert width={13} height={13} />;
            return <Icon.settings width={13} height={13} />;
          };

          return (
            <button
              key={n.id}
              className={`observatory-node-btn node-${n.id} ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectNode(isSelected ? null : n.id)}
              aria-label={`${n.title} security domain - ${n.metric}`}
            >
              <div className="node-icon-chip">
                {renderIcon()}
              </div>
              <div className="node-text-wrap">
                <div className="node-header-line">
                  <span className={`dot ${statusDotClass}`} />
                  <span className="node-title">{n.title}</span>
                </div>
                <span className="node-metric">{n.metric}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ObservatoryRadial;
