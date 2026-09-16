import React from 'react';
import trustData from '../content/trust.json';
import Breadcrumb from '../components/ui/Breadcrumb';
import StatBlock from '../components/ui/StatBlock';
import RedactionReveal from '../components/motion/RedactionReveal';

export function Trust() {
  return (
    <div className="w-full bg-paper py-20 sm:py-28">
      <div className="container-wide">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Trust & Security' }]} />

        <div className="max-w-4xl mb-20 sm:mb-28">
          <h1 className="display-02 text-ink tracking-tight mb-6">
            {trustData.heading}
          </h1>
          <p className="font-body text-body-lg text-ink-soft leading-relaxed max-w-3xl">
            {trustData.lede}
          </p>
        </div>

        <div className="pt-16 border-t border-rule mb-24 sm:mb-32">
          <div className="max-w-2xl mb-12">
            <span className="font-body text-label text-ink-soft mb-2 block">
              Methodology
            </span>
            <h2 className="display-03 text-ink tracking-tight">
              How the platform operates
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
            {trustData.methodology.map((m) => (
              <div key={m.step} className="border-t-2 border-ink pt-6">
                <span className="font-display text-4xl font-medium text-neutral-400 block mb-3">
                  {m.step}
                </span>
                <h3 className="font-body text-heading-01 text-ink font-semibold mb-3">
                  {m.title}
                </h3>
                <p className="font-body text-body-sm text-ink-soft leading-relaxed">
                  {m.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section
        className="section-ink py-24 sm:py-36 my-16 border-y border-neutral-800"
        style={{
          backgroundColor: '#0A0A0A',
          color: '#FAF9F6'
        }}
      >
        <div className="container-wide">
          <div className="max-w-3xl">
            <span className="font-body text-label text-neutral-400 mb-4 block">
              Institutional Standard
            </span>
            <div className="mb-4">
              <RedactionReveal barColor="#0A0A0A">
                <h3 className="display-02 text-white font-medium leading-tight">
                  We eliminate contractual liabilities before execution.
                </h3>
              </RedactionReveal>
            </div>
            <p className="font-body text-body text-ink-soft mt-6 leading-relaxed">
              Every analysis produced by Deciva is backed by verifiable statutory references, preserving non-repudiation and evidential authority in commercial dispute environments.
            </p>
          </div>
        </div>
      </section>

      <div className="container-wide py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 pt-8 border-t border-rule">
          {trustData.stats.map((st, i) => (
            <StatBlock
              key={i}
              value={st.value}
              label={st.label}
              sublabel={st.sublabel}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default Trust;
