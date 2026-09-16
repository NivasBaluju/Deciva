import React from 'react';
import Breadcrumb from '../components/ui/Breadcrumb';

export function Terms() {
  return (
    <div className="w-full bg-paper py-20 sm:py-28">
      <div className="container-text">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Terms of Use' }]} />

        <h1 className="display-02 text-ink tracking-tight mb-4">
          Terms of Use
        </h1>
        <p className="font-body text-body-sm text-ink-soft mb-12 pb-6 border-b border-rule">
          Last updated: September 2025 • Deciva Operating Agreement
        </p>

        <div className="font-body text-body text-ink space-y-8 leading-relaxed">
          <section>
            <h2 className="font-body text-heading-01 font-semibold text-ink mb-3">
              1. Scope of Intelligence &amp; Legal Warranty
            </h2>
            <p className="measure-body">
              Deciva is an advanced algorithmic contract examination and risk detection instrument designed to assist licensed legal counsel and enterprise compliance executives. The platform's analysis, redline suggestions, and scenario probabilities do not constitute formal legal advice or substitute for human legal judgment.
            </p>
          </section>

          <section>
            <h2 className="font-body text-heading-01 font-semibold text-ink mb-3">
              2. Authentication &amp; Hardware Key Authorization
            </h2>
            <p className="measure-body">
              Enterprise users must maintain the integrity of their multi-factor credentials. Any mutation or batch operation executed using an authorized administrative credential is permanently attributed to that account within the immutable audit ledger.
            </p>
          </section>

          <section>
            <h2 className="font-body text-heading-01 font-semibold text-ink mb-3">
              3. Governed Batch Operations &amp; Dual Signatures
            </h2>
            <p className="measure-body">
              High-value bulk actions requiring secondary administrative authorization cannot be executed unilaterally. Users acknowledge that strict-mode batch operations abort with zero mutations if any single agreement in the batch violates eligibility constraints.
            </p>
          </section>

          <section>
            <h2 className="font-body text-heading-01 font-semibold text-ink mb-3">
              4. Governing Law &amp; Arbitration
            </h2>
            <p className="measure-body">
              These terms shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law principles. Any dispute arising out of or relating to these terms shall be settled by binding commercial arbitration in Wilmington, Delaware.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default Terms;
