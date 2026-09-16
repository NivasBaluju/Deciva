import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import MetalFx from '../components/ui/MetalFx';

export function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ name: '', email: '' });
  const [submitting, setSubmitting] = useState(false);

  const { user, loading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!loading && (user || isAuthenticated)) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, isAuthenticated, navigate]);

  const handleNameChange = (e) => {
    setName(e.target.value);
    if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: '' }));
  };

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({ name: '', email: '' });

    let hasErr = false;
    if (!name.trim()) {
      setFieldErrors((prev) => ({ ...prev, name: 'Please enter your full name' }));
      hasErr = true;
    }
    if (!email.trim()) {
      setFieldErrors((prev) => ({ ...prev, email: 'Please enter your corporate email' }));
      hasErr = true;
    }
    if (hasErr) return;

    setSubmitting(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const res = await Api.post('/api/auth/register', { name: name.trim(), email: cleanEmail });
      sessionStorage.setItem('preToken', res.preToken);
      sessionStorage.setItem('authEmail', cleanEmail);
      if (res.backupPass) {
        sessionStorage.setItem('backupPass', res.backupPass);
      } else {
        sessionStorage.removeItem('backupPass');
      }

      if (res.deliveryFailed) {
        toast('Outbound mail was throttled by mail provider. Emergency pass ready.', 'warn');
      } else {
        toast('Verification pass dispatched to your email', 'ok');
      }
      navigate('/mfa');
    } catch (err) {
      const errMsg = err.message || 'Registration failed';
      setFieldErrors({ name: '', email: errMsg });
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
            [Enterprise Registration]
          </span>
          <h1 className="font-display text-4xl text-ink tracking-tight mb-3">
            Create Account
          </h1>
          <p className="font-body text-body-sm text-ink-soft max-w-sm mx-auto">
            Register your enterprise account to access legal copilot capabilities.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="w-full">
          <FormField
            id="name"
            label="Full Name & Title"
            required
            autoFocus
            value={name}
            onChange={handleNameChange}
            error={fieldErrors.name}
            placeholder="e.g. David Vance, Managing Counsel"
          />

          <FormField
            id="email"
            label="Corporate Email"
            type="email"
            autoComplete="email"
            required
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
                Register &amp; Receive Passcode
              </Button>
            </MetalFx>
          </div>

          <div className="text-center pt-6 border-t border-rule text-body-sm text-ink-soft">
            Already have an account?{' '}
            <Link to="/login" className="editorial-link text-ink font-medium">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Register;
