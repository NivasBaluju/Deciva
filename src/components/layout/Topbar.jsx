import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { IconMenu } from '../ui/Icons';
import { MobileMenu } from './MobileMenu';
import Button from '../ui/Button';
import PlatformGuideModal from '../guide/PlatformGuideModal';

/**
 * Topbar (Navbar)
 * Fixed position, --paper background at 92% with 16px backdrop-blur.
 * Height 88px at rest, shrinking to 64px on scroll (>120px) with bottom --rule hairline.
 *
 * Architecture Specialization:
 * - Sidebar is for USE (Daily operational tools: Dashboard, Portfolio, Documents, Upload, Integrations, Operations).
 * - Topbar is for GUIDE (Interactive 5-Section Platform Guide: How to Use, AI Intelligence, Monitoring, Tech Stack, Security & DR).
 */
export function Topbar() {
  const { user, trust, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [activeGuideSection, setActiveGuideSection] = useState('WORKFLOW');

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 120);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const openGuide = (sectionId) => {
    setActiveGuideSection(sectionId);
    setGuideModalOpen(true);
  };

  const guideSections = [
    { id: 'WORKFLOW', label: 'User Guide', icon: '🧭', badge: 'Guide' },
    { id: 'INTELLIGENCE_GOVERNANCE', label: 'AI & Governance', icon: '🧠', badge: 'Engines' },
    { id: 'TECH_SECURITY', label: 'Stack & Security', icon: '🛡️', badge: 'Zero-Trust' },
  ];

  const publicLinks = [
    { href: '/capabilities', label: 'Capabilities' },
    { href: '/intelligence', label: 'Intelligence' },
    { href: '/trust', label: 'Trust & Security' },
    { href: '/contact', label: 'Contact' },
  ];

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-all duration-fast ease-in-out-quad ${
          scrolled
            ? 'h-16 border-b border-rule'
            : 'h-[88px] border-b border-rule'
        }`}
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)'
        }}
      >
        <nav
          aria-label="Primary"
          className="container-wide h-full flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="font-display text-2xl font-medium tracking-tight text-ink no-underline select-none"
            >
              Deciva
            </Link>
            {user && (
              <span className="hidden xl:inline-block text-micro uppercase tracking-widest text-ink-soft border border-rule px-2 py-0.5">
                Enterprise Portal
              </span>
            )}
          </div>

          {user ? (
            <div className="hidden lg:flex items-center gap-3 xl:gap-5 bg-white/[0.03] border border-rule px-3 py-1.5">
              <span className="font-body text-micro text-ink-soft uppercase tracking-wider font-mono pr-1">
                System Guide:
              </span>
              {guideSections.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => openGuide(sec.id)}
                  className="font-body text-xs text-ink hover:text-white hover:bg-white/10 transition-all px-3 py-1.5 flex items-center gap-2 border border-transparent hover:border-rule"
                >
                  <span className="text-sm">{sec.icon}</span>
                  <span className="font-medium tracking-tight whitespace-nowrap">{sec.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="hidden lg:flex items-center gap-8 xl:gap-10">
              {publicLinks.map((link) => {
                const isActive =
                  location.pathname === link.href ||
                  (link.href !== '/' && location.pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    to={link.href}
                    className="font-body text-label text-ink relative px-2 py-1.5 no-underline group tracking-wide"
                  >
                    {link.label}
                    <span
                      className={`absolute left-0 -bottom-1 h-px w-full bg-ink transition-transform duration-fast origin-left ${
                        isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                      }`}
                    />
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => openGuide('WORKFLOW')}
                className="font-body text-xs text-ink bg-white/5 hover:bg-white/10 border border-rule px-3 py-1 transition-all flex items-center gap-1.5"
              >
                <span>🧭</span>
                <span>System Guide &amp; Tech</span>
              </button>
            </div>
          )}

          <div className="hidden lg:flex items-center gap-6 sm:gap-7">
            {user ? (
              <div className="flex items-center gap-5">
                <span className="font-body text-micro border border-ink/40 px-2.5 py-1 select-none tracking-wider text-ink">
                  ZT Score: {trust ?? 100}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-body text-body-sm text-ink font-medium max-w-[150px] truncate">
                    {user.name || user.email}
                  </span>
                  {user.role === 'admin' && (
                    <span className="font-body text-micro bg-ink text-paper px-1.5 py-0.5 font-bold tracking-wider">
                      ADMIN
                    </span>
                  )}
                </div>
                <div className="h-4 w-px bg-rule" aria-hidden="true" />
                <button
                  type="button"
                  onClick={logout}
                  className="font-body text-label text-ink-soft hover:text-ink hover:bg-white/5 transition-colors px-2 py-1"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <Link
                  to="/login"
                  className="font-body text-label text-ink hover:text-ink-soft relative px-2 py-1 no-underline group"
                >
                  Client Portal
                  <span className="absolute left-0 -bottom-1 h-px w-full bg-ink scale-x-0 origin-left group-hover:scale-x-100 transition-transform duration-fast" />
                </Link>
                <Button href="/contact" variant="primary">
                  Speak with us
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 lg:hidden">
            <button
              type="button"
              onClick={() => openGuide('WORKFLOW')}
              className="p-1.5 text-xs text-ink bg-white/5 border border-rule"
            >
              🧭 Guide
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open mobile menu"
              className="p-2 text-ink hover:text-ink-soft transition-colors"
            >
              <IconMenu className="w-6 h-6" />
            </button>
          </div>
        </nav>
      </header>

      <MobileMenu
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        navLinks={user ? [] : publicLinks}
        user={user}
        onOpenGuide={(secId) => {
          setMobileMenuOpen(false);
          openGuide(secId);
        }}
      />

      <PlatformGuideModal
        isOpen={guideModalOpen}
        initialSection={activeGuideSection}
        onClose={() => setGuideModalOpen(false)}
      />
    </>
  );
}

export default Topbar;
