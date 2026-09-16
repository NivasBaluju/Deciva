import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { v4 as uuidv4 } from 'uuid';
import { PortfolioOperationsApi } from '../../services/portfolioOperationsApi';
import { useToast } from '../../context/ToastContext';

/**
 * Modal workflow for configuring and executing bulk portfolio operations.
 */

const STEPS = { CONFIGURE: 1, PREVIEW: 2, CONFIRM: 3, EXECUTE: 4, RECEIPT: 5 };

const OPERATION_LABELS = {
  BULK_ASSIGN:     { label: 'Bulk Assignment',       icon: '👤', description: 'Assign selected actions to an owner.' },
  BULK_DEADLINE:   { label: 'Bulk Deadline Update',  icon: '📅', description: 'Set or clear due dates for selected actions.' },
  BULK_TRANSITION: { label: 'Bulk Status Transition',icon: '🔄', description: 'Move selected actions to a new workflow state.' },
};

const VALID_TRANSITIONS = {
  OPEN:       ['IN_REVIEW', 'DISMISSED'],
  IN_REVIEW:  ['OPEN', 'RESOLVED', 'DISMISSED'],
  RESOLVED:   ['IN_REVIEW'],
  DISMISSED:  ['IN_REVIEW'],
};

const STATUS_LABELS = {
  OPEN: 'Open', IN_REVIEW: 'In Review', RESOLVED: 'Resolved', DISMISSED: 'Dismissed',
};

const BLOCK_REASON_LABELS = {
  ACTION_NOT_FOUND:   'Action not found',
  UNAUTHORIZED:       'Not authorized',
  DUPLICATE_ID:       'Duplicate in batch',
  ACTION_NOT_ACTIVE:  'Action is resolved or dismissed',
  INVALID_TRANSITION: 'Invalid state transition',
  INVALID_OWNER:      'Owner user not found',
  INVALID_DATE:       'Invalid date format',
  STATE_CHANGED:      'State changed since preview',
};

export const BulkOperationModal = ({
  selectedActionIds = [],
  actionItems = [],
  onClose,
  onComplete,
}) => {
  const { toast } = useToast();

  const [step, setStep] = useState(STEPS.CONFIGURE);

  const [operation, setOperation]         = useState('BULK_ASSIGN');
  const [mode, setMode]                   = useState('STRICT');
  const [ownerId, setOwnerId]             = useState('');
  const [dueDate, setDueDate]             = useState('');
  const [clearDueDate, setClearDueDate]   = useState(false);
  const [targetStatus, setTargetStatus]   = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [dismissReason, setDismissReason] = useState('');

  const [preview, setPreview]   = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [receipt, setReceipt]   = useState(null);
  const [idempotencyKey]        = useState(() => uuidv4());

  const buildPayload = useCallback(() => {
    if (operation === 'BULK_ASSIGN') {
      return { ownerId: ownerId.trim() || null };
    }
    if (operation === 'BULK_DEADLINE') {
      return { dueDate: clearDueDate ? null : (dueDate || null) };
    }
    if (operation === 'BULK_TRANSITION') {
      const payload = { targetStatus };
      if (targetStatus === 'RESOLVED') payload.resolutionNotes = resolutionNotes.trim();
      if (targetStatus === 'DISMISSED') payload.reason = dismissReason.trim();
      return payload;
    }
    return {};
  }, [operation, ownerId, dueDate, clearDueDate, targetStatus, resolutionNotes, dismissReason]);

  const commonTargetStatuses = useCallback(() => {
    const selected = actionItems.filter(a => selectedActionIds.includes(a.actionId));
    const allAllowed = new Set(['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED']);
    selected.forEach(a => {
      const allowed = new Set(VALID_TRANSITIONS[a.status] || []);
      for (const s of allAllowed) {
        if (!allowed.has(s)) allAllowed.delete(s);
      }
    });
    return [...allAllowed];
  }, [actionItems, selectedActionIds]);

  const handleRunPreview = async () => {
    setPreviewLoading(true);
    try {
      const payload = buildPayload();
      const res = await PortfolioOperationsApi.previewBulkOperation({
        operation,
        mode,
        actionIds: selectedActionIds,
        payload,
      });
      setPreview(res);
      setStep(STEPS.PREVIEW);
    } catch (err) {
      toast(err.message || 'Preview failed. Please try again.', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!preview?.previewId) return;
    setStep(STEPS.EXECUTE);
    try {
      const res = await PortfolioOperationsApi.executeBulkOperation(preview.previewId, idempotencyKey);
      setReceipt(res);
      setStep(STEPS.RECEIPT);
    } catch (err) {
      const code = err.code || '';
      if (code === 'IDEMPOTENCY_KEY_REUSED') {
        toast('Idempotency key conflict — this key was used for a different operation.', 'error');
      } else if (code === 'OPERATION_IN_PROGRESS') {
        toast('This operation is already in progress. Please wait.', 'warning');
      } else {
        toast(err.message || 'Execution failed. No changes were made.', 'error');
      }
      setStep(STEPS.CONFIRM);
    }
  };

  const canProceedFromConfigure = () => {
    if (!selectedActionIds.length) return false;
    if (operation === 'BULK_TRANSITION') {
      if (!targetStatus) return false;
      if (targetStatus === 'RESOLVED' && !resolutionNotes.trim()) return false;
      if (targetStatus === 'DISMISSED' && !dismissReason.trim()) return false;
    }
    return true;
  };

  const styles = {
    overlay: {
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(2, 6, 23, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    },
    modal: {
      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '16px',
      width: '100%',
      maxWidth: '640px',
      maxHeight: '90vh',
      overflowY: 'auto',
      boxShadow: '0 25px 80px rgba(0,0,0,0.6)',
    },
    header: {
      padding: '24px 24px 0',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
      paddingBottom: '16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    body: { padding: '24px' },
    footer: {
      padding: '16px 24px',
      borderTop: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', gap: '12px', justifyContent: 'flex-end',
    },
    stepIndicator: {
      display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px',
    },
    stepDot: (active, done) => ({
      width: done ? '8px' : (active ? '24px' : '8px'),
      height: '8px',
      borderRadius: '4px',
      background: done ? '#10B981' : (active ? '#6366F1' : 'rgba(255,255,255,0.2)'),
      transition: 'all 0.3s ease',
    }),
    label: { fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' },
    input: {
      width: '100%', padding: '10px 12px',
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px', color: '#fff', fontSize: '14px',
      outline: 'none', boxSizing: 'border-box',
    },
    select: {
      width: '100%', padding: '10px 12px',
      background: 'rgba(15,23,42,0.8)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px', color: '#fff', fontSize: '14px',
      outline: 'none', cursor: 'pointer', boxSizing: 'border-box',
    },
    textarea: {
      width: '100%', padding: '10px 12px',
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px', color: '#fff', fontSize: '14px',
      outline: 'none', resize: 'vertical', minHeight: '72px', boxSizing: 'border-box',
    },
    chip: (color) => ({
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
      background: color.bg, color: color.fg, border: `1px solid ${color.border}`,
    }),
    btnPrimary: {
      padding: '10px 24px', borderRadius: '8px', fontWeight: 600, fontSize: '14px',
      background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
      color: '#fff', border: 'none', cursor: 'pointer',
    },
    btnGhost: {
      padding: '10px 20px', borderRadius: '8px', fontWeight: 600, fontSize: '14px',
      background: 'transparent', color: 'rgba(255,255,255,0.6)',
      border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
    },
    btnDanger: {
      padding: '10px 24px', borderRadius: '8px', fontWeight: 600, fontSize: '14px',
      background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
      color: '#fff', border: 'none', cursor: 'pointer',
    },
  };

  const renderStepDots = () => (
    <div style={styles.stepIndicator}>
      {[1,2,3,4,5].map(n => (
        <div key={n} style={styles.stepDot(step === n, step > n)} />
      ))}
      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginLeft: '6px' }}>
        {{ 1:'Configure', 2:'Preview', 3:'Confirm', 4:'Executing', 5:'Receipt' }[step]}
      </span>
    </div>
  );

  const renderConfigure = () => {
    const possibleTargets = commonTargetStatuses();
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div>
          <div style={styles.label}>Operation Type</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {Object.entries(OPERATION_LABELS).map(([key, info]) => (
              <button
                key={key}
                onClick={() => setOperation(key)}
                style={{
                  padding: '10px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                  border: `1px solid ${operation === key ? '#6366F1' : 'rgba(255,255,255,0.1)'}`,
                  background: operation === key ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                  color: operation === key ? '#818CF8' : 'rgba(255,255,255,0.6)',
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                {info.icon} {info.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
            {OPERATION_LABELS[operation].description}
          </div>
        </div>

        <div>
          <div style={styles.label}>Atomicity Mode</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {[['STRICT', '🔒 Strict — all or nothing'], ['SUBSET', '✂️ Subset — eligible only']].map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setMode(val)}
                style={{
                  padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                  border: `1px solid ${mode === val ? '#6366F1' : 'rgba(255,255,255,0.1)'}`,
                  background: mode === val ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                  color: mode === val ? '#818CF8' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {operation === 'BULK_ASSIGN' && (
          <div>
            <div style={styles.label}>Target Owner User ID <span style={{ color: 'rgba(255,255,255,0.35)' }}>(leave blank to unassign)</span></div>
            <input
              style={styles.input}
              value={ownerId}
              onChange={e => setOwnerId(e.target.value)}
              placeholder="User ID or leave empty to unassign"
            />
          </div>
        )}

        {operation === 'BULK_DEADLINE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <div style={styles.label}>Due Date</div>
              <input
                type="datetime-local"
                style={{ ...styles.input, colorScheme: 'dark' }}
                value={dueDate}
                disabled={clearDueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
              <input type="checkbox" checked={clearDueDate} onChange={e => setClearDueDate(e.target.checked)} />
              Clear due date (remove from all selected actions)
            </label>
          </div>
        )}

        {operation === 'BULK_TRANSITION' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={styles.label}>Target Status</div>
              <select style={styles.select} value={targetStatus} onChange={e => setTargetStatus(e.target.value)}>
                <option value="">— Select target status —</option>
                {possibleTargets.map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                ))}
              </select>
              {possibleTargets.length === 0 && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#F59E0B' }}>
                  ⚠ No single status is valid for all selected actions. Use SUBSET mode or adjust selection.
                </div>
              )}
            </div>
            {targetStatus === 'RESOLVED' && (
              <div>
                <div style={styles.label}>Resolution Notes <span style={{ color: '#EF4444' }}>*</span></div>
                <textarea
                  style={styles.textarea}
                  value={resolutionNotes}
                  onChange={e => setResolutionNotes(e.target.value)}
                  placeholder="Shared resolution notes applied to all selected actions…"
                />
              </div>
            )}
            {targetStatus === 'DISMISSED' && (
              <div>
                <div style={styles.label}>Dismissal Reason <span style={{ color: '#EF4444' }}>*</span></div>
                <textarea
                  style={styles.textarea}
                  value={dismissReason}
                  onChange={e => setDismissReason(e.target.value)}
                  placeholder="Reason for dismissing all selected actions…"
                />
              </div>
            )}
          </div>
        )}

        <div style={{
          padding: '12px 16px', borderRadius: '8px',
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
          fontSize: '13px', color: 'rgba(255,255,255,0.7)',
        }}>
          <strong style={{ color: '#818CF8' }}>{selectedActionIds.length}</strong> action{selectedActionIds.length !== 1 ? 's' : ''} selected
        </div>
      </div>
    );
  };

  const renderPreview = () => {
    if (!preview) return null;
    const isExecutable = preview.executable && preview.previewId;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[
            { label: 'Requested', value: preview.requested, color: '#6366F1' },
            { label: 'Eligible', value: preview.eligibleCount, color: '#10B981' },
            { label: 'Blocked', value: preview.blockedCount, color: preview.blockedCount > 0 ? '#EF4444' : '#6B7280' },
          ].map(m => (
            <div key={m.label} style={{
              flex: '1', minWidth: '100px', padding: '14px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.04)', border: `1px solid rgba(255,255,255,0.08)`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: m.color }}>{m.value}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>{m.label}</div>
            </div>
          ))}
        </div>

        {preview.requiresApproval ? (
          <div style={{
            padding: '14px 18px', borderRadius: '10px',
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>🛡️</span>
              <strong style={{ color: '#F59E0B', fontSize: '14px' }}>
                Governance Policy v{preview.policyVersion || '1.0'} — Peer Approval Required
              </strong>
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.5' }}>
              This operation involves high-consequence portfolio changes. Under the four-eyes separation of duties principle, it must be independently reviewed and approved by an administrative peer before execution.
            </div>
            {preview.policyFlags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {preview.policyFlags.map(f => (
                  <span key={f} style={{
                    fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                    background: 'rgba(245,158,11,0.2)', color: '#FCD34D', fontWeight: 600,
                  }}>
                    ⚠ {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{
            padding: '10px 14px', borderRadius: '8px',
            background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#6EE7B7',
          }}>
            <span>✓</span>
            <span><strong>Approval-Exempt:</strong> Operation meets standard safety policy and can be executed directly without peer sign-off.</span>
          </div>
        )}

        {!isExecutable && !preview.requiresApproval && (
          <div style={{
            padding: '12px 16px', borderRadius: '8px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            fontSize: '13px', color: '#FCA5A5',
          }}>
            ⚠ {preview.message || 'Batch is not executable.'}
          </div>
        )}

        {preview.blockedReasons?.length > 0 && (
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#EF4444', marginBottom: '8px' }}>
              Blocked Actions ({preview.blockedCount})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
              {preview.blockedReasons.map((b, i) => (
                <div key={i} style={{
                  padding: '8px 12px', borderRadius: '6px',
                  background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: '12px',
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>{b.actionId?.slice(0,8)}…</span>
                  <span style={{ color: '#F87171', fontWeight: 600 }}>
                    {BLOCK_REASON_LABELS[b.reason] || b.reason}
                    {b.currentStatus && ` (${STATUS_LABELS[b.currentStatus]} → ${STATUS_LABELS[b.targetStatus]})`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {preview.expectedChanges?.length > 0 && (
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#10B981', marginBottom: '8px' }}>
              Eligible Actions ({preview.eligibleCount})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
              {preview.expectedChanges.map((c, i) => (
                <div key={i} style={{
                  padding: '8px 12px', borderRadius: '6px',
                  background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: '12px',
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }} title={c.actionId}>{c.title}</span>
                  <span style={{ color: '#6EE7B7', fontFamily: 'monospace', fontSize: '11px' }}>{c.expectedChange}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderConfirm = () => {
    if (!preview) return null;
    const opInfo = OPERATION_LABELS[operation];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{
          padding: '20px', borderRadius: '12px',
          background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)',
        }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#F59E0B', marginBottom: '8px' }}>
            ⚡ Confirm Bulk Operation
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.6' }}>
            You are about to execute <strong style={{ color: '#FFF' }}>{opInfo.label}</strong> on{' '}
            <strong style={{ color: '#10B981' }}>{preview.eligibleCount}</strong> action{preview.eligibleCount !== 1 ? 's' : ''}.
            {preview.blockedCount > 0 && (
              <> <strong style={{ color: '#EF4444' }}>{preview.blockedCount}</strong> action{preview.blockedCount !== 1 ? 's' : ''} will be skipped.</>
            )}
          </div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
            Mode: <strong style={{ color: '#818CF8' }}>{mode}</strong> · An auditable execution receipt will be generated.
          </div>
        </div>
        <div style={{
          padding: '12px 16px', borderRadius: '8px',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          fontSize: '12px', color: 'rgba(255,255,255,0.4)',
        }}>
          Idempotency Key: <code style={{ color: '#818CF8', fontSize: '11px' }}>{idempotencyKey}</code>
        </div>
      </div>
    );
  };

  const renderExecuting = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '20px 0' }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
        style={{
          width: '48px', height: '48px', borderRadius: '50%',
          border: '3px solid rgba(99,102,241,0.2)',
          borderTopColor: '#6366F1',
        }}
      />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: '#FFF', marginBottom: '6px' }}>Executing bulk operation…</div>
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Applying changes atomically. Do not close this window.</div>
      </div>
    </div>
  );

  const renderReceipt = () => {
    if (!receipt) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>✅</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#10B981' }}>Operation Complete</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
            Auditable execution receipt generated
          </div>
        </div>

        <div style={{
          padding: '20px', borderRadius: '12px',
          background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
        }}>
          {[
            ['Batch ID', receipt.batchId?.slice(0,16) + '…'],
            ['Operation', OPERATION_LABELS[receipt.operation]?.label || receipt.operation],
            ['Mode', receipt.mode],
            ['Status', receipt.status],
            ['Requested', receipt.requested],
            ['Executed', receipt.executed],
            ['Blocked / Skipped', receipt.blocked],
            ['Completed At', receipt.completedAt ? new Date(receipt.completedAt).toLocaleString() : '—'],
            ...(receipt.idempotent ? [['Result', 'Idempotent — cached result returned']] : []),
          ].map(([k, v]) => (
            <div key={k} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
              fontSize: '13px',
            }}>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>{k}</span>
              <span style={{ color: '#E2E8F0', fontWeight: 600 }}>{String(v)}</span>
            </div>
          ))}
        </div>

        {receipt.blocked > 0 && (
          <div style={{
            padding: '10px 14px', borderRadius: '8px',
            background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
            fontSize: '12px', color: '#FDE68A',
          }}>
            ⚠ {receipt.blocked} action{receipt.blocked !== 1 ? 's were' : ' was'} not modified. Review the blocked reasons in the action detail panel.
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={styles.overlay} onClick={e => { if (e.target === e.currentTarget && step !== STEPS.EXECUTE) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ duration: 0.2 }}
        style={styles.modal}
      >
        <div style={styles.header}>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#FFF' }}>
              ⚡ Bulk Operation
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
              {selectedActionIds.length} actions selected
            </div>
          </div>
          {step !== STEPS.EXECUTE && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
          )}
        </div>

        <div style={styles.body}>
          {renderStepDots()}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
            >
              {step === STEPS.CONFIGURE && renderConfigure()}
              {step === STEPS.PREVIEW   && renderPreview()}
              {step === STEPS.CONFIRM   && renderConfirm()}
              {step === STEPS.EXECUTE   && renderExecuting()}
              {step === STEPS.RECEIPT   && renderReceipt()}
            </motion.div>
          </AnimatePresence>
        </div>

        <div style={styles.footer}>
          {step === STEPS.CONFIGURE && (
            <>
              <button style={styles.btnGhost} onClick={onClose}>Cancel</button>
              <button
                style={{ ...styles.btnPrimary, opacity: canProceedFromConfigure() ? 1 : 0.5, cursor: canProceedFromConfigure() ? 'pointer' : 'not-allowed' }}
                disabled={!canProceedFromConfigure() || previewLoading}
                onClick={handleRunPreview}
              >
                {previewLoading ? 'Running preview…' : 'Preview →'}
              </button>
            </>
          )}

          {step === STEPS.PREVIEW && (
            <>
              <button style={styles.btnGhost} onClick={() => setStep(STEPS.CONFIGURE)}>← Back</button>
              {preview?.requiresApproval ? (
                <button
                  style={styles.btnPrimary}
                  onClick={() => {
                    toast('Batch registered in status PENDING_APPROVAL. An administrative peer can now review it in Governed Approvals.', 'info');
                    if (onComplete) onComplete();
                    onClose();
                  }}
                >
                  ✓ Registered for Peer Approval (Done)
                </button>
              ) : preview?.executable && preview?.previewId ? (
                <button style={styles.btnPrimary} onClick={() => setStep(STEPS.CONFIRM)}>
                  Confirm ({preview.eligibleCount} eligible) →
                </button>
              ) : (
                <button style={styles.btnGhost} onClick={onClose}>Close</button>
              )}
            </>
          )}

          {step === STEPS.CONFIRM && (
            <>
              <button style={styles.btnGhost} onClick={() => setStep(STEPS.PREVIEW)}>← Back</button>
              <button style={styles.btnDanger} onClick={handleExecute}>
                Execute {preview?.eligibleCount} Action{preview?.eligibleCount !== 1 ? 's' : ''}
              </button>
            </>
          )}

          {step === STEPS.RECEIPT && (
            <button
              style={styles.btnPrimary}
              onClick={() => { if (onComplete) onComplete(); onClose(); }}
            >
              Done
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default BulkOperationModal;
