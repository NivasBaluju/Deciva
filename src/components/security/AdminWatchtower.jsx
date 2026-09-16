import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import Icon from '../common/Icon';
import { fmtDate } from '../../utils/formatters';
import { buttonMotion } from '../../styles/motion';

export const AdminWatchtower = () => {
  const [overview, setOverview] = useState(null);
  const [riskyUsers, setRiskyUsers] = useState([]);
  const [threatLogs, setThreatLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRisk, setFilterRisk] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [quarantiningId, setQuarantiningId] = useState(null);

  const { toast } = useToast();

  const loadAdminData = async () => {
    try {
      const [ovRes, usersRes, threatsRes] = await Promise.all([
        Api.get('/api/admin/overview').catch(() => null),
        Api.get('/api/admin/risky-users').catch(() => null),
        Api.get('/api/admin/threat-logs').catch(() => null)
      ]);
      if (ovRes) setOverview(ovRes);
      if (usersRes) setRiskyUsers(usersRes.users || []);
      if (threatsRes) setThreatLogs(threatsRes.threats || []);
    } catch (err) {
      console.warn('Admin watchtower load error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleQuarantine = async (userId, userEmail) => {
    if (!window.confirm(`Are you sure you want to quarantine ${userEmail}? All active sessions will be terminated immediately.`)) {
      return;
    }
    setQuarantiningId(userId);
    try {
      const res = await Api.post(`/api/admin/quarantine-user/${userId}`);
      toast(res.message || `User ${userEmail} quarantined`, 'ok');
      await loadAdminData();
    } catch (err) {
      toast(err.message || 'Quarantine failed', 'error');
    } finally {
      setQuarantiningId(null);
    }
  };

  const filteredUsers = riskyUsers.filter(u => {
    const matchSearch =
      (u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchSearch) return false;
    if (filterRisk === 'ALL') return true;
    return u.riskLevel === filterRisk;
  });

  const criticalCount = riskyUsers.filter(u => u.riskLevel === 'CRITICAL_RISK').length;
  const elevatedCount = riskyUsers.filter(u => u.riskLevel === 'ELEVATED_RISK').length;

  return (
    <div className="admin-watchtower-wrapper mt-24">
      <div className="admin-watchtower-header">
        <div className="flex-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge badge-gold" style={{ fontSize: '10px', padding: '3px 8px' }}>
                ADMIN SPECIAL PRIVILEGE
              </span>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--ink)', margin: '6px 0 2px' }}>
              Risky Users & Threat Radar
            </h2>
            <p className="text-lo small" style={{ margin: 0 }}>
              Live cross-tenant anomaly radar and emergency session quarantine authority for institutional administrators.
            </p>
          </div>

          <motion.button
            className="btn btn-outline btn-sm"
            onClick={loadAdminData}
            {...buttonMotion}
          >
            <Icon.lock width={12} height={12} /> Refresh Radar
          </motion.button>
        </div>

        <div className="admin-telemetry-grid mt-16">
          <div className="admin-telemetry-item">
            <span className="telemetry-label">Total Users</span>
            <strong className="telemetry-val">{overview?.totalUsers ?? '…'}</strong>
          </div>
          <div className="admin-telemetry-item">
            <span className="telemetry-label">Encrypted Dossiers</span>
            <strong className="telemetry-val">{overview?.totalDocuments ?? '…'}</strong>
          </div>
          <div className="admin-telemetry-item">
            <span className="telemetry-label">Active Enclaves</span>
            <strong className="telemetry-val">{overview?.totalActiveSessions ?? '…'}</strong>
          </div>
          <div className="admin-telemetry-item">
            <span className="telemetry-label">Critical Risks</span>
            <strong className="telemetry-val" style={{ color: criticalCount > 0 ? '#EF4444' : '#10B981' }}>
              {criticalCount} Detected
            </strong>
          </div>
          <div className="admin-telemetry-item">
            <span className="telemetry-label">Cryptographic Ledger</span>
            <strong className="telemetry-val" style={{ color: '#10B981' }}>
              {(overview?.cryptographicAudit?.valid ?? overview?.blockchainAudit?.valid) ? '✓ Verified' : '⚠ Anomaly'}
            </strong>
          </div>
        </div>
      </div>

      <div className="admin-users-card mt-16">
        <div className="admin-users-header">
          <div className="admin-filter-pills">
            <button
              className={`filter-pill-btn ${filterRisk === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilterRisk('ALL')}
            >
              All Users ({riskyUsers.length})
            </button>
            <button
              className={`filter-pill-btn ${filterRisk === 'CRITICAL_RISK' ? 'active' : ''}`}
              onClick={() => setFilterRisk('CRITICAL_RISK')}
              style={{ color: criticalCount > 0 ? '#EF4444' : undefined }}
            >
              Critical Risk ({criticalCount})
            </button>
            <button
              className={`filter-pill-btn ${filterRisk === 'ELEVATED_RISK' ? 'active' : ''}`}
              onClick={() => setFilterRisk('ELEVATED_RISK')}
              style={{ color: elevatedCount > 0 ? '#F59E0B' : undefined }}
            >
              Elevated ({elevatedCount})
            </button>
            <button
              className={`filter-pill-btn ${filterRisk === 'HEALTHY' ? 'active' : ''}`}
              onClick={() => setFilterRisk('HEALTHY')}
            >
              Healthy
            </button>
          </div>

          <input
            className="auth-input-field admin-search-input"
            placeholder="Search email or user name…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="admin-table-wrapper">
          <table className="admin-radar-table">
            <thead>
              <tr>
                <th>User / Organization</th>
                <th>Enclaves / Dossiers</th>
                <th>Trust Health</th>
                <th>Risk Classification</th>
                <th>Threat Intercepts</th>
                <th>Admin Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#71717A' }}>
                    No users matching the active radar filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isAdmin = u.role === 'admin';
                  const trustColor = u.minTrust >= 85 ? '#10B981' : u.minTrust >= 60 ? '#F59E0B' : '#EF4444';
                  const riskBadge =
                    u.riskLevel === 'CRITICAL_RISK'
                      ? { label: 'CRITICAL RISK', bg: 'rgba(239, 68, 68, 0.12)', color: '#EF4444' }
                      : u.riskLevel === 'ELEVATED_RISK'
                      ? { label: 'ELEVATED RISK', bg: 'rgba(245, 158, 11, 0.12)', color: '#F59E0B' }
                      : { label: 'HEALTHY', bg: 'rgba(16, 185, 129, 0.12)', color: '#10B981' };

                  return (
                    <tr key={u.id} className={u.riskLevel === 'CRITICAL_RISK' ? 'row-critical' : ''}>
                      <td>
                        <div className="user-name-cell">
                          <strong>{u.name || 'Anonymous User'}</strong>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                            <span className="mono text-lo small">{u.email}</span>
                            {isAdmin && <span className="badge badge-gold" style={{ fontSize: '9px' }}>ADMIN</span>}
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="text-lo small">
                          <strong>{u.activeSessions}</strong> sessions · <strong>{u.docCount}</strong> docs
                        </span>
                      </td>

                      <td>
                        <div style={{ width: '90px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
                            <span className="text-lo">Score</span>
                            <strong style={{ color: trustColor }}>{u.minTrust}%</strong>
                          </div>
                          <div className="trust-track-sm">
                            <div className="trust-fill-sm" style={{ width: `${u.minTrust}%`, background: trustColor }} />
                          </div>
                        </div>
                      </td>

                      <td>
                        <span
                          className="badge"
                          style={{ background: riskBadge.bg, color: riskBadge.color, border: `1px solid ${riskBadge.color}33`, fontSize: '10px' }}
                        >
                          {riskBadge.label}
                        </span>
                      </td>

                      <td>
                        {u.threatCount > 0 ? (
                          <div className="threat-summary-cell">
                            <span className="badge badge-danger" style={{ fontSize: '10px' }}>
                              {u.threatCount} Alerts
                            </span>
                            {u.recentThreats && u.recentThreats[0] && (
                              <span className="text-lo small" style={{ display: 'block', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {u.recentThreats[0].message}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-lo small" style={{ color: '#10B981' }}>0 Threat Flags</span>
                        )}
                      </td>

                      <td>
                        {isAdmin ? (
                          <span className="badge badge-neutral" style={{ fontSize: '10px' }}>PROTECTED</span>
                        ) : (
                          <motion.button
                            className="btn btn-outline-danger btn-sm"
                            disabled={quarantiningId === u.id || u.activeSessions === 0}
                            onClick={() => handleQuarantine(u.id, u.email)}
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                            {...buttonMotion}
                          >
                            {quarantiningId === u.id ? 'Quarantining…' : 'Quarantine'}
                          </motion.button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminWatchtower;
