import React from 'react';
import Breadcrumb from '../components/ui/Breadcrumb';

export function Privacy() {
  return (
    <div className="w-full bg-paper py-20 sm:py-28">
      <div className="container-text">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Privacy Policy' }]} />

        <h1 className="display-02 text-ink tracking-tight mb-4">
          Privacy Policy
        </h1>
        <p className="font-body text-body-sm text-ink-soft mb-12 pb-6 border-b border-rule">
          Last updated: September 2025 • Deciva Governance Standard v2.4
        </p>

        <div className="font-body text-body text-ink space-y-8 leading-relaxed">
          <section>
            <h2 className="font-body text-heading-01 font-semibold text-ink mb-3">
              1. Zero-Knowledge Document Ingestion
            </h2>
            <p className="measure-body">
              Deciva operates under a strict zero-knowledge architecture. Uploaded master agreements, exhibits, and non-disclosure documentation are analyzed in ephemeral, hardware-isolated memory chambers. Customer contract data is never used to train, fine-tune, or calibrate public AI models.
            </p>
          </section>

          <section>
            <h2 className="font-body text-heading-01 font-semibold text-ink mb-3">
              2. Cryptographic Digest &amp; Data Anchoring
            </h2>
            <p className="measure-body">
              Upon file ingestion, an unalterable SHA-256 digest is generated immediately on the local client. This digest serves as the immutable root for all downstream risk calculations, redline simulations, and compliance evidence packages.
            </p>
          </section>

          <section>
            <h2 className="font-body text-heading-01 font-semibold text-ink mb-3">
              3. Data Retention &amp; Destruction Protocols
            </h2>
            <p className="measure-body">
              Contract files and analytical manifests are retained solely for the duration authorized by your enterprise subscription tier. Upon user-initiated deletion or contract archival, all associated clause vectors and temporary parsing artifacts are cryptographically scrubbed from primary storage.
            </p>
          </section>

          <section>
            <h2 className="font-body text-heading-01 font-semibold text-ink mb-3">
              4. Institutional Information Requests
            </h2>
            <p className="measure-body">
              We do not disclose customer contract intelligence to third parties or regulatory authorities except where strictly compelled by valid court order issued by a court of competent jurisdiction, with prior written notice provided to enterprise counsel wherever legally permissible.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default Privacy;
