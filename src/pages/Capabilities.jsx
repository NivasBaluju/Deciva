import React from 'react';
import { Link } from 'react-router-dom';
import capabilitiesData from '../content/capabilities.json';
import Breadcrumb from '../components/ui/Breadcrumb';

export function Capabilities() {
  return (
    <div className="w-full bg-paper py-20 sm:py-28">
      <div className="container-wide">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Capabilities' }]} />

        <div className="max-w-3xl mb-20 sm:mb-28">
          <h1 className="display-02 text-ink tracking-tight mb-6">
            Capabilities
          </h1>
          <p className="font-body text-body-lg text-ink-soft leading-relaxed">
            Six proprietary intelligence engines, each engineered to automate high-stakes legal examination, risk mitigation, and continuous portfolio governance.
          </p>
        </div>

        <div className="border-t border-rule">
          {capabilitiesData.map((cap, index) => (
            <Link
              key={cap.slug}
              to={`/capabilities/${cap.slug}`}
              className="group block py-12 sm:py-16 border-b border-rule no-underline transition-colors hover:bg-paper-dim"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
                <div className="lg:col-span-1 font-body text-micro text-neutral-400 pt-1">
                  0{index + 1}
                </div>
                <div className="lg:col-span-5">
                  <h2 className="display-03 text-ink group-hover:underline underline-offset-4 decoration-1">
                    {cap.name}
                  </h2>
                </div>
                <div className="lg:col-span-6">
                  <p className="font-body text-body text-ink-soft leading-relaxed">
                    {cap.indexLine}
                  </p>
                  <span className="inline-flex items-center gap-2 font-body text-label text-ink mt-4 font-medium">
                    Inspect engine specifications →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Capabilities;
