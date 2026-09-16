import React from 'react';
import { motion } from 'motion/react';
import Icon from '../common/Icon';
import MetricCard from '../common/MetricCard';
import { staggerContainer } from '../../styles/motion';

export const PortfolioSummaryCards = ({ summary }) => {
  const data = summary || {};
  const {
    totalContracts = 0,
    activeContracts = 0,
    totalActions = 0,
    activeActions = 0,
    criticalActions = 0,
    overdueActions = 0,
    escalatedActions = 0,
    portfolioHealthScore = 100,
    portfolioHealthGrade = 'EXCELLENT',
    operationalHealth = {}
  } = data;

  const getHealthGradeStyle = (grade) => {
    switch (grade) {
      case 'EXCELLENT':
        return { color: '#0A0A0A', badgeCls: 'badge-ok' };
      case 'GOOD':
        return { color: '#1A1A1A', badgeCls: 'badge-ok' };
      case 'ATTENTION':
        return { color: '#6E2A22', badgeCls: 'badge-warn' };
      case 'AT_RISK':
        return { color: '#6E2A22', badgeCls: 'badge-warn' };
      case 'CRITICAL':
      default:
        return { color: '#6E2A22', badgeCls: 'badge-danger' };
    }
  };

  const healthStyle = getHealthGradeStyle(portfolioHealthGrade);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div
        className="card bg-paper-dim border border-rule"
        style={{ padding: '24px' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="font-body text-micro text-neutral-500 uppercase tracking-wider block">
                Portfolio Governance
              </span>
              <span className="font-mono text-micro text-ink bg-paper border border-rule px-2 py-0.5 select-none">
                v{operationalHealth?.formulaVersion || '1.0'}
              </span>
            </div>
            <h2 className="font-display text-2xl text-ink tracking-tight mb-1">
              Contract Portfolio Governance
            </h2>
            <p className="font-body text-body-sm text-ink-soft m-0 max-w-xl">
              Executive oversight score weighting individual contract health, active risk velocity, and portfolio queue discipline.
            </p>
          </div>

          <div className="text-left sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-rule">
            <div className="font-display text-4xl text-ink tracking-tight leading-none">
              {portfolioHealthScore} <span className="font-body text-lg text-ink-soft">/ 100</span>
            </div>
            <span className="font-body text-micro font-semibold uppercase tracking-wider text-ink block mt-1">
              ● {portfolioHealthGrade}
            </span>
          </div>
        </div>

        {operationalHealth?.penalties && (
          <div className="mt-4 pt-4 border-t border-rule flex flex-wrap gap-6 font-body text-body-sm text-ink-soft">
            <div>
              <span className="text-neutral-500">Weighted Base Score: </span>
              <strong className="text-ink font-semibold">{operationalHealth.weightedBase || 100}</strong>
            </div>
            {operationalHealth.penalties.escalationPenalty < 0 && (
              <div>
                <span className="text-neutral-500">Escalation Penalty: </span>
                <strong className="text-signal font-semibold">{operationalHealth.penalties.escalationPenalty} pts</strong>
              </div>
            )}
            {operationalHealth.penalties.criticalOverduePenalty < 0 && (
              <div>
                <span className="text-neutral-500">Critical Overdue Penalty: </span>
                <strong className="text-signal font-semibold">{operationalHealth.penalties.criticalOverduePenalty} pts</strong>
              </div>
            )}
            <div>
              <span className="text-neutral-500">Active Contracts: </span>
              <strong className="text-ink font-semibold">{activeContracts} of {totalContracts}</strong>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricCard
          icon={<Icon.document />}
          iconCls="metric-icon-blue"
          value={totalContracts}
          label="Total Contracts"
          hint={`${activeContracts} contracts with active actions`}
        />
        <MetricCard
          icon={<Icon.check />}
          iconCls="metric-icon-cyan"
          value={activeActions}
          label="Active Workflow Actions"
          hint={`${totalActions} total lifetime actions`}
        />
        <MetricCard
          icon={<Icon.alert />}
          iconCls={criticalActions > 0 ? 'metric-icon-red' : 'metric-icon-green'}
          value={criticalActions}
          label="Critical Priority Actions"
          badgeCls={criticalActions > 0 ? 'badge-danger' : 'badge-ok'}
          badgeText={criticalActions > 0 ? 'NEEDS REVIEW' : 'NONE'}
        />
        <MetricCard
          icon={<Icon.calendar />}
          iconCls={overdueActions > 0 ? 'metric-icon-amber' : 'metric-icon-blue'}
          value={overdueActions}
          label="Overdue Actions"
          badgeCls={overdueActions > 0 ? 'badge-warn' : 'badge-ok'}
          badgeText={overdueActions > 0 ? `${overdueActions} Overdue` : 'ON TRACK'}
        />
        <MetricCard
          icon={<Icon.shield />}
          iconCls={escalatedActions > 0 ? 'metric-icon-red' : 'metric-icon-navy'}
          value={escalatedActions}
          label="Escalated Actions"
          badgeCls={escalatedActions > 0 ? 'badge-danger' : 'badge-ok'}
          badgeText={escalatedActions > 0 ? 'ESCALATED' : 'STABLE'}
        />
        <MetricCard
          icon={<Icon.shield />}
          iconCls="metric-icon-gold"
          value={`${portfolioHealthScore}%`}
          label="Portfolio Governance Index"
          badgeCls={healthStyle.badgeCls}
          badgeText={portfolioHealthGrade}
        />
      </div>
    </div>
  );
};

export default PortfolioSummaryCards;
