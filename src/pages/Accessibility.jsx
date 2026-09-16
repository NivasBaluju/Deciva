import React from 'react';
import Breadcrumb from '../components/ui/Breadcrumb';

export function Accessibility() {
  return (
    <div className="w-full bg-paper py-20 sm:py-28">
      <div className="container-text">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Accessibility Statement' }]} />

        <h1 className="display-02 text-ink tracking-tight mb-4">
          Accessibility Statement
        </h1>
        <p className="font-body text-body-sm text-ink-soft mb-12 pb-6 border-b border-rule">
          Commitment to WCAG 2.1 Level AA/AAA Digital Standards
        </p>

        <div className="font-body text-body text-ink space-y-8 leading-relaxed">
          <section>
            <h2 className="font-body text-heading-01 font-semibold text-ink mb-3">
              1. Color Contrast &amp; Palette Discipline
            </h2>
            <p className="measure-body">
              Deciva is built upon an 8-color high-contrast monochrome palette. The primary text pair (Ink #0A0A0A on Paper #FAF9F6) achieves an 18.2:1 contrast ratio, surpassing WCAG AAA requirements. Color is never used as the sole conveyor of information or system state.
            </p>
          </section>

          <section>
            <h2 className="font-body text-heading-01 font-semibold text-ink mb-3">
              2. Reduced Motion Standards
            </h2>
            <p className="measure-body">
              The entire platform respects the operating system's <code>prefers-reduced-motion: reduce</code> setting. When enabled, all orchestrated GSAP timelines, redaction bar wipes, and smooth scrolling inertia are disabled immediately in favor of instantaneous, non-animated state transitions.
            </p>
          </section>

          <section>
            <h2 className="font-body text-heading-01 font-semibold text-ink mb-3">
              3. Keyboard Navigation &amp; Focus Rings
            </h2>
            <p className="measure-body">
              Every interactive element—including navigation links, filter buttons, underline inputs, and modal controls—is fully operable using a keyboard alone. Interactive elements display an unobstructed 2px solid focus ring with a 2px offset.
            </p>
          </section>

          <section>
            <h2 className="font-body text-heading-01 font-semibold text-ink mb-3">
              4. Screen Reader Compatibility &amp; ARIA Live Regions
            </h2>
            <p className="measure-body">
              Decorative motion layers (such as the signature redaction bar) are marked with <code>aria-hidden="true"</code>, ensuring assistive technology reads the underlying textual content immediately. Dynamic state changes—such as form confirmations and threshold verification steps—are announced via <code>aria-live="polite"</code> regions.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default Accessibility;
