import React from 'react';
import { Link } from 'react-router-dom';
import HeroEntrance from '../components/motion/HeroEntrance';
import RedactionReveal from '../components/motion/RedactionReveal';
import Button from '../components/ui/Button';
import ContentCard from '../components/ui/ContentCard';
import PullQuote from '../components/ui/PullQuote';
import TextLinkButton from '../components/ui/TextLinkButton';
import capabilitiesData from '../content/capabilities.json';
import insightsData from '../content/insights.json';

export function Landing() {
  const diligenceCap = capabilitiesData.find((c) => c.slug === 'contract-diligence') || capabilitiesData[0];
  const riskCap = capabilitiesData.find((c) => c.slug === 'risk-radar') || capabilitiesData[1];
  const negotiationCap = capabilitiesData.find((c) => c.slug === 'autonomous-negotiation') || capabilitiesData[2];
  const governanceCap = capabilitiesData.find((c) => c.slug === 'portfolio-governance') || capabilitiesData[3];
  const complianceCap = capabilitiesData.find((c) => c.slug === 'compliance-audit') || capabilitiesData[4];
  const crosscheckCap = capabilitiesData.find((c) => c.slug === 'regulatory-crosscheck') || capabilitiesData[5];

  return (
    <div className="w-full">
      <section
        className="section-ink relative flex items-center min-h-[88vh] py-28 sm:py-36 border-b border-neutral-800 bg-black overflow-hidden"
        style={{
          backgroundColor: '#000000',
          color: '#FFFFFF'
        }}
      >
        <div 
          className="absolute right-0 top-0 bottom-0 w-full lg:w-1/2 pointer-events-none select-none flex items-center justify-end overflow-hidden opacity-60 sm:opacity-75 lg:opacity-85 z-0"
          style={{
            maskImage: 'linear-gradient(to left, rgba(0,0,0,1) 40%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,1) 40%, transparent 100%)'
          }}
        >
          <img
            src="/assets/statue-dither.png"
            alt="Lady Justice Statue Art"
            className="h-full max-h-[750px] object-contain object-right-bottom mix-blend-screen"
          />
        </div>

        <div className="container-wide w-full relative z-10">
          <HeroEntrance
            headline="Judgment, applied with precision."
            subheadline="Deciva evaluates the contracts that define an enterprise's future — diligence, risk mitigation, autonomous negotiation, and governance."
          >
            <div className="flex flex-wrap items-center gap-4 mt-8">
              <Button href="/contact" variant="primary">
                Speak with us
              </Button>
              <Button href="/capabilities" variant="ghost-light">
                View capabilities
              </Button>
            </div>
          </HeroEntrance>
        </div>
      </section>

      <section className="bg-paper py-28 sm:py-36 border-b border-rule">
        <div className="container-wide">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            <div className="lg:col-span-8">
              <span className="font-body text-label text-ink-soft mb-4 block uppercase tracking-wider">
                Operating Mandate
              </span>
              <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-ink font-medium leading-tight tracking-tight">
                Contractual commitments are dynamic financial liabilities. Deciva applies machine intelligence to declassify risk, govern bulk mutations, and enforce cryptographic compliance.
              </h2>
            </div>
            <div className="lg:col-span-4 border-l border-rule pl-8 lg:pl-12 pt-2 space-y-6">
              <div>
                <h4 className="font-body text-label text-ink font-semibold uppercase tracking-wider mb-1">
                  Statutory Coverage
                </h4>
                <p className="font-body text-body-sm text-ink-soft">
                  Delaware Chancery, UCC Article 2, English Common Law, and EU GDPR Article 28 baselines.
                </p>
              </div>
              <div>
                <h4 className="font-body text-label text-ink font-semibold uppercase tracking-wider mb-1">
                  Cryptographic Non-Repudiation
                </h4>
                <p className="font-body text-body-sm text-ink-soft">
                  SHA-256 block anchored audit ledger with dual-signatory separation of duties.
                </p>
              </div>
              <div>
                <h4 className="font-body text-label text-ink font-semibold uppercase tracking-wider mb-1">
                  Zero-Trust Architecture
                </h4>
                <p className="font-body text-body-sm text-ink-soft">
                  Hardware enclave processing with zero multi-tenant data bleed guarantees.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-paper py-24 sm:py-32 border-b border-rule">
        <div className="container-wide">
          <div className="mb-16">
            <span className="font-body text-label text-ink-soft mb-2 block uppercase tracking-wider">
              Capability Group I — Diligence & Risk
            </span>
            <h3 className="display-03 text-ink tracking-tight">
              Contract Examination & Exposure Declassification
            </h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-stretch">
            <div className="lg:col-span-7 bg-paper-dim border border-rule p-8 sm:p-12 flex flex-col justify-between">
              <div>
                <span className="font-body text-micro text-ink-soft block mb-3 font-medium">
                  Diligence Engine
                </span>
                <h4 className="font-display text-2xl sm:text-3xl text-ink font-medium mb-4">
                  {diligenceCap.name}
                </h4>
                <p className="font-body text-body text-ink-soft mb-6 leading-relaxed">
                  {diligenceCap.overview}
                </p>
                <ul className="space-y-3 font-body text-body-sm text-ink-soft list-none p-0 mb-8">
                  {diligenceCap.services.map((srv, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="text-ink font-bold">•</span>
                      <span>{srv}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <TextLinkButton href={`/capabilities/${diligenceCap.slug}`}>
                  Explore Diligence Architecture
                </TextLinkButton>
              </div>
            </div>

            <div className="lg:col-span-5 border border-rule p-8 sm:p-12 flex flex-col justify-between bg-paper">
              <div>
                <span className="font-body text-micro text-ink-soft block mb-3 font-medium">
                  Risk Surveillance
                </span>
                <h4 className="font-display text-2xl sm:text-3xl text-ink font-medium mb-4">
                  {riskCap.name}
                </h4>
                <p className="font-body text-body-sm text-ink-soft mb-6 leading-relaxed">
                  {riskCap.indexLine}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-6">
                  <div className="border border-rule p-3.5 bg-paper-dim">
                    <span className="font-body text-micro text-ink-soft block mb-1">Indemnity</span>
                    <span className="font-display text-xl text-ink font-semibold block">Active</span>
                  </div>
                  <div className="border border-rule p-3.5 bg-paper-dim">
                    <span className="font-body text-micro text-ink-soft block mb-1">Damage Audit</span>
                    <span className="font-display text-xl text-ink font-semibold block">99.4%</span>
                  </div>
                  <div className="border border-rule p-3.5 bg-paper-dim">
                    <span className="font-body text-micro text-ink-soft block mb-1">Risk Scale</span>
                    <span className="font-display text-xl text-ink font-semibold block">0–100</span>
                  </div>
                </div>
              </div>
              <div>
                <TextLinkButton href={`/capabilities/${riskCap.slug}`}>
                  Examine Risk Radar
                </TextLinkButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-paper-dim py-24 sm:py-32 border-b border-rule">
        <div className="container-wide">
          <div className="mb-16">
            <span className="font-body text-label text-ink-soft mb-2 block font-medium">
              Capability Group II — Execution & Governance
            </span>
            <h3 className="display-03 text-ink tracking-tight">
              Bilateral Strategy & Multi-Contract Governance
            </h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-stretch">
            <div className="lg:col-span-5 border border-rule p-8 sm:p-12 flex flex-col justify-between bg-paper">
              <div>
                <span className="font-body text-micro text-ink-soft block mb-3 font-medium">
                  Negotiation Workbench
                </span>
                <h4 className="font-display text-2xl sm:text-3xl text-ink font-medium mb-4">
                  {negotiationCap.name}
                </h4>
                <p className="font-body text-body-sm text-ink-soft mb-6 leading-relaxed">
                  {negotiationCap.indexLine}
                </p>
                <p className="font-body text-body-sm text-ink-soft leading-relaxed mb-6">
                  Calculates concession probabilities, fallback positions, and strategic BATNA tolerance matrices to maximize leverage at every exchange.
                </p>
              </div>
              <div>
                <TextLinkButton href={`/capabilities/${negotiationCap.slug}`}>
                  Workbench Specifications
                </TextLinkButton>
              </div>
            </div>

            <div className="lg:col-span-7 bg-paper border border-rule p-8 sm:p-12 flex flex-col justify-between">
              <div>
                <span className="font-body text-micro text-ink-soft block mb-3 font-medium">
                  Portfolio Health Engine
                </span>
                <h4 className="font-display text-2xl sm:text-3xl text-ink font-medium mb-4">
                  {governanceCap.name}
                </h4>
                <p className="font-body text-body text-ink-soft mb-6 leading-relaxed">
                  {governanceCap.overview}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  <div className="border border-rule p-4 bg-paper-dim">
                    <span className="font-body text-micro text-ink-soft block mb-1">Health Index</span>
                    <span className="font-display text-2xl text-ink font-semibold">88.4 / 100</span>
                  </div>
                  <div className="border border-rule p-4 bg-paper-dim">
                    <span className="font-body text-micro text-ink-soft block mb-1">Phase 8.1 Engine</span>
                    <span className="font-display text-2xl text-ink font-semibold">Dual Signoff</span>
                  </div>
                </div>
              </div>
              <div>
                <TextLinkButton href={`/capabilities/${governanceCap.slug}`}>
                  View Governance Framework
                </TextLinkButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-paper py-24 sm:py-32 border-b border-rule">
        <div className="container-wide">
          <div className="mb-16">
            <span className="font-body text-label text-ink-soft mb-2 block font-medium">
              Capability Group III — Integrity & Compliance
            </span>
            <h3 className="display-03 text-ink tracking-tight">
              Cryptographic Evidence & Statutory Cross-Checking
            </h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            <div className="lg:col-span-9 space-y-12">
              <div className="border border-rule p-8 sm:p-12 bg-paper-dim">
                <span className="font-body text-micro text-ink-soft block mb-3 font-medium">
                  Audit Ledger
                </span>
                <h4 className="font-display text-2xl sm:text-3xl text-ink font-medium mb-4">
                  {complianceCap.name}
                </h4>
                <p className="font-body text-body text-ink-soft leading-relaxed mb-6">
                  {complianceCap.overview}
                </p>
                <TextLinkButton href={`/capabilities/${complianceCap.slug}`}>
                  Cryptographic Ledger Details
                </TextLinkButton>
              </div>

              <div className="border border-rule p-8 sm:p-12 bg-paper">
                <span className="font-body text-micro text-ink-soft block mb-3 font-medium">
                  Statutory Audit
                </span>
                <h4 className="font-display text-2xl sm:text-3xl text-ink font-medium mb-4">
                  {crosscheckCap.name}
                </h4>
                <p className="font-body text-body text-ink-soft leading-relaxed mb-6">
                  {crosscheckCap.overview}
                </p>
                <TextLinkButton href={`/capabilities/${crosscheckCap.slug}`}>
                  Cross-Check Specifications
                </TextLinkButton>
              </div>
            </div>

            <div className="lg:col-span-3 border-l border-rule pl-8 lg:pl-10 space-y-8 pt-2">
              <div>
                <h5 className="font-body text-label text-ink font-semibold uppercase tracking-wider mb-2">
                  Evidence Formats
                </h5>
                <p className="font-body text-body-sm text-ink-soft">
                  RFC-4180 CSV manifests, binary PDF audit reports, JSON-LD cryptographic proofs.
                </p>
              </div>
              <div>
                <h5 className="font-body text-label text-ink font-semibold uppercase tracking-wider mb-2">
                  Statutory Regimes
                </h5>
                <p className="font-body text-body-sm text-ink-soft">
                  EU GDPR Article 28, FTC/DOJ antitrust guidelines, Delaware Chancery corporate precedent.
                </p>
              </div>
              <div>
                <h5 className="font-body text-label text-ink font-semibold uppercase tracking-wider mb-2">
                  Non-Repudiation
                </h5>
                <p className="font-body text-body-sm text-ink-soft">
                  Stateless verification endpoint allows independent judicial validation of executed batches.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="section-ink py-32 sm:py-44 border-b border-neutral-800"
        style={{
          backgroundColor: '#0A0A0A',
          color: '#FAF9F6'
        }}
      >
        <div className="container-wide">
          <div className="max-w-4xl">
            <span className="font-body text-label text-neutral-400 mb-4 block uppercase tracking-wider">
              Statutory Surveillance Metric
            </span>
            <div className="mb-6">
              <RedactionReveal barColor="#0A0A0A">
                <span className="display-01 text-white font-medium block">
                  40+
                </span>
              </RedactionReveal>
            </div>
            <h3 className="font-display text-3xl sm:text-4xl text-white font-medium leading-snug">
              compliance frameworks and statutory regimes monitored continuously across your portfolio.
            </h3>
            <p className="font-body text-body text-ink-soft mt-6 max-w-2xl leading-relaxed">
              From Delaware corporate precedent and UCC obligations to European Union GDPR Article 28 mandates, Deciva continuously validates contract terms against changing statutory baselines.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-paper py-28 sm:py-36 border-b border-rule">
        <div className="container-wide">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            <div className="lg:col-span-8">
              <span className="font-body text-label text-ink-soft mb-6 block uppercase tracking-wider">
                Representative Matter
              </span>
              <PullQuote
                quote="Advised an enterprise manufacturer through an unannounced multi-jurisdiction contract audit, identifying 14 uncapped liability clauses before counterparty discovery."
                attribution="Cross-Border Commercial Diligence"
                subattribution="Mergers & Acquisitions • 2025"
              />
            </div>
            <div className="lg:col-span-4 border-l border-rule pl-8 lg:pl-12 pt-4 space-y-6">
              <div>
                <h4 className="font-body text-label text-ink font-semibold uppercase mb-1">
                  Transaction Impact
                </h4>
                <p className="font-body text-body-sm text-ink-soft">
                  Prevented $42M in unmitigated cross-border indemnity exposures prior to closing.
                </p>
              </div>
              <div>
                <h4 className="font-body text-label text-ink font-semibold uppercase mb-1">
                  Turnaround Velocity
                </h4>
                <p className="font-body text-body-sm text-ink-soft">
                  Full portfolio diligence completed across 1,840 agreements in under 4 hours.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-paper-dim py-28 sm:py-36 border-b border-rule">
        <div className="container-wide">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-16 gap-6">
            <div>
              <span className="font-body text-label text-ink-soft mb-2 block uppercase tracking-wider">
                Legal Engineering Publications
              </span>
              <h2 className="display-03 text-ink tracking-tight">
                Recent thinking
              </h2>
            </div>
            <TextLinkButton href="/intelligence">
              All publications
            </TextLinkButton>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 sm:gap-12">
            {insightsData.slice(0, 3).map((item) => (
              <ContentCard
                key={item.slug}
                href={`/intelligence/${item.slug}`}
                badge={item.category}
                title={item.title}
                subtitle={item.dek}
                meta={`${item.author} • ${item.date}`}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-paper py-24 sm:py-32 border-b border-rule">
        <div className="container-wide">
          <div className="max-w-3xl">
            <span className="font-body text-label text-ink-soft mb-4 block uppercase tracking-wider">
              Zero-Trust Architecture
            </span>
            <h3 className="font-display text-3xl sm:text-4xl text-ink font-medium mb-6 leading-tight">
              Hardware enclave processing with zero multi-tenant data leakage.
            </h3>
            <p className="font-body text-body text-ink-soft leading-relaxed mb-8">
              Deciva isolates all contract telemetry inside hardware-encrypted enclaves. Your legal data is never used to train global AI models, and every calculation produces an immutable SHA-256 evidence package for independent judicial verification.
            </p>
            <TextLinkButton href="/trust">
              Read Security Architecture & SOC 2 Telemetry
            </TextLinkButton>
          </div>
        </div>
      </section>

      <section
        className="section-ink py-32 sm:py-40 text-center flex flex-col items-center justify-center"
        style={{
          backgroundColor: '#0A0A0A',
          color: '#FAF9F6'
        }}
      >
        <div className="container-text">
          <span className="font-body text-label text-ink-soft mb-4 block uppercase tracking-wider">
            Executive Briefing
          </span>
          <h2 className="display-02 text-white tracking-tight mb-6">
            Retain Deciva for your portfolio.
          </h2>
          <p className="font-body text-body text-ink-soft max-w-xl mx-auto mb-10 leading-relaxed">
            Schedule a confidential briefing with our legal engineering team to evaluate your contract exposure.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button href="/contact" variant="primary">
              Speak with us
            </Button>
            <Button href="/login" variant="ghost-light">
              Client Portal Sign In
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Landing;
