import React from 'react';
import { useParams, Link } from 'react-router-dom';
import capabilitiesData from '../content/capabilities.json';
import Breadcrumb from '../components/ui/Breadcrumb';
import Button from '../components/ui/Button';

export function CapabilityDetail() {
  const { slug } = useParams();
  const cap = capabilitiesData.find((c) => c.slug === slug) || capabilitiesData[0];

  return (
    <div className="w-full bg-paper py-20 sm:py-28">
      <div className="container-wide">
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Capabilities', href: '/capabilities' },
            { label: cap.name }
          ]}
        />

        <div className="max-w-4xl mb-16 sm:mb-24">
          <span className="font-body text-label text-ink-soft mb-3 block">
            Intelligence Engine
          </span>
          <h1 className="display-02 text-ink tracking-tight mb-6">
            {cap.name}
          </h1>
          <p className="font-body text-body-lg text-ink-soft leading-relaxed max-w-2xl">
            {cap.indexLine}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 sm:gap-16 pt-12 border-t border-rule">
          <div className="lg:col-span-7">
            <h2 className="font-body text-heading-01 text-ink font-semibold mb-6">
              Architecture &amp; Methodology
            </h2>
            <div className="font-body text-body text-ink space-y-6 leading-relaxed max-w-measure">
              <p>{cap.overview}</p>
              <p>
                Engineered with cryptographic immutability at its core, this capability executes zero-knowledge document evaluation. All statutory inferences are paired directly with Delaware Chancery citations, UCC statutory codes, and institutional compliance standards.
              </p>
            </div>
          </div>

          <div className="lg:col-span-5 bg-paper-dim p-8 sm:p-10 border border-rule">
            <h3 className="font-body text-heading-02 text-ink font-semibold mb-6">
              Core Specifications
            </h3>
            <ul className="space-y-4 font-body text-body-sm list-none p-0 m-0">
              {cap.services.map((service, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <span className="font-body text-micro text-neutral-400 pt-0.5 select-none">
                    [0{idx + 1}]
                  </span>
                  <span className="text-ink font-medium">{service}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-24 p-12 sm:p-16 border border-neutral-800 bg-neutral-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-8">
          <div>
            <h3 className="display-03 text-white mb-2">
              Deploy {cap.name}.
            </h3>
            <p className="font-body text-body text-neutral-300 max-w-lg">
              Integrate this capability directly into your corporate contract repository or schedule a private diligence demonstration.
            </p>
          </div>
          <Button href={`/contact?capability=${cap.slug}`} variant="primary">
            Speak with us
          </Button>
        </div>
      </div>
    </div>
  );
}

export default CapabilityDetail;
