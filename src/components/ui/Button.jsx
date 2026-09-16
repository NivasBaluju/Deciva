import React, { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { ThinkingOrb } from 'thinking-orbs';

export const Button = forwardRef(({
  variant = 'primary',
  href,
  onClick,
  children,
  className = '',
  loading = false,
  disabled = false,
  type = 'button',
  ...props
}, ref) => {
  const base = 'inline-flex items-center justify-center font-body text-label px-6 py-4 transition-all duration-fast ease-in-out-quad border text-center select-none cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

  const variants = {
    primary: 'bg-ink text-paper border-ink hover:bg-paper hover:text-ink focus-visible:outline-ink',
    ghost: 'bg-transparent text-ink border-ink hover:border-b-2 hover:border-t-2 hover:border-l-2 hover:border-r-2 focus-visible:outline-ink',
    'ghost-light': 'bg-transparent text-white border-white/50 hover:bg-white hover:text-black hover:border-white focus-visible:outline-white'
  };

  const classes = `${base} ${variants[variant] || variants.primary} ${disabled || loading ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''} ${className}`;

  const content = (
    <>
      {loading && (
        <span className="mr-3 inline-flex items-center" aria-hidden="true">
          <ThinkingOrb state="working" size={20} />
        </span>
      )}
      {children}
    </>
  );

  if (href && !disabled) {
    if (href.startsWith('http') || href.startsWith('mailto:')) {
      return (
        <a ref={ref} href={href} className={classes} {...props}>
          {content}
        </a>
      );
    }
    return (
      <Link ref={ref} to={href} className={classes} {...props}>
        {content}
      </Link>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={classes}
      {...props}
    >
      {content}
    </button>
  );
});

Button.displayName = 'Button';
export default Button;
