import React, { useState, useEffect, useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { EASE_OUT, cardHoverMotion } from '../../styles/motion';

export const MetricCard = ({ icon, iconCls = 'metric-icon-blue', value, label, badgeCls, badgeText, hint }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-20px' });
  const shouldReduceMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(typeof value === 'number' ? 0 : value);

  useEffect(() => {
    if (typeof value !== 'number' || shouldReduceMotion) {
      setDisplayValue(value);
      return;
    }

    if (isInView) {
      const duration = 500;
      const start = 0;
      const end = value;
      const startTime = performance.now();

      const animateCount = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const current = Math.round(start + (end - start) * (1 - Math.pow(1 - progress, 3)));
        setDisplayValue(current);

        if (progress < 1) {
          requestAnimationFrame(animateCount);
        }
      };

      requestAnimationFrame(animateCount);
    }
  }, [isInView, value, shouldReduceMotion]);

  return (
    <motion.div
      ref={ref}
      className="card"
      {...cardHoverMotion}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE_OUT }}
    >
      <div className="metric-row">
        <div className={`metric-icon-wrap ${iconCls}`}>{icon}</div>
        <div>
          <div className="metric-value">{displayValue}</div>
          <div className="metric-label">{label}</div>
          {badgeCls && (
            <div className="mt-8">
              <span className={`badge ${badgeCls}`} style={{ fontSize: '10.5px' }}>
                {badgeText || label}
              </span>
            </div>
          )}
          {hint && <p className="text-lo small mt-4">{hint}</p>}
        </div>
      </div>
    </motion.div>
  );
};

export default MetricCard;
