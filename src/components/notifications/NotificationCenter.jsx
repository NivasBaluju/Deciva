import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Icon from '../common/Icon';
import NotificationItem from './NotificationItem';
import NotificationsApi from '../../services/notificationsApi';
import { useToast } from '../../context/ToastContext';
import { buttonMotion } from '../../styles/motion';

export const NotificationCenter = ({ onSelectAction }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [markingId, setMarkingId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const containerRef = useRef(null);
  const { toast } = useToast();

  const fetchUnreadCountOnly = async () => {
    try {
      const res = await NotificationsApi.getUnreadCount();
      setUnreadCount(res.unreadCount || 0);
    } catch (err) {
    }
  };

  const loadNotifications = async (showToast = false) => {
    setLoading(true);
    try {
      const res = await NotificationsApi.getNotifications({
        unreadOnly: filter === 'UNREAD',
        limit: 50
      });
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
      if (showToast) toast('Notifications updated', 'ok');
    } catch (err) {
      toast(err.message || 'Failed to load notifications', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluateDeadlines = async () => {
    setEvaluating(true);
    try {
      const evalRes = await NotificationsApi.evaluateNotifications();
      toast(
        evalRes.createdCount > 0
          ? `Deadline evaluation complete: ${evalRes.createdCount} new notification(s)`
          : 'Deadline evaluation complete: All notifications up to date',
        'ok'
      );
      await loadNotifications(false);
    } catch (err) {
      toast(err.message || 'Failed to evaluate deadlines', 'error');
    } finally {
      setEvaluating(false);
    }
  };

  useEffect(() => {
    fetchUnreadCountOnly();
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadNotifications(false);
    }
  }, [isOpen, filter]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkOneRead = async (notificationId) => {
    setMarkingId(notificationId);
    try {
      await NotificationsApi.markAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      toast(err.message || 'Failed to mark notification as read', 'error');
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await NotificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      toast('All notifications marked as read', 'ok');
    } catch (err) {
      toast(err.message || 'Failed to mark all notifications as read', 'error');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleNavigate = (notification) => {
    if (!notification.actionId) return;
    if (onSelectAction) {
      onSelectAction(notification.actionId);
    }
    if (!notification.isRead) {
      handleMarkOneRead(notification.id);
    }
    setIsOpen(false);
  };

  const displayedNotifications =
    filter === 'UNREAD'
      ? notifications.filter((n) => !n.isRead)
      : notifications;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <motion.button
        {...buttonMotion}
        style={{
          background: isOpen ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
          border: `1px solid ${
            isOpen ? '#3B82F6' : unreadCount > 0 ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255, 255, 255, 0.1)'
          }`,
          color: unreadCount > 0 ? '#60A5FA' : '#E4E4E7',
          padding: '8px 12px',
          borderRadius: '8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          fontWeight: 600,
          position: 'relative'
        }}
        onClick={() => setIsOpen((prev) => !prev)}
        title="Notifications & Deadline Intelligence"
      >
        <span style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Icon.bell width={16} height={16} />
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-6px',
                right: '-8px',
                background: '#EF4444',
                color: '#FFF',
                fontSize: '10px',
                fontWeight: 700,
                minWidth: '16px',
                height: '16px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
                boxShadow: '0 0 6px rgba(239, 68, 68, 0.6)'
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        <span className="hide-mobile">Alerts</span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              width: '420px',
              maxWidth: '92vw',
              maxHeight: '520px',
              background: '#121215',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.02)'
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 600, color: '#FFF' }}>
                  Action Notifications
                </h3>
                <span style={{ fontSize: '11.5px', color: '#71717A' }}>
                  {unreadCount > 0 ? `${unreadCount} unread alert(s)` : 'All caught up'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <motion.button
                  {...buttonMotion}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#A1A1AA',
                    fontSize: '11.5px',
                    padding: '4px 8px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  onClick={handleEvaluateDeadlines}
                  disabled={evaluating}
                  title="Run Deadline Intelligence Evaluation"
                >
                  <Icon.refresh width={12} height={12} className={evaluating ? 'spin' : ''} />
                  <span>{evaluating ? 'Checking...' : 'Check Deadlines'}</span>
                </motion.button>

                {unreadCount > 0 && (
                  <motion.button
                    {...buttonMotion}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#60A5FA',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '4px 6px'
                    }}
                    onClick={handleMarkAllRead}
                    disabled={markingAll}
                  >
                    Mark all read
                  </motion.button>
                )}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '8px',
                padding: '8px 16px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                background: 'rgba(0, 0, 0, 0.2)'
              }}
            >
              <button
                style={{
                  background: filter === 'ALL' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                  border: 'none',
                  color: filter === 'ALL' ? '#60A5FA' : '#71717A',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
                onClick={() => setFilter('ALL')}
              >
                All ({notifications.length})
              </button>
              <button
                style={{
                  background: filter === 'UNREAD' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                  border: 'none',
                  color: filter === 'UNREAD' ? '#60A5FA' : '#71717A',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
                onClick={() => setFilter('UNREAD')}
              >
                Unread ({unreadCount})
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              {loading && notifications.length === 0 ? (
                <div style={{ padding: '30px 0', textAlign: 'center', color: '#71717A', fontSize: '13px' }}>
                  Loading alerts...
                </div>
              ) : displayedNotifications.length === 0 ? (
                <div
                  style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: '#71717A'
                  }}
                >
                  <div style={{ marginBottom: '8px', opacity: 0.5 }}>
                    <Icon.check width={28} height={28} />
                  </div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#A1A1AA' }}>
                    {filter === 'UNREAD' ? 'No unread notifications' : 'No notifications yet'}
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                    {filter === 'UNREAD'
                      ? 'You have reviewed all current workflow alerts.'
                      : 'Workflow assignments and deadline alerts will appear here.'}
                  </p>
                </div>
              ) : (
                displayedNotifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onMarkRead={handleMarkOneRead}
                    onNavigate={handleNavigate}
                    marking={markingId === n.id}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationCenter;
