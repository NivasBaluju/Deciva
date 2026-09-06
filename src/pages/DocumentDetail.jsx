import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import Api from '../services/api';
import { useToast } from '../context/ToastContext';
import Icon from '../components/common/Icon';
import PageTransition from '../components/common/PageTransition';
import SkeletonLoader from '../components/common/SkeletonLoader';
import { fmtBytes } from '../utils/formatters';
import { buttonMotion, EASE_OUT, DURATIONS } from '../styles/motion';

// Lazy-loaded tab components to keep initial bundle ultra-lean
const OverviewTab = lazy(() => import('../components/document/OverviewTab'));
const ClausesTab = lazy(() => import('../components/document/ClausesTab'));
const RiskTab = lazy(() => import('../components/document/RiskTab'));
const ComplianceTab = lazy(() => import('../components/document/ComplianceTab'));
const DeadlinesTab = lazy(() => import('../components/document/DeadlinesTab'));
const ChatTab = lazy(() => import('../components/document/ChatTab'));
const NegotiationTab = lazy(() => import('../components/document/NegotiationTab'));
const SimulationTab = lazy(() => import('../components/document/SimulationTab'));
const IntelligenceTab = lazy(() => import('../components/document/IntelligenceTab'));
const DecisionWorkflow = lazy(() => import('../components/workflow/DecisionWorkflow'));
const GovernanceConsole = lazy(() => import('../components/governance/GovernanceConsole'));
const ActionsTab = lazy(() => import('../components/document/ActionsTab'));
const ComplianceAuditPanel = lazy(() => import('../components/compliance/ComplianceAuditPanel'));
const PiiTab = lazy(() => import('../components/document/PiiTab'));
const ShareTab = lazy(() => import('../components/document/ShareTab'));

const DOC_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'clauses', label: 'Clauses' },
  { id: 'risk', label: 'Risk' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'deadlines', label: 'Deadlines' },
  { id: 'chat', label: 'AI Chat' },
  { id: 'negotiation', label: 'Negotiation' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'intelligence', label: '🧠 Intelligence' },
  { id: 'decisions', label: '🤝 Approvals' },
  { id: 'governance', label: '📜 Policy Governance' },
  { id: 'actions', label: '⚡ Action Center' },
  { id: 'audit', label: '🛡️ Audit & Export' },
  { id: 'pii', label: 'PII / Redact' },
  { id: 'share', label: 'Share' }
];

export const DocumentDetail = () => {
  const { id, tab } = useParams();
  const isValidTab = DOC_TABS.some((t) => t.id === tab);
  const activeTab = isValidTab ? tab : 'overview';
  const [doc, setDoc] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { toast } = useToast();
  const navigate = useNavigate();

  const loadDocumentAndAnalysis = async () => {
    try {
      const docRes = await Api.get(`/api/documents/${id}`);
      const documentData = docRes.document || docRes;
      setDoc(documentData);

      try {
        const analysisRes = await Api.get(`/api/documents/${id}/analysis`);
        setAnalysis(analysisRes);
      } catch (aErr) {
        console.warn('Analysis fetch notice:', aErr.message);
      }
    } catch (err) {
      toast(err.message || 'Failed to load document', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocumentAndAnalysis();
  }, [id, refreshTrigger]);

  const handleTriggerAnalyze = async () => {
    setAnalyzing(true);
    try {
      toast('Running AI Legal & Risk Analysis…', 'info');
      const res = await Api.post(`/api/documents/${id}/analyze`, {});
      setAnalysis(res);
      setRefreshTrigger((prev) => prev + 1);

      if (res.analysisStatus === 'FAILED') {
        toast(res.error || 'Analysis could not be completed', 'error');
      } else {
        toast('Analysis completed successfully', 'ok');
      }
    } catch (err) {
      toast(err.message || 'Analysis failed', 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const verifyIntegrity = async () => {
    setVerifying(true);
    try {
      const r = await Api.get(`/api/documents/${id}/verify`);
      toast(
        r.valid ? '✓ Cryptographic match — SHA-256 integrity verified' : '✗ Integrity check failed!',
        r.valid ? 'ok' : 'error'
      );
    } catch (e) {
      toast(e.message || 'Integrity check failed', 'error');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <PageTransition>
        <SkeletonLoader.Text lines={2} width="400px" />
        <div style={{ marginTop: '20px' }}>
          <SkeletonLoader.Card count={1} height="400px" />
        </div>
      </PageTransition>
    );
  }

  if (!doc) {
    return (
      <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
        <h3>Document Not Found</h3>
        <p className="text-mid small">This document record does not exist or has been deleted.</p>
        <button className="btn btn-primary mt-16" onClick={() => navigate('/documents')}>
          Back to Documents
        </button>
      </div>
    );
  }

  const analysisStatus = analyzing ? 'PROCESSING' : (analysis?.analysisStatus || doc.analysisStatus || doc.analysis_status || 'NOT_STARTED');
  const hasPrevious = analysis?.hasPreviousAnalysis || doc.hasPreviousAnalysis;
  const analysisError = analysis?.error || doc.analysis_error;

  return (
    <PageTransition>
      {/* Header Bar */}
      <div className="flex-between mb-16" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div className="truncate" style={{ maxWidth: '65%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h1 className="page-title truncate" style={{ margin: 0 }}>{doc.original_name || doc.filename}</h1>
            {analysisStatus === 'COMPLETED' && <span className="badge badge-ok">✓ Analyzed</span>}
            {analysisStatus === 'PROCESSING' && (
              <span className="badge badge-warn">
                <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--amber)', display: 'inline-block', marginRight: '4px' }} />
                Processing…
              </span>
            )}
            {analysisStatus === 'FAILED' && <span className="badge badge-danger">⚠ Analysis Failed</span>}
          </div>

          <p className="page-sub" style={{ marginBottom: 0 }}>
            {fmtBytes(doc.size)} · SHA-256 {doc.sha256 ? doc.sha256.slice(0, 16) : 'VERIFIED'}… · OCR{' '}
            {doc.ocr_confidence ? `${Math.round(doc.ocr_confidence * 100)}%` : 'Digital'}
          </p>
        </div>

        <div className="flex gap-8" style={{ alignItems: 'center' }}>
          <motion.button
            className="btn btn-primary btn-sm"
            onClick={handleTriggerAnalyze}
            disabled={analyzing}
            {...buttonMotion}
          >
            <Icon.shield /> {analyzing ? 'Analyzing…' : analysisStatus === 'COMPLETED' ? 'Re-Analyze Document' : 'Analyze Document'}
          </motion.button>

          <motion.button
            className="btn btn-outline btn-sm"
            onClick={verifyIntegrity}
            disabled={verifying}
            title="Verify SHA-256 Cryptographic Hash"
            {...buttonMotion}
          >
            <Icon.eye /> {verifying ? 'Verifying…' : 'Verify Integrity'}
          </motion.button>
        </div>
      </div>

      {/* STATE 5.10: FAILED + hasPreviousAnalysis Notification Banner */}
      {analysisStatus === 'FAILED' && hasPrevious && (
        <div
          className="card mb-16"
          style={{
            background: '#FFFBEB',
            borderColor: '#FDE68A',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#D97706', fontSize: '18px' }}>⚠</span>
            <div>
              <strong style={{ color: '#92400E', fontSize: '13.5px' }}>Latest analysis attempt could not be completed</strong>
              <div style={{ color: '#B45309', fontSize: '12px' }}>
                {analysisError || 'Previous verified results remain available and displayed below.'}
              </div>
            </div>
          </div>
          <button className="btn btn-sm btn-outline" onClick={handleTriggerAnalyze} disabled={analyzing}>
            Retry Analysis
          </button>
        </div>
      )}

      {/* First-time Failed State with no previous data */}
      {analysisStatus === 'FAILED' && !hasPrevious && (
        <div
          className="card mb-16"
          style={{
            background: '#FEF2F2',
            borderColor: '#FEE2E2',
            padding: '16px 20px',
            textAlign: 'center'
          }}
        >
          <strong style={{ color: 'var(--red)', fontSize: '14px' }}>Analysis Failed</strong>
          <p className="text-mid small mt-4">{analysisError || 'Document analysis could not be completed. Please ensure the file is valid.'}</p>
          <button className="btn btn-sm btn-primary mt-12" onClick={handleTriggerAnalyze} disabled={analyzing}>
            Retry Analysis
          </button>
        </div>
      )}

      {/* Tabs Header with Animated Indicator */}
      <div className="tab-bar">
        {DOC_TABS.map((t) => {
          const isActive = t.id === activeTab;
          return (
            <button
              key={t.id}
              className={`tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => navigate(`/document/${id}/${t.id}`)}
              style={{ position: 'relative' }}
            >
              {isActive && (
                <motion.div
                  layoutId="activeDocTabIndicator"
                  style={{
                    position: 'absolute',
                    bottom: '-1px',
                    left: 0,
                    right: 0,
                    height: '2px',
                    backgroundColor: 'var(--royal)'
                  }}
                  transition={{ duration: DURATIONS.fast, ease: EASE_OUT }}
                />
              )}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div id="docTabContent" className="mt-16">
        <Suspense fallback={<SkeletonLoader.Card count={2} height="160px" />}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: EASE_OUT }}
            >
              {activeTab === 'overview' && <OverviewTab doc={doc} analysisData={analysis} loadingAnalysis={analyzing} />}
              {activeTab === 'clauses' && <ClausesTab doc={doc} refreshTrigger={refreshTrigger} />}
              {activeTab === 'risk' && <RiskTab doc={doc} refreshTrigger={refreshTrigger} />}
              {activeTab === 'compliance' && <ComplianceTab doc={doc} refreshTrigger={refreshTrigger} />}
              {activeTab === 'deadlines' && <DeadlinesTab doc={doc} refreshTrigger={refreshTrigger} />}
              {activeTab === 'chat' && <ChatTab doc={doc} />}
              {activeTab === 'negotiation' && <NegotiationTab doc={doc} />}
              {activeTab === 'simulation' && <SimulationTab doc={doc} />}
              {activeTab === 'intelligence' && <IntelligenceTab doc={doc} refreshTrigger={refreshTrigger} />}
              {activeTab === 'decisions' && <DecisionWorkflow doc={doc} refreshTrigger={refreshTrigger} />}
              {activeTab === 'governance' && <GovernanceConsole doc={doc} />}
              {activeTab === 'actions' && <ActionsTab doc={doc} refreshTrigger={refreshTrigger} />}
              {activeTab === 'audit' && <ComplianceAuditPanel doc={doc} />}
              {activeTab === 'pii' && <PiiTab doc={doc} />}
              {activeTab === 'share' && <ShareTab doc={doc} />}
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </div>
    </PageTransition>
  );
};

export default DocumentDetail;
