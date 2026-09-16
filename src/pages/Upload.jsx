import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Api from '../services/api';
import { useToast } from '../context/ToastContext';
import { fmtBytes } from '../utils/formatters';
import ThinkingLoader from '../components/common/ThinkingLoader';
import Button from '../components/ui/Button';
import Breadcrumb from '../components/ui/Breadcrumb';

export function Upload() {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [stepLabel, setStepLabel] = useState('');
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleFile = async (file) => {
    if (!file) return;
    setSelectedFile(file);
    setUploading(true);
    setResult(null);
    setStepLabel('Computing SHA-256 digest & securing memory chamber...');

    const stepInterval = setInterval(() => {
      setStepLabel((prev) => {
        if (prev.includes('SHA-256')) return 'Extracting structural clauses & legal covenants...';
        if (prev.includes('covenants')) return 'Evaluating liability deviation & corporate risk baselines...';
        return prev;
      });
    }, 600);

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await Api.upload('/api/documents/upload', fd);

      clearInterval(stepInterval);
      setResult(res);
      setUploading(false);
      toast('Document ingested & cryptographic digest anchored', 'ok');
    } catch (err) {
      clearInterval(stepInterval);
      setUploading(false);
      toast(err.message || 'Intake failed', 'error');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const handleSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="w-full bg-paper py-16 sm:py-24 min-h-[85vh]">
      <div className="container-wide">
        <Breadcrumb
          items={[
            { label: 'Cockpit', href: '/dashboard' },
            { label: 'Intake Chamber' }
          ]}
        />

        <div className="max-w-3xl mb-12">
          <span className="font-body text-label text-ink-soft mb-2 block select-none uppercase tracking-wider">
            Document Intake
          </span>
          <h1 className="display-02 text-ink tracking-tight mb-4">
            Deposit document for examination.
          </h1>
          <p className="font-body text-body-lg text-ink-soft leading-relaxed">
            Upload commercial contracts, indentures, or master agreements. Ephemeral hardware isolation guarantees zero data leakage or model training.
          </p>
        </div>

        {uploading ? (
          <div className="bg-paper-dim border border-rule p-16 sm:p-24 text-center">
            <ThinkingLoader
              state="working"
              size={64}
              caption={selectedFile ? `Ingesting ${selectedFile.name}` : 'Ingesting Document...'}
              subcaption={stepLabel}
            />
            {selectedFile && (
              <p className="font-body text-micro text-neutral-500 mt-6">
                Payload: {fmtBytes(selectedFile.size)} • Memory Chamber: Isolated
              </p>
            )}
          </div>
        ) : result ? (
          <div className="bg-paper-dim border border-rule p-10 sm:p-14">
            <div className="flex items-center gap-3 mb-4 text-ink">
              <span className="font-display text-2xl font-medium">✓</span>
              <h3 className="display-03 text-ink tracking-tight">
                Document Examination Complete
              </h3>
            </div>
            <p className="font-body text-body text-ink-soft mb-8">
              Structural clauses have been extracted, classified, and indexed for risk intelligence.
            </p>

            <div className="bg-paper p-6 border border-rule space-y-3 mb-8 font-body text-body-sm">
              <div className="flex justify-between border-b border-rule pb-2">
                <span className="text-neutral-500">Document Title</span>
                <span className="text-ink font-medium">{result.title || selectedFile?.name}</span>
              </div>
              <div className="flex justify-between border-b border-rule pb-2">
                <span className="text-neutral-500">SHA-256 Digest</span>
                <span className="font-mono text-micro text-ink">{result.hash || 'Anchored in session'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Clauses Extracted</span>
                <span className="text-ink font-medium">{result.clauseCount || result.clauses?.length || 'Indexed'}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <Button
                variant="primary"
                onClick={() => navigate(`/document/${result.id || result.docId || result.document?.id}`)}
              >
                Open Document Workspace
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setResult(null);
                  setSelectedFile(null);
                }}
              >
                Deposit Another Document
              </Button>
            </div>
          </div>
        ) : (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`bg-paper-dim border p-16 sm:p-24 text-center cursor-pointer transition-all duration-fast ${
              isDragging
                ? 'border-ink bg-white/10'
                : 'border-rule hover:border-ink/80 hover:bg-white/[0.03]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              onChange={handleSelect}
              className="hidden"
            />

            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 border border-ink mx-auto flex items-center justify-center mb-6 select-none font-display text-2xl text-ink">
                ↓
              </div>
              <h3 className="font-body text-heading-01 text-ink font-semibold mb-2">
                Drag &amp; drop document or click to select
              </h3>
              <p className="font-body text-body-sm text-ink-soft mb-6">
                PDF or DOCX up to 50MB. Cryptographic SHA-256 fingerprint computed locally upon drop.
              </p>
              <span className="font-body text-label text-ink underline font-medium">
                Browse local filesystem
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Upload;
