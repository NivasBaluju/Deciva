import React from 'react';

export function PullQuote({
  quote,
  attribution,
  subattribution,
  className = '',
  isInverted = false
}) {
  const ruleColor = isInverted ? 'bg-paper' : 'bg-ink';
  const textColor = isInverted ? 'text-paper' : 'text-ink';
  const softColor = isInverted ? 'text-neutral-400' : 'text-ink-soft';

  return (
    <figure className={`relative pl-6 sm:pl-8 my-10 ${className}`}>
      <div
        className={`absolute left-0 top-1 bottom-1 w-1 ${ruleColor}`}
        aria-hidden="true"
      />
      <blockquote className={`display-04 ${textColor} leading-snug tracking-tight mb-4`}>
        “{quote}”
      </blockquote>
      {(attribution || subattribution) && (
        <figcaption className="font-body text-body-sm">
          {attribution && (
            <span className={`font-medium ${textColor} block`}>
              {attribution}
            </span>
          )}
          {subattribution && (
            <span className={`${softColor} block mt-0.5 whitespace-pre-line`}>
              {subattribution}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}

export default PullQuote;
