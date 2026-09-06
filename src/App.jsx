import React, { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';

import Topbar from './components/layout/Topbar';
import Footer from './components/layout/Footer';
import ProtectedRoute from './components/layout/ProtectedRoute';
import ThinkingLoader from './components/common/ThinkingLoader';
import LenisProvider from './components/motion/LenisProvider';
import AiDegradedModeBanner from './components/common/AiDegradedModeBanner';

// Lazy-loaded Public Pages
const Landing = lazy(() => import('./pages/Landing'));
const Capabilities = lazy(() => import('./pages/Capabilities'));
const CapabilityDetail = lazy(() => import('./pages/CapabilityDetail'));
const Insights = lazy(() => import('./pages/Insights'));
const InsightDetail = lazy(() => import('./pages/InsightDetail'));
const Trust = lazy(() => import('./pages/Trust'));
const Contact = lazy(() => import('./pages/Contact'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const Accessibility = lazy(() => import('./pages/Accessibility'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Lazy-loaded Auth Pages
const Register = lazy(() => import('./pages/Register'));
const Login = lazy(() => import('./pages/Login'));
const Mfa = lazy(() => import('./pages/Mfa'));

// Lazy-loaded Protected Enterprise Pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Upload = lazy(() => import('./pages/Upload'));
const Documents = lazy(() => import('./pages/Documents'));
const DocumentDetail = lazy(() => import('./pages/DocumentDetail'));
const Contracts = lazy(() => import('./pages/Contracts'));
const Deadlines = lazy(() => import('./pages/Deadlines'));
const Security = lazy(() => import('./pages/Security'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const MfaSetup = lazy(() => import('./pages/MfaSetup'));
const Integrations = lazy(() => import('./pages/Integrations'));
const Operations = lazy(() => import('./pages/Operations'));

import './styles/styles.css';

const RouteLoadingFallback = () => (
  <div className="w-full bg-paper min-h-[70vh] flex items-center justify-center py-24">
    <ThinkingLoader
      state="working"
      size={64}
      caption="Loading Deciva chamber..."
      subcaption="Establishing isolated session and preparing secure workspace"
    />
  </div>
);

const GuestRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return <RouteLoadingFallback />;
  }
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

const AppContent = () => {
  const { user } = useAuth();
  const location = useLocation();
  const isAuthPage = [
    '/dashboard',
    '/upload',
    '/documents',
    '/contracts',
    '/portfolio',
    '/deadlines',
    '/security',
    '/integrations',
    '/operations'
  ].some((p) => location.pathname.startsWith(p)) || location.pathname.startsWith('/document/');

  React.useEffect(() => {
    const isAuthed = Boolean(user || isAuthPage);
    if (isAuthed) {
      document.body.classList.add('authenticated', 'portal-active');
    } else {
      document.body.classList.remove('authenticated', 'portal-active');
    }
  }, [user, isAuthPage]);

  return (
    <>
      <Topbar />
      <AiDegradedModeBanner />
      <main id="app" role="main" className="flex-1">
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            {/* Public Marketing & Intelligence Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/capabilities" element={<Capabilities />} />
            <Route path="/capabilities/:slug" element={<CapabilityDetail />} />
            <Route path="/intelligence" element={<Insights />} />
            <Route path="/intelligence/:slug" element={<InsightDetail />} />
            <Route path="/trust" element={<Trust />} />
            <Route path="/about" element={<Trust />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/accessibility" element={<Accessibility />} />

            {/* Authentication Routes */}
            <Route
              path="/register"
              element={
                <GuestRoute>
                  <Register />
                </GuestRoute>
              }
            />
            <Route
              path="/login"
              element={
                <GuestRoute>
                  <Login />
                </GuestRoute>
              }
            />
            <Route
              path="/mfa"
              element={
                <GuestRoute>
                  <Mfa />
                </GuestRoute>
              }
            />

            {/* Protected Enterprise Portal Routes (Preserved 100%) */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/portfolio"
              element={
                <ProtectedRoute>
                  <Portfolio />
                </ProtectedRoute>
              }
            />
            <Route
              path="/upload"
              element={
                <ProtectedRoute>
                  <Upload />
                </ProtectedRoute>
              }
            />
            <Route
              path="/documents"
              element={
                <ProtectedRoute>
                  <Documents />
                </ProtectedRoute>
              }
            />
            <Route
              path="/document/:id"
              element={
                <ProtectedRoute>
                  <DocumentDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/document/:id/:tab"
              element={
                <ProtectedRoute>
                  <DocumentDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/contracts"
              element={
                <ProtectedRoute>
                  <Contracts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/deadlines"
              element={
                <ProtectedRoute>
                  <Deadlines />
                </ProtectedRoute>
              }
            />
            <Route
              path="/security"
              element={
                <ProtectedRoute>
                  <Security />
                </ProtectedRoute>
              }
            />
            <Route
              path="/integrations"
              element={
                <ProtectedRoute>
                  <Integrations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/operations"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <Operations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/security/mfa-setup"
              element={
                <ProtectedRoute>
                  <MfaSetup />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mfa-setup"
              element={
                <ProtectedRoute>
                  <MfaSetup />
                </ProtectedRoute>
              }
            />

            {/* 404 Fallback */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      {(!user || !isAuthPage) && <Footer />}
    </>
  );
};

// Clean up path + hash mismatch (e.g. /login#/login -> /#/login)
if (typeof window !== 'undefined' && window.location.pathname !== '/' && window.location.pathname !== '') {
  try {
    const hashPart = window.location.hash ? window.location.hash.replace(/^#\/?/, '/') : window.location.pathname;
    window.history.replaceState(null, '', '/#' + hashPart);
  } catch (e) {
    // Ignore history state errors in restricted environments
  }
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('Deciva App Error Caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full min-h-screen bg-paper flex items-center justify-center p-8">
          <div className="max-w-md w-full border border-rule bg-paper-dim p-8 text-center">
            <h2 className="font-display text-2xl text-ink mb-3">Session Interrupted</h2>
            <p className="font-body text-body-sm text-ink-soft mb-6">
              A temporary interface error occurred. You can return home or reload the chamber.
            </p>
            <div className="flex gap-4 justify-center">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false });
                  window.location.href = '/#/';
                }}
                className="btn btn-primary"
              >
                Return to Home
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn btn-ghost"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <AppErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <HashRouter>
            <LenisProvider>
              <AppContent />
            </LenisProvider>
          </HashRouter>
        </AuthProvider>
      </ToastProvider>
    </AppErrorBoundary>
  );
}

export default App;
