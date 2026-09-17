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
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);

  const { user, login, loading, isAuthenticated } = useAuth();
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

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }));
  };

  const handleConfirmPasswordChange = (e) => {
    setConfirmPassword(e.target.value);
    if (fieldErrors.confirmPassword) setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({ name: '', email: '', password: '', confirmPassword: '' });

    let hasErr = false;
    if (!name.trim()) {
      setFieldErrors((prev) => ({ ...prev, name: 'Please enter your full name' }));
      hasErr = true;
    }
    if (!email.trim()) {
      setFieldErrors((prev) => ({ ...prev, email: 'Please enter your corporate email' }));
      hasErr = true;
    }
    if (!password) {
      setFieldErrors((prev) => ({ ...prev, password: 'Password is required' }));
      hasErr = true;
    } else if (password.length < 8) {
      setFieldErrors((prev) => ({ ...prev, password: 'Password must be at least 8 characters long' }));
      hasErr = true;
    }
    if (password !== confirmPassword) {
      setFieldErrors((prev) => ({ ...prev, confirmPassword: 'Passwords do not match' }));
      hasErr = true;
    }
    if (hasErr) return;

    setSubmitting(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const res = await Api.post('/api/auth/register', {
        name: name.trim(),
        email: cleanEmail,
        password,
        confirmPassword
      });

      if (res.user && res.token) {
        await login(res.token, res.user);
      }
      toast('Enterprise account created successfully', 'ok');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const errMsg = err.message || 'Registration failed';
      if (errMsg.toLowerCase().includes('already exists')) {
        setFieldErrors((prev) => ({ ...prev, email: errMsg }));
      } else if (errMsg.toLowerCase().includes('password')) {
        setFieldErrors((prev) => ({ ...prev, password: errMsg }));
      } else {
        setFieldErrors((prev) => ({ ...prev, email: errMsg }));
      }
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

        <form onSubmit={handleSubmit} noValidate className="w-full flex flex-col gap-4">
          <FormField
            id="name"
            label="Full Name &amp; Title"
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

          <FormField
            id="password"
            label="Password (min 8 characters)"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={handlePasswordChange}
            error={fieldErrors.password}
            placeholder="••••••••••••"
          />

          <FormField
            id="confirmPassword"
            label="Confirm Password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={handleConfirmPasswordChange}
            error={fieldErrors.confirmPassword}
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
                Create Enterprise Account
              </Button>
            </MetalFx>
          </div>

          <div className="text-center pt-4 border-t border-rule text-body-sm text-ink-soft">
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
