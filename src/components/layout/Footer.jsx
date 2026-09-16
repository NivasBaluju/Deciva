import React from 'react';
import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer
      className="bg-[#0A0A0A] text-[#FAF9F6] mt-auto border-t border-neutral-800"
      role="contentinfo"
    >
      <div className="container-wide py-16 sm:py-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 sm:gap-8 pb-16 border-b border-neutral-800">
          <div>
            <h4 className="font-body text-heading-02 text-white font-semibold mb-4">
              Architecture &amp; Trust
            </h4>
            <div className="space-y-3 font-body text-body-sm text-neutral-400">
              <div className="border-l border-neutral-700 pl-3">
                <p className="text-white font-medium">Zero-Trust Enclaves</p>
                <p className="text-neutral-400 text-micro">Hardware-isolated multi-tenant security</p>
              </div>
              <div className="border-l border-neutral-700 pl-3">
                <p className="text-white font-medium">Cryptographic Ledger</p>
                <p className="text-neutral-400 text-micro">SHA-256 hash-chain non-repudiation</p>
              </div>
              <div className="border-l border-neutral-700 pl-3">
                <p className="text-white font-medium">Statutory Compliance</p>
                <p className="text-neutral-400 text-micro">SOC 2 Type II, GDPR Art 28, UCC baselines</p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-body text-heading-02 text-white font-semibold mb-4">
              Capabilities
            </h4>
            <ul className="space-y-3 font-body text-body-sm list-none p-0 m-0">
              <li>
                <Link to="/capabilities/contract-diligence" className="text-neutral-400 hover:text-white transition-colors no-underline">
                  Contract Diligence & Examination
                </Link>
              </li>
              <li>
                <Link to="/capabilities/risk-radar" className="text-neutral-400 hover:text-white transition-colors no-underline">
                  Autonomous Risk Radar
                </Link>
              </li>
              <li>
                <Link to="/capabilities/autonomous-negotiation" className="text-neutral-400 hover:text-white transition-colors no-underline">
                  Bilateral Negotiation Workbench
                </Link>
              </li>
              <li>
                <Link to="/capabilities/portfolio-governance" className="text-neutral-400 hover:text-white transition-colors no-underline">
                  Portfolio Health & Governance
                </Link>
              </li>
              <li>
                <Link to="/capabilities/compliance-audit" className="text-neutral-400 hover:text-white transition-colors no-underline">
                  Cryptographic Audit Ledger
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-body text-heading-02 text-white font-semibold mb-4">
              Platform &amp; Trust
            </h4>
            <ul className="space-y-3 font-body text-body-sm list-none p-0 m-0">
              <li>
                <Link to="/trust" className="text-neutral-400 hover:text-white transition-colors no-underline">
                  Zero-Trust Architecture
                </Link>
              </li>
              <li>
                <Link to="/intelligence" className="text-neutral-400 hover:text-white transition-colors no-underline">
                  Legal Engineering Research
                </Link>
              </li>
              <li>
                <Link to="/security" className="text-neutral-400 hover:text-white transition-colors no-underline">
                  Audit Ledger Verification
                </Link>
              </li>
              <li>
                <Link to="/trust" className="text-neutral-400 hover:text-white transition-colors no-underline">
                  SOC 2 Type II Compliance
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-body text-heading-02 text-white font-semibold mb-4">
              Connect
            </h4>
            <div className="space-y-4 font-body text-body-sm text-neutral-400">
              <p>
                Enterprise counsel and executive inquiries:
                <br />
                <span className="text-white font-medium">briefings@deciva.ai</span>
              </p>
              <div>
                <Link
                  to="/contact"
                  className="editorial-link text-white hover:text-neutral-300"
                >
                  Schedule Executive Briefing →
                </Link>
              </div>
              <div className="pt-2">
                <Link
                  to="/login"
                  className="editorial-link text-neutral-400 hover:text-white"
                >
                  Client Portal Access
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-body text-micro text-neutral-500">
          <p className="m-0">
            © 2026 Deciva. Precision legal intelligence and zero-trust contract governance.
          </p>

          <div className="flex items-center gap-4">
            <Link to="/privacy" className="text-neutral-500 hover:text-neutral-300 no-underline">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-neutral-500 hover:text-neutral-300 no-underline">
              Terms of Use
            </Link>
            <Link to="/accessibility" className="text-neutral-500 hover:text-neutral-300 no-underline">
              Accessibility Statement
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
