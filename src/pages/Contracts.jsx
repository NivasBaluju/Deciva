import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Api from '../services/api';
import { useToast } from '../context/ToastContext';
import Icon from '../components/common/Icon';
import PageTransition from '../components/common/PageTransition';
import SkeletonLoader from '../components/common/SkeletonLoader';
import Breadcrumb from '../components/ui/Breadcrumb';
import { buttonMotion, EASE_OUT } from '../styles/motion';

export const Contracts = () => {
  const [types, setTypes] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [formValues, setFormValues] = useState({});
  const [generating, setGenerating] = useState(false);
  const [generatedContract, setGeneratedContract] = useState(null);
  const [contractsList, setContractsList] = useState([]);
  const [previewingId, setPreviewingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [typesRes, contractsRes] = await Promise.all([
          Api.get('/api/contracts/types').catch(() => ({ types: [] })),
          Api.get('/api/contracts').catch(() => ({ contracts: [] }))
        ]);
        if (isMounted) {
          const tList = typesRes.types || [];
          setTypes(tList);
          if (tList.length > 0) {
            setSelectedType(tList[0].id);
          }
          setContractsList(contractsRes.contracts || []);
        }
      } catch (err) {
        if (isMounted) toast(err.message || 'Failed to load contract workspace', 'error');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [toast]);

  const activeTypeObj = types.find((t) => t.id === selectedType);

  const handleFieldChange = (fieldName, value) => {
    setFormValues((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleGenerate = async () => {
    if (!selectedType) return;
    setGenerating(true);
    try {
      const params = {};
      if (activeTypeObj && activeTypeObj.fields) {
        activeTypeObj.fields.forEach((f) => {
          if (formValues[f]) params[f] = formValues[f];
        });
      }

      const res = await Api.post('/api/contracts/generate', {
        type: selectedType,
        params
      });
      setGeneratedContract(res);
      setContractsList((prev) => [
        {
          id: res.id,
          contract_type: selectedType,
          created_at: new Date().toISOString()
        },
        ...prev
      ]);
      toast('Contract generated and digitally signed with RSA-2048', 'ok');
      const el = document.getElementById('contractPreviewWrap');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      toast(err.message || 'Failed to generate contract', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handlePreviewContract = async (contractId) => {
    setPreviewingId(contractId);
    try {
      const { contract } = await Api.get(`/api/contracts/${contractId}`);
      setGeneratedContract({
        id: contract.id,
        content: contract.content,
        signature: contract.signature
      });
      toast('Contract retrieved from verified ledger', 'ok');
      const el = document.getElementById('contractPreviewWrap');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      toast(err.message || 'Failed to retrieve contract', 'error');
    } finally {
      setPreviewingId(null);
    }
  };

  const handleDownload = async (contractId) => {
    try {
      const { contract } = await Api.get(`/api/contracts/${contractId}`);
      const blob = new Blob([contract.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${contract.contract_type}_${contractId.slice(0, 8)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err.message || 'Download failed', 'error');
    }
  };

  const formatContractTypeLabel = (typeId) => {
    const found = types.find((t) => t.id === typeId);
    if (found) return found.label;
    return String(typeId || 'Contract')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  if (loading) {
    return (
      <PageTransition>
        <div style={{ maxWidth: '880px', margin: '0 auto' }}>
          <SkeletonLoader.Text lines={2} width="320px" />
          <div style={{ marginTop: '20px' }}>
            <SkeletonLoader.Card count={2} height="240px" />
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        <Breadcrumb items={[{ label: 'Cockpit', href: '/dashboard' }, { label: 'Contract Generator' }]} />

        <div className="mb-20">
          <span className="mono text-lo small" style={{ letterSpacing: '0.08em' }}>
            [CRYPTOGRAPHIC_AGREEMENT_SYNTHESIS]
          </span>
          <h1 className="page-title" style={{ marginTop: '2px', marginBottom: '4px' }}>
            Contract Generator
          </h1>
          <p className="page-sub" style={{ margin: 0 }}>
            Generate bespoke, legally structured agreements with automated RSA-2048 non-repudiation seals.
          </p>
        </div>

        {/* Generator Form Card */}
        <div className="card mb-24">
          <div className="card-title mb-16">
            <span className="dot dot-gold" />
            Template & Clause Parameters
          </div>

          <div className="input-group mb-16">
            <label htmlFor="ctypeSelect">Select Contract Archetype</label>
            <select
              id="ctypeSelect"
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setFormValues({});
              }}
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <AnimatePresence mode="wait">
            {activeTypeObj && activeTypeObj.fields && (
              <motion.div
                key={selectedType}
                id="ctypeFields"
                className="grid grid-2"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
              >
                {activeTypeObj.fields.map((f) => {
                  const label = f.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
                  return (
                    <div key={f} className="input-group">
                      <label>{label}</label>
                      <input
                        name={f}
                        value={formValues[f] || ''}
                        onChange={(e) => handleFieldChange(f, e.target.value)}
                        placeholder={`Enter ${label.toLowerCase()}`}
                      />
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            className="btn btn-primary mt-16"
            id="genBtn"
            onClick={handleGenerate}
            disabled={generating}
            {...buttonMotion}
          >
            <Icon.pen /> {generating ? 'Generating & Digitally Signing…' : 'Generate & Sign Contract'}
          </motion.button>
        </div>

        {/* Active Contract Preview */}
        <AnimatePresence>
          {generatedContract && (
            <motion.div
              id="contractPreviewWrap"
              className="mb-24"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
            >
              <div className="card">
                <div className="flex-between mb-16 flex-wrap gap-2">
                  <div className="card-title" style={{ margin: 0 }}>
                    <span className="dot dot-emerald" />
                    Digitally Signed Output — RSA-2048 Non-Repudiation
                  </div>
                  <motion.button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleDownload(generatedContract.id)}
                    {...buttonMotion}
                  >
                    <Icon.download /> Download .txt
                  </motion.button>
                </div>
                <div
                  className="contract-preview"
                  style={{
                    lineHeight: '1.7',
                    fontSize: '13.5px',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '420px',
                    overflowY: 'auto',
                    padding: '16px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  {generatedContract.content}
                </div>
                <p
                  className="text-lo small mt-16 mono"
                  style={{
                    wordBreak: 'break-all',
                    background: 'rgba(255, 255, 255, 0.03)',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)'
                  }}
                >
                  RSA-SHA256 signature: {generatedContract.signature}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Historical Contracts Ledger */}
        <div className="card">
          <div className="flex-between mb-16 flex-wrap gap-2">
            <div>
              <span className="mono text-lo small">[IMMUTABLE_CONTRACT_LEDGER]</span>
              <div className="card-title" style={{ marginTop: '2px', marginBottom: 0 }}>
                Generated Contracts Ledger
              </div>
            </div>
            <span
              className="badge"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#E4E4E7',
                padding: '4px 10px',
                fontSize: '11px',
                fontFamily: 'monospace'
              }}
            >
              {contractsList.length} RECORD{contractsList.length === 1 ? '' : 'S'}
            </span>
          </div>

          {contractsList.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '36px 16px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px dashed var(--border)',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              <div style={{ opacity: 0.4, marginBottom: '8px' }}>
                <Icon.document width={28} height={28} />
              </div>
              <p className="font-medium text-sm text-ink mb-1">No generated contracts yet</p>
              <p className="text-xs text-ink-soft max-w-sm mx-auto">
                Select an archetype above, fill in counterparty details, and generate your first digitally-sealed agreement.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border)',
                      textAlign: 'left',
                      color: 'var(--text-lo)',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}
                  >
                    <th style={{ padding: '10px 12px' }}>Contract Type</th>
                    <th style={{ padding: '10px 12px' }}>Ledger UUID</th>
                    <th style={{ padding: '10px 12px' }}>Created</th>
                    <th style={{ padding: '10px 12px' }}>Seal</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contractsList.map((c) => (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        transition: 'background 0.15s ease'
                      }}
                      className="hover:bg-white/[0.02]"
                    >
                      <td style={{ padding: '12px', fontWeight: 600, color: 'var(--ink)' }}>
                        {formatContractTypeLabel(c.contract_type)}
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-lo)' }}>
                        {c.id ? c.id.slice(0, 8) : '—'}…
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-lo)', fontSize: '12px' }}>
                        {c.created_at ? new Date(c.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : 'Recent'}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(16, 185, 129, 0.12)',
                            color: '#10B981',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600
                          }}
                        >
                          <Icon.check width={12} height={12} /> RSA-2048
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: '11.5px', padding: '4px 10px' }}
                            onClick={() => handlePreviewContract(c.id)}
                            disabled={previewingId === c.id}
                          >
                            <Icon.eye width={12} height={12} /> {previewingId === c.id ? 'Loading…' : 'Preview'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: '11.5px', padding: '4px 10px' }}
                            onClick={() => handleDownload(c.id)}
                          >
                            <Icon.download width={12} height={12} /> Download
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default Contracts;
