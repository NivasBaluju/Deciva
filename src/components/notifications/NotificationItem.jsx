import React from 'react';
import { motion } from 'motion/react';
import Icon from '../common/Icon';
import { buttonMotion } from '../../styles/motion';

const getSeverityStyle = (severity) => {
  switch (severity) {
    case 'CRITICAL':
      return {
        badgeBg: 'rgba(239, 68, 68, 0.15)',
        badgeColor: '#EF4444',
        border: 'rgba(239, 68, 68, 0.3)',
        label: 'CRITICAL',
        icon: 'alert'
      };
    case 'HIGH':
      return {
        badgeBg: 'rgba(245, 158, 11, 0.15)',
        badgeColor: '#F59E0B',
        border: 'rgba(245, 158, 11, 0.3)',
        label: 'HIGH',
        icon: 'clock'
      };
    case 'MEDIUM':
      return {
        badgeBg: 'rgba(59, 130, 246, 0.15)',
        badgeColor: '#60A5FA',
        border: 'rgba(59, 130, 246, 0.3)',
        label: 'MEDIUM',
        icon: 'info'
      };
    case 'LOW':
    default:
      return {
        badgeBg: 'rgba(148, 163, 184, 0.12)',
        badgeColor: '#94A3B8',
        border: 'rgba(148, 163, 184, 0.25)',
        label: 'LOW',
        icon: 'check'
      };
  }
};

const getTypeLabel = (type) => {
  switch (type) {
    case 'ACTION_OVERDUE':
      return 'OVERDUE';
    case 'DUE_SOON':
      return 'DUE SOON';
    case 'ACTION_ASSIGNED':
      return 'ASSIGNMENT';
    case 'HIGH_PRIORITY_ACTION':
      return 'HIGH PRIORITY';
    case 'ACTION_RESOLVED':
      return 'RESOLVED';
    case 'ACTION_REOPENED':
      return 'REOPENED';
    default:
      return type?.replace(/_/g, ' ') || 'ALERT';
  }
};

function formatRelativeTime(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffSecs = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffSecs < 60) return 'Just now';
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
  if (diffSecs < 604800) return `${Math.floor(diffSecs / 86400)}d ago`;
  return d.toLocaleDateString();
}

export const NotificationItem = ({
  notification,
  onMarkRead,
  onNavigate,
  marking = false
}) => {
  const sev = getSeverityStyle(notification.severity);
  const typeLabel = getTypeLabel(notification.type);
  const timeStr = formatRelativeTime(notification.createdAt);

  const handleClick = () => {
    if (onNavigate) {
      onNavigate(notification);
    }
  };

  const handleMarkReadClick = (e) => {
    e.stopPropagation();
    if (onMarkRead && !notification.isRead && !marking) {
      onMarkRead(notification.id);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      style={{
        padding: '14px 16px',
        borderRadius: '8px',
        background: notification.isRead ? 'rgba(255, 255, 255, 0.02)' : 'rgba(59, 130, 246, 0.05)',
        border: `1px solid ${
          notification.isRead ? 'rgba(255, 255, 255, 0.06)' : 'rgba(59, 130, 246, 0.25)'
        }`,
        position: 'relative',
        cursor: notification.actionId || notification.documentId ? 'pointer' : 'default',
        transition: 'background 0.15s, border-color 0.15s'
      }}
      onClick={handleClick}
    >
      {!notification.isRead && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            bottom: '8px',
            left: '0px',
            width: '3px',
            borderRadius: '0 2px 2px 0',
            background: sev.badgeColor
          }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: '4px',
              background: sev.badgeBg,
              color: sev.badgeColor,
              border: `1px solid ${sev.border}`,
              letterSpacing: '0.02em',
              textTransform: 'uppercase'
            }}
          >
            {sev.label}
          </span>

          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 600,
              color: '#A1A1AA',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '2px 6px',
              borderRadius: '4px'
            }}
          >
            {typeLabel}
          </span>

          <span style={{ fontSize: '11px', color: '#71717A' }}>
            {timeStr}
          </span>
        </div>

        {!notification.isRead && (
          <motion.button
            {...buttonMotion}
            style={{
              background: 'none',
              border: 'none',
              color: '#60A5FA',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: '4px'
            }}
            onClick={handleMarkReadClick}
            disabled={marking}
          >
            Mark read
          </motion.button>
        )}
      </div>

      <h4
        style={{
          margin: '8px 0 4px 0',
          fontSize: '13.5px',
          fontWeight: 600,
          color: notification.isRead ? '#D4D4D8' : '#FFFFFF',
          lineHeight: 1.35
        }}
      >
        {notification.title}
      </h4>

      <p
        style={{
          margin: 0,
          fontSize: '12.5px',
          color: notification.isRead ? '#A1A1AA' : '#E4E4E7',
          lineHeight: 1.45
        }}
      >
        {notification.message}
      </p>

      {(notification.actionId || notification.documentId) && (
        <div
          style={{
            marginTop: '8px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            color: '#60A5FA',
            fontWeight: 500
          }}
        >
          <span>Open Action Details</span>
          <span style={{ fontSize: '10px' }}>→</span>
        </div>
      )}
    </motion.div>
  );
};

export default NotificationItem;
