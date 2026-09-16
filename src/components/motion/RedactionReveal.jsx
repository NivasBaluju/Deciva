import React, { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useReducedMotion } from './useReducedMotion';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export function RedactionReveal({
  children,
  triggerOnScroll = true,
  className = '',
  barColor = 'var(--redact)',
  delay = 0
}) {
  const wrapRef = useRef(null);
  const barRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!wrapRef.current || !barRef.current) return;

    if (reduced) {
      gsap.set(barRef.current, { scaleX: 0 });
      return;
    }

    gsap.set(barRef.current, { scaleX: 1, transformOrigin: 'right' });

    const anim = () => {
      gsap.to(barRef.current, {
        scaleX: 0,
        duration: 0.7,
        delay: delay,
        ease: 'cubic-bezier(0.83, 0, 0.17, 1)',
        onStart: () => {
          if (barRef.current) barRef.current.style.willChange = 'transform';
        },
        onComplete: () => {
          if (barRef.current) {
            barRef.current.style.willChange = 'auto';
            barRef.current.style.display = 'none';
          }
        }
      });
    };

    let triggerInstance = null;
    if (triggerOnScroll) {
      triggerInstance = ScrollTrigger.create({
        trigger: wrapRef.current,
        start: 'top 80%',
        once: true,
        onEnter: anim,
      });
    } else {
      anim();
    }

    return () => {
      if (triggerInstance) triggerInstance.kill();
    };
  }, [reduced, triggerOnScroll, delay]);

  return (
    <span
      ref={wrapRef}
      className={`relative inline-block ${className}`}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      {children}
      <span
        ref={barRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: barColor,
          transformOrigin: 'right',
          zIndex: 10,
        }}
      />
    </span>
  );
}

export default RedactionReveal;
