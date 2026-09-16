import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Icon from '../common/Icon';
import { fmtDate } from '../../utils/formatters';
import { buttonMotion, EASE_OUT } from '../../styles/motion';

export const SessionsManager = ({ sessions = [], currentSessionId, onRevokeSession }) => {
  const [filter, setFilter] = useState('active');
  const [showAll, setShowAll] = useState(false);

  const allSessions = sessions || [];
  const activeSessions = allSessions.filter(s => !s.revoked);
  const revokedSessions = allSessions.filter(s => s.revoked);

  const displayedList = filter === 'active' 
    ? activeSessions 
    : filter === 'revoked' 
      ? revokedSessions 
      : allSessions;

  const visibleSessions = showAll ? displayedList : displayedList.slice(0, 6);

  const getDeviceDetails = (s, isCurrent) => {
    if (isCurrent) return { name: 'Institutional Legal Workstation (Primary)', icon: '💻', type: 'Primary Enclave' };
    const ipStr = String(s?.ip || '');
    if (ipStr.includes('127.0.0.1') || ipStr.includes('::1') || ipStr.includes('localhost')) {
      return { name: 'Chamber Desktop Client', icon: '🖥️', type: 'Local Loopback' };
    }
    return { name: 'Authorized Counsel Enclave', icon: '📱', type: 'Secured Remote Endpoint' };
  };

  return (
    <div className="card mt-24">
      <div className="flex-between mb-16">
        <div>
          <div className="card-title" style={{ marginBottom: '2px' }}>
            <span className="dot dot-emerald" />
            Active Session Enclaves
          </div>
          <p className="text-lo small" style={{ margin: 0 }}>
            Hardware cryptographic sessions authorized to access confidential firm dossiers.
          </p>
        </div>

        <div className="session-filter-tabs">
          <button
            className={`filter-tab ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            Active ({activeSessions.length})
          </button>
          <button
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({allSessions.length})
          </button>
          <button
            className={`filter-tab ${filter === 'revoked' ? 'active' : ''}`}
            onClick={() => setFilter('revoked')}
          >
            Revoked ({revokedSessions.length})
          </button>
        </div>
      </div>

      <div className="session-cards-grid">
        <AnimatePresence mode="popLayout">
          {visibleSessions.map((s) => {
            const isCurrent = s.id === currentSessionId;
            const dev = getDeviceDetails(s, isCurrent);
            const trustVal = s.trust_score || 100;
            const trustColor = trustVal >= 90 ? '#10B981' : trustVal >= 70 ? '#3B82F6' : '#F59E0B';

            return (
              <motion.div
                key={s.id}
                className={`session-card-item ${isCurrent ? 'current-device' : ''} ${s.revoked ? 'revoked' : ''}`}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
              >
                <div className="session-card-top">
                  <div className="session-device-icon">{dev.icon}</div>
                  <div className="session-device-info">
                    <div className="session-device-title">
                      <strong>{dev.name}</strong>
                      {isCurrent && (
                        <span className="badge badge-ok" style={{ marginLeft: '6px', fontSize: '10px' }}>
                          THIS DEVICE
                        </span>
                      )}
                      {s.mfa_verified && (
                        <span className="badge badge-neutral" style={{ marginLeft: '4px', fontSize: '10px', background: 'rgba(255,255,255,0.06)' }}>
                          🔒 MFA
                        </span>
                      )}
                    </div>
                    <span className="session-device-sub">{dev.type} · Hash {s.ip}</span>
                  </div>
                </div>

                <div className="session-trust-bar-wrap">
                  <div className="session-trust-labels">
                    <span>Trust Health</span>
                    <strong style={{ color: trustColor }}>{trustVal}%</strong>
                  </div>
                  <div className="trust-track">
                    <div
                      className="trust-fill"
                      style={{ width: `${trustVal}%`, background: trustColor }}
                    />
                  </div>
                </div>

                <div className="session-card-bottom">
                  <span className="session-time-text">
                    Seen {fmtDate(s.last_seen)}
                  </span>

                  {s.revoked ? (
                    <span className="badge badge-danger" style={{ fontSize: '11px' }}>REVOKED</span>
                  ) : isCurrent ? (
                    <span className="badge badge-ok" style={{ fontSize: '11px' }}>ACTIVE</span>
                  ) : (
                    <motion.button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => onRevokeSession(s.id)}
                      {...buttonMotion}
                    >
                      Revoke
                    </motion.button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {displayedList.length > 6 && (
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Show Fewer Sessions ↑' : `View All ${displayedList.length} Sessions ↓`}
          </button>
        </div>
      )}
    </div>
  );
};

export default SessionsManager;
