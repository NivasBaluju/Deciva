import React, { useState, useEffect } from 'react';
import { IntegrationApi } from '../../services/integrationApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function IntegrationConsole() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('registry');
  const [integrations, setIntegrations] = useState([]);
  const [overview, setOverview] = useState(null);
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [syncRuns, setSyncRuns] = useState([]);
  const [outboxEvents, setOutboxEvents] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [newIntegration, setNewIntegration] = useState({
    name: '',
    provider: 'generic_rest',
    integration_type: 'DOCUMENT_SOURCE',
    endpoint_url: 'http://localhost:5000/mock/partner',
    mock: true,
    secret: ''
  });

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedIntegration) {
      loadIntegrationDetails(selectedIntegration.id);
    }
  }, [selectedIntegration, activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [listRes, overRes] = await Promise.all([
        IntegrationApi.listIntegrations(),
        IntegrationApi.getOverview().catch(() => null)
      ]);

      const items = Array.isArray(listRes) ? listRes : (listRes?.data || []);
      setIntegrations(items);
      setOverview(overRes);

      if (items.length > 0 && !selectedIntegration) {
        setSelectedIntegration(items[0]);
      }
    } catch (err) {
      console.error('Failed to load integrations:', err);
      showToast('Failed to load enterprise integrations', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadIntegrationDetails = async (intgId) => {
    try {
      if (activeTab === 'runs') {
        const res = await IntegrationApi.listSyncRuns(intgId);
        setSyncRuns(res.runs || []);
      } else if (activeTab === 'events') {
        const res = await IntegrationApi.listEvents(intgId);
        setOutboxEvents(res.events || []);
      } else if (activeTab === 'mappings') {
        const res = await IntegrationApi.listMappings(intgId);
        setMappings(res.mappings || []);
      }
    } catch (err) {
      console.error('Failed to load integration detail tab:', err);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      await IntegrationApi.createIntegration({
        name: newIntegration.name,
        provider: newIntegration.provider,
        integration_type: newIntegration.integration_type,
        configuration: {
          endpoint_url: newIntegration.endpoint_url,
          mock: newIntegration.mock
        },
        secret: newIntegration.secret
      });
      showToast('Enterprise integration created successfully', 'success');
      setShowCreateModal(false);
      setNewIntegration({
        name: '',
        provider: 'generic_rest',
        integration_type: 'DOCUMENT_SOURCE',
        endpoint_url: 'http://localhost:5000/mock/partner',
        mock: true,
        secret: ''
      });
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to create integration', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTestConnection = async (id) => {
    try {
      setActionLoading(true);
      const res = await IntegrationApi.testConnection(id);
      if (res.reachable) {
        showToast(`Connection verified: Reachable (${res.latency_ms || 10}ms)`, 'success');
      } else {
        showToast(`Connection failed: ${res.error || 'Endpoint unreachable'}`, 'error');
      }
    } catch (err) {
      showToast(err.message || 'Connection test failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivate = async (id) => {
    try {
      setActionLoading(true);
      await IntegrationApi.activateIntegration(id);
      showToast('Integration activated and listening', 'success');
      await loadData();
    } catch (err) {
      showToast(err.message || 'Activation failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async (id) => {
    try {
      setActionLoading(true);
      await IntegrationApi.pauseIntegration(id);
      showToast('Integration paused', 'info');
      await loadData();
    } catch (err) {
      showToast(err.message || 'Pause failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSyncNow = async (id) => {
    try {
      setActionLoading(true);
      showToast('Initiating synchronization run...', 'info');
      const res = await IntegrationApi.triggerSync(id);
      showToast(
        `Sync completed (${res.status}): ${res.records?.created || 0} created, ${res.records?.updated || 0} updated`,
        'success'
      );
      await loadData();
      if (activeTab === 'runs') {
        await loadIntegrationDetails(id);
      }
    } catch (err) {
      showToast(err.message || 'Sync run failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryEvents = async (id, eventId = null) => {
    try {
      setActionLoading(true);
      const res = await IntegrationApi.retryEvents(id, eventId);
      showToast(`Queued ${res.replayedCount || 0} dead-letter events for retry`, 'success');
      await loadIntegrationDetails(id);
    } catch (err) {
      showToast(err.message || 'Retry failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">ACTIVE</span>;
      case 'DRAFT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-semibold bg-amber-950 text-amber-300 border border-amber-800">DRAFT</span>;
      case 'PAUSED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">PAUSED</span>;
      case 'ERROR':
        return <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-800">ERROR</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-semibold bg-zinc-900 text-zinc-400 border border-zinc-800">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-paper border border-rule p-4 rounded shadow-sm">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">Active Integrations</div>
            <div className="mt-1 font-display text-2xl font-bold text-ink">
              {overview.integrations?.active || 0}
              <span className="text-xs font-mono font-normal text-muted ml-1.5">/ {overview.integrations?.total || 0}</span>
            </div>
          </div>
          <div className="bg-paper border border-rule p-4 rounded shadow-sm">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">Documents Ingested</div>
            <div className="mt-1 font-display text-2xl font-bold text-ink">
              {overview.documents?.imported || 0}
              <span className="text-xs font-mono font-normal text-muted ml-1.5">imported</span>
            </div>
          </div>
          <div className="bg-paper border border-rule p-4 rounded shadow-sm">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">Outbound Delivered</div>
            <div className="mt-1 font-display text-2xl font-bold text-ink">
              {overview.events?.delivered || 0}
              <span className="text-xs font-mono font-normal text-muted ml-1.5">events</span>
            </div>
          </div>
          <div className="bg-paper border border-rule p-4 rounded shadow-sm">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">Dead-Letter Queue</div>
            <div className="mt-1 font-display text-2xl font-bold text-amber-500">
              {overview.events?.dead_letter || 0}
              <span className="text-xs font-mono font-normal text-muted ml-1.5">failed</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-paper border border-rule rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-rule flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">
              Enterprise Integration Gateway
            </h2>
            <p className="font-body text-xs text-muted mt-0.5">
              Manage external document sources, CRM/ERP connectors, and secure webhook subscriptions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-3.5 py-1.5 rounded font-mono text-xs font-semibold bg-ink text-paper hover:opacity-90 transition shadow-sm"
              >
                + Register Connector
              </button>
            )}
            <button
              onClick={loadData}
              disabled={loading}
              className="px-3 py-1.5 rounded font-mono text-xs border border-rule text-ink hover:bg-subtle transition"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="flex border-b border-rule px-6 bg-subtle/40 overflow-x-auto">
          <button
            onClick={() => setActiveTab('registry')}
            className={`py-3 px-4 font-mono text-xs font-medium border-b-2 transition ${
              activeTab === 'registry'
                ? 'border-ink text-ink font-semibold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Connectors Registry ({integrations.length})
          </button>
          {selectedIntegration && (
            <>
              <button
                onClick={() => setActiveTab('runs')}
                className={`py-3 px-4 font-mono text-xs font-medium border-b-2 transition ${
                  activeTab === 'runs'
                    ? 'border-ink text-ink font-semibold'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                Sync History
              </button>
              <button
                onClick={() => setActiveTab('events')}
                className={`py-3 px-4 font-mono text-xs font-medium border-b-2 transition ${
                  activeTab === 'events'
                    ? 'border-ink text-ink font-semibold'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                Outbox Ledger
              </button>
              <button
                onClick={() => setActiveTab('mappings')}
                className={`py-3 px-4 font-mono text-xs font-medium border-b-2 transition ${
                  activeTab === 'mappings'
                    ? 'border-ink text-ink font-semibold'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                Object Mappings
              </button>
            </>
          )}
        </div>

        {activeTab === 'registry' && (
          <div className="p-6">
            {integrations.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-rule rounded">
                <div className="font-display text-lg text-ink font-medium">No Integrations Configured</div>
                <p className="font-body text-xs text-muted mt-1 max-w-md mx-auto">
                  Deciva can connect directly to external contract repositories and business systems via secure REST endpoints.
                </p>
                {isAdmin && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="mt-4 px-4 py-2 rounded font-mono text-xs font-semibold bg-ink text-paper"
                  >
                    Register First Connector
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-rule border border-rule rounded overflow-hidden">
                {integrations.map((intg) => (
                  <div
                    key={intg.id}
                    className={`p-5 transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      selectedIntegration?.id === intg.id ? 'bg-subtle/50' : 'hover:bg-subtle/20'
                    }`}
                  >
                    <div className="space-y-1.5 cursor-pointer" onClick={() => setSelectedIntegration(intg)}>
                      <div className="flex items-center gap-3">
                        <span className="font-display font-medium text-base text-ink">{intg.name}</span>
                        {getStatusBadge(intg.status)}
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {intg.provider}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-muted">
                        <span>Type: {intg.integration_type}</span>
                        <span>•</span>
                        <span>Credentials: {intg.has_credentials ? 'Vault Encrypted' : 'None'}</span>
                        <span>•</span>
                        <span>Last Sync: {intg.last_sync_at ? new Date(intg.last_sync_at).toLocaleString() : 'Never'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTestConnection(intg.id)}
                        disabled={actionLoading}
                        className="px-3 py-1 rounded font-mono text-xs border border-rule text-ink hover:bg-subtle transition"
                      >
                        Test
                      </button>

                      {intg.status === 'ACTIVE' ? (
                        <>
                          <button
                            onClick={() => handleSyncNow(intg.id)}
                            disabled={actionLoading}
                            className="px-3 py-1 rounded font-mono text-xs font-semibold bg-ink text-paper hover:opacity-90 transition"
                          >
                            Sync Now
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handlePause(intg.id)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 rounded font-mono text-xs border border-amber-800 text-amber-300 hover:bg-amber-950 transition"
                            >
                              Pause
                            </button>
                          )}
                        </>
                      ) : (
                        isAdmin && (
                          <button
                            onClick={() => handleActivate(intg.id)}
                            disabled={actionLoading}
                            className="px-3 py-1 rounded font-mono text-xs font-semibold bg-emerald-900 border border-emerald-700 text-emerald-200 hover:bg-emerald-800 transition"
                          >
                            Activate
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'runs' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-ink">
                Synchronization Runs: {selectedIntegration?.name}
              </h3>
              <button
                onClick={() => handleSyncNow(selectedIntegration.id)}
                disabled={actionLoading}
                className="px-3 py-1 rounded font-mono text-xs font-semibold bg-ink text-paper"
              >
                Run Synchronization
              </button>
            </div>

            {syncRuns.length === 0 ? (
              <p className="font-mono text-xs text-muted py-6 text-center border border-rule rounded">
                No sync runs recorded yet for this integration.
              </p>
            ) : (
              <div className="overflow-x-auto border border-rule rounded">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-subtle border-b border-rule">
                    <tr>
                      <th className="p-3">Status</th>
                      <th className="p-3">Started</th>
                      <th className="p-3">Duration</th>
                      <th className="p-3 text-right">Created</th>
                      <th className="p-3 text-right">Updated</th>
                      <th className="p-3 text-right">Skipped</th>
                      <th className="p-3 text-right">Failed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {syncRuns.map((r) => (
                      <tr key={r.id} className="hover:bg-subtle/30">
                        <td className="p-3 font-semibold">{getStatusBadge(r.status)}</td>
                        <td className="p-3 text-muted">{new Date(r.started_at).toLocaleTimeString()}</td>
                        <td className="p-3 text-muted">
                          {r.completed_at
                            ? `${Math.round((new Date(r.completed_at) - new Date(r.started_at)) / 1000)}s`
                            : 'Running...'}
                        </td>
                        <td className="p-3 text-right text-emerald-400 font-bold">{r.records_created}</td>
                        <td className="p-3 text-right text-cyan-400">{r.records_updated}</td>
                        <td className="p-3 text-right text-muted">{r.records_skipped}</td>
                        <td className="p-3 text-right text-rose-400 font-bold">{r.records_failed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-base font-semibold text-ink">
                  Outbound Event Ledger (Transactional Outbox)
                </h3>
                <p className="font-body text-xs text-muted">
                  Guaranteed at-least-once outbound dispatch with automatic exponential backoff.
                </p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => handleRetryEvents(selectedIntegration.id)}
                  disabled={actionLoading}
                  className="px-3 py-1 rounded font-mono text-xs border border-amber-700 text-amber-300 hover:bg-amber-950 transition"
                >
                  Retry All Dead-Letter Events
                </button>
              )}
            </div>

            {outboxEvents.length === 0 ? (
              <p className="font-mono text-xs text-muted py-6 text-center border border-rule rounded">
                No outbound events queued or delivered.
              </p>
            ) : (
              <div className="overflow-x-auto border border-rule rounded">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-subtle border-b border-rule">
                    <tr>
                      <th className="p-3">Status</th>
                      <th className="p-3">Event Type</th>
                      <th className="p-3">Event ID</th>
                      <th className="p-3 text-right">Attempts</th>
                      <th className="p-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {outboxEvents.map((ev) => (
                      <tr key={ev.id} className="hover:bg-subtle/30">
                        <td className="p-3 font-semibold">{getStatusBadge(ev.status)}</td>
                        <td className="p-3 font-bold text-ink">{ev.event_type}</td>
                        <td className="p-3 text-muted">{ev.event_id}</td>
                        <td className="p-3 text-right">{ev.attempt_count}</td>
                        <td className="p-3 text-muted">{new Date(ev.created_at).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'mappings' && (
          <div className="p-6">
            <h3 className="font-display text-base font-semibold text-ink mb-2">
              External Object Identity Mappings
            </h3>
            <p className="font-body text-xs text-muted mb-4">
              Deterministic foreign-key references linking external IDs to internal Deciva contracts.
            </p>

            {mappings.length === 0 ? (
              <p className="font-mono text-xs text-muted py-6 text-center border border-rule rounded">
                No external objects mapped yet.
              </p>
            ) : (
              <div className="overflow-x-auto border border-rule rounded">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-subtle border-b border-rule">
                    <tr>
                      <th className="p-3">External ID</th>
                      <th className="p-3">Deciva Doc ID</th>
                      <th className="p-3 text-center">Ext Version</th>
                      <th className="p-3">Last Synced</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {mappings.map((m) => (
                      <tr key={m.id} className="hover:bg-subtle/30">
                        <td className="p-3 font-bold text-ink">{m.external_object_id}</td>
                        <td className="p-3 text-muted">{m.deciva_object_id}</td>
                        <td className="p-3 text-center">{m.external_version}</td>
                        <td className="p-3 text-muted">{new Date(m.last_synced_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-paper border border-rule rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-rule flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-ink">Register Connector</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-muted hover:text-ink font-mono text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block font-mono text-xs uppercase text-muted mb-1">Connector Name</label>
                <input
                  type="text"
                  required
                  value={newIntegration.name}
                  onChange={(e) => setNewIntegration({ ...newIntegration, name: e.target.value })}
                  placeholder="e.g. Corporate SharePoint Repository"
                  className="w-full px-3 py-2 rounded bg-subtle border border-rule text-ink font-body text-sm focus:outline-none focus:border-ink"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-xs uppercase text-muted mb-1">Provider</label>
                  <select
                    value={newIntegration.provider}
                    onChange={(e) => setNewIntegration({ ...newIntegration, provider: e.target.value })}
                    className="w-full px-3 py-2 rounded bg-subtle border border-rule text-ink font-body text-sm"
                  >
                    <option value="generic_rest">Generic REST Source</option>
                    <option value="webhook">Webhook Gateway</option>
                  </select>
                </div>

                <div>
                  <label className="block font-mono text-xs uppercase text-muted mb-1">Integration Type</label>
                  <select
                    value={newIntegration.integration_type}
                    onChange={(e) => setNewIntegration({ ...newIntegration, integration_type: e.target.value })}
                    className="w-full px-3 py-2 rounded bg-subtle border border-rule text-ink font-body text-sm"
                  >
                    <option value="DOCUMENT_SOURCE">DOCUMENT_SOURCE</option>
                    <option value="WEBHOOK">WEBHOOK</option>
                    <option value="OUTBOUND_API">OUTBOUND_API</option>
                    <option value="BUSINESS_SYSTEM">BUSINESS_SYSTEM</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-mono text-xs uppercase text-muted mb-1">Endpoint URL</label>
                <input
                  type="text"
                  value={newIntegration.endpoint_url}
                  onChange={(e) => setNewIntegration({ ...newIntegration, endpoint_url: e.target.value })}
                  placeholder="https://api.partner.example.com/v1"
                  className="w-full px-3 py-2 rounded bg-subtle border border-rule text-ink font-body text-sm focus:outline-none focus:border-ink"
                />
              </div>

              <div>
                <label className="block font-mono text-xs uppercase text-muted mb-1">API Key / Secret Token</label>
                <input
                  type="password"
                  value={newIntegration.secret}
                  onChange={(e) => setNewIntegration({ ...newIntegration, secret: e.target.value })}
                  placeholder="Vault-encrypted (AES-256-GCM)"
                  className="w-full px-3 py-2 rounded bg-subtle border border-rule text-ink font-body text-sm focus:outline-none focus:border-ink"
                />
                <p className="font-body text-xs text-muted mt-1">
                  Secrets are stored in Deciva's AES-256-GCM encrypted vault and never logged or exposed in plaintext.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="mockMode"
                  checked={newIntegration.mock}
                  onChange={(e) => setNewIntegration({ ...newIntegration, mock: e.target.checked })}
                  className="rounded border-rule text-ink"
                />
                <label htmlFor="mockMode" className="font-mono text-xs text-muted cursor-pointer">
                  Enable mock simulation mode (safe testing without live external endpoint)
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-rule">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded font-mono text-xs border border-rule text-ink hover:bg-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded font-mono text-xs font-semibold bg-ink text-paper hover:opacity-90"
                >
                  {actionLoading ? 'Encrypting & Saving...' : 'Save Connector'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
