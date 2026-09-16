import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Icon from '../common/Icon';
import MetricCard from '../common/MetricCard';
import SkeletonLoader from '../common/SkeletonLoader';
import EmptyState from '../common/EmptyState';
import ActionCard from '../actions/ActionCard';
import ActionFilters from '../actions/ActionFilters';
import ActionDetail from '../actions/ActionDetail';
import NotificationCenter from '../notifications/NotificationCenter';
import ExecutiveAttentionQueue from '../analytics/ExecutiveAttentionQueue';
import WorkflowAnalyticsDashboard from '../analytics/WorkflowAnalyticsDashboard';
import ActionsApi from '../../services/actionsApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { buttonMotion } from '../../styles/motion';

export const ActionsTab = ({ doc, refreshTrigger }) => {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState('ACTIONS');
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState(null);
  const [selectedActionId, setSelectedActionId] = useState(null);
  const [error, setError] = useState(null);

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [ownerFilter, setOwnerFilter] = useState('ALL');
  const [sortOption, setSortOption] = useState('HIGHEST_PRIORITY');
  const [searchQuery, setSearchQuery] = useState('');

  const { toast } = useToast();

  const loadActions = async (showToast = false) => {
    if (!doc?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await ActionsApi.getDocumentActions(doc.id);
      setActions(res.actions || []);
      if (showToast) toast('Workflow actions updated', 'ok');
    } catch (err) {
      if (err.status === 404) {
        setActions([]);
      } else {
        setError(err.message || 'Failed to load workflow actions');
        toast(err.message || 'Failed to load workflow actions', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setActions([]);
    setSelectedActionId(null);
    setSyncSummary(null);
    loadActions(false);
  }, [doc?.id, refreshTrigger]);

  useEffect(() => {
    if (actions.length === 0) return;
    try {
      const searchStr = window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
      const params = new URLSearchParams(searchStr);
      const actionIdParam = params.get('action');
      if (actionIdParam) {
        const match = actions.find((a) => a.id === actionIdParam);
        if (match) {
          setSelectedActionId(match.id);
          setActiveView('ACTIONS');
        } else {
          toast('Referenced action not found in this document', 'warn');
        }
      }
    } catch {
    }
  }, [actions]);

  const handleSyncActions = async () => {
    if (!doc?.id) return;
    setSyncing(true);
    setSyncSummary(null);
    try {
      const res = await ActionsApi.syncDocumentActions(doc.id);
      setSyncSummary(res.summary);
      toast(
        `Synchronized: ${res.summary?.created || 0} new actions created, ${res.summary?.existing || 0} preserved`,
        'ok'
      );
      await loadActions(false);
    } catch (err) {
      if (err.status === 404) {
        toast('No intelligence snapshot found. Generate intelligence first.', 'warn');
      } else {
        toast(err.message || 'Synchronization failed', 'error');
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleActionUpdated = (updatedAction) => {
    setActions((prev) =>
      prev.map((a) => (a.id === updatedAction.id ? { ...a, ...updatedAction } : a))
    );
  };

  const counts = useMemo(() => {
    const res = {
      total: actions.length,
      open: 0,
      inReview: 0,
      resolved: 0,
      dismissed: 0,
      critical: 0,
      important: 0,
      monitoring: 0
    };
    actions.forEach((a) => {
      if (a.status === 'OPEN') res.open++;
      if (a.status === 'IN_REVIEW') res.inReview++;
      if (a.status === 'RESOLVED') res.resolved++;
      if (a.status === 'DISMISSED') res.dismissed++;

      if (a.category === 'CRITICAL') res.critical++;
      if (a.category === 'IMPORTANT') res.important++;
      if (a.category === 'MONITORING') res.monitoring++;
    });
    return res;
  }, [actions]);

  const filteredActions = useMemo(() => {
    return actions
      .filter((a) => {
        if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;

        if (categoryFilter !== 'ALL' && a.category !== categoryFilter) return false;

        if (ownerFilter === 'ASSIGNED_TO_ME') {
          if (!user?.id || a.owner_id !== user.id) return false;
        } else if (ownerFilter === 'UNASSIGNED') {
          if (a.owner_id) return false;
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = (a.title || '').toLowerCase().includes(q);
          const matchExcerpt = (a.document_evidence?.excerpt || '').toLowerCase().includes(q);
          const matchSource = (a.source_action_id || '').toLowerCase().includes(q);
          const matchNotes = (a.resolution_notes || '').toLowerCase().includes(q);
          if (!matchTitle && !matchExcerpt && !matchSource && !matchNotes) return false;
        }

        return true;
      })
      .sort((a, b) => {
        switch (sortOption) {
          case 'HIGHEST_PRIORITY':
            return (b.priority_score || 0) - (a.priority_score || 0);
          case 'LOWEST_PRIORITY':
            return (a.priority_score || 0) - (b.priority_score || 0);
          case 'NEWEST':
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          case 'OLDEST':
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          case 'DUE_SOONEST': {
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          }
          default:
            return (b.priority_score || 0) - (a.priority_score || 0);
        }
      });
  }, [actions, statusFilter, categoryFilter, ownerFilter, sortOption, searchQuery, user?.id]);

  if (loading && actions.length === 0) {
    return (
      <div className="card">
        <SkeletonLoader.Text lines={2} width="320px" />
        <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <SkeletonLoader.Card count={4} height="100px" />
        </div>
        <div style={{ marginTop: '20px' }}>
          <SkeletonLoader.Card count={3} height="130px" />
        </div>
      </div>
    );
  }

  return (
    <div className="action-center-container">
      <div className="card mb-20" style={{ padding: '20px 24px', background: 'linear-gradient(135deg, rgba(30,27,75,0.4), rgba(15,23,42,0.6))' }}>
        <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div className="flex gap-8" style={{ alignItems: 'center', marginBottom: '6px' }}>
              <span className="dot dot-gold" />
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#FFF' }}>
                Executive Contract Action Center
              </h2>
            </div>
            <p className="text-mid small" style={{ margin: 0, maxWidth: '640px' }}>
              Review, assign, decide, and resolve prioritized contract risks under controlled human governance and append-only audit tracking.
            </p>
          </div>

          <div className="flex gap-8" style={{ alignItems: 'center' }}>
            <NotificationCenter onSelectAction={(actId) => setSelectedActionId(actId)} />
            <motion.button
              className="btn btn-royal"
              onClick={handleSyncActions}
              disabled={syncing}
              {...buttonMotion}
            >
              <Icon.refresh width={14} height={14} />
              {syncing ? 'Synchronizing…' : 'Sync Intelligence Actions'}
            </motion.button>
          </div>
        </div>

        <AnimatePresence>
          {syncSummary && (
            <motion.div
              className="mt-16 p-12"
              style={{
                background: 'rgba(5, 150, 105, 0.12)',
                border: '1px solid rgba(5, 150, 105, 0.3)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div style={{ fontSize: '13px', color: '#6EE7B7' }}>
                ✓ <strong>Synchronization Complete:</strong> {syncSummary.created || 0} new actions created,{' '}
                {syncSummary.existing || 0} existing actions preserved. <em>Existing workflow decisions and notes were not overwritten.</em>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSyncSummary(null)}
                style={{ color: '#6EE7B7', padding: '2px 8px' }}
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div
        className="flex gap-8 mb-20 p-4"
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          width: 'fit-content'
        }}
      >
        <button
          className={`btn btn-sm ${activeView === 'ACTIONS' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveView('ACTIONS')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
        >
          <Icon.target width={14} height={14} />
          <span>Action Center</span>
          <span
            style={{
              fontSize: '11px',
              padding: '1px 6px',
              borderRadius: '10px',
              background: activeView === 'ACTIONS' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'
            }}
          >
            {counts.total}
          </span>
        </button>

        <button
          className={`btn btn-sm ${activeView === 'ATTENTION' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveView('ATTENTION')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
        >
          <Icon.alert width={14} height={14} />
          <span>Executive Attention</span>
        </button>

        <button
          className={`btn btn-sm ${activeView === 'ANALYTICS' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveView('ANALYTICS')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
        >
          <Icon.chart width={14} height={14} />
          <span>Operational Intelligence</span>
        </button>
      </div>

      {activeView === 'ATTENTION' ? (
        <ExecutiveAttentionQueue
          documentId={doc?.id}
          onSelectAction={(id) => {
            setSelectedActionId(id);
            setActiveView('ACTIONS');
          }}
        />
      ) : activeView === 'ANALYTICS' ? (
        <WorkflowAnalyticsDashboard documentId={doc?.id} />
      ) : (
        <>
          <div className="grid grid-4 gap-16 mb-20">
            <MetricCard
              title="Total Actions"
              value={counts.total}
              sub={`${counts.critical} Critical · ${counts.important} Important`}
              icon={<Icon.target width={18} height={18} />}
            />
            <MetricCard
              title="In Review"
              value={counts.inReview}
              sub={`${counts.open} Awaiting Review`}
              badge={counts.inReview > 0 ? 'warn' : 'ok'}
              icon={<Icon.eye width={18} height={18} />}
            />
            <MetricCard
              title="Resolved"
              value={counts.resolved}
              sub="Documented resolution notes"
              badge="ok"
              icon={<Icon.check width={18} height={18} strokeWidth={2.5} />}
            />
            <MetricCard
              title="Dismissed"
              value={counts.dismissed}
              sub="Documented commercial rationale"
              icon={<Icon.x width={18} height={18} />}
            />
          </div>

          <ActionFilters
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            ownerFilter={ownerFilter}
            setOwnerFilter={setOwnerFilter}
            sortOption={sortOption}
            setSortOption={setSortOption}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            counts={counts}
          />

          {error && (
            <div
              className="card mb-16"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                borderColor: 'rgba(239, 68, 68, 0.3)',
                padding: '16px',
                textAlign: 'center'
              }}
            >
              <strong style={{ color: '#F87171' }}>Failed to load workflow actions</strong>
              <p className="text-mid small mt-4">{error}</p>
              <button className="btn btn-primary btn-sm mt-8" onClick={() => loadActions(true)}>
                Retry Loading
              </button>
            </div>
          )}

          {actions.length === 0 && !loading && !error ? (
            <div className="card text-center" style={{ padding: '48px 24px' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚡</div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>No Synchronized Workflow Actions</h3>
              <p className="text-mid small" style={{ maxWidth: '480px', margin: '0 auto 20px auto' }}>
                This contract does not currently have synchronized workflow action items. Click below to synchronize prioritized actions from the latest contract intelligence assessment.
              </p>
              <motion.button
                className="btn btn-primary"
                onClick={handleSyncActions}
                disabled={syncing}
                {...buttonMotion}
              >
                <Icon.refresh width={14} height={14} />
                {syncing ? 'Synchronizing…' : 'Sync Intelligence Actions'}
              </motion.button>
            </div>
          ) : filteredActions.length === 0 && actions.length > 0 ? (
            <div className="card text-center" style={{ padding: '40px 24px' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔍</div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '16px' }}>No Actions Match Active Filters</h3>
              <p className="text-mid small" style={{ margin: '0 auto 16px auto' }}>
                Try resetting your status, severity, or search query filters.
              </p>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setStatusFilter('ALL');
                  setCategoryFilter('ALL');
                  setOwnerFilter('ALL');
                  setSearchQuery('');
                }}
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="action-cards-grid flex flex-col gap-12">
              {filteredActions.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  onSelectAction={(id) => setSelectedActionId(id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <ActionDetail
        actionId={selectedActionId}
        isOpen={!!selectedActionId}
        onClose={() => setSelectedActionId(null)}
        onActionUpdated={handleActionUpdated}
      />
    </div>
  );
};

export default ActionsTab;
