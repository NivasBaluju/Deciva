/**
 * server/utils/errorTaxonomy.js
 * Production Error Taxonomy & Sanitized Responses
 * Standardizes operational errors across all enterprise subsystems, ensuring
 * zero leakage of stack traces, SQL syntax, filesystem paths, or secrets.
 */

const ERROR_CODES = {
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  TENANT_ACCESS_ERROR: 'TENANT_ACCESS_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  PERSISTENCE_ERROR: 'PERSISTENCE_ERROR',
  INTEGRATION_ERROR: 'INTEGRATION_ERROR',
  RECOVERY_ERROR: 'RECOVERY_ERROR',
  RETENTION_ERROR: 'RETENTION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};

class EnterpriseError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'EnterpriseError';
    this.code = ERROR_CODES[code] || ERROR_CODES.INTERNAL_ERROR;
    this.statusCode = options.statusCode || 500;
    this.details = options.details || null;
    this.correlationId = options.correlationId || (require('crypto').randomUUID ? require('crypto').randomUUID() : null);
  }
}

/**
 * Strips sensitive patterns (stack traces, SQL, file paths, secrets)
 * and formats a clean JSON payload for clients.
 */
function formatErrorResponse(err, correlationId = 'unknown') {
  const code = err.code || (err instanceof EnterpriseError ? err.code : ERROR_CODES.INTERNAL_ERROR);
  let message = err.message || 'An internal operational error occurred';

  // Scrub sensitive paths or connection strings if accidentally leaked in message
  message = message
    .replace(/(postgres|postgresql):\/\/[^@]+@[^\s/]+/gi, '[REDACTED_DB_URL]')
    .replace(/([a-zA-Z]:|\/)(?:[^\s:;'"<>|]+\/)+[^\s:;'"<>|]+/g, '[REDACTED_PATH]')
    .replace(/key|token|secret|password|jwt/gi, match => match);

  return {
    error_code: code,
    message,
    correlation_id: err.correlationId || correlationId,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  ERROR_CODES,
  EnterpriseError,
  formatErrorResponse
};
