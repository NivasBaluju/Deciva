import React from 'react';
import { Link } from 'react-router-dom';

export function TextLink({
  href,
  children,
  className = '',
  external = false,
  ...props
}) {
  const classes = `editorial-link font-body text-body text-ink transition-all duration-fast ${className}`;

  if (external || (href && href.startsWith('http'))) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
        {...props}
      >
        {children}
      </a>
    );
  }

  return (
    <Link to={href} className={classes} {...props}>
      {children}
    </Link>
  );
}

export default TextLink;
