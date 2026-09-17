import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import Api from '../services/api';
import { useToast } from '../context/ToastContext';
import Icon from '../components/common/Icon';
import SkeletonLoader from '../components/common/SkeletonLoader';
import PageTransition from '../components/common/PageTransition';

function parseLegalDate(dateStr) {
  if (!dateStr) return null;
  const cleaned = String(dateStr).trim();

  // Reject obvious non-dates (parcel numbers, tax IDs, etc.)
  if (/tax\s*parcel|parcel\s*no|parcel\s*id|07-14-226/i.test(cleaned)) return null;

  // Try named month matching: e.g. "August 15, 2026", "15 August 2026", "September 30, 2026"
  const namedMonthMatch = cleaned.match(/(?:(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4}))|(?:([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4}))/i);
  if (namedMonthMatch) {
    const day = parseInt(namedMonthMatch[1] || namedMonthMatch[5], 10);
    const monthStr = namedMonthMatch[2] || namedMonthMatch[4];
    const year = parseInt(namedMonthMatch[3] || namedMonthMatch[6], 10);
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = months.findIndex(m => monthStr.toLowerCase().startsWith(m));
    if (month >= 0 && year >= 2000 && year <= 2099) {
      return new Date(year, month, day);
    }
  }

  // Match numeric MM/DD/YYYY or YYYY-MM-DD (strictly 4-digit or 2-digit years, NOT 3-digit)
  const numMatch = cleaned.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})\b/);
  if (numMatch) {
    let year = parseInt(numMatch[3], 10);
    if (year < 100) year += 2000;
    if (year >= 2000 && year <= 2099) {
      const part1 = parseInt(numMatch[1], 10);
      const part2 = parseInt(numMatch[2], 10);
      const month = part1 <= 12 ? part1 - 1 : part2 - 1;
      const day = part1 <= 12 ? part2 : part1;
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        return new Date(year, month, day);
      }
    }
  }

  const isoMatch = cleaned.match(/\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    if (year >= 2000 && year <= 2099 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  const standard = new Date(cleaned);
  if (!isNaN(standard.getTime())) {
    const y = standard.getFullYear();
    if (y >= 2000 && y <= 2099) return standard;
  }

  return null;
}

function getDaysRemaining(targetDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const diffTime = target.getTime() - today.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

function formatTimelineDate(dateObj) {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const fullMonths = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = months[dateObj.getMonth()];
  const fullMonth = fullMonths[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  return {
    day,
    month,
    fullMonth,
    year,
    full: `${fullMonth} ${dateObj.getDate()}, ${year}`,
    short: `${day} ${month} ${year}`
  };
}

export const Deadlines = () => {
  const [serverDeadlines, setServerDeadlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;
    async function loadDeadlines() {
      try {
        const res = await Api.get('/api/ai/deadlines');
        if (isMounted && res.deadlines) {
          setServerDeadlines(res.deadlines);
          if (res.deadlines.length > 0) {
            setExpandedId(`srv-0`);
          }
        }
      } catch (err) {
        console.warn('Server deadlines fetch note:', err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadDeadlines();
    return () => {
      isMounted = false;
    };
  }, [toast]);

  const allDeadlines = useMemo(() => {
    if (!serverDeadlines || serverDeadlines.length === 0) return [];

    const validList = [];
    serverDeadlines.forEach((d, index) => {
      // Exclude parcel / tax ID sentences
      if (/tax\s*parcel|parcel\s*no|parcel\s*id|07-14-226/i.test(d.context || '') || /tax\s*parcel|parcel\s*no/i.test(d.date || '')) {
        return;
      }

      const dateObj = parseLegalDate(d.date);
      if (!dateObj) return; // Skip invalid or out-of-range dates

      const cat = d.category ? d.category.replace('_', ' ').toUpperCase() : 'MILESTONE';
      validList.push({
        id: `srv-${index}`,
        date: d.date,
        rawDate: dateObj,
        category: d.category || 'general',
        eventType: cat === 'EXPIRY' ? 'CONTRACT EXPIRY' : cat,
        documentName: d.documentName || 'Untitled Document',
        documentId: d.documentId,
        context: d.context || 'Extracted critical contractual milestone.',
        clause: d.context
      });
    });

    return validList.sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
  }, [serverDeadlines]);

  const trackedDocsCount = useMemo(() => {
    const set = new Set(allDeadlines.map(d => d.documentName));
    return set.size;
  }, [allDeadlines]);

  const nextDeadline = allDeadlines[0] || null;
  const nextDateFormatted = nextDeadline ? formatTimelineDate(nextDeadline.rawDate) : null;
  const nextDaysRemaining = nextDeadline ? getDaysRemaining(nextDeadline.rawDate) : 0;

  const monthsDistribution = useMemo(() => {
    const map = new Map();
    allDeadlines.forEach(d => {
      const monthKey = d.rawDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      const count = map.get(monthKey) || 0;
      map.set(monthKey, count + 1);
    });
    return Array.from(map.entries()).map(([month, count]) => ({ month, count }));
  }, [allDeadlines]);

  const visibleDeadlines = useMemo(() => {
    if (selectedMonth === 'ALL') return allDeadlines;
    return allDeadlines.filter(d => {
      const monthKey = d.rawDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      return monthKey === selectedMonth;
    });
  }, [allDeadlines, selectedMonth]);

  if (loading) {
    return (
      <PageTransition>
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '16px 0' }}>
          <SkeletonLoader.Text lines={2} width="320px" />
          <div style={{ marginTop: '24px' }}>
            <SkeletonLoader.Card count={3} height="120px" />
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div style={{ maxWidth: '1060px', margin: '0 auto', padding: '8px 0 48px' }}>
        {/* Header Block */}
        <div className="flex-between mb-24" style={{ flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start' }}>
          <div>
            <div className="card-title" style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-lo)', marginBottom: '8px' }}>
              <span className="dot dot-gold" />
              Chronological Intelligence
            </div>
            <h1 className="page-title" style={{ margin: 0, fontSize: '32px', fontFamily: 'var(--font-head)', letterSpacing: '-0.02em', color: 'var(--ink)' }}>
              Deadlines &amp; Milestones
            </h1>
            <p className="page-sub" style={{ margin: '6px 0 0', color: 'var(--text-lo)', fontSize: '14px', maxWidth: '640px', lineHeight: 1.5 }}>
              Automated extraction of contractual expirations, effective dates, closing milestones, and notice requirements across all protected agreements.
            </p>
          </div>

          <Link
            to="/upload"
            className="btn btn-primary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '12px', fontWeight: 600 }}
          >
            <Icon name="plus" size={14} /> Upload Contract
          </Link>
        </div>

        {allDeadlines.length === 0 ? (
          <div className="card" style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--card-bg)', border: '1px solid var(--rule)' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                background: 'var(--paper-wash)',
                border: '1px solid var(--rule)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: 'var(--ink)'
              }}
            >
              <Icon name="clock" size={26} />
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink)', margin: '0 0 8px 0', fontFamily: 'var(--font-head)' }}>
              No Contract Deadlines Detected
            </h2>
            <p style={{ fontSize: '13.5px', color: 'var(--text-lo)', maxWidth: '460px', margin: '0 auto 24px', lineHeight: 1.6 }}>
              Upload your legal agreements, NDAs, or purchase contracts. Deciva will automatically extract and map your account's critical expiry, renewal, and notice milestones here.
            </p>
            <Link to="/upload" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Icon name="plus" size={14} /> Upload First Document
            </Link>
          </div>
        ) : (
          <>
            {/* Top Overview Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div className="card" style={{ padding: '20px 22px', margin: 0, background: 'var(--card-bg)', border: '1px solid var(--rule)' }}>
                <div className="text-mid small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Upcoming Deadlines
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', margin: '8px 0 6px' }}>
                  <span style={{ fontFamily: 'var(--font-head)', fontSize: '32px', fontWeight: 700, color: 'var(--ink)' }}>
                    {allDeadlines.length}
                  </span>
                  <span className="badge badge-ok" style={{ fontSize: '11px' }}>
                    Active Tracking
                  </span>
                </div>
                <span className="text-lo small">Detected contractual obligations</span>
              </div>

              <div className="card" style={{ padding: '20px 22px', margin: 0, background: 'var(--card-bg)', border: '1px solid var(--rule)' }}>
                <div className="text-mid small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Next Target Milestone
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', margin: '8px 0 6px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-head)',
                      fontSize: '32px',
                      fontWeight: 700,
                      color: nextDaysRemaining <= 7 ? 'var(--signal)' : nextDaysRemaining <= 30 ? '#F59E0B' : '#10B981'
                    }}
                  >
                    {nextDaysRemaining <= 0 ? 'Today' : `${nextDaysRemaining}d`}
                  </span>
                  <span className="text-lo small">
                    {nextDaysRemaining <= 0 ? 'milestone due' : 'remaining'}
                  </span>
                </div>
                <span className="text-lo small" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nextDateFormatted ? nextDateFormatted.full : 'N/A'}
                </span>
              </div>

              <div className="card" style={{ padding: '20px 22px', margin: 0, background: 'var(--card-bg)', border: '1px solid var(--rule)' }}>
                <div className="text-mid small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Vault Documents
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', margin: '8px 0 6px' }}>
                  <span style={{ fontFamily: 'var(--font-head)', fontSize: '32px', fontWeight: 700, color: 'var(--ink)' }}>
                    {trackedDocsCount}
                  </span>
                  <span className="text-lo small">Agreements</span>
                </div>
                <span className="text-lo small">Extracted from repository</span>
              </div>
            </div>

            {/* Featured Hero Card: Immediate Milestone */}
            {nextDeadline && (
              <div
                className="card mb-24"
                style={{
                  padding: '24px 26px',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--rule-strong)',
                  margin: '0 0 24px 0'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        background: 'var(--paper-wash)',
                        border: '1px solid var(--rule)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--ink)'
                      }}
                    >
                      <Icon name="bell" size={18} />
                    </div>
                    <div>
                      <div className="text-mid small" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Immediate Next Action
                      </div>
                      <h3 style={{ margin: '2px 0 0 0', fontSize: '18px', color: 'var(--ink)', fontFamily: 'var(--font-head)' }}>
                        {nextDeadline.eventType}
                      </h3>
                    </div>
                  </div>

                  <span
                    className={`badge ${nextDaysRemaining <= 7 ? 'badge-danger' : nextDaysRemaining <= 30 ? 'badge-warn' : 'badge-ok'}`}
                    style={{ fontSize: '12px', padding: '4px 12px' }}
                  >
                    {nextDaysRemaining <= 0 ? 'DUE TODAY' : `${nextDaysRemaining} DAYS REMAINING`}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '20px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'var(--font-head)', color: 'var(--ink)' }}>
                    {nextDateFormatted?.full}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="text-lo small">Source Document:</span>
                    <Link
                      to={nextDeadline.documentId ? `/document/${nextDeadline.documentId}` : '/documents'}
                      style={{
                        color: 'var(--ink)',
                        fontWeight: 600,
                        fontSize: '13px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        textDecoration: 'underline'
                      }}
                    >
                      <Icon name="fileText" size={14} />
                      {nextDeadline.documentName}
                    </Link>
                  </div>
                </div>

                {nextDeadline.context && (
                  <div
                    style={{
                      background: 'var(--paper-wash)',
                      borderLeft: '3px solid var(--rule-strong)',
                      padding: '12px 16px',
                      color: 'var(--ink-soft)',
                      fontSize: '13px',
                      lineHeight: 1.6
                    }}
                  >
                    "{nextDeadline.context}"
                  </div>
                )}
              </div>
            )}

            {/* Filter Buttons / Month Selector */}
            {monthsDistribution.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  marginBottom: '20px',
                  borderBottom: '1px solid var(--rule)',
                  paddingBottom: '14px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="text-lo small" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '4px' }}>
                    Filter Period:
                  </span>
                  <button
                    onClick={() => setSelectedMonth('ALL')}
                    className={`btn btn-sm ${selectedMonth === 'ALL' ? 'btn-primary' : 'btn-outline'}`}
                    style={{ fontSize: '12px', padding: '5px 12px' }}
                  >
                    All ({allDeadlines.length})
                  </button>
                  {monthsDistribution.map(({ month, count }) => (
                    <button
                      key={month}
                      onClick={() => setSelectedMonth(selectedMonth === month ? 'ALL' : month)}
                      className={`btn btn-sm ${selectedMonth === month ? 'btn-primary' : 'btn-outline'}`}
                      style={{ fontSize: '12px', padding: '5px 12px' }}
                    >
                      {month} ({count})
                    </button>
                  ))}
                </div>

                <span className="text-lo small">
                  Showing {visibleDeadlines.length} of {allDeadlines.length} milestones
                </span>
              </div>
            )}

            {/* Timeline Cards List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {visibleDeadlines.map((d, index) => {
                const formatted = formatTimelineDate(d.rawDate);
                const daysLeft = getDaysRemaining(d.rawDate);
                const isExpanded = expandedId === d.id;

                const urgency =
                  daysLeft <= 7
                    ? { label: daysLeft <= 0 ? 'Due Today' : `${daysLeft}d remaining`, badgeCls: 'badge-danger' }
                    : daysLeft <= 30
                    ? { label: `${daysLeft}d remaining`, badgeCls: 'badge-warn' }
                    : { label: `${daysLeft}d remaining`, badgeCls: 'badge-ok' };

                return (
                  <div
                    key={d.id}
                    className="card"
                    style={{
                      padding: '20px 24px',
                      background: 'var(--card-bg)',
                      border: '1px solid var(--rule)',
                      display: 'flex',
                      gap: '22px',
                      alignItems: 'flex-start',
                      margin: 0,
                      cursor: 'pointer',
                      transition: 'border-color 0.15s ease'
                    }}
                    onClick={() => setExpandedId(isExpanded ? null : d.id)}
                  >
                    {/* Left: Date Display Box */}
                    <div
                      style={{
                        width: '74px',
                        flexShrink: 0,
                        textAlign: 'center',
                        padding: '12px 6px',
                        background: 'var(--paper-wash)',
                        border: '1px solid var(--rule)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <span
                        style={{
                          fontSize: '26px',
                          fontWeight: 700,
                          fontFamily: 'var(--font-head)',
                          color: 'var(--ink)',
                          lineHeight: 1
                        }}
                      >
                        {formatted.day}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          fontFamily: 'var(--font-mono, monospace)',
                          color: 'var(--text-lo)',
                          textTransform: 'uppercase',
                          marginTop: '4px',
                          letterSpacing: '0.05em'
                        }}
                      >
                        {formatted.month}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-lo)', marginTop: '2px' }}>
                        {formatted.year}
                      </span>
                    </div>

                    {/* Right: Milestone Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span className="badge badge-ok" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                            {d.eventType}
                          </span>
                          <Link
                            to={d.documentId ? `/document/${d.documentId}` : '/documents'}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontSize: '13px',
                              color: 'var(--ink)',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              textDecoration: 'none'
                            }}
                          >
                            <Icon name="fileText" size={13} />
                            <span style={{ textDecoration: 'underline' }}>{d.documentName}</span>
                          </Link>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`badge ${urgency.badgeCls}`} style={{ fontSize: '11px' }}>
                            {urgency.label}
                          </span>
                          <span style={{ color: 'var(--text-lo)', fontSize: '11px', marginLeft: '4px' }}>
                            {isExpanded ? '▲' : '▼'}
                          </span>
                        </div>
                      </div>

                      <p style={{ fontSize: '14px', color: 'var(--ink-soft)', margin: 0, lineHeight: 1.6 }}>
                        {d.context}
                      </p>

                      {/* Expanded Evidence Drawer */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            style={{ marginTop: '16px', overflow: 'hidden' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div
                              style={{
                                background: 'var(--paper-wash)',
                                borderLeft: '3px solid var(--rule-strong)',
                                padding: '14px 18px',
                                marginBottom: '14px'
                              }}
                            >
                              <span
                                className="text-lo small"
                                style={{ display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                              >
                                Contract Clause Evidence
                              </span>
                              <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--ink)', lineHeight: 1.6, fontStyle: 'italic' }}>
                                "{d.clause || d.context}"
                              </p>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                              <span className="text-lo small">
                                Category: <strong style={{ color: 'var(--ink)' }}>{d.category.toUpperCase()}</strong>
                              </span>
                              <Link
                                to={d.documentId ? `/document/${d.documentId}/deadlines` : '/documents'}
                                className="btn btn-outline btn-sm"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', padding: '6px 12px' }}
                              >
                                <Icon name="fileText" size={13} /> View Document Milestones
                              </Link>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </PageTransition>
  );
};

export default Deadlines;
