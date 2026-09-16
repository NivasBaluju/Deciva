import React, { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { useReducedMotion } from './useReducedMotion';

export function HeroEntrance({ headline, subheadline, children }) {
  const containerRef = useRef(null);
  const barRef = useRef(null);
  const subRef = useRef(null);
  const ctaRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!containerRef.current) return;

    if (reduced) {
      if (barRef.current) barRef.current.style.display = 'none';
      if (subRef.current) {
        subRef.current.style.opacity = '1';
        subRef.current.style.transform = 'none';
      }
      if (ctaRef.current) {
        ctaRef.current.style.opacity = '1';
        ctaRef.current.style.transform = 'none';
      }
      return;
    }

    const tl = gsap.timeline({ defaults: { ease: 'cubic-bezier(0.16, 1, 0.3, 1)' } });

    gsap.set(barRef.current, { scaleX: 1, transformOrigin: 'right' });
    gsap.set(subRef.current, { opacity: 0, y: 8 });
    gsap.set(ctaRef.current, { opacity: 0, y: 4 });

    tl.to(barRef.current, {
      scaleX: 0,
      duration: 0.7,
      ease: 'cubic-bezier(0.83, 0, 0.17, 1)',
      delay: 0.2,
      onComplete: () => {
        if (barRef.current) barRef.current.style.display = 'none';
      }
    }, 'lift')
    .to(subRef.current, {
      opacity: 1,
      y: 0,
      duration: 0.4,
      ease: 'cubic-bezier(0.16, 1, 0.3, 1)'
    }, 0.9)
    .to(ctaRef.current, {
      opacity: 1,
      y: 0,
      duration: 0.24,
      ease: 'cubic-bezier(0.16, 1, 0.3, 1)'
    }, 1.1);

    return () => {
      tl.kill();
    };
  }, [reduced]);

  return (
    <div ref={containerRef} className="w-full">
      <h1 className="display-01 text-white relative inline-block mb-6 max-w-4xl tracking-tight" style={{ color: '#FFFFFF' }}>
        <span className="relative inline-block">
          {headline}
          <span
            ref={barRef}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: '#000000',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              transformOrigin: 'right',
              zIndex: 20,
              pointerEvents: 'none'
            }}
          />
        </span>
      </h1>

      <p
        ref={subRef}
        className="body-lg measure-body mb-8 text-neutral-200"
        style={{ maxWidth: '36rem', color: '#E4E4E7' }}
      >
        {subheadline}
      </p>

      <div ref={ctaRef} className="flex flex-wrap items-center gap-4">
        {children}
      </div>
    </div>
  );
}

export default HeroEntrance;
