import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import Api from '../services/api';
import { useToast } from '../context/ToastContext';
import Icon from '../components/common/Icon';
import EmptyState from '../components/common/EmptyState';
import SkeletonLoader from '../components/common/SkeletonLoader';
import PageTransition from '../components/common/PageTransition';
import { fmtBytes, fmtDate } from '../utils/formatters';
import { buttonMotion, EASE_OUT } from '../styles/motion';

export const Documents = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [docA, setDocA] = useState('');
  const [docB, setDocB] = useState('');
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await Api.get('/api/documents');
      const docs = Array.isArray(res) ? res : (res.documents || []);
      setDocuments(docs);
      if (docs.length >= 1) setDocA(docs[0].id);
      if (docs.length >= 2) setDocB(docs[1].id);
    } catch (err) {
      const msg = err.message || 'Failed to load documents';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Permanently delete this document and its AI analysis?')) return;
    try {
      await Api.del(`/api/documents/${id}`);
      toast('Document deleted', 'ok');
      await fetchDocuments();
    } catch (err) {
      toast(err.message || 'Failed to delete document', 'error');
    }
  };

  const handleCompare = async () => {
    if (docA === docB) {
      toast('Choose two different documents to compare', 'error');
      return;
    }
    setComparing(true);
    setCompareResult(null);
    try {
      const res = await Api.post('/api/ai/compare', { documentIdA: docA, documentIdB: docB });
      setCompareResult(res);
    } catch (err) {
      toast(err.message || 'Comparison failed', 'error');
    } finally {
      setComparing(false);
    }
  };

  const getFormatBadge = (filename, mime) => {
    const ext = (filename || '').split('.').pop().toUpperCase();
    if (ext === 'PDF') return { label: 'PDF', bg: 'var(--royal-light)', color: 'var(--royal)' };
    if (ext === 'DOCX' || ext === 'DOC') return { label: 'DOCX', bg: '#EFF6FF', color: '#2563EB' };
    if (['PNG', 'JPG', 'JPEG', 'TIFF'].includes(ext)) return { label: 'IMAGE', bg: '#FEF3C7', color: '#D97706' };
    return { label: ext || 'FILE', bg: 'var(--off-white)', color: 'var(--text-mid)' };
  };

  const getStatusBadge = (doc) => {
    const status = doc.analysisStatus || doc.analysis_status || 'NOT_STARTED';
    if (status === 'COMPLETED') {
      return <span className="badge badge-ok" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>✓ Analyzed</span>;
    }
    if (status === 'PROCESSING') {
      return (
        <span className="badge badge-warn" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--amber)' }} />
          Processing…
        </span>
      );
    }
    if (status === 'FAILED') {
      return (
        <span className="badge badge-danger" title={doc.analysis_error || 'Analysis failed'}>
          ⚠ {doc.hasPreviousAnalysis ? 'Failed (Cached)' : 'Failed'}
        </span>
      );
    }
    return <span className="badge badge-neutral">Pending Analysis</span>;
  };

  const getRiskBadge = (score) => {
    if (score == null) return null;
    const num = Number(score);
    if (num >= 60) return <span className="badge badge-danger">Risk {num} · High</span>;
    if (num >= 30) return <span className="badge badge-warn">Risk {num} · Med</span>;
    return <span className="badge badge-ok">Risk {num} · Low</span>;
  };

  return (
    <PageTransition>
      <div className="flex-between mb-24">
        <div>
          <h1 className="page-title">Documents</h1>
          <p className="page-sub">Cryptographically hashed (SHA-256) and secured at rest (AES-256-GCM).</p>
        </div>
        <div className="flex gap-12">
          <motion.button
            className="btn btn-outline"
            onClick={fetchDocuments}
            disabled={loading}
            title="Refresh documents list"
            {...buttonMotion}
          >
            <Icon.history /> Refresh
          </motion.button>
          <motion.button
            className="btn btn-primary"
            onClick={() => navigate('/upload')}
            {...buttonMotion}
          >
            <Icon.upload /> Upload Document
          </motion.button>
        </div>
      </div>

      {loading && (
        <div>
          <div className="flex-between mb-16">
            <SkeletonLoader.Text lines={1} width="180px" />
          </div>
          <SkeletonLoader.Card count={3} height="76px" />
        </div>
      )}

      {!loading && error && (
        <div className="card" style={{ borderColor: 'var(--red)', background: '#FEF2F2', padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>⚠</div>
          <h3 style={{ color: 'var(--red)', margin: '0 0 8px' }}>Unable to load documents</h3>
          <p className="text-mid small" style={{ margin: '0 0 16px' }}>{error}</p>
          <button className="btn btn-primary btn-sm" onClick={fetchDocuments}>
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && documents.length === 0 && (
        <div className="card">
          <EmptyState
            icon={<Icon.document />}
            title="No documents uploaded yet"
            sub="Upload a digital contract or scanned document to begin automated AI legal analysis."
            action={
              <button className="btn btn-primary mt-16" onClick={() => navigate('/upload')}>
                <Icon.upload /> Upload First Contract
              </button>
            }
          />
        </div>
      )}

      {!loading && !error && documents.length > 0 && (
        <div className="card" style={{ padding: '8px' }}>
          {documents.map((d) => {
            const fmt = getFormatBadge(d.filename || d.original_name, d.mime_type);

            return (
              <div
                key={d.id}
                className="doc-row"
                onClick={() => navigate(`/document/${d.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div className="doc-row-inner">
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: 'var(--radius-sm)',
                      background: fmt.bg,
                      color: fmt.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '11px',
                      letterSpacing: '0.04em',
                      flexShrink: 0
                    }}
                  >
                    {fmt.label}
                  </div>

                  <div className="truncate">
                    <div className="doc-name truncate" style={{ fontWeight: 600, color: 'var(--navy)' }}>
                      {d.filename || d.original_name}
                    </div>
                    <div className="doc-meta" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{d.size ? fmtBytes(d.size) : 'PostgreSQL Record'}</span>
                      <span>·</span>
                      <span>{d.created_at ? fmtDate(d.created_at) : 'Active'}</span>
                      {d.sha256 && (
                        <>
                          <span>·</span>
                          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                            SHA: {d.sha256.slice(0, 10)}…
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-8" style={{ flexShrink: 0, marginLeft: '12px', alignItems: 'center' }}>
                  {getStatusBadge(d)}
                  {getRiskBadge(d.risk_score)}
                  
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={(e) => handleDelete(e, d.id)}
                    title="Delete document"
                    style={{ color: 'var(--text-lo)' }}
                  >
                    <Icon.trash />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && documents.length >= 2 && (
        <div className="card mt-24">
          <div className="card-title">
            <span className="dot dot-gold" />
            Compare Legal Agreements
          </div>
          <div className="grid grid-2">
            <div>
              <label>Document A (Baseline)</label>
              <select value={docA} onChange={(e) => setDocA(e.target.value)}>
                {documents.map((d) => (
                  <option key={`a-${d.id}`} value={d.id}>
                    {d.filename || d.original_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Document B (Revised)</label>
              <select value={docB} onChange={(e) => setDocB(e.target.value)}>
                {documents.map((d) => (
                  <option key={`b-${d.id}`} value={d.id}>
                    {d.filename || d.original_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <motion.button
            className="btn btn-royal mt-16"
            onClick={handleCompare}
            disabled={comparing}
            {...buttonMotion}
          >
            <Icon.compare /> {comparing ? 'Comparing versions…' : 'Compare Documents'}
          </motion.button>

          <AnimatePresence>
            {compareResult && (
              <motion.div
                id="compareResult"
                className="mt-16"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
              >
                <p className="text-mid small mb-16">
                  Comparing <strong>{compareResult.docA}</strong> → <strong>{compareResult.docB}</strong>
                  {' '}· {compareResult.totalChanges} changes detected
                </p>
                {compareResult.changes?.length === 0 ? (
                  <p className="text-lo">No differences detected between selected versions.</p>
                ) : (
                  compareResult.changes?.map((c, i) => (
                    <div key={i} className={`diff-item ${c.type}`}>
                      <span className={`badge ${c.type === 'added' ? 'badge-ok' : 'badge-danger'}`}>
                        {c.type?.toUpperCase()}
                      </span>
                      <span className="badge badge-neutral" style={{ marginLeft: '4px' }}>
                        {c.section}
                      </span>
                      <p style={{ margin: '8px 0 0', lineHeight: '1.6' }}>{c.text}</p>
                      <span className="diff-impact">{c.impact}</span>
                    </div>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </PageTransition>
  );
};

export default Documents;
