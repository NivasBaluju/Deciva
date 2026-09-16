import React from 'react';
import { ThinkingOrb } from 'thinking-orbs';

/**
 * Normalizes size to valid thinking-orbs presets (20 or 64).
 */
function getOrbPresetSize(rawSize) {
  const num = Number(rawSize);
  if (!num || num <= 32) return 20;
  return 64;
}

/**
 * Safe wrapper around ThinkingOrb to guarantee zero fatal React crashes.
 */
function SafeOrb({ state = 'working', size = 64 }) {
  const presetSize = getOrbPresetSize(size);
  const validStates = [
    'working', 'searching', 'solving', 'listening',
    'connecting', 'weaving', 'composing', 'breathing', 'shaping'
  ];
  const safeState = validStates.includes(state) ? state : 'working';

  try {
    return <ThinkingOrb state={safeState} size={presetSize} />;
  } catch (err) {
    console.warn('[ThinkingLoader] ThinkingOrb render fallback:', err);
    return (
      <div
        className="inline-block border-2 border-ink border-t-transparent rounded-full animate-spin"
        style={{ width: `${presetSize}px`, height: `${presetSize}px` }}
      />
    );
  }
}

export function ThinkingLoader({
  state = 'working',
  size = 64,
  caption = '',
  subcaption = '',
  inline = false,
  className = ''
}) {
  if (inline) {
    return (
      <span
        role="status"
        aria-live="polite"
        className={`inline-flex items-center gap-3 ${className}`}
      >
        <SafeOrb state={state} size={size || 20} />
        {caption && (
          <span className="font-body text-body-sm text-ink font-medium">
            {caption}
          </span>
        )}
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center py-12 px-6 text-center ${className}`}
    >
      <div className="flex items-center justify-center mb-4">
        <SafeOrb state={state} size={size} />
      </div>
      {caption && (
        <h4 className="font-body text-heading-02 text-ink font-semibold tracking-tight">
          {caption}
        </h4>
      )}
      {subcaption && (
        <p className="font-body text-body-sm text-neutral-600 mt-1 max-w-md">
          {subcaption}
        </p>
      )}
    </div>
  );
}

export default ThinkingLoader;
