import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import insightsData from '../content/insights.json';
import Breadcrumb from '../components/ui/Breadcrumb';

export function Insights() {
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Security & Governance', 'Contract Diligence', 'Decision Intelligence'];

  const filtered = selectedCategory === 'All'
    ? insightsData
    : insightsData.filter((item) => item.category === selectedCategory);

  return (
    <div className="w-full bg-paper py-20 sm:py-28">
      <div className="container-wide">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Intelligence' }]} />

        <div className="max-w-3xl mb-16 sm:mb-20">
          <h1 className="display-02 text-ink tracking-tight mb-6">
            Intelligence
          </h1>
          <p className="font-body text-body-lg text-ink-soft leading-relaxed">
            Technical research and architectural specifications from the Deciva systems engineering team — covering zero-trust cryptography, continuous risk quantification, and autonomous negotiation mechanics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-16 pb-8 border-b border-rule">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`font-body text-label px-4 py-2 border transition-all duration-fast ${
                selectedCategory === cat
                  ? 'bg-ink text-paper border-ink font-semibold'
                  : 'bg-transparent text-ink border-rule hover:border-ink'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="space-y-0">
          {filtered.map((item) => (
            <Link
              key={item.slug}
              to={`/intelligence/${item.slug}`}
              className="group block py-10 sm:py-14 border-b border-rule no-underline transition-colors hover:bg-paper-dim px-2"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 items-baseline">
                <div className="lg:col-span-3 font-body text-body-sm text-neutral-500">
                  <span className="block font-medium text-ink-soft mb-1">{item.category}</span>
                  <span>{item.date} • {item.readTime}</span>
                </div>
                <div className="lg:col-span-6">
                  <h2 className="font-body font-semibold text-heading-01 text-ink group-hover:underline underline-offset-4 decoration-1 mb-2">
                    {item.title}
                  </h2>
                  <p className="font-body text-body-sm text-ink-soft leading-relaxed">
                    {item.dek}
                  </p>
                </div>
                <div className="lg:col-span-3 lg:text-right font-body text-micro text-neutral-400">
                  {item.author}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Insights;
