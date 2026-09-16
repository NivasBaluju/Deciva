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
  const [fieldErrors, setFieldErrors] = useState({ email: '' });
  const [submitting, setSubmitting] = useState(false);

  const { user, loading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!loading && (user || isAuthenticated)) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, isAuthenticated, navigate]);

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    if (fieldErrors.email) setFieldErrors({ email: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({ email: '' });

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      setFieldErrors({ email: 'Please enter your corporate email address' });
      return;
    }

    setSubmitting(true);
    try {
      const result = await Api.post('/api/auth/login', { email: cleanEmail });
      sessionStorage.setItem('preToken', result.preToken);
      sessionStorage.setItem('authEmail', cleanEmail);
      if (result.backupPass) {
        sessionStorage.setItem('backupPass', result.backupPass);
      } else {
        sessionStorage.removeItem('backupPass');
      }

      if (result.deliveryFailed) {
        toast('Outbound mail was throttled by mail provider. Emergency pass ready.', 'warn');
      } else {
        toast('Verification pass dispatched to your email', 'ok');
      }
      navigate('/mfa');
    } catch (err) {
      setFieldErrors({ email: err.message || 'Authentication request failed' });
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
            [Client Portal Access]
          </span>
          <h1 className="font-display text-4xl text-ink tracking-tight mb-3">
            Sign In
          </h1>
          <p className="font-body text-body-sm text-ink-soft max-w-sm mx-auto">
            Enter your email address to receive your secure one-time verification pass.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="w-full">
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

          <div className="mt-8 mb-6">
            <MetalFx preset="chromatic" strength={0.90} className="w-full">
              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                disabled={submitting}
                className="w-full py-4 text-center font-medium"
              >
                Authenticate
              </Button>
            </MetalFx>
          </div>

          <div className="text-center pt-6 border-t border-rule text-body-sm text-ink-soft flex flex-col gap-2">
            <p className="m-0">
              New to Deciva?{' '}
              <Link to="/register" className="editorial-link text-ink font-medium">
                Register enterprise account
              </Link>
            </p>
            <p className="m-0 text-micro text-ink-soft">
              Protected by Zero-Trust hardware isolation
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;
