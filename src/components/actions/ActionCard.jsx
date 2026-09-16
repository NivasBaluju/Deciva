import React from 'react';
import { motion } from 'motion/react';
import Icon from '../common/Icon';
import { ActionStatusBadge, DecisionBadge, CategoryBadge, DueDateBadge } from './ActionStatusBadge';
import { fmtDate } from '../../utils/formatters';
import { buttonMotion } from '../../styles/motion';

const getPriorityColor = (score) => {
  if (score >= 70) return '#EF4444';
  if (score >= 45) return '#F59E0B';
  return '#3B82F6';
};

export const ActionCard = ({ action, onSelectAction }) => {
  const priorityColor = getPriorityColor(action.priority_score);

  return (
    <div
      className="card action-card"
      style={{
        background: 'var(--bg-card, #18181B)',
        borderColor: 'var(--border-hairline, rgba(255, 255, 255, 0.1))',
        padding: '18px 20px',
        borderRadius: '10px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 0.2s, transform 0.15s',
        cursor: 'pointer'
      }}
      onClick={() => onSelectAction(action.id)}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          width: '4px',
          background: priorityColor
        }}
      />

      <div className="flex-between" style={{ alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <div className="flex gap-8 mb-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <span
              className="mono"
              style={{
                background: `${priorityColor}18`,
                color: priorityColor,
                border: `1px solid ${priorityColor}33`,
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700
              }}
            >
              PRIORITY {action.priority_score}
            </span>

            <CategoryBadge category={action.category} size="small" />
            <ActionStatusBadge status={action.status} size="small" />
            <DecisionBadge decision={action.decision} size="small" />
          </div>

          <h3
            style={{
              margin: '0 0 6px 0',
              fontSize: '15.5px',
              fontWeight: 600,
              color: '#FFF',
              lineHeight: 1.4
            }}
          >
            {action.title}
          </h3>

          {action.document_evidence?.excerpt && (
            <p
              className="text-mid"
              style={{
                margin: '0 0 10px 0',
                fontSize: '12.5px',
                color: '#A1A1AA',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}
            >
              "{action.document_evidence.excerpt}"
            </p>
          )}

          <div className="flex gap-16 text-muted small" style={{ fontSize: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Icon.user width={13} height={13} />
              Owner: <strong style={{ color: '#D4D4D8' }}>{action.owner_name || action.owner_email || (action.owner_id ? `User (${action.owner_id.slice(0, 6)}…)` : 'Unassigned')}</strong>
            </span>

            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Icon.calendar width={13} height={13} />
              Due: <DueDateBadge dueDate={action.due_date} />
            </span>

            {action.comment_count > 0 && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(59, 130, 246, 0.12)',
                  color: '#93C5FD',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600
                }}
              >
                💬 {action.comment_count} {action.comment_count === 1 ? 'comment' : 'comments'}
              </span>
            )}

            <span className="mono" style={{ fontSize: '11px', color: '#71717A' }}>
              Source: {action.source_action_id}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <motion.button
            className="btn btn-outline btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onSelectAction(action.id);
            }}
            {...buttonMotion}
          >
            View Evidence & Action <Icon.chevronRight width={14} height={14} />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default ActionCard;
