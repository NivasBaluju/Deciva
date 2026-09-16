import React from 'react';

export function IconMenu({ className = 'w-5 h-5', strokeWidth = 1.5 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className} aria-hidden="true">
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
    </svg>
  );
}

export function IconClose({ className = 'w-5 h-5', strokeWidth = 1.5 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className} aria-hidden="true">
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  );
}

export function IconChevron({ direction = 'down', className = 'w-4 h-4', strokeWidth = 1.5 }) {
  const rotation = {
    down: 'rotate-0',
    up: 'rotate-180',
    right: '-rotate-90',
    left: 'rotate-90'
  }[direction] || 'rotate-0';

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={`${className} transform ${rotation} transition-transform duration-base`} aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function IconArrow({ direction = 'right', className = 'w-4 h-4', strokeWidth = 1.5 }) {
  const rotation = {
    right: 'rotate-0',
    left: 'rotate-180',
    up: '-rotate-90',
    down: 'rotate-90'
  }[direction] || 'rotate-0';

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={`${className} transform ${rotation}`} aria-hidden="true">
      <line x1="4" y1="12" x2="20" y2="12" />
      <polyline points="14 6 20 12 14 18" />
    </svg>
  );
}

export function IconPlus({ className = 'w-4 h-4', strokeWidth = 1.5 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className} aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function IconMinus({ className = 'w-4 h-4', strokeWidth = 1.5 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className} aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function IconExclamation({ className = 'w-4 h-4', strokeWidth = 1.5 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export function IconCheckmark({ className = 'w-4 h-4', strokeWidth = 1.5 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="8 12 11 15 16 9" />
    </svg>
  );
}

export default {
  Menu: IconMenu,
  Close: IconClose,
  Chevron: IconChevron,
  Arrow: IconArrow,
  Plus: IconPlus,
  Minus: IconMinus,
  Exclamation: IconExclamation,
  Checkmark: IconCheckmark
};
