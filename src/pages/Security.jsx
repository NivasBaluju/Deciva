import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import PageTransition from '../components/common/PageTransition';
import Breadcrumb from '../components/ui/Breadcrumb';
import Icon from '../components/common/Icon';

import ObservatoryRadial from '../components/security/ObservatoryRadial';
import ObservatoryDetailPanel from '../components/security/ObservatoryDetailPanel';
import SecuritySignalsStrip from '../components/security/SecuritySignalsStrip';
import AdminWatchtower from '../components/security/AdminWatchtower';

export const Security = () => {
  const [dash, setDash] = useState({ auditLedger: { valid: true, totalBlocks: 0 }, documentsUploaded: 0 });
  const [sessions, setSessions] = useState({ sessions: [], currentSessionId: '' });
  const [audit, setAudit] = useState({ blocks: [] });
  const [threats, setThreats] = useState({ threats: [] });
  const [zt, setZt] = useState({ score: 100, mfaEnabled: false, reasons: ['All zero-trust safeguards active'] });
  const [publicKey, setPublicKey] = useState('');
  const [chainVerifyResult, setChainVerifyResult] = useState(null);
  const [verifyingChain, setVerifyingChain] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);

  const { user } = useAuth();
  const { toast } = useToast();

  const fetchSecurityData = async () => {
    try {
      const [dashRes, sessRes, auditRes, threatRes, ztRes] = await Promise.all([
        Api.get('/api/security/dashboard').catch(() => null),
        Api.get('/api/security/sessions').catch(() => null),
        Api.get('/api/security/audit?limit=60').catch(() => null),
        Api.get('/api/security/threats').catch(() => null),
        Api.get('/api/security/zero-trust').catch(() => null)
      ]);
      if (dashRes) setDash(dashRes);
      if (sessRes) setSessions(sessRes);
      if (auditRes) setAudit(auditRes);
      if (threatRes) setThreats(threatRes);
      if (ztRes) setZt(ztRes);
    } catch (err) {
      console.error('fetchSecurityData error:', err);
    }
  };

  useEffect(() => {
    fetchSecurityData();
  }, []);

  const handleRevokeSession = async (sessionId) => {
    try {
      await Api.post(`/api/security/sessions/${sessionId}/revoke`);
      toast('Session enclave revoked successfully', 'ok');
      await fetchSecurityData();
    } catch (err) {
      toast(err.message || 'Failed to revoke session', 'error');
    }
  };

  const handleLoadKey = async () => {
    try {
      const res = await Api.get('/api/security/signing-key');
      setPublicKey(res.publicKey || '');
      toast('Public key certificate loaded', 'ok');
    } catch (err) {
      toast(err.message || 'Failed to load public key', 'error');
    }
  };

  const handleVerifyChain = async () => {
    setVerifyingChain(true);
    try {
      const res = await Api.get('/api/security/audit/verify');
      setChainVerifyResult(res);
      toast(res.valid ? 'Blockchain audit chain verified successfully' : 'Tampering detected in chain', res.valid ? 'ok' : 'error');
    } catch (err) {
      toast(err.message || 'Chain verification failed', 'error');
    } finally {
      setVerifyingChain(false);
    }
  };

  const ztScore = zt?.score ?? 100;
  const isAuditValid = dash?.auditLedger?.valid !== false;
  const activeSessionsCount = (sessions?.sessions || []).filter(s => !s.revoked).length || 1;
  const threatsCount = (threats?.threats || []).filter(t => t.severity === 'high').length;
  const auditBlocksCount = dash?.auditLedger?.totalBlocks ?? (audit?.blocks || []).length ?? 0;

  const isAdmin = user?.role === 'admin';

  return (
    <PageTransition>
      <Breadcrumb items={[{ label: 'Cockpit', href: '/dashboard' }, { label: 'Security & Ledger' }]} />

      {/* Header */}
      <div className="security-page-header flex flex-wrap items-center justify-between gap-4 mb-16">
        <div>
          <span className="mono text-lo small" style={{ letterSpacing: '0.08em' }}>[ZERO-TRUST_OBSERVATORY]</span>
          <h1 className="page-title" style={{ marginTop: '2px', marginBottom: '4px' }}>Security Center</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            Real-time zero-trust posture and cryptographic integrity.
          </p>
        </div>
        <div>
          <Link
            to="/security/mfa-setup"
            className="btn btn-outline btn-sm"
            style={{ fontSize: '12px', padding: '7px 14px' }}
          >
            <Icon.shield width={14} height={14} /> {zt?.mfaEnabled ? 'Authenticator Active (TOTP)' : 'Configure TOTP MFA'}
          </Link>
        </div>
      </div>

      {/* Primary Visual Instrument: Radial Observatory */}
      <div className="security-observatory-wrapper">
        <ObservatoryRadial
          score={ztScore}
          mfaEnabled={zt?.mfaEnabled}
          isAuditValid={isAuditValid}
          activeSessionsCount={activeSessionsCount}
          threatsCount={threatsCount}
          auditBlocksCount={auditBlocksCount}
          docsEncryptedCount={dash?.documentsUploaded || 0}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
        />
      </div>

      {/* Contextual Progressive Disclosure Detail Panel */}
      <ObservatoryDetailPanel
        selectedNode={selectedNode}
        onClose={() => setSelectedNode(null)}
        dash={dash}
        sessions={sessions}
        audit={audit}
        threats={threats}
        zt={zt}
        publicKey={publicKey}
        onLoadKey={handleLoadKey}
        onRevokeSession={handleRevokeSession}
        onVerifyChain={handleVerifyChain}
        verifyingChain={verifyingChain}
        chainVerifyResult={chainVerifyResult}
      />

      {/* Security Signals Strip */}
      <SecuritySignalsStrip
        zt={zt}
        isAuditValid={isAuditValid}
        activeSessionsCount={activeSessionsCount}
      />

      {/* Special Admin Watchtower Radar (Only visible to Institutional Admin) */}
      {isAdmin && <AdminWatchtower />}
    </PageTransition>
  );
};

export default Security;
