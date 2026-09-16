import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import Icon from '../common/Icon';
import MetricCard from '../common/MetricCard';
import SkeletonLoader from '../common/SkeletonLoader';
import EmptyState from '../common/EmptyState';
import WorkflowAnalyticsApi from '../../services/workflowAnalyticsApi';
import { useToast } from '../../context/ToastContext';
import { buttonMotion } from '../../styles/motion';

const getHealthGradeStyle = (grade) => {
  switch (grade) {
    case 'EXCELLENT':
      return { bg: 'rgba(16, 185, 129, 0.15)', color: '#10B981', border: 'rgba(16, 185, 129, 0.3)' };
    case 'GOOD':
      return { bg: 'rgba(59, 130, 246, 0.15)', color: '#60A5FA', border: 'rgba(59, 130, 246, 0.3)' };
    case 'ATTENTION':
      return { bg: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', border: 'rgba(245, 158, 11, 0.3)' };
    case 'AT_RISK':
      return { bg: 'rgba(249, 115, 22, 0.15)', color: '#FB923C', border: 'rgba(249, 115, 22, 0.3)' };
    case 'CRITICAL':
    default:
      return { bg: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', border: 'rgba(239, 68, 68, 0.3)' };
  }
};

export const WorkflowAnalyticsDashboard = ({ documentId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { toast } = useToast();

  const loadAnalytics = async (showToast = false) => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await WorkflowAnalyticsApi.getDocumentWorkflowAnalytics(documentId);
      setData(res);
      if (showToast) toast('Operational analytics updated', 'ok');
    } catch (err) {
      setError(err.message || 'Failed to load workflow analytics');
      toast(err.message || 'Failed to load workflow analytics', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics(false);
  }, [documentId]);

  if (loading && !data) {
    return (
      <div className="card">
        <SkeletonLoader.Text lines={2} width="280px" />
        <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <SkeletonLoader.Card count={4} height="90px" />
        </div>
        <div style={{ marginTop: '20px' }}>
          <SkeletonLoader.Card count={2} height="150px" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <p className="text-danger mb-16">{error}</p>
        <motion.button className="btn btn-secondary" onClick={() => loadAnalytics(true)} {...buttonMotion}>
          <Icon.refresh width={14} height={14} /> Retry Analytics
        </motion.button>
      </div>
    );
  }

  if (!data || data.overview?.totalActions === 0) {
    return (
      <EmptyState
        icon="info"
        title="No Workflow Actions Recorded Yet"
        message="Operational intelligence and workflow performance metrics will automatically populate once contract actions are created and managed."
      />
    );
  }

  const {
    overview = {},
    resolutionPerformance = {},
    deadlinePerformance = {},
    priorityDistribution = {},
    decisionMetrics = {},
    ownerWorkload = {},
    reopenMetrics = {},
    collaborationMetrics = {},
    categoryMetrics = [],
    operationalHealth = {}
  } = data;

  const healthStyle = getHealthGradeStyle(operationalHealth.grade);

  return (
    <div className="workflow-analytics-dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div
        className="card"
        style={{
          padding: '24px',
          background: 'linear-gradient(135deg, rgba(30,27,75,0.5), rgba(15,23,42,0.8))',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        <div className="flex-between" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div className="flex gap-8" style={{ alignItems: 'center', marginBottom: '4px' }}>
              <span className="dot dot-cyan" />
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#FFF' }}>
                Workflow Operational Health
              </h2>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#A1A1AA',
                  background: 'rgba(255,255,255,0.06)',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}
              >
                v{operationalHealth.formulaVersion || '1.0'}
              </span>
            </div>
            <p className="text-muted small" style={{ margin: 0, maxWidth: '640px' }}>
              Deterministic operational efficiency score measuring risk mitigation velocity, on-time resolution, and queue discipline (distinct from Contract Risk Score).
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '36px', fontWeight: 800, color: healthStyle.color, lineHeight: 1 }}>
                {operationalHealth.score} <span style={{ fontSize: '18px', color: '#71717A' }}>/ 100</span>
              </div>
              <span
                style={{
                  display: 'inline-block',
                  marginTop: '4px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: healthStyle.bg,
                  color: healthStyle.color,
                  border: `1px solid ${healthStyle.border}`,
                  letterSpacing: '0.04em'
                }}
              >
                {operationalHealth.grade}
              </span>
            </div>

            <motion.button
              className="btn btn-secondary"
              onClick={() => loadAnalytics(true)}
              style={{ padding: '8px 12px' }}
              {...buttonMotion}
              title="Refresh Analytics"
            >
              <Icon.refresh width={14} height={14} />
            </motion.button>
          </div>
        </div>

        <div
          style={{
            marginTop: '18px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            fontSize: '12px'
          }}
        >
          <span style={{ color: '#71717A', fontWeight: 600 }}>Score Breakdown:</span>
          <span className="badge badge-neutral">
            Resolution Velocity: {operationalHealth.components?.resolutionPerformance ?? 0} / 30
          </span>
          <span className="badge badge-neutral">
            Deadline Adherence: {operationalHealth.components?.deadlinePerformance ?? 0} / 25
          </span>
          <span className="badge badge-neutral">
            Priority Clearing: {operationalHealth.components?.priorityManagement ?? 0} / 20
          </span>
          <span
            className="badge"
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#EF4444',
              border: '1px solid rgba(239, 68, 68, 0.3)'
            }}
          >
            Overdue Penalty: {operationalHealth.components?.overduePenalty ?? 0} pts
          </span>
          <span
            className="badge"
            style={{
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#F59E0B',
              border: '1px solid rgba(245, 158, 11, 0.3)'
            }}
          >
            Reopen Penalty: {operationalHealth.components?.reopenPenalty ?? 0} pts
          </span>
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600, color: '#FFF' }}>
          Workflow Status Overview
        </h3>
        <div className="grid grid-4 gap-16">
          <MetricCard title="Total Actions" value={overview.totalActions || 0} icon="file" />
          <MetricCard
            title="Resolution Rate"
            value={`${overview.resolutionRate || 0}%`}
            subtitle={`${overview.resolvedActions || 0} resolved / ${overview.totalActions || 0}`}
            icon="check"
          />
          <MetricCard
            title="Active In Review"
            value={overview.inReviewActions || 0}
            subtitle={`${overview.openActions || 0} unreviewed open`}
            icon="clock"
          />
          <MetricCard
            title="Escalated & Overdue"
            value={overview.escalatedActions || 0}
            subtitle={`${overview.overdueActions || 0} past deadline`}
            status={overview.escalatedActions > 0 || overview.overdueActions > 0 ? 'critical' : 'normal'}
            icon="alert"
          />
        </div>
      </div>

      <div className="grid grid-2 gap-16">
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 600, color: '#FFF' }}>
            Resolution Performance
          </h3>
          {resolutionPerformance.resolvedCount === 0 ? (
            <p className="text-muted small" style={{ margin: 0 }}>
              No resolution duration data available yet. Metrics will appear once actions are marked resolved.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-muted small" style={{ display: 'block' }}>Average Resolution</span>
                <span style={{ fontSize: '20px', fontWeight: 700, color: '#FFF' }}>
                  {resolutionPerformance.averageHours} hrs
                </span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-muted small" style={{ display: 'block' }}>Median Duration</span>
                <span style={{ fontSize: '20px', fontWeight: 700, color: '#60A5FA' }}>
                  {resolutionPerformance.medianHours} hrs
                </span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-muted small" style={{ display: 'block' }}>Fastest Resolution</span>
                <span style={{ fontSize: '18px', fontWeight: 600, color: '#10B981' }}>
                  {resolutionPerformance.fastestHours} hrs
                </span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-muted small" style={{ display: 'block' }}>Slowest Resolution</span>
                <span style={{ fontSize: '18px', fontWeight: 600, color: '#F59E0B' }}>
                  {resolutionPerformance.slowestHours} hrs
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 600, color: '#FFF' }}>
            Risk & Priority Distribution
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <div className="flex-between" style={{ fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ color: '#EF4444', fontWeight: 600 }}>Critical (80–100)</span>
                <span style={{ color: '#FFF', fontWeight: 700 }}>{priorityDistribution.bands?.critical || 0}</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${overview.totalActions > 0 ? (priorityDistribution.bands?.critical / overview.totalActions) * 100 : 0}%`,
                    background: '#EF4444'
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex-between" style={{ fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ color: '#F59E0B', fontWeight: 600 }}>High (70–79)</span>
                <span style={{ color: '#FFF', fontWeight: 700 }}>{priorityDistribution.bands?.high || 0}</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${overview.totalActions > 0 ? (priorityDistribution.bands?.high / overview.totalActions) * 100 : 0}%`,
                    background: '#F59E0B'
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex-between" style={{ fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ color: '#60A5FA', fontWeight: 600 }}>Medium (40–69)</span>
                <span style={{ color: '#FFF', fontWeight: 700 }}>{priorityDistribution.bands?.medium || 0}</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${overview.totalActions > 0 ? (priorityDistribution.bands?.medium / overview.totalActions) * 100 : 0}%`,
                    background: '#3B82F6'
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex-between" style={{ fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ color: '#94A3B8', fontWeight: 600 }}>Low (0–39)</span>
                <span style={{ color: '#FFF', fontWeight: 700 }}>{priorityDistribution.bands?.low || 0}</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${overview.totalActions > 0 ? (priorityDistribution.bands?.low / overview.totalActions) * 100 : 0}%`,
                    background: '#64748B'
                  }}
                />
              </div>
            </div>

            <div className="flex-between" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '12px', color: '#A1A1AA' }}>
              <span>Average Priority: <strong style={{ color: '#FFF' }}>{priorityDistribution.averagePriorityScore || 0}</strong></span>
              <span>Highest Active: <strong style={{ color: '#EF4444' }}>{priorityDistribution.highestActivePriority || 0}</strong></span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-2 gap-16">
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 600, color: '#FFF' }}>
            Deadline Adherence
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-muted small" style={{ display: 'block' }}>On-Time Completion</span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: deadlinePerformance.onTimeRate >= 80 ? '#10B981' : '#F59E0B' }}>
                {deadlinePerformance.onTimeRate}%
              </span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-muted small" style={{ display: 'block' }}>Actions With Deadlines</span>
              <span style={{ fontSize: '22px', fontWeight: 700, color: '#FFF' }}>
                {deadlinePerformance.actionsWithDeadlines}
              </span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-muted small" style={{ display: 'block' }}>Resolved On-Time</span>
              <span style={{ fontSize: '18px', fontWeight: 600, color: '#10B981' }}>
                {deadlinePerformance.resolvedOnTime}
              </span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-muted small" style={{ display: 'block' }}>Resolved Late</span>
              <span style={{ fontSize: '18px', fontWeight: 600, color: '#EF4444' }}>
                {deadlinePerformance.resolvedLate}
              </span>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 600, color: '#FFF' }}>
            Decision Ledger Trends
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', padding: '10px 8px', borderRadius: '6px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#10B981', display: 'block', fontWeight: 600 }}>ACCEPT</span>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#FFF' }}>{decisionMetrics.accept || 0}</span>
            </div>
            <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', padding: '10px 8px', borderRadius: '6px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#60A5FA', display: 'block', fontWeight: 600 }}>NEGOTIATE</span>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#FFF' }}>{decisionMetrics.negotiate || 0}</span>
            </div>
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', padding: '10px 8px', borderRadius: '6px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#F59E0B', display: 'block', fontWeight: 600 }}>ESCALATE</span>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#FFF' }}>{decisionMetrics.escalate || 0}</span>
            </div>
            <div style={{ background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.2)', padding: '10px 8px', borderRadius: '6px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#94A3B8', display: 'block', fontWeight: 600 }}>DISMISS</span>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#FFF' }}>{decisionMetrics.dismiss || 0}</span>
            </div>
          </div>
          <div className="flex-between" style={{ fontSize: '12.5px', color: '#A1A1AA' }}>
            <span>Total Ledger Entries: <strong style={{ color: '#FFF' }}>{decisionMetrics.totalDecisions || 0}</strong></span>
            <span>Escalation Rate: <strong style={{ color: decisionMetrics.escalationRate > 20 ? '#EF4444' : '#60A5FA' }}>{decisionMetrics.escalationRate || 0}%</strong></span>
          </div>
        </div>
      </div>

      <div className="grid grid-2 gap-16">
        <div className="card" style={{ padding: '20px' }}>
          <div className="flex-between" style={{ marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#FFF' }}>
              Owner Workload Distribution
            </h3>
            <span style={{ fontSize: '12px', color: '#71717A' }}>
              {ownerWorkload.unassignedActions || 0} Unassigned
            </span>
          </div>

          {ownerWorkload.owners?.length === 0 ? (
            <p className="text-muted small" style={{ margin: 0 }}>
              No action owners assigned yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
              {ownerWorkload.owners.map((o) => (
                <div
                  key={o.userId}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12.5px'
                  }}
                >
                  <div>
                    <strong style={{ color: '#FFF' }}>{o.name}</strong>
                    <span className="text-muted" style={{ display: 'block', fontSize: '11px' }}>{o.email}</span>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', gap: '12px' }}>
                    <span>Open: <strong style={{ color: '#60A5FA' }}>{o.openActions + o.inReviewActions}</strong></span>
                    <span>Overdue: <strong style={{ color: o.overdueActions > 0 ? '#EF4444' : '#10B981' }}>{o.overdueActions}</strong></span>
                    <span>Resolved: <strong style={{ color: '#10B981' }}>{o.resolvedActions}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 600, color: '#FFF' }}>
            Reopen Rates & Collaboration
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-muted small" style={{ display: 'block' }}>Reopened Actions</span>
              <span style={{ fontSize: '20px', fontWeight: 700, color: reopenMetrics.reopenedActions > 0 ? '#F59E0B' : '#10B981' }}>
                {reopenMetrics.reopenedActions}
              </span>
              <span style={{ display: 'block', fontSize: '11px', color: '#71717A', marginTop: '2px' }}>
                Rate: {reopenMetrics.reopenRate}%
              </span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-muted small" style={{ display: 'block' }}>Discussion Threads</span>
              <span style={{ fontSize: '20px', fontWeight: 700, color: '#FFF' }}>
                {collaborationMetrics.actionsWithDiscussion}
              </span>
              <span style={{ display: 'block', fontSize: '11px', color: '#71717A', marginTop: '2px' }}>
                {collaborationMetrics.totalComments} comments ({collaborationMetrics.totalReplies} replies)
              </span>
            </div>
          </div>

          {collaborationMetrics.mostDiscussedAction && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                background: 'rgba(59,130,246,0.06)',
                border: '1px solid rgba(59,130,246,0.2)',
                fontSize: '12px'
              }}
            >
              <span style={{ color: '#60A5FA', fontWeight: 600 }}>Most Discussed: </span>
              <span style={{ color: '#FFF' }}>{collaborationMetrics.mostDiscussedAction.title}</span>
              <span style={{ color: '#A1A1AA', marginLeft: '6px' }}>({collaborationMetrics.mostDiscussedAction.commentCount} comments)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkflowAnalyticsDashboard;
