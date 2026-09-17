import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import Icon from '../common/Icon';
import { fmtDate } from '../../utils/formatters';
import { buttonMotion, EASE_OUT } from '../../styles/motion';

export const ShareTab = ({ doc }) => {
  const [password, setPassword] = useState('');
  const [expiresInHours, setExpiresInHours] = useState('');
  const [maxDownloads, setMaxDownloads] = useState('');
  const [shareResult, setShareResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await Api.post('/api/share', {
        documentId: doc.id,
        password: password || undefined,
        expiresInHours: expiresInHours ? Number(expiresInHours) : undefined,
        maxDownloads: maxDownloads ? Number(maxDownloads) : undefined
      });
      setShareResult(res);
      toast('Secure share link created', 'ok');
    } catch (err) {
      toast(err.message || 'Failed to create share link', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const copyShareLink = () => {
    if (!shareResult) return;
    const fullUrl = `${window.location.origin}${shareResult.url}`;
    navigator.clipboard.writeText(fullUrl);
    toast('Share URL copied to clipboard', 'ok');
  };

  return (
    <div className="card">
      <div className="card-title">
        <span className="dot dot-gold" />
        Secure Encrypted Link Sharing
      </div>

      <form id="shareForm" onSubmit={handleSubmit} style={{ marginTop: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft, #94a3b8)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Access Password (Optional)
            </label>
            <input
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank for none"
              className="form-input"
            />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft, #94a3b8)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Expires In (Hours)
            </label>
            <input
              name="expiresInHours"
              type="number"
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(e.target.value)}
              placeholder="e.g. 48"
              className="form-input"
            />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft, #94a3b8)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Max Downloads
            </label>
            <input
              name="maxDownloads"
              type="number"
              value={maxDownloads}
              onChange={(e) => setMaxDownloads(e.target.value)}
              placeholder="e.g. 3"
              className="form-input"
            />
          </div>
        </div>

        <motion.button
          className="btn btn-royal mt-20"
          type="submit"
          disabled={submitting}
          {...buttonMotion}
        >
          <Icon.link /> {submitting ? 'Generating secure link…' : 'Generate Secure Link'}
        </motion.button>
      </form>

      <AnimatePresence>
        {shareResult && (
          <motion.div
            id="shareResult"
            className="mt-16"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            <div
              className="card"
              style={{ background: 'var(--emerald-bg)', borderColor: 'rgba(5,150,105,0.2)' }}
            >
              <div className="flex-between">
                <p className="mono small" style={{ wordBreak: 'break-all', fontWeight: '600' }}>
                  {window.location.origin}{shareResult.url}
                </p>
                <motion.button
                  className="btn btn-ghost btn-sm"
                  onClick={copyShareLink}
                  style={{ marginLeft: '12px', flexShrink: 0 }}
                  {...buttonMotion}
                >
                  Copy Link
                </motion.button>
              </div>
              <p className="text-mid small mt-8">
                {shareResult.passwordProtected ? (
                  <>
                    <Icon.lock /> Password protected ·{' '}
                  </>
                ) : null}
                {shareResult.expiresAt
                  ? `Expires ${fmtDate(shareResult.expiresAt)}`
                  : 'No expiration limit'}{' '}
                ·{' '}
                {shareResult.maxDownloads
                  ? `${shareResult.maxDownloads} downloads allowed`
                  : 'Unlimited downloads'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShareTab;
