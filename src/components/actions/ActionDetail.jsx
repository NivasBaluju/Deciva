import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Icon from '../common/Icon';
import { ActionStatusBadge, DecisionBadge, CategoryBadge, DueDateBadge } from './ActionStatusBadge';
import DecisionDialog from './DecisionDialog';
import ResolutionDialog from './ResolutionDialog';
import DismissalDialog from './DismissalDialog';
import OwnerDialog from './OwnerDialog';
import DueDateDialog from './DueDateDialog';
import WorkflowTimeline from './WorkflowTimeline';
import DecisionHistory from './DecisionHistory';
import ActionComments from './ActionComments';
import ActionsApi from '../../services/actionsApi';
import { useToast } from '../../context/ToastContext';
import { fmtDate } from '../../utils/formatters';
import { buttonMotion } from '../../styles/motion';

export const ActionDetail = ({ actionId, isOpen, onClose, onActionUpdated }) => {
  const [action, setAction] = useState(null);
  const [history, setHistory] = useState({ decisions: [], activity: [] });
  const [commentCount, setCommentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('context');

  const [showDecisionDialog, setShowDecisionDialog] = useState(false);
  const [showResolutionDialog, setShowResolutionDialog] = useState(false);
  const [showDismissalDialog, setShowDismissalDialog] = useState(false);
  const [showOwnerDialog, setShowOwnerDialog] = useState(false);
  const [showDueDateDialog, setShowDueDateDialog] = useState(false);

  const { toast } = useToast();

  const fetchActionDetails = async () => {
    if (!actionId) return;
    setLoading(true);
    try {
      const [actionRes, historyRes, commentsRes] = await Promise.all([
        ActionsApi.getAction(actionId),
        ActionsApi.getActionHistory(actionId),
        ActionsApi.getActionComments(actionId).catch(() => ({ totalCount: 0 }))
      ]);
      setAction(actionRes.action);
      setHistory(historyRes);
      if (commentsRes && typeof commentsRes.totalCount === 'number') {
        setCommentCount(commentsRes.totalCount);
      }
    } catch (err) {
      toast(err.message || 'Failed to load action details', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && actionId) {
      fetchActionDetails();
    }
  }, [actionId, isOpen]);

  const handleStateTransition = async (targetStatus, extra = {}) => {
    setMutating(true);
    try {
      const res = await ActionsApi.updateActionStatus(action.id, {
        status: targetStatus,
        ...extra
      });
      setAction(res.action);
      toast(`Action transitioned to ${targetStatus}`, 'ok');
      await fetchActionDetails();
      if (onActionUpdated) onActionUpdated(res.action);
    } catch (err) {
      toast(err.message || `Failed to transition to ${targetStatus}`, 'error');
    } finally {
      setMutating(false);
    }
  };

  const handleDialogSuccess = async (updatedAction) => {
    setAction(updatedAction);
    await fetchActionDetails();
    if (onActionUpdated) onActionUpdated(updatedAction);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="modal-backdrop"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'flex-end',
          zIndex: 900
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !mutating) onClose();
        }}
      >
        <motion.div
          className="action-detail-drawer"
          style={{
            width: '100%',
            maxWidth: '680px',
            height: '100vh',
            background: 'var(--bg-card, #141416)',
            borderLeft: '1px solid var(--border-hairline, rgba(255, 255, 255, 0.12))',
            boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.8)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto'
          }}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        >
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(20, 20, 22, 0.95)',
              backdropFilter: 'blur(10px)',
              position: 'sticky',
              top: 0,
              zIndex: 10
            }}
          >
            <div className="flex-between mb-8" style={{ alignItems: 'flex-start' }}>
              <div className="flex gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <CategoryBadge category={action?.category} size="small" />
                <ActionStatusBadge status={action?.status} size="small" />
                <DecisionBadge decision={action?.decision} size="small" />
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={onClose}
                disabled={mutating}
                style={{ padding: '6px' }}
              >
                <Icon.x width={18} height={18} />
              </button>
            </div>

            <h2 style={{ margin: '8px 0 4px 0', fontSize: '19px', fontWeight: 700, color: '#FFF' }}>
              {action?.title || 'Action Details'}
            </h2>

            <div className="text-mid small" style={{ fontSize: '12.5px' }}>
              Document: {action?.document_name || action?.document_id}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#71717A' }}>
              <Icon.refresh width={24} height={24} className="spin mb-8" />
              <div>Loading action details...</div>
            </div>
          ) : action ? (
            <div style={{ padding: '24px' }}>
              <div
                className="card mb-20"
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderColor: 'rgba(255, 255, 255, 0.08)',
                  padding: '16px 20px'
                }}
              >
                <div className="flex-between" style={{ alignItems: 'center' }}>
                  <div>
                    <span className="text-mid small">Deterministic Priority Score</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
                      <span
                        style={{
                          fontSize: '32px',
                          fontWeight: 800,
                          color: action.priority_score >= 70 ? '#EF4444' : action.priority_score >= 45 ? '#F59E0B' : '#3B82F6'
                        }}
                      >
                        {action.priority_score}
                      </span>
                      <span className="text-mid small">/ 100</span>
                    </div>
                  </div>

                  {action.priority_breakdown && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', maxWidth: '340px' }}>
                      <span className="badge" style={{ fontSize: '11px', background: 'rgba(239, 68, 68, 0.15)', color: '#FCA5A5' }}>
                        Clause: +{action.priority_breakdown.clauseSeverity || 0}
                      </span>
                      <span className="badge" style={{ fontSize: '11px', background: 'rgba(245, 158, 11, 0.15)', color: '#FCD34D' }}>
                        Neg: +{action.priority_breakdown.negotiationImbalance || 0}
                      </span>
                      <span className="badge" style={{ fontSize: '11px', background: 'rgba(139, 92, 246, 0.15)', color: '#C4B5FD' }}>
                        Sim: +{action.priority_breakdown.simulationExposure || 0}
                      </span>
                      <span className="badge" style={{ fontSize: '11px', background: 'rgba(59, 130, 246, 0.15)', color: '#93C5FD' }}>
                        Due: +{action.priority_breakdown.deadlineUrgency || 0}
                      </span>
                      <span className="badge" style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.15)', color: '#6EE7B7' }}>
                        Comp: +{action.priority_breakdown.complianceExposure || 0}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div
                className="card mb-20"
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  padding: '16px'
                }}
              >
                <div className="text-mid small mb-8" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Workflow Controls ({action.status})
                </div>

                <div className="flex gap-8" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                  {action.status === 'OPEN' && (
                    <>
                      <motion.button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleStateTransition('IN_REVIEW')}
                        disabled={mutating}
                        {...buttonMotion}
                      >
                        <Icon.arrowRight width={14} height={14} /> Start Review
                      </motion.button>
                      <button
                        className="btn btn-outline btn-sm text-danger"
                        onClick={() => setShowDismissalDialog(true)}
                        disabled={mutating}
                      >
                        <Icon.x width={14} height={14} /> Dismiss Action
                      </button>
                    </>
                  )}

                  {action.status === 'IN_REVIEW' && (
                    <>
                      <motion.button
                        className="btn btn-sm"
                        style={{ background: '#10B981', color: '#FFF', border: 'none' }}
                        onClick={() => setShowResolutionDialog(true)}
                        disabled={mutating}
                        {...buttonMotion}
                      >
                        <Icon.checkCircle width={14} height={14} /> Resolve Action
                      </motion.button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowDecisionDialog(true)}
                        disabled={mutating}
                      >
                        <Icon.zap width={14} height={14} /> Record Decision
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleStateTransition('OPEN', { reason: 'Returned to backlog' })}
                        disabled={mutating}
                      >
                        Return to Open
                      </button>
                      <button
                        className="btn btn-outline btn-sm text-danger"
                        onClick={() => setShowDismissalDialog(true)}
                        disabled={mutating}
                      >
                        Dismiss Action
                      </button>
                    </>
                  )}

                  {action.status === 'RESOLVED' && (
                    <motion.button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleStateTransition('IN_REVIEW', { reason: 'Reopened for additional review' })}
                      disabled={mutating}
                      {...buttonMotion}
                    >
                      <Icon.history width={14} height={14} /> Reopen Action to IN REVIEW
                    </motion.button>
                  )}

                  {action.status === 'DISMISSED' && (
                    <motion.button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleStateTransition('IN_REVIEW', { reason: 'Reconsideration initiated' })}
                      disabled={mutating}
                      {...buttonMotion}
                    >
                      <Icon.history width={14} height={14} /> Reconsider Action
                    </motion.button>
                  )}

                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowOwnerDialog(true)}
                      disabled={mutating}
                      title="Assign Owner"
                    >
                      <Icon.user width={14} height={14} /> {action.owner_name || (action.owner_id ? `Owner: ${action.owner_id.slice(0, 6)}…` : 'Assign Owner')}
                    </button>

                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowDueDateDialog(true)}
                      disabled={mutating}
                      title="Set Due Date"
                    >
                      <Icon.calendar width={14} height={14} /> {action.due_date ? fmtDate(action.due_date) : 'Set Due Date'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="tab-bar mb-16" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <button
                  className={`tab-btn ${activeSubTab === 'context' ? 'active' : ''}`}
                  onClick={() => setActiveSubTab('context')}
                >
                  🧠 Evidence & Context
                </button>
                <button
                  className={`tab-btn ${activeSubTab === 'discussion' ? 'active' : ''}`}
                  onClick={() => setActiveSubTab('discussion')}
                >
                  💬 Discussion {commentCount > 0 ? `(${commentCount})` : ''}
                </button>
                <button
                  className={`tab-btn ${activeSubTab === 'decisions' ? 'active' : ''}`}
                  onClick={() => setActiveSubTab('decisions')}
                >
                  ⚖️ Decision Ledger ({history.decisions?.length || 0})
                </button>
                <button
                  className={`tab-btn ${activeSubTab === 'history' ? 'active' : ''}`}
                  onClick={() => setActiveSubTab('history')}
                >
                  📜 Activity Timeline ({history.activity?.length || 0})
                </button>
              </div>

              {activeSubTab === 'context' && (
                <div>
                  {action.status === 'RESOLVED' && action.resolution_notes && (
                    <div
                      className="card mb-16"
                      style={{
                        background: 'rgba(74, 222, 128, 0.08)',
                        borderColor: 'rgba(74, 222, 128, 0.3)',
                        padding: '16px'
                      }}
                    >
                      <div className="flex-between mb-4">
                        <strong style={{ color: '#86EFAC', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Icon.checkCircle width={16} height={16} /> Resolution Documented
                        </strong>
                        {action.resolved_at && (
                          <span className="text-mid small">{fmtDate(action.resolved_at)}</span>
                        )}
                      </div>
                      <p style={{ margin: '6px 0 0 0', fontSize: '13.5px', color: '#DCFCE7', whiteSpace: 'pre-wrap' }}>
                        {action.resolution_notes}
                      </p>
                    </div>
                  )}

                  {action.status === 'DISMISSED' && action.decision_reason && (
                    <div
                      className="card mb-16"
                      style={{
                        background: 'rgba(239, 68, 68, 0.08)',
                        borderColor: 'rgba(239, 68, 68, 0.3)',
                        padding: '16px'
                      }}
                    >
                      <strong style={{ color: '#FCA5A5', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Icon.x width={16} height={16} /> Action Dismissed
                      </strong>
                      <p style={{ margin: '6px 0 0 0', fontSize: '13.5px', color: '#FEE2E2', whiteSpace: 'pre-wrap' }}>
                        {action.decision_reason}
                      </p>
                    </div>
                  )}

                  <div
                    className="card mb-16"
                    style={{
                      background: 'rgba(59, 130, 246, 0.04)',
                      borderColor: 'rgba(59, 130, 246, 0.25)',
                      padding: '16px 18px'
                    }}
                  >
                    <div className="flex-between mb-8">
                      <h4 style={{ margin: 0, fontSize: '14px', color: '#93C5FD', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        📄 Immutable Document Evidence
                      </h4>
                      {action.document_evidence?.section && (
                        <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93C5FD' }}>
                          {action.document_evidence.section}
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        borderLeft: '3px solid #3B82F6',
                        padding: '12px 14px',
                        borderRadius: '0 6px 6px 0',
                        fontSize: '13px',
                        color: '#E4E4E7',
                        fontStyle: 'italic',
                        lineHeight: 1.5
                      }}
                    >
                      "{action.document_evidence?.excerpt || 'Source clause excerpt from document'}"
                    </div>

                    <p className="text-mid small" style={{ margin: '8px 0 0 0', fontSize: '11px' }}>
                      🔒 Direct unedited quote from contract source text.
                    </p>
                  </div>

                  <div
                    className="card mb-16"
                    style={{
                      background: 'rgba(245, 158, 11, 0.04)',
                      borderColor: 'rgba(245, 158, 11, 0.25)',
                      padding: '16px 18px'
                    }}
                  >
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#FCD34D', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🧠 AI Intelligence Assessment
                    </h4>

                    {action.intelligence_assessment?.whyItMatters && (
                      <div className="mb-12">
                        <strong className="text-mid small" style={{ color: '#FBBF24', display: 'block', marginBottom: '2px' }}>
                          Why It Matters:
                        </strong>
                        <p style={{ margin: 0, fontSize: '13px', color: '#F4F4F5', lineHeight: 1.5 }}>
                          {action.intelligence_assessment.whyItMatters}
                        </p>
                      </div>
                    )}

                    {action.intelligence_assessment?.recommendedAction && (
                      <div>
                        <strong className="text-mid small" style={{ color: '#FBBF24', display: 'block', marginBottom: '2px' }}>
                          Recommended Action:
                        </strong>
                        <p style={{ margin: 0, fontSize: '13px', color: '#F4F4F5', lineHeight: 1.5 }}>
                          {action.intelligence_assessment.recommendedAction}
                        </p>
                      </div>
                    )}
                  </div>

                  {action.provenance && (
                    <div
                      className="card"
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderColor: 'rgba(255, 255, 255, 0.08)',
                        padding: '14px 16px'
                      }}
                    >
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#A1A1AA' }}>
                        🔗 Traceability & Machine Provenance
                      </h4>
                      <div className="mono small" style={{ fontSize: '11px', color: '#71717A', lineHeight: 1.6 }}>
                        <div>Source Action: {action.source_action_id}</div>
                        {action.provenance.clauseIds?.length > 0 && (
                          <div>Clause IDs: {action.provenance.clauseIds.join(', ')}</div>
                        )}
                        {action.provenance.simulationIds?.length > 0 && (
                          <div>Simulation IDs: {action.provenance.simulationIds.join(', ')}</div>
                        )}
                        {action.provenance.riskFactorIds?.length > 0 && (
                          <div>Risk Factor IDs: {action.provenance.riskFactorIds.join(', ')}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeSubTab === 'discussion' && (
                <ActionComments
                  actionId={action.id}
                  onCommentActivity={async () => {
                    await fetchActionDetails();
                  }}
                />
              )}

              {activeSubTab === 'decisions' && (
                <div>
                  <div className="flex-between mb-16">
                    <h3 style={{ margin: 0, fontSize: '15px' }}>Immutable Decision Ledger</h3>
                    {action.status === 'IN_REVIEW' && (
                      <button
                        className="btn btn-primary btn-xs"
                        onClick={() => setShowDecisionDialog(true)}
                        disabled={mutating}
                      >
                        <Icon.zap width={12} height={12} /> Record Decision
                      </button>
                    )}
                  </div>
                  <DecisionHistory decisions={history.decisions} />
                </div>
              )}

              {activeSubTab === 'history' && (
                <div>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Chronological Action Activity</h3>
                  <WorkflowTimeline activity={history.activity} />
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '32px', textAlign: 'center' }}>
              <p className="text-danger">Action not found.</p>
            </div>
          )}

          <DecisionDialog
            isOpen={showDecisionDialog}
            onClose={() => setShowDecisionDialog(false)}
            action={action}
            onSuccess={handleDialogSuccess}
          />
          <ResolutionDialog
            isOpen={showResolutionDialog}
            onClose={() => setShowResolutionDialog(false)}
            action={action}
            onSuccess={handleDialogSuccess}
          />
          <DismissalDialog
            isOpen={showDismissalDialog}
            onClose={() => setShowDismissalDialog(false)}
            action={action}
            onSuccess={handleDialogSuccess}
          />
          <OwnerDialog
            isOpen={showOwnerDialog}
            onClose={() => setShowOwnerDialog(false)}
            action={action}
            onSuccess={handleDialogSuccess}
          />
          <DueDateDialog
            isOpen={showDueDateDialog}
            onClose={() => setShowDueDateDialog(false)}
            action={action}
            onSuccess={handleDialogSuccess}
          />
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ActionDetail;
