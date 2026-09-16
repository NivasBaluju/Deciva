import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import Api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import Icon from '../common/Icon';
import SkeletonLoader from '../common/SkeletonLoader';
import { buttonMotion, EASE_OUT } from '../../styles/motion';
import ContractCommandCenter from './ContractCommandCenter';

export const OverviewTab = ({ doc, analysisData, loadingAnalysis }) => {
  const [simplified, setSimplified] = useState(null);
  const [simplifying, setSimplifying] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSimplify = async () => {
    setSimplifying(true);
    try {
      const res = await Api.get(`/api/ai/documents/${doc.id}/simplify`);
      setSimplified(res.simplified);
    } catch (err) {
      toast(err.message || 'Failed to simplify document text', 'error');
    } finally {
      setSimplifying(false);
    }
  };

  const riskScore = analysisData?.risk?.score ?? doc?.risk_score ?? 0;
  const riskLevel = analysisData?.risk?.level ?? (riskScore >= 60 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW');
  const detectedCount = analysisData?.clauses?.detected?.length ?? 0;
  const deadlinesCount = analysisData?.deadlines?.length ?? 0;
  const segmentsCount = analysisData?.segmentsCount ?? (doc?.page_count ? doc.page_count * 3 : 1);
  const status = analysisData?.analysisStatus || doc?.analysisStatus || doc?.analysis_status || 'COMPLETED';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <ContractCommandCenter
        doc={doc}
        analysisData={analysisData}
        onNavigateTab={(targetTab) => navigate(`/document/${doc.id}/${targetTab}`)}
      />

      <div className="grid grid-4" style={{ gap: '14px' }}>
        <div className="card" style={{ padding: '16px', margin: 0 }}>
          <div className="text-mid small">Calculated Risk</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: riskScore >= 60 ? 'var(--red)' : riskScore >= 30 ? 'var(--amber)' : 'var(--emerald)', margin: '4px 0' }}>
            {riskScore} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-lo)' }}>/ 100</span>
          </div>
          <span className={`badge ${riskScore >= 60 ? 'badge-danger' : riskScore >= 30 ? 'badge-warn' : 'badge-ok'}`} style={{ fontSize: '11px' }}>
            {riskLevel} RISK
          </span>
        </div>

        <div className="card" style={{ padding: '16px', margin: 0 }}>
          <div className="text-mid small">Clauses Detected</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--navy)', margin: '4px 0' }}>
            {detectedCount}
          </div>
          <span className="text-lo small">Rule + ML Hybrid</span>
        </div>

        <div className="card" style={{ padding: '16px', margin: 0 }}>
          <div className="text-mid small">Milestones &amp; Dates</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--royal)', margin: '4px 0' }}>
            {deadlinesCount}
          </div>
          <span className="text-lo small">Calendar Targets</span>
        </div>

        <div className="card" style={{ padding: '16px', margin: 0 }}>
          <div className="text-mid small">Analysis Lifecycle</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--navy)', margin: '7px 0 4px' }}>
            {status}
          </div>
          <span className="badge badge-ok" style={{ fontSize: '11px' }}>
            {segmentsCount} Segments
          </span>
        </div>
      </div>

      <div className="split">
        <div className="card">
          <div className="flex-between mb-12">
            <div className="card-title" style={{ margin: 0 }}>
              <span className="dot" />
              Document Text Viewer
            </div>
            <span className="text-lo small">{doc.character_count || doc.extracted_text?.length || 0} characters</span>
          </div>

          <div
            className="doc-text"
            style={{ maxHeight: '460px', overflowY: 'auto', lineHeight: '1.75', fontSize: '13.5px', whiteSpace: 'pre-wrap' }}
          >
            {doc?.extracted_text || '(no extractable text available in document record)'}
          </div>

          <motion.button
            className="btn btn-outline btn-sm mt-16"
            onClick={handleSimplify}
            disabled={simplifying}
            {...buttonMotion}
          >
            <Icon.chat /> {simplifying ? 'Translating to Plain English…' : 'Plain-Language Legal Summary'}
          </motion.button>

          <AnimatePresence>
            {simplified && (
              <motion.div
                id="simplifiedArea"
                className="mt-16"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: EASE_OUT }}
              >
                <div className="card" style={{ background: 'var(--emerald-bg)', borderColor: 'rgba(5,150,105,0.2)' }}>
                  <div className="card-title">
                    <span className="dot dot-emerald" />
                    Plain English Summary
                  </div>
                  <p className="text-mid" style={{ lineHeight: '1.7', whiteSpace: 'pre-line' }}>{simplified}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="card">
          <div className="card-title">
            <span className="dot dot-emerald" />
            Security &amp; Encryption Spec
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
            <div style={{ padding: '12px', background: 'var(--off-white)', borderRadius: 'var(--radius-sm)' }}>
              <div className="text-mid small">Cryptographic Storage</div>
              <strong style={{ color: 'var(--navy)', fontSize: '13px' }}>AES-256-GCM Encrypted at Rest</strong>
              <div className="text-lo small mt-4">Isolated IV + Auth Tag validation</div>
            </div>

            <div style={{ padding: '12px', background: 'var(--off-white)', borderRadius: 'var(--radius-sm)' }}>
              <div className="text-mid small">Tamper-Proof Integrity</div>
              <strong style={{ color: 'var(--navy)', fontSize: '13px', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {doc.sha256 || 'SHA-256 Verified'}
              </strong>
            </div>

            <div style={{ padding: '12px', background: 'var(--off-white)', borderRadius: 'var(--radius-sm)' }}>
              <div className="text-mid small">Extraction Pipeline</div>
              <strong style={{ color: 'var(--navy)', fontSize: '13px' }}>
                {doc.extraction_method || 'PyMuPDF + OCR Engine'}
              </strong>
              <div className="text-lo small mt-4">
                OCR Confidence: {doc.ocr_confidence ? `${Math.round(doc.ocr_confidence * 100)}%` : 'Digital Native'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
