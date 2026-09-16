import React from 'react';
import Button from '../components/ui/Button';

export function NotFound() {
  return (
    <div
      className="min-h-[85vh] flex items-center justify-center section-ink py-24 text-center px-6"
      style={{
        backgroundColor: '#0A0A0A',
        color: '#FAF9F6'
      }}
    >
      <div className="container-text flex flex-col items-center">
        <span className="font-body text-micro text-neutral-400 mb-4 select-none uppercase tracking-wider">
          Page Not Found
        </span>

        <h1 className="display-02 text-white tracking-tight mb-6">
          This page has been redacted.
        </h1>

        <p className="font-body text-body-lg text-ink-soft mb-10 max-w-md mx-auto">
          The document, specification, or route you are looking for does not exist, or has been archived by administrative policy.
        </p>

        <Button href="/" variant="primary">
          Return home
        </Button>
      </div>
    </div>
  );
}

export default NotFound;
