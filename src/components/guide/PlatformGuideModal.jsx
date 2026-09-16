import React, { useState, useEffect } from 'react';
import { IconClose } from '../ui/Icons';

export const PlatformGuideModal = ({ isOpen, onClose, initialSection = 'WORKFLOW' }) => {
  const resolveSection = (sec) => {
    if (sec === 'INTELLIGENCE' || sec === 'MONITORING') return 'INTELLIGENCE_GOVERNANCE';
    if (sec === 'STACK' || sec === 'SECURITY') return 'TECH_SECURITY';
    return sec || 'WORKFLOW';
  };

  const [activeTab, setActiveTab] = useState(resolveSection(initialSection));

  useEffect(() => {
    if (initialSection) {
      setActiveTab(resolveSection(initialSection));
    }
  }, [initialSection]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tabs = [
    {
      id: 'WORKFLOW',
      num: '01',
      label: 'User Guide & Workflow',
      title: 'Platform Workflow & End-to-End Operational Journey',
      icon: '🧭'
    },
    {
      id: 'INTELLIGENCE_GOVERNANCE',
      num: '02',
      label: 'AI & Governance',
      title: 'AI Decision Engines, Continuous Monitoring & Governed Approvals',
      icon: '🧠'
    },
    {
      id: 'TECH_SECURITY',
      num: '03',
      label: 'Stack & Security',
      title: 'Full Engineering Stack, Cryptographic Audit Ledger & Zero-Trust DR',
      icon: '🛡️'
    }
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
      data-lenis-prevent="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        data-lenis-prevent="true"
        className="relative w-full max-w-5xl max-h-[90vh] bg-[#0A0A0E] border border-rule flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-rule bg-[#0C0C12]">
          <div className="flex items-center gap-3">
            <span id="guide-title" className="font-display text-xl text-white font-semibold">
              Deciva — System Guide &amp; Architecture Tour
            </span>
            <span className="text-micro bg-white/10 text-zinc-300 px-2.5 py-0.5 border border-rule uppercase tracking-wider font-mono">
              Reference Manual
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close guide"
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors border border-transparent hover:border-rule"
          >
            <IconClose className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 border-b border-rule bg-[#07070A]">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-3.5 px-4 text-left transition-all flex items-center gap-3 border-r border-rule last:border-r-0 ${
                  isActive
                    ? 'bg-white text-black font-semibold shadow-inner'
                    : 'text-zinc-300 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <span className="text-base">{tab.icon}</span>
                <div className="truncate">
                  <span className={`text-micro block leading-tight font-mono ${isActive ? 'text-neutral-700' : 'text-neutral-400'}`}>
                    [{tab.num}]
                  </span>
                  <span className="text-xs sm:text-sm tracking-tight truncate block font-medium">
                    {tab.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div
          data-lenis-prevent="true"
          className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 text-zinc-200 text-body-sm leading-relaxed guide-scrollable"
          style={{ overscrollBehavior: 'contain' }}
          onWheel={(e) => e.stopPropagation()}
        >
          {activeTab === 'WORKFLOW' && (
            <div className="space-y-6">
              <div>
                <span className="text-micro text-white font-mono uppercase tracking-widest block mb-1">
                  Section 01 • Operational Walkthrough
                </span>
                <h3 className="font-display text-2xl text-white font-medium">
                  How to Use Deciva From Start to Finish
                </h3>
                <p className="text-zinc-300 text-body mt-2">
                  Deciva is structured as an executive decision pipeline. You do not need to be a corporate lawyer or developer to navigate your enterprise agreements. Follow these 5 progressive stages:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 pt-2">
                <div className="border border-white/10 p-4 bg-[#121218] flex flex-col justify-between">
                  <div>
                    <span className="font-mono text-micro text-white block mb-2 font-bold">Step 1</span>
                    <h4 className="font-body text-white font-semibold text-sm mb-2">Ingestion &amp; OCR</h4>
                    <p className="text-xs text-zinc-300 leading-normal">
                      Upload PDFs, DOCX, or scanned legal exhibits. Hardware OCR extracts text with 99.4% confidence and generates a unique SHA-256 digest.
                    </p>
                  </div>
                  <span className="text-micro text-zinc-400 block mt-4 font-mono">Via /upload</span>
                </div>

                <div className="border border-white/10 p-4 bg-[#121218] flex flex-col justify-between">
                  <div>
                    <span className="font-mono text-micro text-white block mb-2 font-bold">Step 2</span>
                    <h4 className="font-body text-white font-semibold text-sm mb-2">AI Risk Radar</h4>
                    <p className="text-xs text-zinc-300 leading-normal">
                      The engine scores 9 risk dimensions (indemnity caps, liability, termination) and flags statutory redlines automatically.
                    </p>
                  </div>
                  <span className="text-micro text-zinc-400 block mt-4 font-mono">Via /documents</span>
                </div>

                <div className="border border-white/10 p-4 bg-[#121218] flex flex-col justify-between">
                  <div>
                    <span className="font-mono text-micro text-white block mb-2 font-bold">Step 3</span>
                    <h4 className="font-body text-white font-semibold text-sm mb-2">Bilateral Redlining</h4>
                    <p className="text-xs text-zinc-300 leading-normal">
                      Calculate counterparty concession probabilities, view fallback clause alternatives, and simulate negotiation outcomes.
                    </p>
                  </div>
                  <span className="text-micro text-zinc-400 block mt-4 font-mono">Via Document Detail</span>
                </div>

                <div className="border border-white/10 p-4 bg-[#121218] flex flex-col justify-between">
                  <div>
                    <span className="font-mono text-micro text-white block mb-2 font-bold">Step 4</span>
                    <h4 className="font-body text-white font-semibold text-sm mb-2">Portfolio Oversight</h4>
                    <p className="text-xs text-zinc-300 leading-normal">
                      Monitor multi-contract health, track upcoming renewal deadlines, and resolve executive remediation backlog in batches.
                    </p>
                  </div>
                  <span className="text-micro text-zinc-400 block mt-4 font-mono">Via /portfolio</span>
                </div>

                <div className="border border-white/10 p-4 bg-[#121218] flex flex-col justify-between">
                  <div>
                    <span className="font-mono text-micro text-white block mb-2 font-bold">Step 5</span>
                    <h4 className="font-body text-white font-semibold text-sm mb-2">Governed Signoff</h4>
                    <p className="text-xs text-zinc-300 leading-normal">
                      Enforce dual-signatory approval. Every state mutation is anchored to the immutable SHA-256 cryptographic audit ledger.
                    </p>
                  </div>
                  <span className="text-micro text-zinc-400 block mt-4 font-mono">Via /security</span>
                </div>
              </div>

              <div className="border border-white/10 p-5 bg-[#07070B]">
                <h4 className="font-body text-white font-semibold text-sm mb-2 flex items-center gap-2">
                  <span>💡</span> Navigation Primer for Business Users
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-zinc-300">
                  <p>
                    <strong className="text-white">Use the Left Sidebar:</strong> for daily operational work — uploading new files, browsing contract rankings, viewing live deadline calendars, and configuring CRM/ERP integrations.
                  </p>
                  <p>
                    <strong className="text-white">Use the Topbar (Here):</strong> whenever you or your team need to understand platform capabilities, statutory standards, backend technology, or zero-trust data safety guarantees.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'INTELLIGENCE_GOVERNANCE' && (
            <div className="space-y-8">
              <div className="space-y-4">
                <div>
                  <span className="text-micro text-white font-mono uppercase tracking-widest block mb-1">
                    Section 02A • Applied Legal Machine Intelligence
                  </span>
                  <h3 className="font-display text-2xl text-white font-medium">
                    Decision Intelligence &amp; Statutory Cross-Checking
                  </h3>
                  <p className="text-zinc-300 text-body mt-2">
                    Unlike generic chatbots that summarize text with hallucinated opinions, Deciva uses a deterministic, mathematically grounded intelligence architecture.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="border border-white/10 p-5 bg-[#121218]">
                    <h4 className="font-body text-white font-semibold text-sm mb-2">
                      9-Dimension Exposure Scoring
                    </h4>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      Evaluates financial exposure, uncapped indemnities, governing jurisdiction, non-solicit duration, intellectual property assignment, data protection terms, termination notice windows, liquidated damages, and dispute arbitration clauses.
                    </p>
                  </div>

                  <div className="border border-white/10 p-5 bg-[#121218]">
                    <h4 className="font-body text-white font-semibold text-sm mb-2">
                      Statutory Baselines
                    </h4>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      Continuous cross-checking against 40+ statutory frameworks, including Delaware Chancery Court commercial precedents, UCC Article 2 warranty baselines, English Common Law, and EU GDPR Article 28 mandatory processor provisions.
                    </p>
                  </div>

                  <div className="border border-white/10 p-5 bg-[#121218]">
                    <h4 className="font-body text-white font-semibold text-sm mb-2">
                      Algorithmic BATNA Calculation
                    </h4>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      Models the Best Alternative to a Negotiated Agreement (BATNA). Generates quantified concession probabilities and synthesizes legally sound compromise language to unlock stalled commercial negotiations.
                    </p>
                  </div>
                </div>

                <div className="border border-white/10 p-5 bg-[#07070B]">
                  <h4 className="font-body text-white font-semibold text-sm mb-3">
                    Under the Hood: Hybrid Intelligence Architecture
                  </h4>
                  <div className="font-mono text-xs text-zinc-200 space-y-1.5 bg-black p-4 border border-white/15">
                    <p className="text-neutral-400"># Document Tokenization &amp; Segment Analysis</p>
                    <p>Input Document → PyMuPDF Vector Text Extraction → Clause Boundary Segmentation</p>
                    <p>Clause Segments → TF-IDF Vectorization → Calibrated Rule + Model Consensus</p>
                    <p>Risk Quantification → 9D Heuristic Matrix → SHA-256 Audit Leaf Generation</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-rule space-y-4">
                <div>
                  <span className="text-micro text-white font-mono uppercase tracking-widest block mb-1">
                    Section 02B • Continuous Portfolio Governance
                  </span>
                  <h3 className="font-display text-2xl text-white font-medium">
                    Continuous Surveillance, Deadlines &amp; Approvals
                  </h3>
                  <p className="text-zinc-300 text-body mt-2">
                    Agreements do not end when signed. Deciva continuously monitors active contractual commitments to prevent balance-sheet surprises, surprise auto-renewals, and compliance breaches.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="border border-white/10 p-5 bg-[#121218] space-y-3">
                    <h4 className="font-body text-white font-semibold text-base">
                      📡 Autonomous Obligation Surveillance
                    </h4>
                    <ul className="space-y-2 text-xs text-zinc-300 list-disc pl-4">
                      <li>
                        <strong className="text-white">Renewal Windows:</strong> Automated countdown tracking for 90/60/30-day opt-out notices.
                      </li>
                      <li>
                        <strong className="text-white">SLA Milestones:</strong> Real-time alerts when deliverables risk non-performance penalties.
                      </li>
                      <li>
                        <strong className="text-white">Operational Drift:</strong> Detects changes in vendor delivery terms against baseline commitments.
                      </li>
                      <li>
                        <strong className="text-white">Audit Trails:</strong> Real-time event bus capturing all lifecycle events.
                      </li>
                    </ul>
                  </div>

                  <div className="border border-white/10 p-5 bg-[#121218] space-y-3">
                    <h4 className="font-body text-white font-semibold text-base">
                      🛡️ Governed Dual-Signatory Controls
                    </h4>
                    <ul className="space-y-2 text-xs text-zinc-300 list-disc pl-4">
                      <li>
                        <strong className="text-white">Separation of Duties:</strong> High-value contract approvals require two authorized signatories.
                      </li>
                      <li>
                        <strong className="text-white">Policy Exception Governance:</strong> Any clause waiver requires documented executive justification.
                      </li>
                      <li>
                        <strong className="text-white">Legal Holds:</strong> Instantly freeze retention timers during ongoing litigation or regulatory inquiries.
                      </li>
                      <li>
                        <strong className="text-white">Certified Exports:</strong> Generate RFC-4180 CSV and JSON-LD tamper-proof manifests.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'TECH_SECURITY' && (
            <div className="space-y-8">
              <div className="space-y-4">
                <div>
                  <span className="text-micro text-white font-mono uppercase tracking-widest block mb-1">
                    Section 03A • Systems &amp; Engineering Specifications
                  </span>
                  <h3 className="font-display text-2xl text-white font-medium">
                    Complete Technology Stack &amp; Backend Architecture
                  </h3>
                  <p className="text-zinc-300 text-body mt-2">
                    Deciva is engineered as an enterprise-grade multi-tier system with strict separation of concerns, transactional integrity, and hardware-level cryptographic controls.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="border border-white/10 p-4 bg-[#121218]">
                    <span className="text-micro font-mono text-white uppercase block mb-1 font-bold">Tier 1: Frontend UI</span>
                    <h4 className="font-body text-white font-semibold text-sm mb-2">React 19 &amp; Vite</h4>
                    <ul className="text-xs text-zinc-300 space-y-1">
                      <li>• TailwindCSS Monochrome System</li>
                      <li>• GSAP &amp; Framer Motion micro-interactions</li>
                      <li>• Lenis smooth momentum scrolling</li>
                      <li>• Accessible WCAG AAA contrast</li>
                    </ul>
                  </div>

                  <div className="border border-white/10 p-4 bg-[#121218]">
                    <span className="text-micro font-mono text-white uppercase block mb-1 font-bold">Tier 2: API Gateway</span>
                    <h4 className="font-body text-white font-semibold text-sm mb-2">Node.js &amp; Express</h4>
                    <ul className="text-xs text-zinc-300 space-y-1">
                      <li>• RESTful API on port 5000</li>
                      <li>• JWT session &amp; MFA TOTP validation</li>
                      <li>• AES-256-GCM encrypted vault service</li>
                      <li>• Rate limiting &amp; threat intelligence</li>
                    </ul>
                  </div>

                  <div className="border border-white/10 p-4 bg-[#121218]">
                    <span className="text-micro font-mono text-white uppercase block mb-1 font-bold">Tier 3: Database</span>
                    <h4 className="font-body text-white font-semibold text-sm mb-2">PostgreSQL (Neon)</h4>
                    <ul className="text-xs text-zinc-300 space-y-1">
                      <li>• 14 production schema migrations</li>
                      <li>• Row-level tenant isolation</li>
                      <li>• Transactional ACID event outbox</li>
                      <li>• Automated point-in-time snapshots</li>
                    </ul>
                  </div>

                  <div className="border border-white/10 p-4 bg-[#121218]">
                    <span className="text-micro font-mono text-white uppercase block mb-1 font-bold">Tier 4: ML Service</span>
                    <h4 className="font-body text-white font-semibold text-sm mb-2">Python &amp; scikit-learn</h4>
                    <ul className="text-xs text-zinc-300 space-y-1">
                      <li>• Flask service on port 5001</li>
                      <li>• PyMuPDF text &amp; layout extraction</li>
                      <li>• TF-IDF + Logistic Regression clause classifier</li>
                      <li>• Zero global model training bleed</li>
                    </ul>
                  </div>
                </div>

                <div className="border border-white/10 p-5 bg-[#07070B]">
                  <h4 className="font-body text-white font-semibold text-sm mb-2">
                    System Data Flow Architecture
                  </h4>
                  <div className="font-mono text-xs text-zinc-200 bg-black p-4 border border-white/15 overflow-x-auto whitespace-pre">
{`Client Browser (React 19)
       ↓ (HTTPS / TLS 1.3 + JWT Bearer)
Node.js Express API Server (:5000)
       ├── Authentication & Zero-Trust Verification (Argon2 / SHA-256)
       ├── AES-256-GCM Contract Encryption Vault
       ├── PostgreSQL Neon Cloud (50 Structured Tables, ACID Outbox)
       └── Internal RPC Dispatch
             ↓ (Isolated Port 5001)
       Python NLP & Analysis Microservice (scikit-learn / PyMuPDF)
             └── 9-Dimension Risk Engine & TF-IDF Clause Classification Pipeline`}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-rule space-y-4">
                <div>
                  <span className="text-micro text-white font-mono uppercase tracking-widest block mb-1">
                    Section 03B • Security, Compliance &amp; Disaster Recovery
                  </span>
                  <h3 className="font-display text-2xl text-white font-medium">
                    Zero-Trust Enclaves, Immutable Audit &amp; Disaster Recovery
                  </h3>
                  <p className="text-zinc-300 text-body mt-2">
                    Deciva is engineered so that no administrator, rogue insider, or external counterparty can alter historical legal records undetected.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="border border-white/10 p-5 bg-[#121218] space-y-2">
                    <h4 className="font-body text-white font-semibold text-sm">
                      ⛓️ Tamper-Evident SHA-256 Audit Ledger
                    </h4>
                    <p className="text-xs text-zinc-300">
                      Every audit record contains the cryptographic hash of the previous block. Changing even one byte of contract text breaks the validation chain across the entire ledger.
                    </p>
                    <p className="text-micro font-mono text-zinc-400 pt-2 border-t border-white/10">
                      Stateless endpoint: GET /api/security/verify-ledger
                    </p>
                  </div>

                  <div className="border border-white/10 p-5 bg-[#121218] space-y-2">
                    <h4 className="font-body text-white font-semibold text-sm">
                      🔐 Zero-Trust Hardware Enclaves
                    </h4>
                    <p className="text-xs text-zinc-300">
                      Customer data is processed exclusively within hardware-encrypted enclaves. Document text is never cached unencrypted or used to train external large language models.
                    </p>
                    <p className="text-micro font-mono text-zinc-400 pt-2 border-t border-white/10">
                      SOC 2 Type II &amp; GDPR Article 28 Compliant
                    </p>
                  </div>

                  <div className="border border-white/10 p-5 bg-[#121218] space-y-2">
                    <h4 className="font-body text-white font-semibold text-sm">
                      💾 Automated Disaster Recovery (DR)
                    </h4>
                    <p className="text-xs text-zinc-300">
                      Automated backup snapshots with SHA-256 payload digests, isolated sandboxed dry-run recovery drills, and strict referential integrity validation before activation.
                    </p>
                    <p className="text-micro font-mono text-zinc-400 pt-2 border-t border-white/10">
                      Tested RPO &lt; 5m • RTO &lt; 15m
                    </p>
                  </div>
                </div>

                <div className="border border-white/10 p-5 bg-[#0C0C12] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-white">
                      Need an Evidentiary Audit Verification Report?
                    </h4>
                    <p className="text-xs text-zinc-300 mt-0.5">
                      Authorized compliance officers can generate cryptographic proofs directly from the Security Center.
                    </p>
                  </div>
                  <a
                    href="#/security"
                    onClick={onClose}
                    className="btn btn-primary btn-sm whitespace-nowrap text-xs"
                  >
                    Go to Security Center →
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-rule bg-[#0C0C12]">
          <div className="flex items-center gap-2 text-micro text-zinc-400 font-mono">
            <span>Press ESC or click outside to dismiss</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-sm text-xs text-zinc-300 hover:text-white"
            >
              Close Manual
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlatformGuideModal;
