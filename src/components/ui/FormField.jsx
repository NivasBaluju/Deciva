import React from 'react';
import { IconExclamation } from './Icons';

export function FormField({
  id,
  label,
  type = 'text',
  required = false,
  error = '',
  helper = '',
  className = '',
  rows = 4,
  as = 'input',
  ...props
}) {
  const isTextarea = as === 'textarea';

  return (
    <div className={`mb-6 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block font-body text-label text-ink-soft mb-2 select-none"
        >
          {label}
          {required && <span className="text-ink ml-1">*</span>}
        </label>
      )}

      {isTextarea ? (
        <textarea
          id={id}
          rows={rows}
          required={required}
          aria-describedby={error ? `${id}-error` : helper ? `${id}-helper` : undefined}
          aria-invalid={!!error}
          className="w-full bg-paper-dim border-0 border-b border-rule focus:border-b-2 focus:border-ink px-4 py-3 font-body text-body text-ink outline-none transition-colors duration-instant resize-y"
          {...props}
        />
      ) : (
        <input
          id={id}
          type={type}
          required={required}
          aria-describedby={error ? `${id}-error` : helper ? `${id}-helper` : undefined}
          aria-invalid={!!error}
          className="w-full bg-paper-dim border-0 border-b border-rule focus:border-b-2 focus:border-ink px-4 py-3 font-body text-body text-ink outline-none transition-colors duration-instant"
          {...props}
        />
      )}

      {helper && !error && (
        <p id={`${id}-helper`} className="mt-2 font-body text-body-sm text-neutral-500">
          {helper}
        </p>
      )}

      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-2 font-body text-body-sm text-ink flex items-center gap-2"
        >
          <IconExclamation className="w-4 h-4 text-ink flex-shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export default FormField;
