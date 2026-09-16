import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import Api from '../services/api';
import { useToast } from '../context/ToastContext';
import Icon from '../components/common/Icon';
import SkeletonLoader from '../components/common/SkeletonLoader';
import PageTransition from '../components/common/PageTransition';
import { buttonMotion } from '../styles/motion';

function parseLegalDate(dateStr) {
  if (!dateStr) return new Date();
  const cleaned = String(dateStr).trim();
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) return parsed;

  const parts = cleaned.match(/(\d{1,2})[\s\-\/]([A-Za-z]+|\d{1,2})[\s\-\/](\d{4})/);
  if (parts) {
    const day = parseInt(parts[1], 10);
    const monthStr = parts[2];
    const year = parseInt(parts[3], 10);
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    let month = parseInt(monthStr, 10) - 1;
    if (isNaN(month)) {
      month = months.findIndex(m => monthStr.toLowerCase().startsWith(m));
    }
    if (month >= 0) return new Date(year, month, day);
  }
  return new Date();
}

function getDaysRemaining(targetDate) {
  const now = new Date();
  const diffTime = targetDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function formatTimelineDate(dateObj) {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = months[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  return { day, month, year, full: `${day} ${month} ${year}` };
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
    
    const list = serverDeadlines.map((d, index) => {
      const dateObj = parseLegalDate(d.date);
      const cat = d.category ? d.category.replace('_', ' ').toUpperCase() : 'CRITICAL DATE';
      return {
        id: `srv-${index}`,
        date: d.date,
        rawDate: dateObj,
        category: d.category || 'general',
        eventType: cat === 'EXPIRY' ? 'CONTRACT EXPIRY' : cat,
        documentName: d.documentName || 'Untitled Document',
        documentId: d.documentId,
        context: d.context || 'Extracted critical contractual milestone.',
        clause: d.context
      };
    });

    return list.sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
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
      const monthKey = d.rawDate.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
      const count = map.get(monthKey) || 0;
      map.set(monthKey, count + 1);
    });
    return Array.from(map.entries()).map(([month, count]) => ({ month, count }));
  }, [allDeadlines]);

  const visibleDeadlines = useMemo(() => {
    if (selectedMonth === 'ALL') return allDeadlines;
    return allDeadlines.filter(d => {
      const monthKey = d.rawDate.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
      return monthKey === selectedMonth;
    });
  }, [allDeadlines, selectedMonth]);

  if (loading) {
    return (
      <PageTransition>
        <div style={{ maxWidth: '880px', margin: '0 auto' }}>
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
      <div className="timeline-page-container">
        <div className="timeline-ambient-bg" />
        <div className="timeline-ambient-overlay" />

        <div className="timeline-content-wrapper">
          <div className="timeline-header-block mb-16">
            <h1 className="page-title" style={{ marginTop: '2px', marginBottom: '4px', letterSpacing: '-0.03em' }}>
              DEADLINES
            </h1>
            <p className="page-sub" style={{ margin: 0 }}>
              Critical dates automatically extracted from your protected documents.
            </p>
          </div>

          {allDeadlines.length === 0 ? (
            <motion.div
              className="timeline-empty-card"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
            >
              <div className="timeline-empty-icon">
                <Icon.calendar width={32} height={32} />
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#FFFFFF', margin: '6px 0' }}>
                No Contract Deadlines Detected
              </h2>
              <p style={{ fontSize: '13px', color: '#A1A1AA', maxWidth: '440px', margin: '0 auto 20px', lineHeight: 1.5 }}>
                Upload your legal agreements, NDAs, or contracts. Deciva will automatically extract and map your account's critical expiry, renewal, and notice milestones here.
              </p>
              <Link to="/upload" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Icon.document width={14} height={14} /> Upload First Document
              </Link>
            </motion.div>
          ) : (
            <>
              <div className="timeline-inline-metrics">
                <div className="metric-inline-item">
                  <span className="metric-inline-label">UPCOMING</span>
                  <strong className="metric-inline-val">{allDeadlines.length} deadlines</strong>
                </div>
                <div className="metric-inline-divider" />
                <div className="metric-inline-item">
                  <span className="metric-inline-label">NEXT</span>
                  <strong className="metric-inline-val" style={{ color: '#10B981' }}>
                    {nextDateFormatted ? `${nextDateFormatted.day} ${nextDateFormatted.month}` : 'N/A'}
                  </strong>
                </div>
                <div className="metric-inline-divider" />
                <div className="metric-inline-item">
                  <span className="metric-inline-label">DOCUMENTS</span>
                  <strong className="metric-inline-val">{trackedDocsCount} tracked</strong>
                </div>
              </div>

              {nextDeadline && (
                <motion.div
                  className="next-deadline-hero"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="next-hero-top-row">
                    <span className="next-hero-tag mono">NEXT CRITICAL DATE</span>
                    <span className="badge badge-warn" style={{ fontSize: '11px', padding: '3px 8px' }}>
                      {nextDaysRemaining <= 0 ? 'DUE TODAY' : `${nextDaysRemaining} DAYS REMAINING`}
                    </span>
                  </div>

                  <div className="next-hero-body">
                    <div className="next-hero-date-wrap">
                      <h2 className="next-hero-date-text">
                        {nextDateFormatted?.day} {nextDateFormatted?.month} {nextDateFormatted?.year}
                      </h2>
                      <span className="next-hero-event-type mono">{nextDeadline.eventType}</span>
                    </div>

                    <div className="next-hero-doc-wrap">
                      <span className="next-hero-doc-label">Source Document:</span>
                      <Link
                        to={nextDeadline.documentId ? `/document/${nextDeadline.documentId}` : '/documents'}
                        className="next-hero-doc-name"
                      >
                        📄 {nextDeadline.documentName}
                      </Link>
                    </div>
                  </div>
                </motion.div>
              )}

              {monthsDistribution.length > 1 && (
                <div className="timeline-horizontal-overview">
                  <div className="month-tabs-track">
                    <button
                      className={`month-tab-btn ${selectedMonth === 'ALL' ? 'active' : ''}`}
                      onClick={() => setSelectedMonth('ALL')}
                    >
                      ALL ({allDeadlines.length})
                    </button>
                    {monthsDistribution.map(({ month, count }) => (
                      <button
                        key={month}
                        className={`month-tab-btn ${selectedMonth === month ? 'active' : ''}`}
                        onClick={() => setSelectedMonth(selectedMonth === month ? 'ALL' : month)}
                      >
                        <span>{month}</span>
                        <span className="month-badge">{count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="timeline-vertical-wrapper">
                <div className="timeline-vertical-spine" />

                <div className="timeline-events-list">
                  {visibleDeadlines.map((d, index) => {
                    const formatted = formatTimelineDate(d.rawDate);
                    const daysLeft = getDaysRemaining(d.rawDate);
                    const isNearest = index === 0;
                    const isExpanded = expandedId === d.id;

                    const urgency =
                      daysLeft <= 7
                        ? { label: `${daysLeft}d remaining`, color: '#EF4444', status: 'urgent' }
                        : daysLeft <= 30
                        ? { label: `${daysLeft}d remaining`, color: '#F59E0B', status: 'approaching' }
                        : { label: `${daysLeft}d remaining`, color: '#10B981', status: 'safe' };

                    return (
                      <div
                        key={d.id}
                        className={`timeline-node-item ${isNearest ? 'nearest-event' : ''} ${isExpanded ? 'expanded' : ''}`}
                      >
                        <div className="timeline-node-date-col">
                          <strong className="timeline-date-day">{formatted.day}</strong>
                          <span className="timeline-date-month mono">{formatted.month}</span>
                          <span className="timeline-date-year text-lo">{formatted.year}</span>
                        </div>

                        <div className="timeline-marker-anchor">
                          <div
                            className="timeline-marker-circle"
                            style={{
                              borderColor: urgency.color,
                              boxShadow: isNearest ? `0 0 14px ${urgency.color}66` : 'none'
                            }}
                          >
                            <div
                              className="timeline-marker-core"
                              style={{ background: urgency.color }}
                            />
                          </div>
                        </div>

                        <div
                          className="timeline-node-card"
                          onClick={() => setExpandedId(isExpanded ? null : d.id)}
                        >
                          <div className="timeline-card-header">
                            <div className="timeline-card-title-row">
                              <span
                                className="mono timeline-event-badge"
                                style={{ color: urgency.color, background: `${urgency.color}15`, border: `1px solid ${urgency.color}33` }}
                              >
                                {d.eventType}
                              </span>
                              <span className="timeline-doc-title">
                                {d.documentName}
                              </span>
                            </div>
                            <span className="badge timeline-urgency-pill" style={{ color: urgency.color, background: `${urgency.color}12` }}>
                              {urgency.label}
                            </span>
                          </div>

                          <p className="timeline-card-excerpt">
                            {d.context}
                          </p>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                className="timeline-drawer-content"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="timeline-drawer-divider" />
                                <div className="timeline-clause-box">
                                  <span className="mono text-lo small" style={{ display: 'block', marginBottom: '4px' }}>
                                    Clause Evidence
                                  </span>
                                  <p className="timeline-clause-text">
                                    "{d.clause || d.context}"
                                  </p>
                                </div>

                                <div className="timeline-drawer-actions">
                                  <span className="mono text-lo small">
                                    Category: <strong>{d.category.toUpperCase()}</strong>
                                  </span>
                                  <Link
                                    to={d.documentId ? `/document/${d.documentId}` : '/documents'}
                                    className="btn btn-outline btn-sm"
                                    style={{ fontSize: '11.5px', padding: '4px 10px' }}
                                  >
                                    <Icon.document width={12} height={12} /> Open Source Document
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
              </div>
            </>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default Deadlines;
