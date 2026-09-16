import React from 'react';
import { useParams, Link } from 'react-router-dom';
import insightsData from '../content/insights.json';
import Breadcrumb from '../components/ui/Breadcrumb';
import PullQuote from '../components/ui/PullQuote';

export function InsightDetail() {
  const { slug } = useParams();
  const article = insightsData.find((a) => a.slug === slug) || insightsData[0];
  const related = insightsData.filter((a) => a.slug !== article.slug).slice(0, 2);

  return (
    <article className="w-full bg-paper py-20 sm:py-28">
      <div className="container-wide">
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Intelligence', href: '/intelligence' },
            { label: article.title }
          ]}
        />

        <header className="max-w-4xl mb-16 sm:mb-20 pb-12 border-b border-rule">
          <span className="font-body text-label text-ink-soft mb-3 block">
            {article.category}
          </span>
          <h1 className="display-02 text-ink tracking-tight mb-6 leading-tight">
            {article.title}
          </h1>
          <p className="font-body text-body-lg text-ink-soft leading-relaxed mb-8 max-w-2xl">
            {article.dek}
          </p>
          <div className="font-body text-body-sm text-neutral-500 flex items-center gap-4">
            <span className="text-ink font-medium">{article.author}</span>
            <span>•</span>
            <span>{article.date}</span>
            <span>•</span>
            <span>{article.readTime}</span>
          </div>
        </header>

        <div className="container-text px-0">
          <div className="font-body text-body text-ink space-y-6 leading-relaxed">
            {article.content.map((p, idx) => (
              <p key={idx} className="measure-body">
                {p}
              </p>
            ))}

            <PullQuote
              quote={article.content[1] || article.dek}
              attribution={article.author}
              subattribution="Deciva Systems Architecture & Research"
            />

            <p className="measure-body">
              Enterprise legal and operations teams can leverage these capabilities directly within the Deciva authenticated workspace or configure custom automated continuous surveillance pipelines.
            </p>
          </div>

          <div className="mt-16 pt-10 border-t border-rule flex items-start gap-6">
            <div className="w-14 h-14 bg-paper-dim border border-rule flex items-center justify-center font-display text-xl text-ink select-none flex-shrink-0">
              {article.author.charAt(0)}
            </div>
            <div>
              <h3 className="font-body text-heading-02 text-ink font-semibold">
                {article.author}
              </h3>
              <p className="font-body text-body-sm text-ink-soft mt-1 max-w-md leading-relaxed">
                Conducts core systems engineering, applied zero-trust cryptography, and algorithmic contract intelligence for the Deciva enterprise platform.
              </p>
            </div>
          </div>

          <div className="mt-20 pt-12 border-t border-rule">
            <h3 className="display-03 text-ink mb-8">
              Related intelligence
            </h3>
            <div className="space-y-6">
              {related.map((rel) => (
                <Link
                  key={rel.slug}
                  to={`/intelligence/${rel.slug}`}
                  className="block p-6 bg-paper-dim border border-rule no-underline group hover:border-ink transition-colors"
                >
                  <span className="font-body text-micro text-neutral-500 block mb-1">
                    {rel.category} • {rel.date}
                  </span>
                  <h4 className="font-body text-heading-01 text-ink group-hover:underline underline-offset-4 decoration-1 font-semibold">
                    {rel.title}
                  </h4>
                  <p className="font-body text-body-sm text-ink-soft mt-2">
                    {rel.dek}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default InsightDetail;
