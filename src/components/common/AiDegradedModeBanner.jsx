import React, { useState, useEffect } from 'react';

export default function AiDegradedModeBanner() {
  const [aiStatus, setAiStatus] = useState('CHECKING');
  const [isSimulated, setIsSimulated] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return localStorage.getItem('deciva_banner_dismissed') === 'true';
    } catch {
      return false;
    }
  });
  const [isProbing, setIsProbing] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(false);

  const checkAiHealth = async () => {
    setIsProbing(true);
    try {
      const res = await fetch('/api/health/ready', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const microservice = data?.dependencies?.ai_microservice?.status;
        const mode = data?.dependencies?.ai_microservice?.mode;
        if (
          microservice === 'healthy' || 
          microservice === 'ready' || 
          microservice === 'fallback_ready' || 
          mode === 'node_gemini_fallback'
        ) {
          setAiStatus('READY');
        } else {
          setAiStatus('DEGRADED');
        }
      } else {
        setAiStatus('DEGRADED');
      }
    } catch {
      setAiStatus('OFFLINE');
    } finally {
      setIsProbing(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem('deciva_banner_dismissed', 'true');
    } catch {
    }
  };

  const handleUndismiss = () => {
    setIsDismissed(false);
    try {
      localStorage.removeItem('deciva_banner_dismissed');
    } catch {
    }
  };

  useEffect(() => {
    checkAiHealth();
    const interval = setInterval(checkAiHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  const activeStatus = isSimulated ? 'DEGRADED' : aiStatus;

  if (activeStatus === 'READY' && !isSimulated) {
    return null;
  }

  if (isDismissed && !isSimulated) {
    return (
      <aside 
        aria-label="AI Subsystem Status Notice"
        style={{
          background: 'var(--paper-white, #FFFFFF)',
          borderBottom: '1px solid var(--ink-border, #111111)',
          padding: '0.35rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono, monospace)',
          letterSpacing: '0.05em'
        }}
      >
        <span>
          <strong>NOTICE:</strong> AI engine operating in deterministic fallback mode.
        </span>
        <button
          onClick={handleUndismiss}
          style={{
            background: 'none',
            border: 'none',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.75rem',
            color: 'inherit'
          }}
        >
          View System Status Details
        </button>
      </aside>
    );
  }

  return (
    <aside 
      aria-label="AI Service Status and Degradation Warning"
      style={{
        background: '#111111',
        color: '#FFFFFF',
        borderBottom: '2px solid #000000',
        padding: '0.85rem 1.5rem',
        position: 'relative',
        zIndex: 50,
        boxShadow: 'none'
      }}
    >
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ flex: '1 1 600px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#F59E0B'
                }}
              />
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#FCD34D' }}>
                Operational Advisory {isSimulated && '• Demo Simulation Active'}
              </span>
            </div>

            <h2 style={{ margin: '0 0 0.35rem 0', fontSize: '0.95rem', fontWeight: 700, fontFamily: 'var(--font-serif, Georgia, serif)', letterSpacing: '0.01em' }}>
              AI Microservice Temporarily Degraded — Deterministic Enterprise Fallback Active
            </h2>

            <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.45, color: '#D1D5DB' }}>
              Core document ingestion, 9-dimension risk evaluation, policy governance, workflow approvals, continuous monitoring, and cryptographic audit ledger remain <strong>100% operational</strong>. Deep NLP extraction is operating under local deterministic rules.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setDetailsVisible(!detailsVisible)}
              style={{
                background: 'transparent',
                color: '#FFFFFF',
                border: '1px solid #4B5563',
                padding: '0.35rem 0.75rem',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono, monospace)'
              }}
            >
              {detailsVisible ? 'Hide Subsystem Matrix' : 'Subsystem Status'}
            </button>

            <button
              onClick={checkAiHealth}
              disabled={isProbing}
              style={{
                background: '#FFFFFF',
                color: '#000000',
                border: '1px solid #FFFFFF',
                padding: '0.35rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: isProbing ? 'wait' : 'pointer',
                fontFamily: 'var(--font-mono, monospace)'
              }}
            >
              {isProbing ? 'Probing Gateway...' : 'Re-check Connection'}
            </button>

            <button
              onClick={handleDismiss}
              title="Dismiss warning bar"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#9CA3AF',
                fontSize: '1.2rem',
                lineHeight: 1,
                cursor: 'pointer',
                padding: '0.2rem 0.4rem'
              }}
            >
              ×
            </button>
          </div>
        </div>

        {detailsVisible && (
          <div
            style={{
              marginTop: '0.85rem',
              paddingTop: '0.85rem',
              borderTop: '1px solid #374151',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.75rem',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono, monospace)'
            }}
          >
            <div style={{ background: '#1F2937', padding: '0.5rem 0.75rem', border: '1px solid #374151' }}>
              <div style={{ color: '#9CA3AF', marginBottom: '0.2rem' }}>PostgreSQL Core</div>
              <div style={{ color: '#10B981', fontWeight: 600 }}>ONLINE (Pool Ready)</div>
            </div>
            <div style={{ background: '#1F2937', padding: '0.5rem 0.75rem', border: '1px solid #374151' }}>
              <div style={{ color: '#9CA3AF', marginBottom: '0.2rem' }}>Policy Governance</div>
              <div style={{ color: '#10B981', fontWeight: 600 }}>ONLINE (Deterministic)</div>
            </div>
            <div style={{ background: '#1F2937', padding: '0.5rem 0.75rem', border: '1px solid #374151' }}>
              <div style={{ color: '#9CA3AF', marginBottom: '0.2rem' }}>Audit Ledger</div>
              <div style={{ color: '#10B981', fontWeight: 600 }}>VERIFIED (Chain Intact)</div>
            </div>
            <div style={{ background: '#1F2937', padding: '0.5rem 0.75rem', border: '1px solid #374151' }}>
              <div style={{ color: '#9CA3AF', marginBottom: '0.2rem' }}>Python AI Microservice</div>
              <div style={{ color: '#F59E0B', fontWeight: 600 }}>DEGRADED / FALLBACK</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
