import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Icon from '../common/Icon';
import ActionsApi from '../../services/actionsApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { fmtDate } from '../../utils/formatters';
import { buttonMotion } from '../../styles/motion';

/**
 * Avatar with user initials
 */
const UserAvatar = ({ name = 'User', size = 32 }) => {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
        color: '#FFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${Math.round(size * 0.42)}px`,
        fontWeight: 700,
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
      }}
    >
      {initials}
    </div>
  );
};

export const ActionComments = ({ actionId, onCommentActivity }) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [newCommentBody, setNewCommentBody] = useState('');
  const [submittingRoot, setSubmittingRoot] = useState(false);

  const [replyingToId, setReplyingToId] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);

  const fetchComments = async () => {
    if (!actionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await ActionsApi.getActionComments(actionId);
      setComments(res.comments || []);
    } catch (err) {
      setError(err.message || 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (actionId) {
      fetchComments();
    }
  }, [actionId]);

  const handlePostRootComment = async (e) => {
    e.preventDefault();
    if (!newCommentBody.trim() || submittingRoot) return;

    setSubmittingRoot(true);
    try {
      await ActionsApi.createActionComment(actionId, {
        body: newCommentBody.trim()
      });
      setNewCommentBody('');
      toast('Comment posted', 'ok');
      await fetchComments();
      if (onCommentActivity) onCommentActivity();
    } catch (err) {
      toast(err.message || 'Failed to post comment', 'error');
    } finally {
      setSubmittingRoot(false);
    }
  };

  const handlePostReply = async (parentCommentId) => {
    if (!replyBody.trim() || submittingReply) return;

    setSubmittingReply(true);
    try {
      await ActionsApi.createActionComment(actionId, {
        body: replyBody.trim(),
        parentCommentId
      });
      setReplyBody('');
      setReplyingToId(null);
      toast('Reply posted', 'ok');
      await fetchComments();
      if (onCommentActivity) onCommentActivity();
    } catch (err) {
      toast(err.message || 'Failed to post reply', 'error');
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleSaveEdit = async (commentId) => {
    if (!editBody.trim() || submittingEdit) return;

    setSubmittingEdit(true);
    try {
      await ActionsApi.editActionComment(actionId, commentId, {
        body: editBody.trim()
      });
      setEditingCommentId(null);
      setEditBody('');
      toast('Comment updated', 'ok');
      await fetchComments();
      if (onCommentActivity) onCommentActivity();
    } catch (err) {
      toast(err.message || 'Failed to update comment', 'error');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    setSubmittingDelete(true);
    try {
      await ActionsApi.deleteActionComment(actionId, commentId);
      setDeletingCommentId(null);
      toast('Comment deleted', 'ok');
      await fetchComments();
      if (onCommentActivity) onCommentActivity();
    } catch (err) {
      toast(err.message || 'Failed to delete comment', 'error');
    } finally {
      setSubmittingDelete(false);
    }
  };

  const isUserAuthor = (commentAuthorId) => {
    if (!user || !commentAuthorId) return false;
    return user.id === commentAuthorId || user.role === 'admin';
  };

  const renderCommentCard = (comment, isReply = false) => {
    const isEditing = editingCommentId === comment.id;
    const isReplying = replyingToId === comment.id;
    const isDeleting = deletingCommentId === comment.id;
    const canManage = isUserAuthor(comment.author?.id);

    return (
      <div
        key={comment.id}
        style={{
          background: isReply ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.035)',
          border: `1px solid ${isReply ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.08)'}`,
          borderRadius: '8px',
          padding: '14px 16px',
          marginBottom: '12px',
          position: 'relative'
        }}
      >
        <div className="flex-between mb-8" style={{ alignItems: 'flex-start' }}>
          <div className="flex gap-10" style={{ alignItems: 'center' }}>
            <UserAvatar name={comment.author?.name} size={isReply ? 26 : 30} />
            <div>
              <div className="flex gap-6" style={{ alignItems: 'center' }}>
                <strong style={{ fontSize: '13.5px', color: '#F4F4F5' }}>
                  {comment.author?.name || 'Team Member'}
                </strong>
                {comment.author?.role === 'admin' && (
                  <span
                    style={{
                      fontSize: '10px',
                      background: 'rgba(59, 130, 246, 0.2)',
                      color: '#60A5FA',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontWeight: 600
                    }}
                  >
                    Admin
                  </span>
                )}
              </div>
              <div className="text-mid small" style={{ fontSize: '11px', marginTop: '1px' }}>
                {fmtDate(comment.createdAt)}
                {comment.isEdited && (
                  <span style={{ marginLeft: '6px', color: '#71717A', fontStyle: 'italic' }}>
                    (edited)
                  </span>
                )}
              </div>
            </div>
          </div>

          {!comment.isDeleted && !isEditing && (
            <div className="flex gap-6">
              {!isReply && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-mid"
                  onClick={() => {
                    setReplyingToId(isReplying ? null : comment.id);
                    setReplyBody('');
                  }}
                  style={{ fontSize: '11.5px', padding: '3px 8px' }}
                >
                  <Icon.arrowRight width={12} height={12} /> Reply
                </button>
              )}

              {canManage && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-mid"
                    onClick={() => {
                      setEditingCommentId(comment.id);
                      setEditBody(comment.body);
                    }}
                    style={{ fontSize: '11.5px', padding: '3px 8px' }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-danger"
                    onClick={() => setDeletingCommentId(comment.id)}
                    style={{ fontSize: '11.5px', padding: '3px 8px' }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {isEditing ? (
          <div style={{ marginTop: '8px' }}>
            <textarea
              className="input mb-8"
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.3)',
                borderColor: 'var(--border-hairline, rgba(255, 255, 255, 0.15))',
                fontSize: '13px',
                padding: '8px 10px',
                borderRadius: '6px'
              }}
              placeholder="Edit your comment..."
              autoFocus
            />
            <div className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingCommentId(null)}
                disabled={submittingEdit}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handleSaveEdit(comment.id)}
                disabled={!editBody.trim() || submittingEdit}
              >
                {submittingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : isDeleting ? (
          <div
            className="p-12 mt-8"
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '6px'
            }}
          >
            <p style={{ margin: '0 0 8px 0', fontSize: '12.5px', color: '#FCA5A5' }}>
              <strong>Delete this comment?</strong> The comment content will be removed, but workflow thread structure remains intact.
            </p>
            <div className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setDeletingCommentId(null)}
                disabled={submittingDelete}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger btn-xs"
                onClick={() => handleDeleteComment(comment.id)}
                disabled={submittingDelete}
              >
                {submittingDelete ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              fontSize: '13.5px',
              lineHeight: 1.55,
              color: comment.isDeleted ? '#71717A' : '#E4E4E7',
              fontStyle: comment.isDeleted ? 'italic' : 'normal',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              marginTop: '4px'
            }}
          >
            {comment.isDeleted ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon.info width={14} height={14} /> This comment was deleted.
              </span>
            ) : (
              comment.body
            )}
          </div>
        )}

        {isReplying && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              marginTop: '12px',
              paddingTop: '12px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)'
            }}
          >
            <textarea
              className="input mb-8"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={2}
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.3)',
                borderColor: 'var(--border-hairline, rgba(255, 255, 255, 0.15))',
                fontSize: '13px',
                padding: '8px 10px',
                borderRadius: '6px'
              }}
              placeholder={`Replying to ${comment.author?.name || 'Team Member'}...`}
              autoFocus
            />
            <div className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setReplyingToId(null);
                  setReplyBody('');
                }}
                disabled={submittingReply}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handlePostReply(comment.id)}
                disabled={!replyBody.trim() || submittingReply}
              >
                {submittingReply ? 'Posting...' : 'Post Reply'}
              </button>
            </div>
          </motion.div>
        )}

        {comment.replies && comment.replies.length > 0 && (
          <div
            style={{
              marginTop: '12px',
              paddingLeft: '14px',
              borderLeft: '2px solid rgba(59, 130, 246, 0.3)'
            }}
          >
            {comment.replies.map((reply) => renderCommentCard(reply, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="action-comments-section" style={{ marginTop: '8px' }}>
      <div
        className="p-12 mb-16"
        style={{
          background: 'rgba(59, 130, 246, 0.06)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}
      >
        <Icon.zap width={16} height={16} style={{ color: '#60A5FA', flexShrink: 0 }} />
        <div style={{ fontSize: '12.5px', color: '#93C5FD' }}>
          <strong>Team Action Discussion</strong> — Coordinate resolutions, propose clause redlines, and document internal feedback. Discussion history is maintained separately from the audit ledger.
        </div>
      </div>

      <form onSubmit={handlePostRootComment} className="mb-20">
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '12px 14px'
          }}
        >
          <textarea
            className="input"
            value={newCommentBody}
            onChange={(e) => setNewCommentBody(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              padding: 0,
              fontSize: '13.5px',
              color: '#F4F4F5',
              resize: 'vertical',
              outline: 'none',
              boxShadow: 'none'
            }}
            placeholder="Discuss this action with your team... (e.g. proposed redlines, negotiation tactics)"
            disabled={submittingRoot}
          />

          <div
            className="flex-between mt-8"
            style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              paddingTop: '8px',
              alignItems: 'center'
            }}
          >
            <span className="text-mid small" style={{ fontSize: '11.5px' }}>
              {newCommentBody.length > 0 ? `${newCommentBody.length} characters` : 'Markdown supported'}
            </span>

            <motion.button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!newCommentBody.trim() || submittingRoot}
              {...buttonMotion}
            >
              {submittingRoot ? (
                <>
                  <Icon.refresh width={14} height={14} className="spin" /> Posting...
                </>
              ) : (
                <>
                  <Icon.zap width={14} height={14} /> Post Comment
                </>
              )}
            </motion.button>
          </div>
        </div>
      </form>

      {loading ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: '#71717A' }}>
          <Icon.refresh width={20} height={20} className="spin mb-8" />
          <div style={{ fontSize: '13px' }}>Loading discussion thread...</div>
        </div>
      ) : error ? (
        <div
          className="p-12 mb-16 text-center"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '6px',
            color: '#FCA5A5',
            fontSize: '13px'
          }}
        >
          {error}
          <div className="mt-8">
            <button
              type="button"
              className="btn btn-ghost btn-xs text-primary"
              onClick={fetchComments}
            >
              Retry
            </button>
          </div>
        </div>
      ) : comments.length === 0 ? (
        <div
          style={{
            padding: '32px 16px',
            textAlign: 'center',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px dashed rgba(255, 255, 255, 0.08)',
            borderRadius: '8px'
          }}
        >
          <Icon.user width={24} height={24} style={{ color: '#52525B', margin: '0 auto 8px auto' }} />
          <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#A1A1AA' }}>
            No Discussion Yet
          </h4>
          <p className="text-mid small" style={{ margin: 0, fontSize: '12.5px' }}>
            Be the first to share notes or coordinate next steps with your team on this action.
          </p>
        </div>
      ) : (
        <div className="comments-thread">
          {comments.map((comment) => renderCommentCard(comment, false))}
        </div>
      )}
    </div>
  );
};

export default ActionComments;
