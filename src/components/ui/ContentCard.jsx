import React from 'react';
import { Link } from 'react-router-dom';

export function ContentCard({
  href,
  title,
  subtitle,
  meta,
  badge,
  className = '',
  ...props
}) {
  const CardContent = (
    <div className={`group block ${className}`} {...props}>
      {badge && (
        <span className="inline-block font-body text-micro text-ink-soft mb-2 tracking-wider uppercase">
          {badge}
        </span>
      )}
      <h3 className="font-body font-semibold text-heading-01 text-ink group-hover:underline underline-offset-4 decoration-1 transition-colors">
        {title}
      </h3>
      {subtitle && (
        <p className="font-body text-body-sm text-ink-soft mt-2 leading-relaxed">
          {subtitle}
        </p>
      )}
      {meta && (
        <p className="font-body text-micro text-ink-soft mt-3">
          {meta}
        </p>
      )}
      <div className="mt-4 h-px bg-rule group-hover:h-[2px] group-hover:bg-ink transition-all duration-fast" />
    </div>
  );

  if (href) {
    return (
      <Link to={href} className="block no-underline">
        {CardContent}
      </Link>
    );
  }

  return CardContent;
}

export default ContentCard;
