import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import MetalFx from '../components/ui/MetalFx';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [legacyMode, setLegacyMode] = useState(false);

  const [fieldErrors, setFieldErrors] = useState({
    email: '',
    password: '',
    setupToken: '',
    newPassword: '',
    confirmNewPassword: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const { user, login, loading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!loading && (user || isAuthenticated)) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, isAuthenticated, navigate]);

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }));
  };

  const handleStandardSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({ email: '', password: '', setupToken: '', newPassword: '', confirmNewPassword: '' });

    const cleanEmail = (email || '').trim().toLowerCase();
    let hasErr = false;
    if (!cleanEmail) {
      setFieldErrors((prev) => ({ ...prev, email: 'Corporate email address is required' }));
      hasErr = true;
    }
    if (!password) {
      setFieldErrors((prev) => ({ ...prev, password: 'Password is required' }));
      hasErr = true;
    }
    if (hasErr) return;

    setSubmitting(true);
    try {
      const result = await Api.post('/api/auth/login', { email: cleanEmail, password });

      if (result.mfaRequired) {
        sessionStorage.setItem('preToken', result.preToken);
        sessionStorage.setItem('authEmail', cleanEmail);
        toast('Two-Factor Authentication required', 'info');
        navigate('/mfa');
        return;
      }

      if (result.user && result.token) {
        await login(result.token, result.user);
      }
      toast('Signed in securely', 'ok');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err.data && err.data.legacyInitRequired) {
        setLegacyMode(true);
        toast('Legacy account detected: initial password setup required', 'warn');
      } else {
        setFieldErrors((prev) => ({
          ...prev,
          password: err.message || 'Invalid email or password'
        }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLegacySubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({ email: '', password: '', setupToken: '', newPassword: '', confirmNewPassword: '' });

    const cleanEmail = (email || '').trim().toLowerCase();
    let hasErr = false;
    if (!setupToken.trim()) {
      setFieldErrors((prev) => ({ ...prev, setupToken: 'Setup token is required' }));
      hasErr = true;
    }
    if (!newPassword || newPassword.length < 8) {
      setFieldErrors((prev) => ({ ...prev, newPassword: 'Password must be at least 8 characters long' }));
      hasErr = true;
    }
    if (newPassword !== confirmNewPassword) {
      setFieldErrors((prev) => ({ ...prev, confirmNewPassword: 'Passwords do not match' }));
      hasErr = true;
    }
    if (hasErr) return;

    setSubmitting(true);
    try {
      const result = await Api.post('/api/auth/legacy/setup-password', {
        email: cleanEmail,
        setupToken: setupToken.trim(),
        newPassword,
        confirmPassword: confirmNewPassword
      });

      if (result.user && result.token) {
        await login(result.token, result.user);
      }
      toast('Password established — workspace initialized', 'ok');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setFieldErrors((prev) => ({
        ...prev,
        setupToken: err.message || 'Failed to initialize password'
      }));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || user || isAuthenticated) {
    return (
      <div className="w-full min-h-[85vh] bg-transparent flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[85vh] bg-transparent flex items-center justify-center py-16 px-4">
      <div 
        className="w-full card p-8 sm:p-12 border border-rule shadow-none mx-auto"
        style={{ maxWidth: '480px' }}
      >
        <div className="text-center mb-10 pb-6 border-b border-rule">
          <span className="font-body text-micro text-ink-soft block mb-2 select-none tracking-widest uppercase">
            {legacyMode ? '[Legacy Account Setup]' : '[Client Portal Access]'}
          </span>
          <h1 className="font-display text-4xl text-ink tracking-tight mb-3">
            {legacyMode ? 'Setup Password' : 'Sign In'}
          </h1>
          <p className="font-body text-body-sm text-ink-soft max-w-sm mx-auto">
            {legacyMode
              ? 'Enter your single-use setup token provided by your administrator to establish your password.'
              : 'Enter your corporate credentials to access your enterprise workspace.'}
          </p>
        </div>

        {!legacyMode ? (
          <form onSubmit={handleStandardSubmit} noValidate className="w-full flex flex-col gap-4">
            <FormField
              id="email"
              label="Corporate Email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={handleEmailChange}
              error={fieldErrors.email}
              placeholder="counsel@enterprise.com"
            />

            <FormField
              id="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={handlePasswordChange}
              error={fieldErrors.password}
              placeholder="••••••••••••"
            />

            <div className="mt-4 mb-2">
              <MetalFx preset="chromatic" strength={0.90} className="w-full">
                <Button
                  type="submit"
                  variant="primary"
                  loading={submitting}
                  disabled={submitting}
                  className="w-full py-4 text-center font-medium"
                >
                  Sign In
                </Button>
              </MetalFx>
            </div>

            <div className="text-center pt-4 border-t border-rule text-body-sm text-ink-soft flex flex-col gap-2">
              <p className="m-0">
                New to Deciva?{' '}
                <Link to="/register" className="editorial-link text-ink font-medium">
                  Register enterprise account
                </Link>
              </p>
              <button
                type="button"
                onClick={() => setLegacyMode(true)}
                className="text-micro text-ink-soft hover:text-ink underline cursor-pointer bg-transparent border-none p-0 mt-1"
              >
                Legacy Account? Enter Setup Token
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleLegacySubmit} noValidate className="w-full flex flex-col gap-4">
            <FormField
              id="email"
              label="Account Email"
              type="email"
              required
              value={email}
              onChange={handleEmailChange}
              error={fieldErrors.email}
              placeholder="counsel@enterprise.com"
            />

            <FormField
              id="setupToken"
              label="Administrator Setup Token"
              type="text"
              required
              autoFocus
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              error={fieldErrors.setupToken}
              placeholder="Paste 64-character setup token"
            />

            <FormField
              id="newPassword"
              label="New Password (min 8 chars)"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              error={fieldErrors.newPassword}
              placeholder="••••••••••••"
            />

            <FormField
              id="confirmNewPassword"
              label="Confirm New Password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              error={fieldErrors.confirmNewPassword}
              placeholder="••••••••••••"
            />

            <div className="mt-4 mb-2 flex flex-col gap-2">
              <MetalFx preset="chromatic" strength={0.90} className="w-full">
                <Button
                  type="submit"
                  variant="primary"
                  loading={submitting}
                  disabled={submitting}
                  className="w-full py-4 text-center font-medium"
                >
                  Establish Password &amp; Sign In
                </Button>
              </MetalFx>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLegacyMode(false)}
                className="w-full py-2 text-center text-xs"
              >
                Back to Standard Sign In
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default Login;
