import React, { useState } from 'react';
import Icon from '../common/Icon';
import { fmtDate } from '../../utils/formatters';

const getEventIcon = (eventType) => {
  switch (eventType) {
    case 'ACTION_CREATED':
      return <Icon.zap width={14} height={14} color="#60A5FA" />;
    case 'ACTION_MOVED_TO_REVIEW':
      return <Icon.eye width={14} height={14} color="#FB923C" />;
    case 'ACTION_RESOLVED':
      return <Icon.check width={14} height={14} color="#4ADE80" strokeWidth={2.5} />;
    case 'ACTION_REOPENED':
      return <Icon.history width={14} height={14} color="#FBBF24" />;
    case 'ACTION_DISMISSED':
      return <Icon.x width={14} height={14} color="#9CA3AF" />;
    case 'DECISION_RECORDED':
      return <Icon.pen width={14} height={14} color="#F59E0B" />;
    case 'ACTION_ASSIGNED':
    case 'ACTION_UNASSIGNED':
      return <Icon.user width={14} height={14} color="#A78BFA" />;
    case 'DUE_DATE_SET':
    case 'DUE_DATE_UPDATED':
    case 'DUE_DATE_REMOVED':
      return <Icon.calendar width={14} height={14} color="#38BDF8" />;
    default:
      return <Icon.info width={14} height={14} color="#9CA3AF" />;
  }
};

const formatEventTitle = (item) => {
  const { event_type, details } = item;
  switch (event_type) {
    case 'ACTION_CREATED':
      return `Action synchronized from Intelligence Snapshot (${details?.source_action_id || 'Initial'})`;
    case 'ACTION_MOVED_TO_REVIEW':
      return 'Action moved to IN REVIEW';
    case 'ACTION_RESOLVED':
      return 'Action resolved with documented notes';
    case 'ACTION_REOPENED':
      return 'Action reopened to IN REVIEW';
    case 'ACTION_DISMISSED':
      return 'Action dismissed';
    case 'DECISION_RECORDED':
      return `Human Decision Recorded: ${details?.decision || 'DECISION'}`;
    case 'ACTION_ASSIGNED':
      return `Owner assigned: ${details?.owner_id ? details.owner_id.slice(0, 8) + '…' : 'User'}`;
    case 'ACTION_UNASSIGNED':
      return 'Owner unassigned';
    case 'DUE_DATE_SET':
      return `Target due date set to ${details?.due_date ? fmtDate(details.due_date) : 'date'}`;
    case 'DUE_DATE_UPDATED':
      return `Target due date updated to ${details?.due_date ? fmtDate(details.due_date) : 'date'}`;
    case 'DUE_DATE_REMOVED':
      return 'Target due date cleared';
    default:
      return event_type ? event_type.replace(/_/g, ' ') : 'Activity Event';
  }
};

export const WorkflowTimeline = ({ activity = [] }) => {
  const [expandedIndex, setExpandedIndex] = useState(null);

  if (!activity || activity.length === 0) {
    return (
      <div className="p-16 text-center text-muted small" style={{ background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px' }}>
        No activity history recorded yet.
      </div>
    );
  }

  return (
    <div className="workflow-timeline" style={{ position: 'relative', paddingLeft: '8px' }}>
      {activity.map((item, idx) => {
        const isExpanded = expandedIndex === idx;
        const hasDetails = item.details && Object.keys(item.details).length > 0;

        return (
          <div
            key={item.id || idx}
            style={{
              position: 'relative',
              paddingLeft: '28px',
              paddingBottom: idx === activity.length - 1 ? '4px' : '20px',
              borderLeft: idx === activity.length - 1 ? '2px solid transparent' : '2px solid rgba(255, 255, 255, 0.1)'
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '-11px',
                top: '0px',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'var(--bg-card, #18181B)',
                border: '1.5px solid rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2
              }}
            >
              {getEventIcon(item.event_type)}
            </div>

            <div style={{ fontSize: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <strong style={{ color: '#E4E4E7', fontWeight: 600 }}>
                  {formatEventTitle(item)}
                </strong>
                <span className="mono text-muted" style={{ fontSize: '11px' }}>
                  {fmtDate(item.created_at)}
                </span>
              </div>

              <div style={{ color: '#A1A1AA', fontSize: '12px', marginTop: '3px' }}>
                By: <span style={{ color: '#D4D4D8' }}>{item.actor_name || (item.actor_id ? `User (${item.actor_id.slice(0, 8)}…)` : 'System')}</span>
              </div>

              {item.details?.resolution_notes && (
                <div
                  className="mt-8 p-8"
                  style={{
                    background: 'rgba(74, 222, 128, 0.06)',
                    borderLeft: '3px solid #4ADE80',
                    borderRadius: '0 4px 4px 0',
                    color: '#86EFAC',
                    fontSize: '12px',
                    fontStyle: 'italic'
                  }}
                >
                  "{item.details.resolution_notes}"
                </div>
              )}

              {item.details?.reason && (
                <div
                  className="mt-8 p-8"
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    borderLeft: '3px solid #FB923C',
                    borderRadius: '0 4px 4px 0',
                    color: '#D4D4D8',
                    fontSize: '12px',
                    fontStyle: 'italic'
                  }}
                >
                  "{item.details.reason}"
                </div>
              )}

              {hasDetails && (
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                    style={{ fontSize: '11px', padding: '2px 6px', color: '#71717A' }}
                  >
                    {isExpanded ? 'Hide Technical Metadata ▲' : 'View Technical Metadata ▼'}
                  </button>

                  {isExpanded && (
                    <pre
                      className="mono mt-4 p-8"
                      style={{
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#A1A1AA',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      {JSON.stringify(item.details, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default WorkflowTimeline;
