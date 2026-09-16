import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IconClose } from '../ui/Icons';
import { useReducedMotion } from '../motion/useReducedMotion';

export function MobileMenu({ isOpen, onClose, navLinks = [], user = null, onOpenGuide = () => {} }) {
  const panelRef = useRef(null);
  const location = useLocation();
  const reduced = useReducedMotion();

  useEffect(() => {
    onClose();
  }, [location.pathname]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      if (panelRef.current) {
        panelRef.current.focus();
      }
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Navigation Menu"
      className="fixed inset-0 z-50 flex flex-col justify-between bg-[#0A0A0A] text-[#FAF9F6] p-6 sm:p-10 outline-none overflow-y-auto"
    >
      <div className="flex items-center justify-between border-b border-neutral-800 pb-6">
        <Link
          to="/"
          className="font-display text-2xl font-medium tracking-tight text-white no-underline"
          onClick={onClose}
        >
          Deciva
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="btn-circle w-12 h-12 flex items-center justify-center border border-neutral-700 hover:border-white transition-colors duration-fast text-white"
          style={{ borderRadius: '50%' }}
        >
          <IconClose className="w-5 h-5 text-white" />
        </button>
      </div>

      <nav aria-label="Mobile Navigation" className="my-auto py-6">
        <div className="mb-6 pb-6 border-b border-neutral-800">
          <span className="text-micro font-mono uppercase tracking-widest text-neutral-400 block mb-3">
            System Guide &amp; Architecture
          </span>
          <div className="grid grid-cols-1 gap-2">
            {[
              { id: 'WORKFLOW', label: 'User Guide & Workflows', icon: '🧭' },
              { id: 'INTELLIGENCE_GOVERNANCE', label: 'AI Intelligence & Governance', icon: '🧠' },
              { id: 'TECH_SECURITY', label: 'System Stack & Zero-Trust Security', icon: '🛡️' }
            ].map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => onOpenGuide(sec.id)}
                className="text-left py-2 px-3 bg-white/5 hover:bg-white/10 border border-neutral-800 text-white text-sm flex items-center gap-2"
              >
                <span>{sec.icon}</span>
                <span>{sec.label}</span>
              </button>
            ))}
          </div>
        </div>

        <ul className="list-none p-0 m-0 space-y-4">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  to={link.href}
                  onClick={onClose}
                  className={`font-display text-2xl block no-underline transition-all duration-fast ${
                    isActive ? 'text-white font-semibold' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}

          {user ? (
            <li>
              <Link
                to="/dashboard"
                onClick={onClose}
                className="font-display text-2xl block text-white no-underline mt-2 pt-3 border-t border-neutral-800"
              >
                Executive Cockpit →
              </Link>
            </li>
          ) : (
            <li>
              <Link
                to="/login"
                onClick={onClose}
                className="font-display text-2xl block text-neutral-400 hover:text-white no-underline mt-2 pt-3 border-t border-neutral-800"
              >
                Client Portal Sign In →
              </Link>
            </li>
          )}
        </ul>
      </nav>

      <div className="border-t border-neutral-800 pt-6">
        <p className="font-body text-body-sm text-neutral-400">
          Executive Inquiries &amp; Zero-Trust Counsel
        </p>
        <p className="font-body text-heading-02 text-white font-medium mt-1">
          briefings@deciva.ai
        </p>
        <p className="font-body text-micro text-neutral-400 mt-2">
          Hardware Enclave Processing • SHA-256 Audit Non-Repudiation
        </p>
      </div>
    </div>
  );
}

export default MobileMenu;
