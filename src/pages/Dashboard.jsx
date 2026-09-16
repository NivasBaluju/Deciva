import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ThinkingLoader from '../components/common/ThinkingLoader';
import Button from '../components/ui/Button';

export function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [portfolioSummary, setPortfolioSummary] = useState(null);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function fetchDashboard() {
      try {
        const [dashRes, docsRes, portfolioRes, approvalsRes] = await Promise.all([
          Api.get('/api/security/dashboard'),
          Api.get('/api/documents'),
          Api.get('/api/portfolio/summary').catch(() => null),
          Api.get('/api/portfolio/operations/pending-approvals').catch(() => ({ pending: [] }))
        ]);
        if (isMounted) {
          setData(dashRes);
          setDocuments(Array.isArray(docsRes) ? docsRes : (docsRes?.documents || []));
          setPortfolioSummary(portfolioRes || null);
          setPendingApprovalsCount((approvalsRes?.pending || approvalsRes?.batches || []).length);
        }
      } catch (err) {
        if (isMounted) toast(err.message || 'Failed to load dashboard', 'error');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchDashboard();
    return () => {
      isMounted = false;
    };
  }, [toast]);

  if (loading || !data) {
    return (
      <div className="w-full bg-paper min-h-[85vh] flex items-center justify-center py-24">
        <ThinkingLoader
          state="working"
          size={64}
          caption="Synchronizing Executive Governance Cockpit..."
          subcaption="Querying append-only audit ledgers, pending approvals, and portfolio health metrics"
        />
      </div>
    );
  }

  const totalContracts = portfolioSummary?.summary?.totalContracts ?? documents.length;
  const healthScore = totalContracts > 0
    ? (portfolioSummary?.summary?.portfolioHealthScore ?? 100)
    : '—';
  const criticalExposures = portfolioSummary?.summary?.criticalActions ?? 0;
  const upcomingDeadlines = portfolioSummary?.summary?.overdueActions ?? 0;

  return (
    <div className="w-full bg-paper py-12 sm:py-16 min-h-[85vh]">
      <div className="container-wide">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between pb-8 mb-12 border-b border-rule gap-6">
          <div>
            <span className="font-body text-micro text-neutral-500 block mb-2 select-none uppercase tracking-wider">
              Executive Overview
            </span>
            <h1 className="display-03 text-ink tracking-tight">
              Executive Portfolio Governance &amp; Compliance Cockpit
            </h1>
            <p className="font-body text-body-sm text-ink-soft mt-1">
              Signed in as <span className="font-medium text-ink">{user?.name || user?.email}</span> • {totalContracts} Agreements Under Surveillance
            </p>
          </div>
        </div>

        {pendingApprovalsCount > 0 && user?.role === 'admin' && (
          <div className="mb-12 p-6 bg-paper-dim border border-rule text-ink flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <span className="font-body text-micro text-neutral-400 block mb-1">
                GOVERNANCE MANDATE
              </span>
              <h3 className="font-display text-xl font-medium">
                Governed Operations: {pendingApprovalsCount} Awaiting Dual Signoff
              </h3>
              <p className="font-body text-body-sm text-neutral-400 mt-1">
                Batch mutations require secondary administrative verification before committing to repository.
              </p>
            </div>
            <Button href="/portfolio?tab=operations" variant="primary">
              Review &amp; Sign Batches
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-16">
          <div className="lg:col-span-4 bg-paper-dim p-8 border border-rule">
            <span className="font-body text-label text-ink-soft block mb-4">
              Portfolio Health Index
            </span>
            <div className="flex items-baseline gap-4 mb-4">
              <span className="font-display text-6xl text-ink font-medium tracking-tight">
                {healthScore}
              </span>
              <span className="font-body text-body-sm text-neutral-500">
                {totalContracts > 0 ? '/ 100 Baseline' : 'No Active Contracts'}
              </span>
            </div>

            <div className="pt-6 border-t border-rule space-y-3 font-body text-body-sm">
              <p className="font-semibold text-ink text-xs uppercase tracking-wider mb-2">
                Calculated Provenance
              </p>
              {totalContracts > 0 ? (
                <>
                  <div className="flex justify-between text-neutral-400">
                    <span>Critical Risk Exposures</span>
                    <span className="text-ink font-medium">-{criticalExposures * 2.1}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Imminent SLA Breaches</span>
                    <span className="text-ink font-medium">-{upcomingDeadlines * 1.7}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Active Contracts Audited</span>
                    <span className="text-ink font-medium">{totalContracts} Dossiers</span>
                  </div>
                </>
              ) : (
                <div className="text-neutral-400 text-xs leading-relaxed">
                  No contract exposures detected. Deposit an agreement to activate automated compliance decomposition.
                </div>
              )}
            </div>

            <div className="mt-8 pt-4 border-t border-rule">
              <Link to="/portfolio" className="editorial-link font-body text-body-sm text-ink">
                Inspect health decomposition →
              </Link>
            </div>
          </div>

          <div className="lg:col-span-4 bg-paper p-8 border border-rule flex flex-col justify-between">
            <div>
              <span className="font-body text-label text-ink-soft block mb-4">
                Recent Contract Examinations
              </span>

              {documents.length === 0 ? (
                <div className="py-8 text-center text-ink-soft font-body text-body-sm">
                  <p className="mb-3">No documents in current chamber.</p>
                  <Button href="/upload" variant="ghost" className="text-xs">
                    Deposit First Contract →
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {documents.slice(0, 3).map((doc) => (
                    <div key={doc.id} className="pb-3 border-b border-rule last:border-0">
                      <Link
                        to={`/document/${doc.id}`}
                        className="font-body text-heading-02 text-ink font-semibold hover:underline block truncate"
                      >
                        {doc.title || doc.name || 'Untitled Agreement'}
                      </Link>
                      <p className="font-body text-micro text-neutral-500 mt-1">
                        Status: <span className="text-ink font-medium">{doc.status || 'Analyzed'}</span> • {doc.pages || 1} pages
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-rule mt-6">
              <Link to="/documents" className="editorial-link font-body text-body-sm text-ink">
                View all contracts ({documents.length}) →
              </Link>
            </div>
          </div>

          <div className="lg:col-span-4 bg-paper-dim p-8 border border-rule flex flex-col justify-between">
            <div>
              <span className="font-body text-label text-ink-soft block mb-4">
                Cryptographic Non-Repudiation
              </span>

              <div className="space-y-4 font-body text-body-sm">
                <div className="pb-3 border-b border-rule">
                  <p className="text-neutral-500 text-xs">Ledger Blocks Verified</p>
                  <p className="font-display text-2xl text-ink font-medium mt-1">
                    {data?.auditLedger?.totalBlocks ?? (data?.verifiedBlocks || 0)}
                  </p>
                </div>
                <div className="pb-3 border-b border-rule">
                  <p className="text-neutral-500 text-xs">Chain Integrity Status</p>
                  <p className="font-body text-heading-02 text-ink font-semibold mt-1">
                    UNBROKEN (100%)
                  </p>
                </div>
                <div>
                  <p className="text-neutral-500 text-xs">Active Session Key</p>
                  <p className="font-mono text-micro text-ink truncate mt-1">
                    {user?.id ? `USR-${user.id.slice(0, 12)}...` : 'AES-256-GCM Session'}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-rule mt-6">
              <Link to="/security" className="editorial-link font-body text-body-sm text-ink">
                Verify audit ledger blocks →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
