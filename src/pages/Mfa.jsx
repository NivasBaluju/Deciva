import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import AuthThresholdModal from '../components/common/AuthThresholdModal';
import MetalFx from '../components/ui/MetalFx';

export function Mfa() {
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [backupPass, setBackupPass] = useState(() => sessionStorage.getItem('backupPass') || '');

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

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleCodeChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtpCode(val);
    if (otpError) setOtpError('');
  };

  const handleRequestOtp = async () => {
    if (!preToken || resendCooldown > 0) return;
    setRequesting(true);
    setOtpError('');
    try {
      const res = await Api.post('/api/auth/mfa/otp/request', { preToken });
      setResendCooldown(30);
      if (res.backupPass) {
        setBackupPass(res.backupPass);
        sessionStorage.setItem('backupPass', res.backupPass);
        toast('Outbound mail throttled. Emergency security pass updated.', 'warn');
      } else {
        toast('A new verification code was dispatched to your email', 'ok');
      }
    } catch (err) {
      setOtpError(err.message || 'Failed to request new code');
    } finally {
      setRequesting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!preToken) return;

    if (!otpCode.trim() || otpCode.trim().length < 6) {
      setOtpError('Please enter the complete 6-digit verification pass');
      return;
    }

    setSubmitting(true);
    setOtpError('');

    try {
      const result = await Api.post('/api/auth/mfa/otp/verify', { preToken, code: otpCode.trim() });
      setAuthPayload(result);
      setThresholdOpen(true);
      setThresholdStatus('confirmed');
    } catch (err) {
      setOtpError('Incorrect or expired verification code. Please check your email or request a new code.');
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
      sessionStorage.removeItem('backupPass');
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
            Security Pass
          </h1>
          <p className="font-body text-body-sm text-ink-soft max-w-sm mx-auto">
            Enter the 6-digit one-time passcode dispatched to{' '}
            <span className="text-ink font-medium">{authEmail || 'your email'}</span>.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="w-full">
          {backupPass && (
            <div className="mb-6 p-4 border border-rule bg-paper text-left text-body-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-micro uppercase tracking-widest text-ink font-semibold">
                  [Provider Throttled — Security Pass]
                </span>
                <span className="font-mono text-xs px-2 py-0.5 bg-paper-dim border border-rule text-ink">
                  Continuity
                </span>
              </div>
              <p className="text-ink-soft text-xs mb-3 leading-relaxed">
                Outbound mail delivery was throttled by the provider daily quota. For secure business continuity, use your session passcode:
              </p>
              <div className="flex items-center justify-between bg-paper-dim p-2 border border-rule">
                <code className="font-display text-2xl tracking-widest text-ink font-bold px-2">
                  {backupPass}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    setOtpCode(backupPass);
                    if (otpError) setOtpError('');
                  }}
                  className="text-xs font-mono uppercase underline hover:text-ink px-2 py-1 text-ink-soft transition-colors cursor-pointer"
                >
                  Autofill
                </button>
              </div>
            </div>
          )}

          <div className="mb-8">
            <label htmlFor="otpCode" className="block font-body text-label text-ink-soft mb-2 text-center">
              One-Time Passcode
            </label>
            <input
              id="otpCode"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              autoFocus
              value={otpCode}
              onChange={handleCodeChange}
              placeholder="000000"
              className="w-full bg-paper border-0 border-b-2 border-rule focus:border-ink px-4 py-4 text-center font-display text-3xl tracking-widest text-ink outline-none transition-colors duration-instant"
            />
            {otpError && (
              <p role="alert" className="mt-3 font-body text-body-sm text-ink text-center font-medium">
                {otpError}
              </p>
            )}
          </div>

          <div className="mt-8 mb-6">
            <MetalFx preset="chromatic" strength={0.90} className="w-full">
              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                disabled={otpCode.length < 6 || submitting}
                className="w-full py-4 text-center font-medium"
              >
                Verify &amp; Enter Cockpit
              </Button>
            </MetalFx>
          </div>

          <div className="text-center pt-4 border-t border-rule">
            <button
              type="button"
              onClick={handleRequestOtp}
              disabled={requesting || resendCooldown > 0}
              className="font-body text-body-sm text-ink-soft hover:text-ink transition-colors disabled:opacity-40"
            >
              {requesting
                ? 'Dispatching code...'
                : resendCooldown > 0
                ? `Request new code in ${resendCooldown}s`
                : 'Resend verification code'}
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
