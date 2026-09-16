import React from 'react';
import { Link } from 'react-router-dom';

export function Breadcrumb({ items = [], className = '' }) {
  if (!items || items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={`font-body text-body-sm text-ink-soft mb-6 ${className}`}>
      <ol className="flex flex-wrap items-center gap-1.5 list-none p-0 m-0">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={index} className="inline-flex items-center">
              {index > 0 && <span className="mx-2 text-neutral-400 select-none">/</span>}
              {isLast ? (
                <span className="text-ink font-medium" aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.href || '#'}
                  className="editorial-link text-ink-soft hover:text-ink transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumb;
