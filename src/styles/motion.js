/**
 * Deciva — Centralized Motion Design System
 * -------------------------------------------------------------
 * Minimal, restrained, and intentional motion primitives powered by Motion.
 * Respects prefers-reduced-motion and follows enterprise legal-tech aesthetics.
 */

export const EASE_OUT = [0.16, 1, 0.3, 1];
export const EASE_IN_OUT = [0.65, 0, 0.35, 1];

export const SPRING_FAST = { type: 'spring', stiffness: 450, damping: 32 };
export const SPRING_SUBTLE = { type: 'spring', stiffness: 280, damping: 26 };

export const DURATIONS = {
  instant: 0.12,
  fast: 0.18,
  base: 0.26,
  reveal: 0.42,
  analysis: 0.65
};

export const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATIONS.base,
      ease: EASE_OUT,
      staggerChildren: 0.05,
      delayChildren: 0.02
    }
  },
  exit: {
    opacity: 0,
    transition: { duration: DURATIONS.instant, ease: 'easeOut' }
  }
};

export const staggerContainer = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02
    }
  }
};

export const itemFadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATIONS.base,
      ease: EASE_OUT
    }
  }
};

export const buttonMotion = {
  whileHover: { y: -1, transition: { duration: DURATIONS.instant, ease: EASE_OUT } },
  whileTap: { scale: 0.98, transition: { duration: 0.08 } }
};

export const cardHoverMotion = {
  whileHover: {
    y: -2,
    transition: { duration: DURATIONS.fast, ease: EASE_OUT }
  }
};

export const modalBackdropVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATIONS.fast } },
  exit: { opacity: 0, transition: { duration: DURATIONS.instant } }
};

export const modalDialogVariants = {
  initial: { opacity: 0, y: 12, scale: 0.985 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DURATIONS.base, ease: EASE_OUT }
  },
  exit: {
    opacity: 0,
    y: 8,
    scale: 0.985,
    transition: { duration: DURATIONS.fast, ease: 'easeIn' }
  }
};

export const toastVariants = {
  initial: { opacity: 0, y: 14, scale: 0.96 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DURATIONS.fast, ease: EASE_OUT }
  },
  exit: {
    opacity: 0,
    y: -6,
    scale: 0.96,
    transition: { duration: DURATIONS.instant, ease: 'easeIn' }
  }
};

export const analysisStepVariants = {
  initial: { opacity: 0, y: 10 },
  animate: (custom = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: custom * 0.08,
      duration: DURATIONS.reveal,
      ease: EASE_OUT
    }
  })
};
