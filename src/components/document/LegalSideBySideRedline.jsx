import React, { useRef, useState, useEffect } from 'react';
import Icon from '../common/Icon';

export const LegalSideBySideRedline = ({
  originalText = '',
  proposedText = '',
  diffOperations = [],
  clauseType = 'Contract Clause',
  clauseId = '',
  riskSeverity = 'MEDIUM',
  rationale = '',
  evidenceRef = '',
  onAccept,
  isAccepted = false,
  onExportDocx,
  exportingDocx = false,
  beforeScore = null,
  afterScore = null,
  riskDelta = null,
  riskDirection = null,
  riskFindings = null
}) => {
  const [viewMode, setViewMode] = useState('side-by-side');
  const leftPaneRef = useRef(null);
  const rightPaneRef = useRef(null);
  const isSyncingLeft = useRef(false);
  const isSyncingRight = useRef(false);

  const handleLeftScroll = () => {
    if (isSyncingLeft.current) {
      isSyncingLeft.current = false;
      return;
    }
    if (leftPaneRef.current && rightPaneRef.current) {
      isSyncingRight.current = true;
      const left = leftPaneRef.current;
      const right = rightPaneRef.current;
      const scrollPct = left.scrollTop / (left.scrollHeight - left.clientHeight || 1);
      right.scrollTop = scrollPct * (right.scrollHeight - right.clientHeight);
    }
  };

  const handleRightScroll = () => {
    if (isSyncingRight.current) {
      isSyncingRight.current = false;
      return;
    }
    if (leftPaneRef.current && rightPaneRef.current) {
      isSyncingLeft.current = true;
      const left = leftPaneRef.current;
      const right = rightPaneRef.current;
      const scrollPct = right.scrollTop / (right.scrollHeight - right.clientHeight || 1);
      left.scrollTop = scrollPct * (right.scrollHeight - right.clientHeight);
    }
  };

  return (
    <div style={{ border: '1px solid var(--line, #27272A)', borderRadius: '0px', background: '#09090B' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          borderBottom: '1px solid var(--line, #27272A)',
          background: '#121215',
          flexWrap: 'wrap',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontFamily: 'Georgia, serif', fontWeight: 600, fontSize: '13px', color: '#FAFAFA' }}>
            {clauseType}
          </span>
          {clauseId && (
            <span style={{ fontSize: '10px', padding: '1px 6px', border: '1px solid #3F3F46', color: '#A1A1AA', fontFamily: 'monospace' }}>
              {clauseId}
            </span>
          )}
          <span
            style={{
              fontSize: '10px',
              padding: '1px 6px',
              fontWeight: 700,
              background: riskSeverity === 'HIGH' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(234, 179, 8, 0.2)',
              color: riskSeverity === 'HIGH' ? '#FCA5A5' : '#FDE047',
              border: `1px solid ${riskSeverity === 'HIGH' ? '#EF4444' : '#EAB308'}`
            }}
          >
            {riskSeverity} RISK
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'inline-flex', border: '1px solid #3F3F46' }}>
            <button
              type="button"
              onClick={() => setViewMode('side-by-side')}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                background: viewMode === 'side-by-side' ? '#FFFFFF' : 'transparent',
                color: viewMode === 'side-by-side' ? '#000000' : '#A1A1AA',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Side-by-Side
            </button>
            <button
              type="button"
              onClick={() => setViewMode('stacked')}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                background: viewMode === 'stacked' ? '#FFFFFF' : 'transparent',
                color: viewMode === 'stacked' ? '#000000' : '#A1A1AA',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Stacked Diff
            </button>
          </div>

          {onExportDocx && (
            <button
              type="button"
              onClick={onExportDocx}
              disabled={exportingDocx}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                background: '#18181B',
                border: '1px solid #3F3F46',
                color: '#FAFAFA',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              📄 {exportingDocx ? 'Generating DOCX…' : 'Export Word DOCX'}
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '8px 14px', background: '#0D0D10', borderBottom: '1px solid #1E1E24', fontSize: '11.5px', color: '#A1A1AA' }}>
        <strong style={{ color: '#E4E4E7' }}>Objective:</strong> {rationale || 'Commercially balanced counter-proposal.'}
        {evidenceRef && (
          <span style={{ marginLeft: '12px', color: '#71717A' }}>
            [Grounded: {evidenceRef}]
          </span>
        )}
      </div>

      {typeof beforeScore === 'number' && typeof afterScore === 'number' && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(24, 24, 27, 0.7)',
            borderBottom: '1px solid var(--line, #27272A)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            fontSize: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <span style={{ color: '#71717A', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '6px' }}>Baseline Risk:</span>
              <span style={{ fontWeight: 700, color: '#E4E4E7' }}>{beforeScore}/100</span>
            </div>
            <div style={{ color: '#52525B' }}>➔</div>
            <div>
              <span style={{ color: '#71717A', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '6px' }}>Projected Risk:</span>
              <span style={{ fontWeight: 700, color: '#FAFAFA' }}>{afterScore}/100</span>
            </div>
            <div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: (riskDelta < 0) ? 'rgba(16, 185, 129, 0.15)' : (riskDelta > 0) ? 'rgba(239, 68, 68, 0.15)' : 'rgba(113, 113, 122, 0.15)',
                  color: (riskDelta < 0) ? '#34D399' : (riskDelta > 0) ? '#F87171' : '#A1A1AA',
                  border: `1px solid ${riskDelta < 0 ? '#059669' : riskDelta > 0 ? '#DC2626' : '#52525B'}`
                }}
              >
                {riskDelta > 0 ? `+${riskDelta}` : riskDelta} pts ({riskDirection || (riskDelta < 0 ? 'REDUCED' : riskDelta > 0 ? 'INCREASED' : 'UNCHANGED')})
              </span>
            </div>
          </div>

          {riskFindings?.resolvedHazards && riskFindings.resolvedHazards.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: '#10B981', fontWeight: 600 }}>Resolved:</span>
              {riskFindings.resolvedHazards.map((h, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '2px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    color: '#6EE7B7',
                    border: '1px solid rgba(16, 185, 129, 0.3)'
                  }}
                >
                  ✓ {h.replace('CONFIRMED_HAZARD_', '').replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}

          {riskFindings?.introducedHazards && riskFindings.introducedHazards.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: '#EF4444', fontWeight: 600 }}>Introduced:</span>
              {riskFindings.introducedHazards.map((h, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '2px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#FCA5A5',
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                  }}
                >
                  ⚠ {h.replace('CONFIRMED_HAZARD_', '').replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {viewMode === 'side-by-side' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', minHeight: '220px' }}>
          <div
            ref={leftPaneRef}
            onScroll={handleLeftScroll}
            style={{
              padding: '14px',
              borderRight: '1px solid var(--line, #27272A)',
              maxHeight: '340px',
              overflowY: 'auto',
              background: '#09090B'
            }}
          >
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#71717A', letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase' }}>
              Original Contract Clause (Document Fact)
            </div>
            <div style={{ fontSize: '13px', lineHeight: '1.7', color: '#D4D4D8', fontFamily: 'Georgia, serif' }}>
              {originalText || 'No original clause text provided.'}
            </div>
          </div>

          <div
            ref={rightPaneRef}
            onScroll={handleRightScroll}
            style={{
              padding: '14px',
              maxHeight: '340px',
              overflowY: 'auto',
              background: '#0C0D10'
            }}
          >
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#34D399', letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
              <span>Proposed Negotiated Revision</span>
              <span style={{ color: '#A1A1AA', fontWeight: 400 }}>Word-Level Tracked</span>
            </div>
            <div style={{ fontSize: '13px', lineHeight: '1.7', fontFamily: 'Georgia, serif' }}>
              {diffOperations && diffOperations.length > 0 ? (
                diffOperations.map((op, idx) => {
                  if (op.type === 'delete') {
                    return (
                      <del
                        key={idx}
                        style={{
                          background: 'rgba(239, 68, 68, 0.25)',
                          color: '#FCA5A5',
                          textDecoration: 'line-through',
                          padding: '1px 3px',
                          margin: '0 1px'
                        }}
                      >
                        {op.text}
                      </del>
                    );
                  }
                  if (op.type === 'insert') {
                    return (
                      <ins
                        key={idx}
                        style={{
                          background: 'rgba(16, 185, 129, 0.25)',
                          color: '#6EE7B7',
                          textDecoration: 'none',
                          fontWeight: 600,
                          padding: '1px 3px',
                          margin: '0 1px'
                        }}
                      >
                        {op.text}
                      </ins>
                    );
                  }
                  return <span key={idx} style={{ color: '#FAFAFA' }}>{op.text}</span>;
                })
              ) : (
                <span style={{ color: '#FAFAFA' }}>{proposedText || originalText}</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '14px' }}>
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#71717A', marginBottom: '4px', textTransform: 'uppercase' }}>
              Original Clause
            </div>
            <div style={{ fontSize: '12.5px', color: '#A1A1AA', fontStyle: 'italic', padding: '8px 12px', background: '#121215', border: '1px solid #27272A' }}>
              "{originalText}"
            </div>
          </div>
          <div>
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#34D399', marginBottom: '4px', textTransform: 'uppercase' }}>
              Tracked Changes
            </div>
            <div style={{ fontSize: '13px', lineHeight: '1.7', padding: '10px 14px', background: '#121215', border: '1px solid #27272A' }}>
              {diffOperations && diffOperations.length > 0 ? (
                diffOperations.map((op, idx) => {
                  if (op.type === 'delete') {
                    return (
                      <del key={idx} style={{ background: 'rgba(239, 68, 68, 0.25)', color: '#FCA5A5', padding: '1px 3px' }}>
                        {op.text}
                      </del>
                    );
                  }
                  if (op.type === 'insert') {
                    return (
                      <ins key={idx} style={{ background: 'rgba(16, 185, 129, 0.25)', color: '#6EE7B7', textDecoration: 'none', fontWeight: 600, padding: '1px 3px' }}>
                        {op.text}
                      </ins>
                    );
                  }
                  return <span key={idx} style={{ color: '#FAFAFA' }}>{op.text}</span>;
                })
              ) : (
                <span style={{ color: '#FAFAFA' }}>{proposedText}</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 14px',
          background: '#121215',
          borderTop: '1px solid var(--line, #27272A)'
        }}
      >
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(proposedText);
          }}
          style={{
            padding: '5px 12px',
            fontSize: '11px',
            fontWeight: 600,
            background: '#18181B',
            border: '1px solid #3F3F46',
            color: '#E4E4E7',
            cursor: 'pointer'
          }}
        >
          Copy Revised Text
        </button>
        {onAccept && (
          <button
            type="button"
            onClick={onAccept}
            disabled={isAccepted}
            style={{
              padding: '5px 14px',
              fontSize: '11px',
              fontWeight: 700,
              background: isAccepted ? '#27272A' : '#FFFFFF',
              border: isAccepted ? '1px solid #3F3F46' : '1px solid #FFFFFF',
              color: isAccepted ? '#A1A1AA' : '#000000',
              cursor: isAccepted ? 'default' : 'pointer'
            }}
          >
            {isAccepted ? '✓ Accepted in Draft' : 'Accept Revision'}
          </button>
        )}
      </div>
    </div>
  );
};

export default LegalSideBySideRedline;
