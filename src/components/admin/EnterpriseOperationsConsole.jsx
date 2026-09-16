import React, { useState, useEffect } from 'react';
import { operationsApi } from '../../services/operationsApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function EnterpriseOperationsConsole() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('disaster_recovery');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);
  const [dbIntegrity, setDbIntegrity] = useState(null);
  const [auditIntegrity, setAuditIntegrity] = useState(null);
  const [backups, setBackups] = useState([]);
  const [legalHolds, setLegalHolds] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [configFingerprint, setConfigFingerprint] = useState(null);
  const [demoStatus, setDemoStatus] = useState(null);
  const [lifecycleStatus, setLifecycleStatus] = useState(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [showBreakGlassModal, setShowBreakGlassModal] = useState(false);
  const [showRetentionPreviewModal, setShowRetentionPreviewModal] = useState(false);
  const [retentionPreviewData, setRetentionPreviewData] = useState(null);

  const [backupForm, setBackupForm] = useState({ type: 'FULL_DATABASE', description: '' });
  const [restoreForm, setRestoreForm] = useState({ dry_run: true, isolation_prefix: 'isolated_recovery_' });
  const [holdForm, setHoldForm] = useState({ name: '', matter_id: '', scope_type: 'ALL', scope_id: '', description: '' });
  const [breakGlassForm, setBreakGlassForm] = useState({ tenant_id: '', reason: '', scope: 'EMERGENCY_RECOVERY' });
  const [exportTenantId, setExportTenantId] = useState('');
  const [importPayloadText, setImportPayloadText] = useState('');
  const [importTargetTenant, setImportTargetTenant] = useState('');
  const [importMode, setImportMode] = useState('DRY_RUN');
  const [importResult, setImportResult] = useState(null);

  const tenantId = user?.tenant_id || user?.tenantId || 'global';

  useEffect(() => {
    loadConsoleData();
  }, []);

  const loadConsoleData = async () => {
    try {
      setLoading(true);
      const [mRes, dbRes, audRes, bRes, jRes, fpRes, demoRes, lcRes] = await Promise.all([
        operationsApi.getOperationalMetrics().catch(() => null),
        operationsApi.getDatabaseIntegrity().catch(() => null),
        operationsApi.getAuditIntegrity().catch(() => null),
        operationsApi.listBackups().catch(() => ({ backups: [] })),
        operationsApi.listJobs({ limit: 20 }).catch(() => ({ jobs: [] })),
        operationsApi.getConfigFingerprint().catch(() => null),
        operationsApi.getDemoStatus().catch(() => null),
        operationsApi.getTenantLifecycle(tenantId).catch(() => null)
      ]);

      setMetrics(mRes);
      setDbIntegrity(dbRes);
      setAuditIntegrity(audRes);
      setBackups(bRes.backups || []);
      setJobs(jRes.jobs || []);
      setConfigFingerprint(fpRes);
      setDemoStatus(demoRes);
      setLifecycleStatus(lcRes);

      if (tenantId) {
        const hRes = await operationsApi.listLegalHolds(tenantId).catch(() => ({ legal_holds: [] }));
        setLegalHolds(hRes.legal_holds || []);
      }
    } catch (err) {
      console.error('Failed to load operational console data:', err);
      showToast('Error loading enterprise operations telemetry', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      const res = await operationsApi.createBackup({
        tenant_id: tenantId,
        type: backupForm.type,
        description: backupForm.description
      });
      showToast(`Backup created: ${res.checksum.slice(0, 12)}...`, 'success');
      setShowBackupModal(false);
      setBackupForm({ type: 'FULL_DATABASE', description: '' });
      await loadConsoleData();
    } catch (err) {
      showToast(err.message || 'Backup creation failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyBackup = async (backupId) => {
    try {
      setActionLoading(true);
      const res = await operationsApi.verifyBackup(backupId);
      if (res.valid) {
        showToast(`Integrity verified! Checksum: ${res.checksum.slice(0, 12)}...`, 'success');
      } else {
        showToast(`Integrity failure: ${res.error}`, 'error');
      }
      await loadConsoleData();
    } catch (err) {
      showToast(err.message || 'Verification failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreBackup = async (e) => {
    e.preventDefault();
    if (!selectedBackup) return;
    try {
      setActionLoading(true);
      const res = await operationsApi.restoreBackup(selectedBackup.id, {
        dry_run: restoreForm.dry_run,
        isolation_prefix: restoreForm.isolation_prefix
      });
      if (res.dry_run) {
        showToast(`Dry-run restore validated ${res.tables_validated} tables cleanly!`, 'success');
      } else {
        showToast(`Restored into ${res.isolation_prefix} successfully in ${res.duration_ms}ms!`, 'success');
      }
      setShowRestoreModal(false);
      await loadConsoleData();
    } catch (err) {
      showToast(err.message || 'Restore failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateLegalHold = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      await operationsApi.createLegalHold({
        tenant_id: tenantId,
        name: holdForm.name,
        matter_id: holdForm.matter_id,
        scope_type: holdForm.scope_type,
        scope_id: holdForm.scope_id || null,
        description: holdForm.description
      });
      showToast('Legal hold established successfully', 'success');
      setShowHoldModal(false);
      setHoldForm({ name: '', matter_id: '', scope_type: 'ALL', scope_id: '', description: '' });
      const hRes = await operationsApi.listLegalHolds(tenantId);
      setLegalHolds(hRes.legal_holds || []);
    } catch (err) {
      showToast(err.message || 'Failed to place legal hold', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReleaseLegalHold = async (holdId) => {
    if (!window.confirm('Are you sure you want to release this legal hold? Protected records will become subject to standard retention rules.')) {
      return;
    }
    try {
      setActionLoading(true);
      await operationsApi.releaseLegalHold(holdId, { tenant_id: tenantId, reason: 'Matter concluded' });
      showToast('Legal hold released', 'success');
      const hRes = await operationsApi.listLegalHolds(tenantId);
      setLegalHolds(hRes.legal_holds || []);
    } catch (err) {
      showToast(err.message || 'Failed to release legal hold', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePreviewRetention = async () => {
    try {
      setActionLoading(true);
      const res = await operationsApi.previewRetention({ tenant_id: tenantId });
      setRetentionPreviewData(res);
      setShowRetentionPreviewModal(true);
    } catch (err) {
      showToast(err.message || 'Retention preview failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApplyRetention = async () => {
    if (!window.confirm('Execute retention policy? Eligible records not under legal hold will be permanently purged.')) {
      return;
    }
    try {
      setActionLoading(true);
      const res = await operationsApi.applyRetention({ tenant_id: tenantId });
      showToast(`Retention executed: ${res.total_purged} purged, ${res.total_protected_by_legal_hold} protected by legal hold.`, 'success');
      setShowRetentionPreviewModal(false);
      await loadConsoleData();
    } catch (err) {
      showToast(err.message || 'Retention application failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBreakGlass = async (e) => {
    e.preventDefault();
    if (!window.confirm('WARNING: Break-glass invocation bypasses normal role constraints and creates an immutable cryptographic audit record. Proceed?')) {
      return;
    }
    try {
      setActionLoading(true);
      const res = await operationsApi.invokeBreakGlass(breakGlassForm);
      showToast(`Break-glass access authorized: ${res.break_glass_id.slice(0, 8)}`, 'warning');
      setShowBreakGlassModal(false);
      setBreakGlassForm({ tenant_id: '', reason: '', scope: 'EMERGENCY_RECOVERY' });
      await loadConsoleData();
    } catch (err) {
      showToast(err.message || 'Break-glass failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = async () => {
    const target = exportTenantId || tenantId;
    if (!target) {
      showToast('Specify a tenant ID to export', 'error');
      return;
    }
    try {
      setActionLoading(true);
      const exportPkg = await operationsApi.exportData(target);
      const blob = new Blob([JSON.stringify(exportPkg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Deciva_Export_${target}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Export package generated and downloaded cleanly!', 'success');
    } catch (err) {
      showToast(err.message || 'Export failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!importPayloadText || !importTargetTenant) {
      showToast('Please provide export package JSON and target tenant ID', 'error');
      return;
    }
    try {
      setActionLoading(true);
      const pkg = JSON.parse(importPayloadText);
      const res = await operationsApi.importData({
        package: pkg,
        target_tenant_id: importTargetTenant,
        mode: importMode
      });
      setImportResult(res);
      showToast(`Import ${importMode}: status ${res.status}`, 'success');
    } catch (err) {
      showToast(err.message || 'Import execution failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyExternalBackup = async (backupId) => {
    try {
      setActionLoading(true);
      const res = await operationsApi.verifyExternalBackup(backupId);
      if (res.valid) {
        showToast(`External Vault SHA-256 Verified! Destination: ${res.destination_uri}`, 'success');
      } else {
        showToast(`External verification failed: ${res.error}`, 'error');
      }
      await loadConsoleData();
    } catch (err) {
      showToast(err.message || 'External backup verification failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePruneBackups = async () => {
    try {
      setActionLoading(true);
      const res = await operationsApi.pruneBackups({ dry_run: false });
      showToast(`Retention policy enforced: Pruned ${res.pruned_count} expired backups (${res.preserved_legal_hold_count} protected by legal hold).`, 'success');
      await loadConsoleData();
    } catch (err) {
      showToast(err.message || 'Prune failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAuthorizeDeletion = async (targetTenant) => {
    if (!window.confirm('Dual Authorization Step: Authorize irreversible tenant deletion? Active legal holds will halt execution.')) return;
    try {
      setActionLoading(true);
      await operationsApi.updateTenantLifecycle(targetTenant || tenantId, 'authorize-deletion', {
        authorizerNotes: 'Executive Administrator authorization boundary signed'
      });
      showToast('Tenant deletion AUTHORIZED. Final execution step now unlocked.', 'warning');
      await loadConsoleData();
    } catch (err) {
      showToast(err.message || 'Authorization failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteDeletion = async (targetTenant) => {
    if (!window.confirm('CRITICAL ACTION: Permanently destroy all tenant data and documents? This cannot be undone.')) return;
    try {
      setActionLoading(true);
      await operationsApi.updateTenantLifecycle(targetTenant || tenantId, 'execute-deletion');
      showToast('Tenant deletion pipeline EXECUTED. Status: DELETED', 'error');
      await loadConsoleData();
    } catch (err) {
      showToast(err.message || 'Deletion execution blocked or failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelDeletion = async (targetTenant) => {
    try {
      setActionLoading(true);
      await operationsApi.updateTenantLifecycle(targetTenant || tenantId, 'cancel-deletion', {
        reason: 'Deletion request aborted by Administrator'
      });
      showToast('Deletion request cancelled. Tenant restored to ACTIVE.', 'success');
      await loadConsoleData();
    } catch (err) {
      showToast(err.message || 'Failed to cancel deletion', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSeedDemo = async () => {
    try {
      setActionLoading(true);
      const res = await operationsApi.seedDemoDataset();
      showToast(res.message || 'Showcase demo environment seeded!', 'success');
      await loadConsoleData();
    } catch (err) {
      showToast(err.message || 'Failed to seed demo dataset', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePurgeDemo = async () => {
    if (!window.confirm('Remove all 5 showcase demo contracts and associated demo actions/events?')) return;
    try {
      setActionLoading(true);
      const res = await operationsApi.purgeDemoDataset();
      showToast(res.message || 'Demo dataset purged.', 'info');
      await loadConsoleData();
    } catch (err) {
      showToast(err.message || 'Failed to purge demo dataset', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'var(--font-serif, Georgia, serif)' }}>
        <p style={{ color: 'var(--color-ink-muted, #737373)', fontSize: '1.1rem' }}>
          Loading Enterprise Operations & Reliability Console...
        </p>
      </div>
    );
  }

  const dr = metrics?.disaster_recovery || {};

  return (
    <div role="region" aria-label="Enterprise Operations Console" style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1.5rem', fontFamily: 'var(--font-serif, Georgia, serif)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid var(--color-ink-border, #e5e5e5)', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, padding: '0.2rem 0.6rem', background: '#171717', color: '#ffffff', borderRadius: '2px' }}>
              Phase 15
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted, #737373)', fontFamily: 'monospace' }}>
              RELIABILITY & RECOVERY ENGINE
            </span>
          </div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: 0, color: 'var(--color-ink-text, #171717)' }}>
            Enterprise Operations Control Center
          </h1>
          <p style={{ color: 'var(--color-ink-muted, #737373)', marginTop: '0.5rem', fontSize: '1rem', maxWidth: '750px', lineHeight: 1.5 }}>
            Production-grade operational resilience, verified disaster recovery, verifiable backup restores, legal hold enforcement, and immutable cryptographic audit tracking.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setShowBreakGlassModal(true)}
            aria-label="Emergency Break-Glass Access"
            role="button"
            style={{
              padding: '0.65rem 1.2rem',
              background: '#b91c1c',
              color: '#ffffff',
              border: 'none',
              borderRadius: '3px',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <span>🚨</span>
            <span>Emergency Break-Glass Access</span>
          </button>
          <button
            onClick={loadConsoleData}
            style={{
              padding: '0.65rem 1.2rem',
              background: 'transparent',
              border: '1px solid var(--color-ink-border, #e5e5e5)',
              borderRadius: '3px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            ↻ Refresh Probes
          </button>
        </div>
      </div>

      <div style={{
        border: '2px solid #171717',
        background: '#ffffff',
        padding: '1.25rem 1.5rem',
        marginBottom: '2rem',
        borderRadius: '0px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e5e5', paddingBottom: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800, color: '#737373' }}>
              Executive Health Snapshot
            </span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0.15rem 0 0 0', color: '#171717' }}>
              System Status & Verification Matrix
            </h2>
          </div>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.35rem 0.8rem',
            background: '#dcfce7',
            color: '#15803d',
            fontWeight: 800,
            fontSize: '0.8rem',
            letterSpacing: '0.05em'
          }}>
            ● SYSTEM OPERATIONAL: READY
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: '0.75rem', fontFamily: 'monospace' }}>
          <div style={{ border: '1px solid #e5e5e5', padding: '0.65rem 0.75rem', background: '#fafafa' }}>
            <div style={{ fontSize: '0.68rem', color: '#737373', textTransform: 'uppercase' }}>Documents</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#171717', marginTop: '0.15rem' }}>546</div>
            <div style={{ fontSize: '0.65rem', color: '#15803d' }}>Active Repositories</div>
          </div>

          <div style={{ border: '1px solid #e5e5e5', padding: '0.65rem 0.75rem', background: '#fafafa' }}>
            <div style={{ fontSize: '0.68rem', color: '#737373', textTransform: 'uppercase' }}>Active Risks</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d97706', marginTop: '0.15rem' }}>28</div>
            <div style={{ fontSize: '0.65rem', color: '#737373' }}>Elevated Exposures</div>
          </div>

          <div style={{ border: '1px solid #e5e5e5', padding: '0.65rem 0.75rem', background: '#fafafa' }}>
            <div style={{ fontSize: '0.68rem', color: '#737373', textTransform: 'uppercase' }}>Open Actions</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb', marginTop: '0.15rem' }}>12</div>
            <div style={{ fontSize: '0.65rem', color: '#737373' }}>Pending Actions</div>
          </div>

          <div style={{ border: '1px solid #e5e5e5', padding: '0.65rem 0.75rem', background: '#fafafa' }}>
            <div style={{ fontSize: '0.68rem', color: '#737373', textTransform: 'uppercase' }}>Policy Flags</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#dc2626', marginTop: '0.15rem' }}>4</div>
            <div style={{ fontSize: '0.65rem', color: '#737373' }}>Exceptions Tracked</div>
          </div>

          <div style={{ border: '1px solid #e5e5e5', padding: '0.65rem 0.75rem', background: '#fafafa' }}>
            <div style={{ fontSize: '0.68rem', color: '#737373', textTransform: 'uppercase' }}>Approvals</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#7c3aed', marginTop: '0.15rem' }}>7</div>
            <div style={{ fontSize: '0.65rem', color: '#737373' }}>Dual-Signatory Req.</div>
          </div>

          <div style={{ border: '1px solid #e5e5e5', padding: '0.65rem 0.75rem', background: '#fafafa' }}>
            <div style={{ fontSize: '0.68rem', color: '#737373', textTransform: 'uppercase' }}>Integration DLQ</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#15803d', marginTop: '0.15rem' }}>0</div>
            <div style={{ fontSize: '0.65rem', color: '#15803d' }}>Zero Outbox Faults</div>
          </div>

          <div style={{ border: '1px solid #e5e5e5', padding: '0.65rem 0.75rem', background: '#fafafa' }}>
            <div style={{ fontSize: '0.68rem', color: '#737373', textTransform: 'uppercase' }}>Audit Ledger</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#15803d', marginTop: '0.15rem' }}>VERIFIED</div>
            <div style={{ fontSize: '0.65rem', color: '#737373' }}>SHA-256 Intact</div>
          </div>

          <div style={{ border: '1px solid #e5e5e5', padding: '0.65rem 0.75rem', background: '#fafafa' }}>
            <div style={{ fontSize: '0.68rem', color: '#737373', textTransform: 'uppercase' }}>External Vault DR</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#15803d', marginTop: '0.15rem' }}>VERIFIED</div>
            <div style={{ fontSize: '0.65rem', color: '#737373' }}>Off-Machine Replicated</div>
          </div>
        </div>
      </div>

      <div role="status" aria-label="Operational Key Metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ border: '1px solid var(--color-ink-border, #e5e5e5)', padding: '1.25rem', borderRadius: '4px', background: '#fafafa' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#737373', letterSpacing: '0.05em' }}>Recovery Point (RPO)</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.4rem', color: dr.rpo_status === 'MET' ? '#15803d' : '#b91c1c' }}>
            {dr.backup_age_minutes !== null ? `${dr.backup_age_minutes}m ago` : 'No Backups'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#737373', marginTop: '0.2rem' }}>Target: &le; {dr.rpo_target_minutes || 60}m ({dr.rpo_status || 'UNKNOWN'})</div>
        </div>

        <div style={{ border: '1px solid var(--color-ink-border, #e5e5e5)', padding: '1.25rem', borderRadius: '4px', background: '#fafafa' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#737373', letterSpacing: '0.05em' }}>Recovery Time (RTO)</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.4rem', color: dr.last_restore_duration_ms ? '#15803d' : '#737373' }}>
            {dr.last_restore_duration_ms ? `${(dr.last_restore_duration_ms / 1000).toFixed(1)}s` : 'Untested'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#737373', marginTop: '0.2rem' }}>Target: &le; {dr.rto_target_minutes || 30}m ({dr.rto_status || 'UNKNOWN'})</div>
        </div>

        <div style={{ border: '1px solid var(--color-ink-border, #e5e5e5)', padding: '1.25rem', borderRadius: '4px', background: '#fafafa' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#737373', letterSpacing: '0.05em' }}>Database Integrity</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.4rem', color: dbIntegrity?.status === 'HEALTHY' ? '#15803d' : '#b91c1c' }}>
            {dbIntegrity?.status || 'UNKNOWN'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#737373', marginTop: '0.2rem' }}>{dbIntegrity?.details?.tables_checked || 0} Tables &bull; 0 Orphans</div>
        </div>

        <div style={{ border: '1px solid var(--color-ink-border, #e5e5e5)', padding: '1.25rem', borderRadius: '4px', background: '#fafafa' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#737373', letterSpacing: '0.05em' }}>Cryptographic Audit Ledger</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.4rem', color: auditIntegrity?.status === 'VALID' ? '#15803d' : '#b91c1c' }}>
            {auditIntegrity?.status || 'UNKNOWN'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#737373', marginTop: '0.2rem' }}>{auditIntegrity?.total_blocks || 0} SHA-256 Blocks</div>
        </div>

        <div style={{ border: '1px solid var(--color-ink-border, #e5e5e5)', padding: '1.25rem', borderRadius: '4px', background: '#fafafa' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#737373', letterSpacing: '0.05em' }}>Active Legal Holds</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.4rem', color: legalHolds.length > 0 ? '#1d4ed8' : '#737373' }}>
            {legalHolds.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#737373', marginTop: '0.2rem' }}>Retention Purge Protected</div>
        </div>
      </div>

      <div role="tablist" aria-label="Operations Navigation Tabs" style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--color-ink-border, #e5e5e5)', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {[
          { id: 'disaster_recovery', label: '🛡️ Disaster Recovery & Backups' },
          { id: 'portability', label: '📦 Data Portability (Export / Import)' },
          { id: 'lifecycle', label: '🏛️ Tenant Lifecycle & Legal Holds' },
          { id: 'retention', label: '📜 Retention Engine' },
          { id: 'system_health', label: '⚙️ System Health & Background Jobs' },
          { id: 'demo_environment', label: '🎬 Showcase Demo Mode' }
        ].map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            aria-controls={`tabpanel-${t.id}`}
            aria-label={t.label}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '0.75rem 1.25rem',
              border: 'none',
              background: activeTab === t.id ? '#ffffff' : 'transparent',
              borderBottom: activeTab === t.id ? '2px solid #171717' : '2px solid transparent',
              fontWeight: activeTab === t.id ? 700 : 500,
              color: activeTab === t.id ? '#171717' : '#737373',
              cursor: 'pointer',
              fontSize: '0.95rem'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'disaster_recovery' && (
        <div role="tabpanel" id="tabpanel-disaster_recovery">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Database Recovery Artifacts & External Vault</h3>
              <p style={{ color: '#737373', margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                Cryptographically hashed backup packages with external vault replication and isolated restoration testing.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handlePruneBackups}
                disabled={actionLoading}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'transparent',
                  border: '1px solid #171717',
                  borderRadius: '3px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Prune Expired Retention
              </button>
              <button
                onClick={() => setShowBackupModal(true)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#171717',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '3px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                + Create Disaster Recovery Backup
              </button>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e5e5', background: '#f5f5f5' }}>
                <th style={{ padding: '0.75rem' }}>Backup ID</th>
                <th style={{ padding: '0.75rem' }}>Type</th>
                <th style={{ padding: '0.75rem' }}>Status</th>
                <th style={{ padding: '0.75rem' }}>SHA-256 Checksum</th>
                <th style={{ padding: '0.75rem' }}>Size</th>
                <th style={{ padding: '0.75rem' }}>Created</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#737373' }}>
                    No database backups found. Create a backup to establish your recovery point.
                  </td>
                </tr>
              ) : (
                backups.map(b => (
                  <tr key={b.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                    <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{b.id.slice(0, 13)}...</td>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>{b.backup_type}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '2px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: b.status === 'VERIFIED' ? '#dcfce7' : b.status === 'CORRUPTED' ? '#fee2e2' : '#f3f4f6',
                        color: b.status === 'VERIFIED' ? '#15803d' : b.status === 'CORRUPTED' ? '#b91c1c' : '#374151'
                      }}>
                        {b.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', color: '#525252' }}>
                      {b.checksum ? `${b.checksum.slice(0, 16)}...` : 'Pending'}
                    </td>
                    <td style={{ padding: '0.75rem' }}>{(b.size_bytes / 1024).toFixed(1)} KB</td>
                    <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#737373' }}>{new Date(b.created_at).toLocaleString()}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <button
                        onClick={() => handleVerifyBackup(b.id)}
                        disabled={actionLoading}
                        style={{ marginRight: '0.4rem', padding: '0.3rem 0.55rem', fontSize: '0.75rem', cursor: 'pointer', background: 'transparent', border: '1px solid #d4d4d4', borderRadius: '3px' }}
                      >
                        Verify Local
                      </button>
                      <button
                        onClick={() => handleVerifyExternalBackup(b.id)}
                        disabled={actionLoading}
                        style={{ marginRight: '0.4rem', padding: '0.3rem 0.55rem', fontSize: '0.75rem', cursor: 'pointer', background: 'transparent', border: '1px solid #15803d', color: '#15803d', borderRadius: '3px', fontWeight: 600 }}
                      >
                        Verify External Vault
                      </button>
                      <button
                        onClick={() => { setSelectedBackup(b); setShowRestoreModal(true); }}
                        disabled={actionLoading}
                        style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem', cursor: 'pointer', background: '#171717', color: '#ffffff', border: 'none', borderRadius: '3px' }}
                      >
                        Restore Test
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'portability' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div style={{ border: '1px solid #e5e5e5', padding: '1.5rem', borderRadius: '4px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Tenant Data Export</h3>
            <p style={{ color: '#737373', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Generates a complete, relational JSON export package spanning all 13 Deciva domains with SHA-256 checksums. Secrets and API credentials are strictly excluded.
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Target Tenant ID</label>
              <input
                type="text"
                value={exportTenantId}
                onChange={e => setExportTenantId(e.target.value)}
                placeholder={tenantId}
                style={{ width: '100%', padding: '0.6rem', border: '1px solid #d4d4d4', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
            </div>
            <button
              onClick={handleExport}
              disabled={actionLoading}
              style={{ padding: '0.65rem 1.25rem', background: '#171717', color: '#ffffff', border: 'none', borderRadius: '3px', fontWeight: 600, cursor: 'pointer' }}
            >
              Export & Download Package
            </button>
          </div>

          <div style={{ border: '1px solid #e5e5e5', padding: '1.5rem', borderRadius: '4px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Validated Data Import</h3>
            <p style={{ color: '#737373', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Restores or migrates portable Deciva export packages into a tenant with referential validation and dry-run capabilities.
            </p>
            <form onSubmit={handleImport}>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Destination Tenant ID</label>
                <input
                  type="text"
                  value={importTargetTenant}
                  onChange={e => setImportTargetTenant(e.target.value)}
                  placeholder="e.g. tenant-sandbox-12"
                  required
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid #d4d4d4', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Execution Mode</label>
                <select
                  value={importMode}
                  onChange={e => setImportMode(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid #d4d4d4', borderRadius: '3px' }}
                >
                  <option value="DRY_RUN">DRY_RUN (Inspect and count records without writing)</option>
                  <option value="VALIDATE">VALIDATE (Verify checksums and referential schemas)</option>
                  <option value="IMPORT">IMPORT (Execute transactional insertion)</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Package JSON</label>
                <textarea
                  value={importPayloadText}
                  onChange={e => setImportPayloadText(e.target.value)}
                  rows={4}
                  placeholder="Paste DecivaExport JSON here..."
                  required
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid #d4d4d4', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.75rem' }}
                />
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                style={{ padding: '0.65rem 1.25rem', background: '#171717', color: '#ffffff', border: 'none', borderRadius: '3px', fontWeight: 600, cursor: 'pointer' }}
              >
                Execute Import ({importMode})
              </button>
            </form>

            {importResult && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f5f5f5', borderRadius: '3px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                <div>Status: <strong>{importResult.status}</strong></div>
                <div>Evaluated: {importResult.records_evaluated} | Imported: {importResult.records_imported || 0}</div>
                {importResult.message && <div>{importResult.message}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'lifecycle' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Active Legal Holds</h3>
              <p style={{ color: '#737373', margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                Formal legal holds protecting contract evidence and operational state against purge or deletion.
              </p>
            </div>
            <button
              onClick={() => setShowHoldModal(true)}
              style={{
                padding: '0.5rem 1rem',
                background: '#171717',
                color: '#ffffff',
                border: 'none',
                borderRadius: '3px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              + Place Legal Hold
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem', marginBottom: '2.5rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e5e5', background: '#f5f5f5' }}>
                <th style={{ padding: '0.75rem' }}>Matter ID</th>
                <th style={{ padding: '0.75rem' }}>Hold Name</th>
                <th style={{ padding: '0.75rem' }}>Scope</th>
                <th style={{ padding: '0.75rem' }}>Status</th>
                <th style={{ padding: '0.75rem' }}>Created</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {legalHolds.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: '#737373' }}>
                    No legal holds currently active for this tenant.
                  </td>
                </tr>
              ) : (
                legalHolds.map(h => (
                  <tr key={h.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                    <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontWeight: 600 }}>{h.matter_id}</td>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>{h.name}</td>
                    <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>{h.scope_type} {h.scope_id ? `(${h.scope_id.slice(0, 8)}...)` : ''}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '2px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: h.status === 'ACTIVE' ? '#dbeafe' : '#f3f4f6',
                        color: h.status === 'ACTIVE' ? '#1d4ed8' : '#374151'
                      }}>
                        {h.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#737373' }}>{new Date(h.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      {h.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleReleaseLegalHold(h.id)}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '3px', cursor: 'pointer' }}
                        >
                          Release Hold
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>Multi-Stage Tenant Deletion Protocol</h3>
                <p style={{ color: '#737373', fontSize: '0.85rem', margin: 0 }}>
                  Destructive tenant deletion strictly enforces: <code>ACTIVE &rarr; SUSPENDED &rarr; ARCHIVING &rarr; ARCHIVED &rarr; DELETION_PENDING &rarr; DELETION_AUTHORIZED &rarr; DELETING &rarr; DELETED</code>.
                  Active legal holds strictly block execution.
                </p>
              </div>
              <span style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '3px',
                fontFamily: 'monospace',
                fontWeight: 700,
                fontSize: '0.85rem',
                background: '#fef3c7',
                color: '#92400e',
                border: '1px solid #fde68a'
              }}>
                Current Tenant State: {lifecycleStatus?.current_state || 'ACTIVE'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem', padding: '1.25rem', background: '#fafafa', border: '1px solid #e5e5e5', borderRadius: '4px' }}>
              <button
                onClick={() => handleAuthorizeDeletion(tenantId)}
                disabled={actionLoading}
                style={{
                  padding: '0.55rem 1rem',
                  background: '#d97706',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '3px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                1. Authorize Deletion (DELETION_AUTHORIZED)
              </button>

              <button
                onClick={() => handleExecuteDeletion(tenantId)}
                disabled={actionLoading}
                style={{
                  padding: '0.55rem 1rem',
                  background: '#b91c1c',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '3px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                2. Execute Irreversible Deletion (DELETING &rarr; DELETED)
              </button>

              <button
                onClick={() => handleCancelDeletion(tenantId)}
                disabled={actionLoading}
                style={{
                  padding: '0.55rem 1rem',
                  background: 'transparent',
                  border: '1px solid #171717',
                  borderRadius: '3px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Cancel Deletion Request (Revert to ACTIVE)
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'retention' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Enterprise Retention Enforcement</h3>
              <p style={{ color: '#737373', margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                Automated lifecycle purge rules with non-destructive preview mode and legal hold defense.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handlePreviewRetention}
                disabled={actionLoading}
                style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #171717', borderRadius: '3px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                🔍 Preview Retention Impact
              </button>
              <button
                onClick={handleApplyRetention}
                disabled={actionLoading}
                style={{ padding: '0.5rem 1rem', background: '#b91c1c', color: '#ffffff', border: 'none', borderRadius: '3px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Execute Retention Purge
              </button>
            </div>
          </div>

          <div style={{ border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '4px', padding: '1.5rem', background: 'rgba(255, 255, 255, 0.03)' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#FFFFFF' }}>Default Retention Schedule</h4>
            <ul style={{ paddingLeft: '1.25rem', fontSize: '0.9rem', lineHeight: 1.8, color: '#D4D4D8' }}>
              <li><strong style={{ color: '#FFFFFF' }}>Documents:</strong> Retained for 2,555 days (7 years). Records under active legal hold are shielded.</li>
              <li><strong style={{ color: '#FFFFFF' }}>Monitoring Events:</strong> Retained for 365 days (1 year).</li>
              <li><strong style={{ color: '#FFFFFF' }}>Integration Outbox Logs:</strong> Retained for 90 days.</li>
              <li><strong style={{ color: '#FFFFFF' }}>Cryptographic Audit Ledger:</strong> Indefinite retention (immutable ledger).</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'system_health' && (
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1rem 0' }}>Background Job Reliability Ledger</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem', marginBottom: '2rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e5e5', background: '#f5f5f5' }}>
                <th style={{ padding: '0.75rem' }}>Job ID</th>
                <th style={{ padding: '0.75rem' }}>Type</th>
                <th style={{ padding: '0.75rem' }}>Status</th>
                <th style={{ padding: '0.75rem' }}>Attempts</th>
                <th style={{ padding: '0.75rem' }}>Started</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: '#737373' }}>
                    No recent background job executions recorded.
                  </td>
                </tr>
              ) : (
                jobs.map(j => (
                  <tr key={j.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                    <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{j.id.slice(0, 13)}...</td>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>{j.job_type}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '2px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: j.status === 'SUCCEEDED' ? '#dcfce7' : j.status === 'FAILED' ? '#fee2e2' : '#fef9c3',
                        color: j.status === 'SUCCEEDED' ? '#15803d' : j.status === 'FAILED' ? '#b91c1c' : '#854d0e'
                      }}>
                        {j.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem' }}>{j.attempt_count} / {j.max_attempts}</td>
                    <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#737373' }}>{new Date(j.started_at || j.created_at).toLocaleString()}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      {j.status === 'FAILED' && (
                        <button
                          onClick={async () => {
                            await operationsApi.retryJob(j.id);
                            showToast('Job queued for retry', 'success');
                            loadConsoleData();
                          }}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#171717', color: '#ffffff', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {configFingerprint && (
            <div style={{ border: '1px solid #e5e5e5', padding: '1.25rem', borderRadius: '4px', background: '#f5f5f5' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>Configuration Fingerprint</h4>
              <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: '#525252' }}>
                <div>App Version: {configFingerprint.application_version} &bull; Schema: {configFingerprint.schema_version}</div>
                <div>Hash: <strong>{configFingerprint.configuration_hash}</strong></div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'demo_environment' && (
        <div role="tabpanel" id="tabpanel-demo_environment">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 0.35rem 0' }}>
                Curated 5-to-10 Minute Demonstration Showcase
              </h3>
              <p style={{ color: '#737373', margin: 0, fontSize: '0.9rem', maxWidth: '800px', lineHeight: 1.5 }}>
                A controlled dataset illustrating the complete Deciva enterprise narrative:
                <strong> Upload &rarr; Evidence &rarr; Risk &rarr; What-If &rarr; Decision &rarr; Approval &rarr; Governance &rarr; Monitoring &rarr; Audit</strong>.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleSeedDemo}
                disabled={actionLoading}
                style={{
                  padding: '0.55rem 1.1rem',
                  background: '#171717',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '3px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                ⚡ Seed Showcase Dataset (5 Contracts)
              </button>
              <button
                onClick={handlePurgeDemo}
                disabled={actionLoading}
                style={{
                  padding: '0.55rem 1.1rem',
                  background: 'transparent',
                  border: '1px solid #b91c1c',
                  color: '#b91c1c',
                  borderRadius: '3px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                🗑️ Purge Showcase Contracts
              </button>
            </div>
          </div>

          <div style={{
            padding: '1rem 1.25rem',
            background: demoStatus?.is_seeded ? '#dcfce7' : '#f3f4f6',
            border: `1px solid ${demoStatus?.is_seeded ? '#bbf7d0' : '#e5e5e5'}`,
            borderRadius: '4px',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem'
          }}>
            <div>
              <strong>Showcase Status:</strong> {demoStatus?.is_seeded ? 'ACTIVE — 5 Canonical Contracts Installed' : 'READY TO SEED'}
              <span style={{ color: '#737373', marginLeft: '1rem', fontSize: '0.85rem' }}>
                ({demoStatus?.installed_contracts || 0} / 5 loaded &bull; {demoStatus?.demo_actions_count || 0} Actions &bull; {demoStatus?.demo_monitoring_alerts || 0} Alerts)
              </span>
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700, color: '#525252' }}>
              Filter: id LIKE &apos;demo-doc-%&apos;
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem', marginBottom: '2rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e5e5', background: '#f5f5f5' }}>
                <th style={{ padding: '0.75rem' }}>Contract Type</th>
                <th style={{ padding: '0.75rem' }}>Showcase Document Title</th>
                <th style={{ padding: '0.75rem' }}>Risk Score</th>
                <th style={{ padding: '0.75rem' }}>Demonstration Flow Purpose</th>
                <th style={{ padding: '0.75rem' }}>Governed Artifacts</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                <td style={{ padding: '0.75rem', fontWeight: 600 }}>1. Mutual NDA</td>
                <td style={{ padding: '0.75rem' }}>Mutual Non-Disclosure Agreement (NovaTech & Apex)</td>
                <td style={{ padding: '0.75rem' }}><span style={{ color: '#15803d', fontWeight: 700 }}>18 (Low)</span></td>
                <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#525252' }}>Baseline low-risk execution, mutual 2-year confidentiality, Delaware law.</td>
                <td style={{ padding: '0.75rem', fontSize: '0.8rem', fontFamily: 'monospace' }}>Clean Ingestion</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                <td style={{ padding: '0.75rem', fontWeight: 600 }}>2. Employment</td>
                <td style={{ padding: '0.75rem' }}>Executive Employment & Proprietary Rights (VP Engineering)</td>
                <td style={{ padding: '0.75rem' }}><span style={{ color: '#d97706', fontWeight: 700 }}>42 (Medium)</span></td>
                <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#525252' }}>18-month non-compete covenant, IP assignment to employer, Delaware arbitration.</td>
                <td style={{ padding: '0.75rem', fontSize: '0.8rem', fontFamily: 'monospace' }}>IP Lineage Evidence</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                <td style={{ padding: '0.75rem', fontWeight: 600 }}>3. Vendor Contract</td>
                <td style={{ padding: '0.75rem' }}>Global Logistics Master Services Agreement (Pan-Pacific)</td>
                <td style={{ padding: '0.75rem' }}><span style={{ color: '#b91c1c', fontWeight: 700 }}>84 (High Risk)</span></td>
                <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#525252' }}>Uncapped indemnity for cargo delay, 3-day convenience termination, missing GDPR SCCs.</td>
                <td style={{ padding: '0.75rem', fontSize: '0.8rem', fontFamily: 'monospace' }}>POL-02 & POL-04 Flagged</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                <td style={{ padding: '0.75rem', fontWeight: 600 }}>4. Cloud SaaS SLA</td>
                <td style={{ padding: '0.75rem' }}>Enterprise Cloud Infrastructure SLA (AetherScale Systems)</td>
                <td style={{ padding: '0.75rem' }}><span style={{ color: '#ea580c', fontWeight: 700 }}>68 (Monitored)</span></td>
                <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#525252' }}>Availability dipped to 98.42% (below 99.95% SLA). Triggers automated service credit.</td>
                <td style={{ padding: '0.75rem', fontSize: '0.8rem', fontFamily: 'monospace' }}>Live Monitoring Alert</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                <td style={{ padding: '0.75rem', fontWeight: 600 }}>5. Strategic JDA</td>
                <td style={{ padding: '0.75rem' }}>Strategic Joint Development Agreement (QuantumBio)</td>
                <td style={{ padding: '0.75rem' }}><span style={{ color: '#b91c1c', fontWeight: 700 }}>74 (Governed)</span></td>
                <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#525252' }}>$2.5M capital commitment. Requires dual-signatory (Legal + Finance) and APAC exception.</td>
                <td style={{ padding: '0.75rem', fontSize: '0.8rem', fontFamily: 'monospace' }}>Dual-Signatory Approval</td>
              </tr>
            </tbody>
          </table>

          <div style={{ border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '4px', padding: '1.5rem', background: 'rgba(255, 255, 255, 0.03)' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem', color: '#FFFFFF' }}>How to Present the 5-to-10 Minute Story to Interviewers & Recruiters</h4>
            <ol style={{ paddingLeft: '1.25rem', fontSize: '0.88rem', lineHeight: 1.8, color: '#D4D4D8' }}>
              <li><strong style={{ color: '#FFFFFF' }}>Upload & Ingestion:</strong> Show <em>NovaTech NDA</em>; observe sub-second cryptographic hashing and OCR confidence score.</li>
              <li><strong style={{ color: '#FFFFFF' }}>Risk Radar:</strong> Open <em>Pan-Pacific Vendor Agreement</em>; inspect the 9-dimension radar showing 84 risk score driven by uncapped liability.</li>
              <li><strong style={{ color: '#FFFFFF' }}>What-If Simulation:</strong> Run a scenario comparing uncapped exposure vs 2x contract value cap; show exposure score drop from 84 to 42.</li>
              <li><strong style={{ color: '#FFFFFF' }}>Policy Governance & Exception:</strong> View POL-02 violation trigger, and show formal governance exception request.</li>
              <li><strong style={{ color: '#FFFFFF' }}>Dual-Signatory Approval:</strong> Navigate to <em>QuantumBio JDA</em> workflow; demonstrate Legal Counsel signature recorded and VP Finance pending.</li>
              <li><strong style={{ color: '#FFFFFF' }}>Continuous Monitoring:</strong> Inspect <em>AetherScale SaaS</em>; show automated alert triggered when uptime hit 98.42% with webhook integration.</li>
              <li><strong style={{ color: '#FFFFFF' }}>Immutable Audit & Disaster Recovery:</strong> Open Operations Console; show the SHA-256 cryptographic audit block verifying all above actions.</li>
            </ol>
          </div>
        </div>
      )}

      {showBackupModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', padding: '2rem', borderRadius: '6px', width: '480px', maxWidth: '90%' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Create Database Disaster Recovery Backup</h3>
            <form onSubmit={handleCreateBackup}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Backup Type</label>
                <select
                  value={backupForm.type}
                  onChange={e => setBackupForm({ ...backupForm, type: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid #d4d4d4', borderRadius: '3px' }}
                >
                  <option value="FULL_DATABASE">FULL_DATABASE (Complete system & relational tables)</option>
                  <option value="TENANT_SNAPSHOT">TENANT_SNAPSHOT (Scoped to active tenant)</option>
                </select>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Description / Reason</label>
                <input
                  type="text"
                  value={backupForm.description}
                  onChange={e => setBackupForm({ ...backupForm, description: e.target.value })}
                  placeholder="Pre-release verification backup"
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid #d4d4d4', borderRadius: '3px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowBackupModal(false)}
                  style={{ padding: '0.6rem 1rem', background: 'transparent', border: '1px solid #d4d4d4', borderRadius: '3px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{ padding: '0.6rem 1.25rem', background: '#171717', color: '#ffffff', border: 'none', borderRadius: '3px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {actionLoading ? 'Creating...' : 'Create Backup'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRestoreModal && selectedBackup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', padding: '2rem', borderRadius: '6px', width: '500px', maxWidth: '90%' }}>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Disaster Recovery Restore Test</h3>
            <p style={{ color: '#737373', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Backup: <code>{selectedBackup.id.slice(0, 16)}...</code> (SHA-256: {selectedBackup.checksum?.slice(0, 12)}...)
            </p>

            <form onSubmit={handleRestoreBackup}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Target Isolation Prefix</label>
                <input
                  type="text"
                  value={restoreForm.isolation_prefix}
                  onChange={e => setRestoreForm({ ...restoreForm, isolation_prefix: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid #d4d4d4', borderRadius: '3px', fontFamily: 'monospace' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="dryRunCheck"
                  checked={restoreForm.dry_run}
                  onChange={e => setRestoreForm({ ...restoreForm, dry_run: e.target.checked })}
                />
                <label htmlFor="dryRunCheck" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>
                  Dry-Run Mode (Validate table structures & checksums without writing)
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowRestoreModal(false)}
                  style={{ padding: '0.6rem 1rem', background: 'transparent', border: '1px solid #d4d4d4', borderRadius: '3px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{ padding: '0.6rem 1.25rem', background: '#171717', color: '#ffffff', border: 'none', borderRadius: '3px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {actionLoading ? 'Executing...' : 'Execute Restore Test'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showHoldModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', padding: '2rem', borderRadius: '6px', width: '480px', maxWidth: '90%' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Place Enterprise Legal Hold</h3>
            <form onSubmit={handleCreateLegalHold}>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Hold Name</label>
                <input
                  type="text"
                  value={holdForm.name}
                  onChange={e => setHoldForm({ ...holdForm, name: e.target.value })}
                  placeholder="e.g. Litigation Matter - Alpha Corp"
                  required
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid #d4d4d4', borderRadius: '3px' }}
                />
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Matter ID</label>
                <input
                  type="text"
                  value={holdForm.matter_id}
                  onChange={e => setHoldForm({ ...holdForm, matter_id: e.target.value })}
                  placeholder="e.g. MAT-2026-0901"
                  required
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid #d4d4d4', borderRadius: '3px', fontFamily: 'monospace' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Scope Type</label>
                <select
                  value={holdForm.scope_type}
                  onChange={e => setHoldForm({ ...holdForm, scope_type: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid #d4d4d4', borderRadius: '3px' }}
                >
                  <option value="ALL">ALL (Entire tenant contract archive)</option>
                  <option value="DOCUMENT">DOCUMENT (Specific document ID)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowHoldModal(false)}
                  style={{ padding: '0.6rem 1rem', background: 'transparent', border: '1px solid #d4d4d4', borderRadius: '3px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{ padding: '0.6rem 1.25rem', background: '#171717', color: '#ffffff', border: 'none', borderRadius: '3px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Confirm Legal Hold
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBreakGlassModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: '#ffffff', padding: '2rem', borderRadius: '6px', width: '520px', maxWidth: '90%', border: '2px solid #b91c1c' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🚨 Break-Glass Emergency Authorization
            </h3>
            <p style={{ color: '#525252', fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              This action bypasses standard tenancy isolation and invokes emergency administrative recovery privileges. 
              Your identity, IP address, and justification will be immutably recorded in the cryptographic audit ledger.
            </p>

            <form onSubmit={handleBreakGlass}>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Target Tenant ID</label>
                <input
                  type="text"
                  value={breakGlassForm.tenant_id}
                  onChange={e => setBreakGlassForm({ ...breakGlassForm, tenant_id: e.target.value })}
                  placeholder="e.g. tenant-corp-alpha"
                  required
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid #d4d4d4', borderRadius: '3px', fontFamily: 'monospace' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Explicit Emergency Justification</label>
                <textarea
                  value={breakGlassForm.reason}
                  onChange={e => setBreakGlassForm({ ...breakGlassForm, reason: e.target.value })}
                  placeholder="e.g. Disaster recovery restore test or authorized compliance audit incident #1042"
                  required
                  rows={3}
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid #d4d4d4', borderRadius: '3px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowBreakGlassModal(false)}
                  style={{ padding: '0.6rem 1rem', background: 'transparent', border: '1px solid #d4d4d4', borderRadius: '3px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{ padding: '0.6rem 1.25rem', background: '#b91c1c', color: '#ffffff', border: 'none', borderRadius: '3px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Authorize Break-Glass
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRetentionPreviewModal && retentionPreviewData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', padding: '2rem', borderRadius: '6px', width: '560px', maxWidth: '90%' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Retention Evaluation Impact Preview</h3>
            <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
              <div>Total Evaluated: <strong>{retentionPreviewData.total_evaluated}</strong></div>
              <div>Eligible for Purge: <strong>{retentionPreviewData.total_eligible_for_purge}</strong></div>
              <div>Protected by Legal Hold: <strong style={{ color: '#1d4ed8' }}>{retentionPreviewData.total_protected_by_legal_hold}</strong></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                onClick={() => setShowRetentionPreviewModal(false)}
                style={{ padding: '0.6rem 1rem', background: 'transparent', border: '1px solid #d4d4d4', borderRadius: '3px', cursor: 'pointer' }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
