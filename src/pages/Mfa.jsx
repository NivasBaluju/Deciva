import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import AuthThresholdModal from '../components/common/AuthThresholdModal';
import MetalFx from '../components/ui/MetalFx';

export function Mfa() {
  const [totpCode, setTotpCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [thresholdStatus, setThresholdStatus] = useState('validating');
  const [authPayload, setAuthPayload] = useState(null);
  const isCompletingRef = React.useRef(false);

  const { user, login, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const preToken = sessionStorage.getItem('preToken');
  const authEmail = sessionStorage.getItem('authEmail');

  useEffect(() => {
    if (user || isAuthenticated) {
      navigate('/dashboard', { replace: true });
      return;
    }
    if (!preToken && !isCompletingRef.current && !thresholdOpen && !authPayload) {
      navigate('/login', { replace: true });
    }
  }, [preToken, user, isAuthenticated, thresholdOpen, authPayload, navigate]);

  const handleCodeChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setTotpCode(val);
    if (mfaError) setMfaError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!preToken) return;

    if (!totpCode.trim() || totpCode.trim().length < 6) {
      setMfaError('Please enter the complete 6-digit authenticator code');
      return;
    }

    setSubmitting(true);
    setMfaError('');

    try {
      const result = await Api.post('/api/auth/mfa/totp/verify', {
        preToken,
        code: totpCode.trim()
      });
      setAuthPayload(result);
      setThresholdOpen(true);
      setThresholdStatus('confirmed');
    } catch (err) {
      setMfaError(err.message || 'Invalid authentication code. Please check your authenticator app.');
      setSubmitting(false);
    }
  };

  const handleThresholdComplete = async () => {
    if (!authPayload || isCompletingRef.current) return;
    isCompletingRef.current = true;
    try {
      await login(authPayload.token, authPayload.user);
      sessionStorage.removeItem('preToken');
      sessionStorage.removeItem('authEmail');
      toast('Identity confirmed — workspace initialized', 'ok');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      isCompletingRef.current = false;
      toast(err.message || 'Failed to initialize session', 'error');
    }
  };

  if (!preToken && !isCompletingRef.current && !thresholdOpen && !authPayload) return null;

  return (
    <div className="w-full min-h-[85vh] bg-paper flex items-center justify-center py-20 px-6">
      <div 
        className="w-full bg-paper-dim border border-rule p-8 sm:p-12 mx-auto"
        style={{ maxWidth: '480px' }}
      >
        <div className="text-center mb-10 pb-6 border-b border-rule">
          <span className="font-body text-micro text-neutral-500 block mb-2 select-none tracking-widest uppercase">
            [Zero-Trust Verification]
          </span>
          <h1 className="font-display text-4xl text-ink tracking-tight mb-3">
            Two-Factor Auth
          </h1>
          <p className="font-body text-body-sm text-ink-soft max-w-sm mx-auto">
            Enter the 6-digit code from your authenticator app for{' '}
            <span className="text-ink font-medium">{authEmail || 'your account'}</span>.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="w-full">
          <div className="mb-8">
            <label htmlFor="otpCode" className="block font-body text-label text-ink-soft mb-2 text-center">
              Authenticator Security Code
            </label>
            <input
              id="otpCode"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              autoFocus
              value={totpCode}
              onChange={handleCodeChange}
              placeholder="000000"
              className="w-full bg-paper border-0 border-b-2 border-rule focus:border-ink px-4 py-4 text-center font-display text-3xl tracking-widest text-ink outline-none transition-colors duration-instant"
            />
            {mfaError && (
              <p role="alert" className="mt-3 font-body text-body-sm text-ink text-center font-medium text-red-500">
                {mfaError}
              </p>
            )}
          </div>

          <div className="mt-8 mb-6">
            <MetalFx preset="chromatic" strength={0.90} className="w-full">
              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                disabled={totpCode.length < 6 || submitting}
                className="w-full py-4 text-center font-medium"
              >
                Verify &amp; Enter Cockpit
              </Button>
            </MetalFx>
          </div>

          <div className="text-center pt-4 border-t border-rule">
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem('preToken');
                sessionStorage.removeItem('authEmail');
                navigate('/login');
              }}
              className="font-body text-body-sm text-ink-soft hover:text-ink transition-colors cursor-pointer bg-transparent border-none"
            >
              Cancel &amp; Return to Sign In
            </button>
          </div>
        </form>
      </div>

      <AuthThresholdModal
        isOpen={thresholdOpen}
        status={thresholdStatus}
        email={authPayload?.user?.email}
        onComplete={handleThresholdComplete}
      />
    </div>
  );
}

export default Mfa;
