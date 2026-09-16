import React from 'react';
import { RedactionReveal } from '../motion/RedactionReveal';

export function StatBlock({
  value,
  label,
  sublabel,
  redact = false,
  className = '',
  isInverted = false
}) {
  const valueColor = isInverted ? 'text-paper' : 'text-ink';
  const labelColor = isInverted ? 'text-neutral-400' : 'text-ink-soft';

  const StatContent = (
    <span className={`font-display text-4xl sm:text-5xl lg:text-6xl font-medium tracking-tight ${valueColor} block leading-none`}>
      {value}
    </span>
  );

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="mb-2">
        {redact ? (
          <RedactionReveal
            barColor={isInverted ? 'var(--paper)' : 'var(--redact)'}
          >
            {StatContent}
          </RedactionReveal>
        ) : (
          StatContent
        )}
      </div>
      <p className={`font-body text-body-sm font-medium ${labelColor} leading-tight`}>
        {label}
      </p>
      {sublabel && (
        <p className="font-body text-micro text-neutral-500 mt-1">
          {sublabel}
        </p>
      )}
    </div>
  );
}

export default StatBlock;
