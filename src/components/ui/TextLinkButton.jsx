import React from 'react';
import { Link } from 'react-router-dom';
import { IconArrow } from './Icons';

export function TextLinkButton({
  href,
  children,
  className = '',
  showArrow = true,
  ...props
}) {
  return (
    <Link
      to={href}
      className={`group inline-flex items-center gap-2 font-body text-label text-ink relative py-1 ${className}`}
      {...props}
    >
      <span className="relative">
        {children}
        <span className="absolute left-0 -bottom-1 h-px w-full bg-ink scale-x-0 origin-left group-hover:scale-x-100 transition-transform duration-fast ease-in-out-quad" />
      </span>
      {showArrow && (
        <span className="transform group-hover:translate-x-1 transition-transform duration-fast">
          <IconArrow direction="right" className="w-4 h-4" />
        </span>
      )}
    </Link>
  );
}

export default TextLinkButton;
