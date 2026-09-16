import React, { useState, useEffect } from 'react';
import { PortfolioAnalyticsApi } from '../../services/portfolioAnalyticsApi';
import { useToast } from '../../context/ToastContext';
import SkeletonLoader from '../common/SkeletonLoader';

export const PortfolioMonitoring = () => {
  const [loading, setLoading] = useState(true);
  const [runningCycle, setRunningCycle] = useState(false);
  const [attentionQueue, setAttentionQueue] = useState([]);
  const [events, setEvents] = useState([]);
  const [lifecycle, setLifecycle] = useState({ contracts: [], calendarEvents: [] });
  const [changeIntel, setChangeIntel] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('ATTENTION');
  const { toast } = useToast();

  const loadMonitoringData = async () => {
    setLoading(true);
    try {
      const [attRes, evRes, lcRes, chgRes] = await Promise.all([
        PortfolioAnalyticsApi.getMonitoringAttention(),
        PortfolioAnalyticsApi.getMonitoringEvents({ limit: 50 }),
        PortfolioAnalyticsApi.getPortfolioLifecycle(),
        PortfolioAnalyticsApi.getChangeIntelligence()
      ]);

      setAttentionQueue(attRes.attentionQueue || []);
      setEvents(evRes.events || []);
      setLifecycle(lcRes || { contracts: [], calendarEvents: [] });
      setChangeIntel(chgRes || null);
    } catch (err) {
      toast(err.message || 'Failed to load portfolio monitoring data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonitoringData();
  }, []);

  const handleRunCycle = async () => {
    setRunningCycle(true);
    try {
      const res = await PortfolioAnalyticsApi.runMonitoringCycle();
      toast(`Monitoring cycle completed. Evaluated ${res.evaluatedDocsCount} contracts, ${res.newEventsCount} new events, ${res.actionsCreatedCount} actions.`, 'success');
      await loadMonitoringData();
    } catch (err) {
      toast(err.message || 'Failed to run monitoring cycle', 'error');
    } finally {
      setRunningCycle(false);
    }
  };

  const handleAcknowledge = async (docId, eventId) => {
    try {
      await PortfolioAnalyticsApi.acknowledgeEvent(docId, eventId);
      toast('Monitoring event acknowledged', 'success');
      await loadMonitoringData();
    } catch (err) {
      toast(err.message || 'Failed to acknowledge event', 'error');
    }
  };

  if (loading && !changeIntel) {
    return (
      <div style={{ padding: '24px' }}>
        <SkeletonLoader.Text lines={2} width="400px" />
        <div style={{ marginTop: '20px' }}>
          <SkeletonLoader.Card count={3} height="140px" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="card bg-paper-dim border border-rule" style={{ padding: '20px 24px', borderRadius: '0px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>📡</span>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, fontFamily: 'serif' }}>
                Continuous Contract Portfolio Intelligence
              </h3>
              <span style={{ fontSize: '11px', padding: '2px 8px', border: '1px solid var(--border-rule, #333)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Phase 11 Engine Active
              </span>
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: 'var(--ink-muted, #888)' }}>
              Deterministic change detection, evidence-backed lifecycle deadlines, risk deltas, and automated Action Center governance.
            </p>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleRunCycle}
            disabled={runningCycle}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', fontSize: '13px' }}
          >
            {runningCycle ? (
              <>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" style={{ width: '14px', height: '14px' }}></span>
                <span>Evaluating Portfolio...</span>
              </>
            ) : (
              <>
                <span>🔄 Run Continuous Monitoring Cycle</span>
              </>
            )}
          </button>
        </div>

        {changeIntel && (
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-rule, #333)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-muted, #888)', marginBottom: '10px' }}>
              Portfolio Change Snapshot
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div style={{ padding: '10px 14px', border: '1px solid var(--border-rule, #333)', background: 'rgba(0,0,0,0.2)' }}>
                <div style={{ fontSize: '11px', color: 'var(--ink-muted, #888)' }}>Liability Provisions Modified</div>
                <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '2px' }}>{changeIntel.liabilityChangesCount}</div>
              </div>
              <div style={{ padding: '10px 14px', border: '1px solid var(--border-rule, #333)', background: 'rgba(0,0,0,0.2)' }}>
                <div style={{ fontSize: '11px', color: 'var(--ink-muted, #888)' }}>Notice Windows Open</div>
                <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '2px', color: changeIntel.noticeWindowsOpenCount > 0 ? '#EF4444' : 'inherit' }}>
                  {changeIntel.noticeWindowsOpenCount}
                </div>
              </div>
              <div style={{ padding: '10px 14px', border: '1px solid var(--border-rule, #333)', background: 'rgba(0,0,0,0.2)' }}>
                <div style={{ fontSize: '11px', color: 'var(--ink-muted, #888)' }}>Upcoming Renewals</div>
                <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '2px' }}>{changeIntel.renewalsApproachingCount}</div>
              </div>
              <div style={{ padding: '10px 14px', border: '1px solid var(--border-rule, #333)', background: 'rgba(0,0,0,0.2)' }}>
                <div style={{ fontSize: '11px', color: 'var(--ink-muted, #888)' }}>Material Risk Shifts</div>
                <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '2px' }}>{changeIntel.materialRiskIncreasesCount}</div>
              </div>
              <div style={{ padding: '10px 14px', border: '1px solid var(--border-rule, #333)', background: 'rgba(0,0,0,0.2)' }}>
                <div style={{ fontSize: '11px', color: 'var(--ink-muted, #888)' }}>Urgent Attention Required</div>
                <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '2px', color: changeIntel.criticalAttentionCount > 0 ? '#EF4444' : 'inherit' }}>
                  {changeIntel.criticalAttentionCount}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-rule, #333)', paddingBottom: '8px' }}>
        <button
          className={`btn btn-sm ${activeSubTab === 'ATTENTION' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveSubTab('ATTENTION')}
          style={{ fontSize: '12px', padding: '6px 14px' }}
        >
          🚨 Prioritized Attention ({attentionQueue.length})
        </button>
        <button
          className={`btn btn-sm ${activeSubTab === 'TIMELINE' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveSubTab('TIMELINE')}
          style={{ fontSize: '12px', padding: '6px 14px' }}
        >
          ⏱️ Contract Change Timeline ({events.length})
        </button>
        <button
          className={`btn btn-sm ${activeSubTab === 'CALENDAR' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveSubTab('CALENDAR')}
          style={{ fontSize: '12px', padding: '6px 14px' }}
        >
          📅 Evidence-Backed Lifecycle Calendar ({lifecycle.calendarEvents?.length || 0})
        </button>
        <button
          className={`btn btn-sm ${activeSubTab === 'MAP' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveSubTab('MAP')}
          style={{ fontSize: '12px', padding: '6px 14px' }}
        >
          🗺️ Exposure &amp; Concentration Map
        </button>
      </div>

      {activeSubTab === 'ATTENTION' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {attentionQueue.length === 0 ? (
            <div className="card bg-paper-dim border border-rule" style={{ padding: '36px', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>✅</div>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>Zero Open Attention Alerts</div>
              <p style={{ fontSize: '13px', color: 'var(--ink-muted, #888)', margin: '4px 0 0 0' }}>
                All monitored contracts are operating within approved baselines. No critical changes or notice windows pending.
              </p>
            </div>
          ) : (
            attentionQueue.map((item, idx) => (
              <div
                key={item.event_id || idx}
                className="card bg-paper-dim border border-rule"
                style={{
                  padding: '16px 20px',
                  borderLeft: item.severity === 'CRITICAL' ? '4px solid #EF4444' : '4px solid #F59E0B'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-muted, #888)' }}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
                        {item.filename}
                      </h4>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          fontWeight: 700,
                          borderRadius: '2px',
                          background: item.severity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: item.severity === 'CRITICAL' ? '#EF4444' : '#F59E0B'
                        }}
                      >
                        {item.severity}
                      </span>
                      {item.risk_delta !== 0 && (
                        <span style={{ fontSize: '11px', fontWeight: 600, color: item.risk_delta > 0 ? '#EF4444' : '#10B981' }}>
                          Risk {item.risk_delta > 0 ? `+${item.risk_delta}` : item.risk_delta}
                        </span>
                      )}
                      <span style={{ fontSize: '11px', color: 'var(--ink-muted, #888)' }}>
                        Priority Score: {item.priority_score}/100
                      </span>
                    </div>

                    <div style={{ marginTop: '8px', fontSize: '13.5px', fontWeight: 500 }}>
                      {item.title}
                    </div>

                    <div style={{ marginTop: '4px', fontSize: '12.5px', color: 'var(--ink-muted, #888)' }}>
                      {item.description}
                    </div>

                    {item.evidence_reference && item.evidence_reference !== 'NOT_AVAILABLE' && (
                      <div
                        style={{
                          marginTop: '10px',
                          padding: '8px 12px',
                          background: 'rgba(0,0,0,0.3)',
                          borderLeft: '2px solid var(--border-rule, #444)',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          color: '#CCC'
                        }}
                      >
                        <span style={{ fontWeight: 600, color: '#999' }}>EVIDENCE: </span>
                        "{item.evidence_reference}"
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => handleAcknowledge(item.document_id, item.event_id)}
                      style={{ fontSize: '12px', border: '1px solid var(--border-rule, #444)' }}
                    >
                      ✓ Acknowledge
                    </button>
                    <a
                      href={`/documents/${item.document_id}`}
                      className="btn btn-sm btn-primary"
                      style={{ fontSize: '12px', textDecoration: 'none' }}
                    >
                      Open Contract →
                    </a>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeSubTab === 'TIMELINE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {events.length === 0 ? (
            <div className="card bg-paper-dim border border-rule" style={{ padding: '36px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: 'var(--ink-muted, #888)' }}>No contract changes detected yet.</div>
            </div>
          ) : (
            events.map((ev, idx) => (
              <div key={ev.id || idx} className="card bg-paper-dim border border-rule" style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', padding: '1px 6px', border: '1px solid var(--border-rule, #444)', textTransform: 'uppercase' }}>
                        {ev.event_type}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>{ev.filename}</span>
                      <span style={{ fontSize: '11px', color: 'var(--ink-muted, #888)' }}>
                        {new Date(ev.detected_at).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ marginTop: '6px', fontSize: '13px', fontWeight: 500 }}>
                      {ev.title}
                    </div>

                    {(ev.previous_value !== 'NOT_AVAILABLE' || ev.current_value !== 'NOT_AVAILABLE') && (
                      <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '12px' }}>
                        <div style={{ padding: '4px 8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                          <span style={{ color: '#EF4444', fontWeight: 600 }}>Previous: </span>
                          <span>{ev.previous_value}</span>
                        </div>
                        <div style={{ padding: '4px 8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                          <span style={{ color: '#10B981', fontWeight: 600 }}>Current: </span>
                          <span>{ev.current_value}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--ink-muted, #888)' }}>
                      Status: <strong>{ev.status}</strong>
                    </span>
                    {ev.status === 'OPEN' && (
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleAcknowledge(ev.document_id, ev.id)}
                        style={{ fontSize: '11px', padding: '3px 8px' }}
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeSubTab === 'CALENDAR' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--ink-muted, #888)', fontStyle: 'italic' }}>
            Note: In strict compliance with Deciva's No-Fabrication architecture, only contract events with explicit textual citations appear on this timeline.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {lifecycle.calendarEvents?.length === 0 ? (
              <div className="card bg-paper-dim border border-rule" style={{ padding: '32px', textAlign: 'center' }}>
                <div style={{ fontSize: '14px', color: 'var(--ink-muted, #888)' }}>
                  No upcoming contractual deadlines or renewal dates extracted from active contracts.
                </div>
              </div>
            ) : (
              lifecycle.calendarEvents.map((item, idx) => {
                const dt = new Date(item.date);
                const month = dt.toLocaleString('en-US', { month: 'short' }).toUpperCase();
                const day = dt.getDate();
                const year = dt.getFullYear();

                return (
                  <div
                    key={idx}
                    className="card bg-paper-dim border border-rule"
                    style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '20px' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '56px',
                        height: '56px',
                        border: '1px solid var(--border-rule, #444)',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '0px'
                      }}
                    >
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink-muted, #888)' }}>{month}</span>
                      <span style={{ fontSize: '18px', fontWeight: 700 }}>{day}</span>
                      <span style={{ fontSize: '9px', color: '#666' }}>{year}</span>
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>{item.label}</span>
                        <span style={{ fontSize: '11px', color: 'var(--ink-muted, #888)' }}>({item.filename})</span>
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '1px 6px',
                            border: '1px solid var(--border-rule, #444)',
                            textTransform: 'uppercase'
                          }}
                        >
                          {item.state}
                        </span>
                      </div>

                      {item.evidence && item.evidence !== 'NOT_AVAILABLE' ? (
                        <div style={{ marginTop: '4px', fontSize: '12px', color: '#BBB', fontFamily: 'monospace' }}>
                          Evidence: "{item.evidence}"
                        </div>
                      ) : (
                        <div style={{ marginTop: '4px', fontSize: '11px', color: '#777' }}>
                          Evidence excerpt: NOT_AVAILABLE
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'MAP' && (
        <div className="card bg-paper-dim border border-rule" style={{ padding: '24px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>
            Enterprise Concentration &amp; Exposure Dimensions
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--ink-muted, #888)', margin: '0 0 20px 0' }}>
            Empirical aggregation of contract risks, governance jurisdictions, and renewal accumulation.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '16px', border: '1px solid var(--border-rule, #333)' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Contract Health Distribution</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Active &amp; Compliant:</span>
                  <span style={{ fontWeight: 600 }}>{changeIntel?.activeContractsCount || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Renewals Approaching:</span>
                  <span style={{ fontWeight: 600, color: '#F59E0B' }}>{changeIntel?.renewalsApproachingCount || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Notice Window Open:</span>
                  <span style={{ fontWeight: 600, color: '#EF4444' }}>{changeIntel?.noticeWindowsOpenCount || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Expired Agreements:</span>
                  <span style={{ fontWeight: 600, color: '#888' }}>{changeIntel?.expiredContractsCount || 0}</span>
                </div>
              </div>
            </div>

            <div style={{ padding: '16px', border: '1px solid var(--border-rule, #333)' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Material Portfolio Changes</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Liability Modifications:</span>
                  <span style={{ fontWeight: 600 }}>{changeIntel?.liabilityChangesCount || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Governing Law Changes:</span>
                  <span style={{ fontWeight: 600 }}>{changeIntel?.governingLawChangesCount || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Payment Term Revisions:</span>
                  <span style={{ fontWeight: 600 }}>{changeIntel?.paymentTermChangesCount || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Surging Exposure (&ge;10 pts):</span>
                  <span style={{ fontWeight: 600, color: '#EF4444' }}>{changeIntel?.materialRiskIncreasesCount || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortfolioMonitoring;
