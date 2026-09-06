import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import PortfolioSummaryCards from './PortfolioSummaryCards';
import PortfolioAttentionQueue from './PortfolioAttentionQueue';
import PortfolioHealthTable from './PortfolioHealthTable';
import PortfolioWorkload from './PortfolioWorkload';
import PortfolioRiskDistribution from './PortfolioRiskDistribution';
import PortfolioDeadlinesAndEscalations from './PortfolioDeadlinesAndEscalations';
import PortfolioCompliancePanel from '../compliance/PortfolioCompliancePanel';
import BulkOperationHistoryPanel from './BulkOperationHistoryPanel';
import PendingApprovalsQueue from './PendingApprovalsQueue';
import PortfolioMonitoring from './PortfolioMonitoring';
import CompactPortfolioTableView from './CompactPortfolioTableView';
import BusinessRoiCard from '../analytics/BusinessRoiCard';
import SkeletonLoader from '../common/SkeletonLoader';
import { PortfolioAnalyticsApi } from '../../services/portfolioAnalyticsApi';
import { useToast } from '../../context/ToastContext';

export const PortfolioDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('MONITORING');
  const [viewMode, setViewMode] = useState('EXECUTIVE'); // 'EXECUTIVE' | 'DENSE'
  const { toast } = useToast();

  const tabParam = searchParams.get('tab');

  useEffect(() => {
    if (!tabParam) return;
    const lower = tabParam.toLowerCase();
    if (['monitoring', 'telemetry', 'events'].includes(lower)) {
      setActiveSection('MONITORING');
    } else if (['contracts', 'health', 'risk'].includes(lower)) {
      setActiveSection('CONTRACTS');
    } else if (['attention', 'deadlines', 'urgent', 'escalations'].includes(lower)) {
      setActiveSection('ATTENTION');
    } else if (['approvals', 'governed', 'operations'].includes(lower)) {
      setActiveSection('APPROVALS');
    } else if (['audit', 'compliance', 'export'].includes(lower)) {
      setActiveSection('AUDIT');
    }
  }, [tabParam]);

  const handleSectionSelect = (sectionId) => {
    setActiveSection(sectionId);
    setSearchParams({ tab: sectionId.toLowerCase() });
  };

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await PortfolioAnalyticsApi.getPortfolioSummary();
      setSummary(res);
    } catch (err) {
      toast(err.message || 'Failed to load portfolio summary', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const totalUrgent = summary
    ? (summary.criticalActions || 0) + (summary.overdueActions || 0) + (summary.escalatedActions || 0)
    : 0;

  const sections = [
    {
      id: 'MONITORING',
      num: '01',
      label: 'Continuous Monitoring',
      icon: '📡',
      desc: 'Real-time event stream, triggers, breach detection & telemetry'
    },
    {
      id: 'CONTRACTS',
      num: '02',
      label: 'Contract Health & Risk',
      icon: '📊',
      desc: 'Health score rankings, risk matrices & exposure distributions'
    },
    {
      id: 'ATTENTION',
      num: '03',
      label: 'Attention & Deadlines',
      icon: '🚨',
      badge: totalUrgent > 0 ? totalUrgent : null,
      desc: 'Priority remediation queue, expiring renewals & workload distribution'
    },
    {
      id: 'APPROVALS',
      num: '04',
      label: 'Governed Approvals',
      icon: '🛡️',
      desc: 'Dual-signatory authorization, policy signoffs & bulk operations'
    },
    {
      id: 'AUDIT',
      num: '05',
      label: 'Compliance & Export',
      icon: '📜',
      desc: 'Statutory compliance evaluation & certified data portability'
    }
  ];

  if (loading) {
    return (
      <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
        <SkeletonLoader.Text lines={2} width="320px" />
        <div style={{ marginTop: '20px' }}>
          <SkeletonLoader.Card count={3} height="120px" />
        </div>
        <div style={{ marginTop: '24px' }}>
          <SkeletonLoader.Card count={2} height="260px" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* 1. Executive Summary Cards Header */}
      <PortfolioSummaryCards summary={summary} />

      {/* Dual Mode Switcher: Rich Executive vs Dense Operational */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.12)', paddingBottom: '12px' }}>
        <div>
          <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#A1A1AA' }}>
            PORTFOLIO WORKSPACE MODE
          </span>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', fontFamily: 'var(--font-serif, "Fraunces", Georgia, serif)' }}>
            {viewMode === 'EXECUTIVE' ? 'Rich Executive Overview' : 'Dense Operational View'}
          </div>
        </div>

        <div style={{ display: 'flex', border: '1px solid rgba(255, 255, 255, 0.2)', background: 'rgba(255, 255, 255, 0.04)' }}>
          <button
            type="button"
            onClick={() => setViewMode('EXECUTIVE')}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              background: viewMode === 'EXECUTIVE' ? '#FFFFFF' : 'transparent',
              color: viewMode === 'EXECUTIVE' ? '#000000' : '#D4D4D8',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            📰 Rich Executive View
          </button>
          <button
            type="button"
            onClick={() => setViewMode('DENSE')}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
              background: viewMode === 'DENSE' ? '#FFFFFF' : 'transparent',
              color: viewMode === 'DENSE' ? '#000000' : '#D4D4D8',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            📋 Dense Operational View
          </button>
        </div>
      </div>

      {viewMode === 'DENSE' ? (
        <CompactPortfolioTableView />
      ) : (
        <>
          {/* 2. Structured Section Navigator (Divided into 5 distinct focused views) */}
      <div className="bg-paper-dim border border-rule p-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {sections.map((s) => {
            const isActive = activeSection === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSectionSelect(s.id)}
                className={`text-left p-3 border transition-all duration-fast flex flex-col justify-between ${
                  isActive
                    ? 'bg-ink text-paper border-ink font-medium shadow-sm'
                    : 'bg-paper text-ink border-rule hover:border-ink/50 hover:bg-white/[0.03]'
                }`}
                style={{ minHeight: '68px' }}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-body text-micro opacity-60 tracking-wider">
                    [{s.num}]
                  </span>
                  {s.badge && (
                    <span className="font-body text-micro px-1.5 py-0.2 bg-signal text-white font-bold">
                      {s.badge}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-sm">{s.icon}</span>
                  <span className="font-body text-label font-semibold truncate">
                    {s.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section Header Description */}
      <div className="border-b border-rule pb-3 flex items-center justify-between">
        <div>
          <span className="font-body text-micro text-ink-soft block uppercase tracking-wider">
            Portfolio Section {sections.find((s) => s.id === activeSection)?.num}
          </span>
          <h2 className="font-display text-xl text-ink font-semibold mt-0.5">
            {sections.find((s) => s.id === activeSection)?.label}
          </h2>
        </div>
        <p className="font-body text-body-sm text-ink-soft hidden md:block">
          {sections.find((s) => s.id === activeSection)?.desc}
        </p>
      </div>

      {/* 3. Section Content Panels */}

      {/* SECTION 01: Pulse & Continuous Monitoring */}
      {activeSection === 'MONITORING' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <PortfolioMonitoring />
        </div>
      )}

      {/* SECTION 02: Contract Health Rankings & Risk Distribution */}
      {activeSection === 'CONTRACTS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <BusinessRoiCard />
          <PortfolioHealthTable />
          <div className="border-t border-rule pt-6">
            <PortfolioRiskDistribution />
          </div>
        </div>
      )}

      {/* SECTION 03: Executive Attention Queue & Deadlines */}
      {activeSection === 'ATTENTION' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <PortfolioAttentionQueue />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-2">
            <div className="lg:col-span-7">
              <PortfolioDeadlinesAndEscalations />
            </div>
            <div className="lg:col-span-5">
              <PortfolioWorkload />
            </div>
          </div>
        </div>
      )}

      {/* SECTION 04: Governed Approvals & Bulk Operations */}
      {activeSection === 'APPROVALS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <PendingApprovalsQueue onDecided={fetchSummary} />
          <div className="border-t border-rule pt-6">
            <div className="card p-6 mb-4 bg-paper-dim border border-rule">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-ink m-0">Bulk Action Dispatch</h3>
                  <p className="text-sm text-ink-soft m-0 mt-1">
                    Multi-contract assignment, deadline shifts, and batch lifecycle transitions.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setActiveSection('ATTENTION')}
                >
                  Go to Attention Queue →
                </button>
              </div>
            </div>
            <BulkOperationHistoryPanel />
          </div>
        </div>
      )}

      {/* SECTION 05: Compliance & Export Audit */}
      {activeSection === 'AUDIT' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <PortfolioCompliancePanel />
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default PortfolioDashboard;
