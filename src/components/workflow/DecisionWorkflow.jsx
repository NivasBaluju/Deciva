import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import WorkflowApi from '../../services/workflowApi';
import { useToast } from '../../context/ToastContext';
import Icon from '../common/Icon';
import SkeletonLoader from '../common/SkeletonLoader';

export const DecisionWorkflow = ({ doc, refreshTrigger }) => {
  const [decisions, setDecisions] = useState([]);
  const [selectedDecisionId, setSelectedDecisionId] = useState(null);
  const [decisionDetail, setDecisionDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showRequestChangesModal, setShowRequestChangesModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDecisionType, setNewDecisionType] = useState('MATERIAL_CONTRACT_CHANGE');
  const [newPriority, setNewPriority] = useState('HIGH');
  const [newRiskScore, setNewRiskScore] = useState(doc?.risk_score || 65);
  const [newLiability, setNewLiability] = useState(1250000);
  const [newOwnerId, setNewOwnerId] = useState('');
  const [newApproverId, setNewApproverId] = useState('');

  const [commentBody, setCommentBody] = useState('');
  const [clauseRef, setClauseRef] = useState('');

  const [changeReason, setChangeReason] = useState('');
  const [changeNotes, setChangeNotes] = useState('');
  const [changeClauseRef, setChangeClauseRef] = useState('');

  const [rejectReason, setRejectReason] = useState('');

  const [assignUserId, setAssignUserId] = useState('');
  const [assignRole, setAssignRole] = useState('REVIEWER');
  const [assignNotes, setAssignNotes] = useState('');

  const { toast } = useToast();

  const loadDecisions = async () => {
    if (!doc?.id) return;
    try {
      setLoading(true);
      const res = await WorkflowApi.getDocumentDecisions(doc.id);
      const list = res.decisions || [];
      setDecisions(list);
      if (list.length > 0 && !selectedDecisionId) {
        setSelectedDecisionId(list[0].id);
      }
    } catch (err) {
      toast(err.message || 'Failed to load decisions', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadDecisionDetail = async (id) => {
    if (!id) return;
    try {
      setDetailLoading(true);
      const res = await WorkflowApi.getDecision(id);
      setDecisionDetail(res);
    } catch (err) {
      toast(err.message || 'Failed to load decision details', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadDecisions();
  }, [doc?.id, refreshTrigger]);

  useEffect(() => {
    if (selectedDecisionId) {
      loadDecisionDetail(selectedDecisionId);
    }
  }, [selectedDecisionId]);

  const handleCreateWorkflow = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast('Title is required', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const res = await WorkflowApi.createDecision(doc.id, {
        title: newTitle.trim(),
        description: newDescription.trim(),
        decisionType: newDecisionType,
        priority: newPriority,
        riskScore: Number(newRiskScore),
        liabilityExposure: Number(newLiability),
        ownerId: newOwnerId || undefined,
        approverId: newApproverId || undefined,
        evidenceJson: {
          groundedRiskScore: doc.risk_score,
          documentTitle: doc.original_name
        }
      });
      toast('Decision workflow created successfully', 'ok');
      setShowCreateModal(false);
      setNewTitle('');
      setNewDescription('');
      await loadDecisions();
      if (res.decision?.id) {
        setSelectedDecisionId(res.decision.id);
      }
    } catch (err) {
      toast(err.message || 'Failed to create decision workflow', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedDecisionId) return;
    setActionLoading(true);
    try {
      await WorkflowApi.submitDecision(selectedDecisionId, {
        notes: 'Submitted for formal human review and approval'
      });
      toast('Workflow submitted for review', 'ok');
      await loadDecisionDetail(selectedDecisionId);
      await loadDecisions();
    } catch (err) {
      toast(err.message || 'Submission failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedDecisionId) return;
    setActionLoading(true);
    try {
      await WorkflowApi.approveDecision(selectedDecisionId, {
        notes: 'Decision formally verified and approved by designated authority.'
      });
      toast('Decision approved successfully', 'ok');
      await loadDecisionDetail(selectedDecisionId);
      await loadDecisions();
    } catch (err) {
      toast(err.message || 'Approval failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!selectedDecisionId) return;
    setActionLoading(true);
    try {
      await WorkflowApi.rejectDecision(selectedDecisionId, {
        reason: rejectReason || 'Decision rejected during review'
      });
      toast('Decision rejected', 'info');
      setShowRejectModal(false);
      setRejectReason('');
      await loadDecisionDetail(selectedDecisionId);
      await loadDecisions();
    } catch (err) {
      toast(err.message || 'Rejection failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestChanges = async (e) => {
    e.preventDefault();
    if (!selectedDecisionId) return;
    setActionLoading(true);
    try {
      await WorkflowApi.requestChanges(selectedDecisionId, {
        reason: changeReason,
        notes: changeNotes,
        clauseReference: changeClauseRef || undefined
      });
      toast('Changes requested and author notified', 'ok');
      setShowRequestChangesModal(false);
      setChangeReason('');
      setChangeNotes('');
      setChangeClauseRef('');
      await loadDecisionDetail(selectedDecisionId);
      await loadDecisions();
    } catch (err) {
      toast(err.message || 'Request changes failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResubmit = async () => {
    if (!selectedDecisionId) return;
    setActionLoading(true);
    try {
      await WorkflowApi.resubmitDecision(selectedDecisionId, {
        notes: 'Addressed requested revisions and resubmitted'
      });
      toast('Decision resubmitted for review', 'ok');
      await loadDecisionDetail(selectedDecisionId);
      await loadDecisions();
    } catch (err) {
      toast(err.message || 'Resubmit failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!selectedDecisionId) return;
    setActionLoading(true);
    try {
      await WorkflowApi.completeDecision(selectedDecisionId, {
        outcomeNotes: 'Decision executed and recorded in contract actions'
      });
      toast('Decision marked complete & synchronized with Action Center', 'ok');
      await loadDecisionDetail(selectedDecisionId);
      await loadDecisions();
    } catch (err) {
      toast(err.message || 'Completion failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignReviewer = async (e) => {
    e.preventDefault();
    if (!assignUserId) {
      toast('User ID is required', 'error');
      return;
    }
    setActionLoading(true);
    try {
      if (assignRole === 'APPROVER') {
        await WorkflowApi.assignApprover(selectedDecisionId, {
          approverId: assignUserId,
          notes: assignNotes
        });
      } else {
        await WorkflowApi.assignReviewer(selectedDecisionId, {
          userId: assignUserId,
          role: assignRole,
          notes: assignNotes
        });
      }
      toast(`${assignRole} assigned successfully`, 'ok');
      setShowAssignModal(false);
      setAssignUserId('');
      setAssignNotes('');
      await loadDecisionDetail(selectedDecisionId);
      await loadDecisions();
    } catch (err) {
      toast(err.message || 'Failed to assign reviewer', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentBody.trim() || !selectedDecisionId) return;
    try {
      await WorkflowApi.addComment(selectedDecisionId, {
        body: commentBody.trim(),
        clauseReference: clauseRef.trim() || undefined
      });
      setCommentBody('');
      setClauseRef('');
      toast('Comment added', 'ok');
      await loadDecisionDetail(selectedDecisionId);
    } catch (err) {
      toast(err.message || 'Failed to add comment', 'error');
    }
  };

  const handleResolveComment = async (commentId) => {
    try {
      await WorkflowApi.resolveComment(commentId);
      toast('Comment marked resolved', 'ok');
      await loadDecisionDetail(selectedDecisionId);
    } catch (err) {
      toast(err.message || 'Failed to resolve comment', 'error');
    }
  };

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'APPROVED':
        return { background: '#DEF7EC', color: '#03543F', border: '1px solid #BCF0DA' };
      case 'COMPLETED':
        return { background: '#E1EFFE', color: '#1E429F', border: '1px solid #B4C6FC' };
      case 'REJECTED':
        return { background: '#FDE8E8', color: '#9B1C1C', border: '1px solid #F8B4B4' };
      case 'CHANGES_REQUESTED':
        return { background: '#FEF08A', color: '#854D0E', border: '1px solid #FDE047' };
      case 'UNDER_REVIEW':
        return { background: '#E0E7FF', color: '#3730A3', border: '1px solid #C7D2FE' };
      case 'SUBMITTED':
        return { background: '#F3E8FF', color: '#6B21A8', border: '1px solid #E9D5FF' };
      default:
        return { background: 'rgba(255, 255, 255, 0.08)', color: '#D4D4D8', border: '1px solid rgba(255, 255, 255, 0.15)' };
    }
  };

  const getPriorityBadge = (p) => {
    if (p === 'CRITICAL') return <span className="badge badge-danger">CRITICAL</span>;
    if (p === 'HIGH') return <span className="badge badge-warning">HIGH</span>;
    if (p === 'MEDIUM') return <span className="badge badge-info">MEDIUM</span>;
    return <span className="badge">LOW</span>;
  };

  if (loading) {
    return <SkeletonLoader.Card count={2} height="200px" />;
  }

  return (
    <div className="decision-workflow-container">
      <div className="card mb-16" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--paper)' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--ink)' }}>
            🤝 Contract Decision & Approval Cockpit
          </h2>
          <p className="text-mid small mt-4" style={{ margin: 0 }}>
            Phase 12 Human-in-the-Loop Decision Governance, Multi-Reviewer Workflows & Separation of Duties
          </p>
        </div>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => setShowCreateModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Icon name="plus" size={14} />
          <span>New Decision Workflow</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: decisions.length > 0 ? '320px 1fr' : '1fr', gap: '16px' }}>
        {decisions.length > 0 && (
          <div className="card" style={{ padding: '12px', height: 'fit-content' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', padding: '0 4px' }}>
              Contract Decisions ({decisions.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {decisions.map((d) => {
                const isSelected = d.id === selectedDecisionId;
                return (
                  <div
                    key={d.id}
                    onClick={() => setSelectedDecisionId(d.id)}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      border: isSelected ? '1.5px solid var(--royal)' : '1px solid var(--border)',
                      background: isSelected ? '#F8FAFC' : 'var(--paper)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', ...getStatusBadgeStyle(d.status) }}>
                        {d.status}
                      </span>
                      {getPriorityBadge(d.priority)}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--ink)', marginBottom: '4px' }}>
                      {d.title}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink-light)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Owner: {d.owner_name || 'Unassigned'}</span>
                      <span>💬 {d.comment_count || 0}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          {decisions.length === 0 ? (
            <div className="card text-center" style={{ padding: '48px 24px' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 8px 0' }}>No Active Decision Workflows</h3>
              <p className="text-mid small" style={{ maxWidth: '440px', margin: '0 auto 16px auto' }}>
                There are no open human approval workflows on this document. Initialize a workflow to collaborate with stakeholders, enforce approval policies, and capture auditable decisions.
              </p>
              <button className="btn btn-sm btn-primary" onClick={() => setShowCreateModal(true)}>
                Create First Decision Workflow
              </button>
            </div>
          ) : detailLoading || !decisionDetail ? (
            <SkeletonLoader.Card count={2} height="200px" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', ...getStatusBadgeStyle(decisionDetail.status) }}>
                        {decisionDetail.status}
                      </span>
                      {getPriorityBadge(decisionDetail.priority)}
                      <span style={{ fontSize: '12px', color: 'var(--ink-light)', fontFamily: 'monospace' }}>
                        ID: {decisionDetail.id.slice(0, 8)}…
                      </span>
                    </div>
                    <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--ink)' }}>
                      {decisionDetail.title}
                    </h1>
                    <p style={{ margin: 0, color: 'var(--ink-mid)', fontSize: '13.5px' }}>
                      {decisionDetail.description}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {decisionDetail.status === 'DRAFT' && (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={handleSubmit}
                        disabled={actionLoading}
                      >
                        Submit for Review
                      </button>
                    )}

                    {['SUBMITTED', 'UNDER_REVIEW'].includes(decisionDetail.status) && (
                      <>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => setShowRequestChangesModal(true)}
                          disabled={actionLoading}
                          style={{ borderColor: '#D97706', color: '#B45309' }}
                        >
                          Request Changes
                        </button>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => setShowRejectModal(true)}
                          disabled={actionLoading}
                          style={{ borderColor: '#DC2626', color: '#DC2626' }}
                        >
                          Reject
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={handleApprove}
                          disabled={actionLoading}
                          style={{ background: '#059669', borderColor: '#059669' }}
                        >
                          ✓ Approve Decision
                        </button>
                      </>
                    )}

                    {decisionDetail.status === 'CHANGES_REQUESTED' && (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={handleResubmit}
                        disabled={actionLoading}
                      >
                        Resubmit Revisions
                      </button>
                    )}

                    {decisionDetail.status === 'APPROVED' && (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={handleComplete}
                        disabled={actionLoading}
                        style={{ background: '#2563EB', borderColor: '#2563EB' }}
                      >
                        Complete & Sync Action Center
                      </button>
                    )}

                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => setShowAssignModal(true)}
                      disabled={['COMPLETED', 'CANCELLED'].includes(decisionDetail.status)}
                    >
                      + Assign Stakeholder
                    </button>
                  </div>
                </div>

                {decisionDetail.requires_independent_approval && (
                  <div style={{ marginTop: '16px', padding: '10px 14px', borderRadius: '6px', background: '#FEF3C7', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px' }}>⚖️</span>
                    <div style={{ fontSize: '12.5px', color: '#92400E' }}>
                      <strong>Separation of Duties Mandate:</strong> This high-exposure decision requires independent review and approval. The author/creator cannot approve their own decision.
                    </div>
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>
                  👥 Decision Stakeholders & Review Roles
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div style={{ padding: '10px', background: '#F8FAFC', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ink-light)', textTransform: 'uppercase' }}>Workflow Owner</div>
                    <div style={{ fontWeight: 600, fontSize: '13px', marginTop: '2px' }}>{decisionDetail.owner_name || decisionDetail.creator_name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-mid)' }}>{decisionDetail.owner_email || decisionDetail.creator_email}</div>
                  </div>

                  <div style={{ padding: '10px', background: '#F8FAFC', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ink-light)', textTransform: 'uppercase' }}>Designated Approver</div>
                    <div style={{ fontWeight: 600, fontSize: '13px', marginTop: '2px' }}>{decisionDetail.approver_name || 'Pending Assignment'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-mid)' }}>{decisionDetail.approver_email || 'Requires independent approver'}</div>
                  </div>
                </div>

                {decisionDetail.reviewers && decisionDetail.reviewers.length > 0 && (
                  <div style={{ marginTop: '14px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-light)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Assigned Reviewers ({decisionDetail.reviewers.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {decisionDetail.reviewers.map((r) => (
                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--paper)', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '12px' }}>
                          <div>
                            <strong>{r.user_name}</strong> ({r.user_email}) — <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.role}</span>
                          </div>
                          <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', ...getStatusBadgeStyle(r.status) }}>
                            {r.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>
                  💬 Collaborative Review Discussion ({decisionDetail.comments?.length || 0})
                </div>

                {decisionDetail.comments && decisionDetail.comments.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                    {decisionDetail.comments.map((c) => (
                      <div key={c.id} style={{ padding: '12px', borderRadius: '6px', background: c.status === 'RESOLVED' ? '#F9FAFB' : '#FFFFFF', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>
                            {c.user_name}
                            {c.clause_reference && (
                              <span style={{ marginLeft: '8px', padding: '2px 6px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}>
                                Ref: {c.clause_reference}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--ink-light)' }}>
                              {new Date(c.created_at).toLocaleString()}
                            </span>
                            {c.status === 'OPEN' ? (
                              <button
                                className="btn btn-xs btn-outline"
                                onClick={() => handleResolveComment(c.id)}
                                style={{ fontSize: '10px', padding: '2px 6px' }}
                              >
                                Resolve
                              </button>
                            ) : (
                              <span style={{ fontSize: '10px', color: '#059669', fontWeight: 600 }}>✓ Resolved</span>
                            )}
                          </div>
                        </div>
                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink-mid)' }}>{c.body}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-mid small mb-12" style={{ fontStyle: 'italic' }}>
                    No comments yet. Leave a note or clause-specific suggestion below.
                  </div>
                )}

                <form onSubmit={handleAddComment} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '8px' }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="Clause Ref (optional)"
                      value={clauseRef}
                      onChange={(e) => setClauseRef(e.target.value)}
                      style={{ fontSize: '12.5px' }}
                    />
                    <input
                      type="text"
                      className="input"
                      placeholder="Write comment or review feedback…"
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      style={{ fontSize: '12.5px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" className="btn btn-sm btn-primary" disabled={!commentBody.trim()}>
                      Post Comment
                    </button>
                  </div>
                </form>
              </div>

              <div className="card" style={{ padding: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>
                  🛡️ Immutable Decision Timeline & Governance Audit
                </div>
                {decisionDetail.timeline && decisionDetail.timeline.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {decisionDetail.timeline.map((ev) => (
                      <div key={ev.id} style={{ display: 'flex', gap: '12px', fontSize: '12px', padding: '8px', borderLeft: '2px solid var(--royal)', background: '#F8FAFC' }}>
                        <div style={{ minWidth: '120px', color: 'var(--ink-light)', fontSize: '11px' }}>
                          {new Date(ev.created_at).toLocaleTimeString()}
                        </div>
                        <div>
                          <strong>{ev.event_type}</strong> — {ev.reason || 'Workflow event recorded'}
                          <div style={{ fontSize: '11px', color: 'var(--ink-mid)' }}>
                            Actor: {ev.actor_name || 'System / Automated'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-mid small">No timeline events recorded.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
            <motion.div
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '520px', padding: '24px' }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: '17px', fontWeight: 600 }}>
                Initiate Contract Decision Workflow
              </h3>
              <form onSubmit={handleCreateWorkflow} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label className="label">Workflow Title</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Approve Liability Cap Revision to $2M"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="label">Description & Strategic Intent</label>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Describe the context and required stakeholder approval..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="label">Decision Type</label>
                    <select
                      className="input"
                      value={newDecisionType}
                      onChange={(e) => setNewDecisionType(e.target.value)}
                    >
                      <option value="MATERIAL_CONTRACT_CHANGE">Material Contract Change</option>
                      <option value="LIABILITY_CAP_REVISION">Liability Cap Revision</option>
                      <option value="INDEMNITY_REVISION">Indemnity Revision</option>
                      <option value="RENEWAL_NOTICE_DECISION">Renewal Notice Decision</option>
                      <option value="STANDARD_DECISION">Standard Review</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Priority</label>
                    <select
                      className="input"
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value)}
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="label">Liability Exposure ($)</label>
                    <input
                      type="number"
                      className="input"
                      value={newLiability}
                      onChange={(e) => setNewLiability(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Grounded Risk Score</label>
                    <input
                      type="number"
                      className="input"
                      value={newRiskScore}
                      onChange={(e) => setNewRiskScore(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                    Create Workflow
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAssignModal && (
          <div className="modal-backdrop" onClick={() => setShowAssignModal(false)}>
            <motion.div
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '440px', padding: '24px' }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: '17px', fontWeight: 600 }}>
                Assign Reviewer or Approver
              </h3>
              <form onSubmit={handleAssignReviewer} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label className="label">User UUID or ID</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Enter user ID..."
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label">Review Role</label>
                  <select
                    className="input"
                    value={assignRole}
                    onChange={(e) => setAssignRole(e.target.value)}
                  >
                    <option value="REVIEWER">Reviewer</option>
                    <option value="APPROVER">Designated Approver</option>
                  </select>
                </div>
                <div>
                  <label className="label">Notes or Guidance</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Optional assignment instructions..."
                    value={assignNotes}
                    onChange={(e) => setAssignNotes(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowAssignModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                    Assign
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRequestChangesModal && (
          <div className="modal-backdrop" onClick={() => setShowRequestChangesModal(false)}>
            <motion.div
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '460px', padding: '24px' }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: '17px', fontWeight: 600 }}>
                Request Contract Revisions
              </h3>
              <form onSubmit={handleRequestChanges} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label className="label">Reason for Revision</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Liability cap exceeds authorized limit"
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label">Clause Reference (Optional)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Section 11.2 Limitation of Liability"
                    value={changeClauseRef}
                    onChange={(e) => setChangeClauseRef(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Detailed Revision Instructions</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Specify the exact wording or contractual changes needed..."
                    value={changeNotes}
                    onChange={(e) => setChangeNotes(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowRequestChangesModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                    Submit Change Request
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRejectModal && (
          <div className="modal-backdrop" onClick={() => setShowRejectModal(false)}>
            <motion.div
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '420px', padding: '24px' }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: '17px', fontWeight: 600, color: '#DC2626' }}>
                Reject Decision Workflow
              </h3>
              <form onSubmit={handleReject} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label className="label">Rejection Reason</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Enter explicit reason for rejecting this decision..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowRejectModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-danger" disabled={actionLoading} style={{ background: '#DC2626', color: '#FFF' }}>
                    Confirm Rejection
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DecisionWorkflow;
