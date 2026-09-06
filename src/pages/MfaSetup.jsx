import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import Api from '../services/api';
import { useToast } from '../context/ToastContext';
import Icon from '../components/common/Icon';
import SkeletonLoader from '../components/common/SkeletonLoader';
import PageTransition from '../components/common/PageTransition';
import Breadcrumb from '../components/ui/Breadcrumb';
import { buttonMotion } from '../styles/motion';

export const MfaSetup = () => {
  const [setupData, setSetupData] = useState(null);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const loadMfaSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await Api.post('/api/auth/mfa/totp/setup');
      setSetupData(res);
    } catch (err) {
      const msg = err.message || 'Failed to initialize MFA setup';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMfaSetup();
  }, []);

  const handleCopySecret = async () => {
    if (!setupData?.secret) return;
    try {
      await navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      toast('Secret key copied to clipboard', 'ok');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast('Failed to copy secret key', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code || code.trim().length !== 6) {
      toast('Please enter a 6-digit verification code', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await Api.post('/api/auth/mfa/totp/enable', { code: code.trim() });
      toast('Two-Factor Authentication activated and verified', 'ok');
      navigate('/security');
    } catch (err) {
      toast(err.message || 'Failed to enable MFA — check the 6-digit code', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageTransition>
        <div style={{ maxWidth: '520px', margin: '0 auto' }}>
          <SkeletonLoader.Text lines={2} width="320px" />
          <div style={{ marginTop: '20px' }}>
            <SkeletonLoader.Card count={1} height="360px" />
          </div>
        </div>
      </PageTransition>
    );
  }

  if (error || !setupData) {
    return (
      <PageTransition>
        <div style={{ maxWidth: '520px', margin: '0 auto' }}>
          <Breadcrumb
            items={[
              { label: 'Cockpit', href: '/dashboard' },
              { label: 'Security & Ledger', href: '/security' },
              { label: 'MFA Setup' }
            ]}
          />
          <div className="card text-center" style={{ padding: '36px 24px' }}>
            <div style={{ color: 'var(--red)', marginBottom: '12px', opacity: 0.85 }}>
              <Icon.alert width={36} height={36} />
            </div>
            <h2 className="font-display text-xl text-ink mb-2">Setup Initialization Failed</h2>
            <p className="text-sm text-ink-soft mb-6">
              {error || 'Unable to establish cryptographic seed with security enclave.'}
            </p>
            <div className="flex gap-3 justify-center">
              <button className="btn btn-primary" onClick={loadMfaSetup}>
                <Icon.refresh width={14} height={14} /> Retry Setup
              </button>
              <Link to="/security" className="btn btn-outline">
                Return to Security
              </Link>
            </div>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <Breadcrumb
          items={[
            { label: 'Cockpit', href: '/dashboard' },
            { label: 'Security & Ledger', href: '/security' },
            { label: 'Two-Factor Authentication Setup' }
          ]}
        />

        <div className="mb-20">
          <span className="mono text-lo small" style={{ letterSpacing: '0.08em' }}>
            [ZERO-TRUST_IDENTITY_ENCLAVE]
          </span>
          <h1 className="page-title" style={{ marginTop: '2px', marginBottom: '4px' }}>
            Authenticator Setup
          </h1>
          <p className="page-sub" style={{ margin: 0 }}>
            Pair an RFC-6238 compliant authenticator app (Google Authenticator, 1Password, Authy) to secure your vault.
          </p>
        </div>

        <div className="card">
          <div className="card-title mb-16">
            <span className="dot dot-emerald" />
            1. Scan Cryptographic QR Code
          </div>

          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                display: 'inline-block',
                padding: '12px',
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                margin: '4px auto 16px'
              }}
            >
              <img
                src={setupData.qrDataUrl}
                alt="TOTP QR code"
                style={{
                  width: '180px',
                  height: '180px',
                  display: 'block'
                }}
              />
            </div>

            <p className="text-mid small">Or enter secret key manually:</p>
            <div
              className="flex items-center justify-between gap-2 p-2 mt-2 bg-paper-dim border border-rule rounded"
              style={{ fontFamily: 'monospace', fontSize: '13px' }}
            >
              <span className="text-ink font-semibold tracking-wider select-all overflow-hidden text-ellipsis">
                {setupData.secret}
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleCopySecret}
                style={{ fontSize: '11px', padding: '3px 8px', flexShrink: 0 }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="divider my-20" />

          <form id="enableForm" onSubmit={handleSubmit}>
            <div className="card-title mb-12">
              <span className="dot dot-gold" />
              2. Confirm Verification Token
            </div>
            <div className="input-group">
              <label htmlFor="mfa-confirm-code">6-digit code from your authenticator app</label>
              <input
                id="mfa-confirm-code"
                name="code"
                maxLength={6}
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder="000000"
                className="mfa-code-input"
                style={{
                  letterSpacing: '0.3em',
                  textAlign: 'center',
                  fontSize: '20px',
                  fontWeight: 700
                }}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="flex gap-3 mt-16">
              <Link
                to="/security"
                className="btn btn-outline flex-1 text-center"
                style={{ padding: '12px' }}
              >
                Cancel
              </Link>
              <motion.button
                className="btn btn-primary flex-1"
                type="submit"
                disabled={submitting || code.length !== 6}
                style={{ padding: '12px' }}
                {...buttonMotion}
              >
                <Icon.check /> {submitting ? 'Enabling…' : 'Enable MFA'}
              </motion.button>
            </div>
          </form>
        </div>
      </div>
    </PageTransition>
  );
};

export default MfaSetup;
