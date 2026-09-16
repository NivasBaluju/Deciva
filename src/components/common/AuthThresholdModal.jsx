import React, { useState, useEffect } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { IconCheckmark } from '../ui/Icons';
import { useReducedMotion } from '../motion/useReducedMotion';

export function AuthThresholdModal({
  isOpen = false,
  status = 'validating',
  email = '',
  onComplete
}) {
  const [internalStep, setInternalStep] = useState(1);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!isOpen) {
      setInternalStep(1);
      return;
    }

    if (reduced) {
      if (status === 'confirmed' || status === 'initializing') {
        const timer = setTimeout(() => {
          if (onComplete) onComplete();
        }, 150);
        return () => clearTimeout(timer);
      }
    }

    if (status === 'confirmed') {
      setInternalStep(2);
      const timer = setTimeout(() => {
        setInternalStep(3);
        const completeTimer = setTimeout(() => {
          if (onComplete) onComplete();
        }, 500);
        return () => clearTimeout(completeTimer);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen, status, reduced, onComplete]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Security Threshold Verification"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0A0A] text-[#FAF9F6]"
    >
      <div className="max-w-md w-full px-8 py-12 text-center flex flex-col items-center">
        <div className="mb-8 relative flex items-center justify-center w-24 h-24">
          {internalStep < 2 ? (
            <ThinkingOrb state="working" size={64} />
          ) : internalStep === 2 ? (
            <div className="w-16 h-16 border border-white flex items-center justify-center animate-fade-in">
              <IconCheckmark className="w-8 h-8 text-white" strokeWidth={2} />
            </div>
          ) : (
            <ThinkingOrb state="solving" size={64} />
          )}
        </div>

        <h3 className="font-display text-2xl font-medium tracking-tight mb-2 text-white">
          {internalStep === 1 && 'Verifying Authentication Pass...'}
          {internalStep === 2 && 'Identity Confirmed'}
          {internalStep >= 3 && 'Initializing Secure Workspace...'}
        </h3>

        <p className="font-body text-body-sm text-neutral-400">
          {internalStep === 1 && (email ? `Validating session token for ${email}` : 'Communicating with Zero-Trust auth gateway')}
          {internalStep === 2 && 'Cryptographic credential verified against session ledger'}
          {internalStep >= 3 && 'Loading contract portfolio and governance cockpit'}
        </p>

        <div className="w-48 h-px bg-neutral-800 mt-8 relative overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-white transition-all duration-base ease-out-expo"
            style={{
              width: internalStep === 1 ? '30%' : internalStep === 2 ? '70%' : '100%'
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default AuthThresholdModal;
