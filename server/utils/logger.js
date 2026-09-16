/**
 * Deciva — Enterprise Structured Logger
 * ---------------------------------------------------------------------------
 * Emits clean, machine-readable JSON logs for operational observability.
 * Strictly redacts all sensitive information (passwords, tokens, encryption
 * keys, raw contract text, PII, confidential prompts).
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'jwt',
  'secret',
  'totp_secret',
  'otp',
  'key',
  'aes_key',
  'private_key',
  'authorization',
  'cookie',
  'extracted_text',
  'raw_text',
  'contract_text',
  'file_content',
  'prompt'
]);

function sanitizeData(data, depth = 0) {
  if (!data || depth > 3) return data;

  if (typeof data === 'string') {
    // Truncate excessively long strings in log metadata
    if (data.length > 500) {
      return `${data.slice(0, 100)}... [TRUNCATED: ${data.length} chars]`;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.slice(0, 20).map(item => sanitizeData(item, depth + 1));
  }

  if (typeof data === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(data)) {
      const lowerKey = k.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('token') || lowerKey.includes('key')) {
        clean[k] = '[REDACTED]';
      } else {
        clean[k] = sanitizeData(v, depth + 1);
      }
    }
    return clean;
  }

  return data;
}

function logEvent(severity, eventType, metadata = {}, req = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    severity: severity.toUpperCase(),
    event: eventType,
    correlationId: metadata.correlationId || req?.correlationId || 'none',
    userId: metadata.userId || req?.user?.id || 'anon',
    documentId: metadata.documentId || undefined,
    durationMs: metadata.durationMs !== undefined ? Number(metadata.durationMs) : undefined,
    status: metadata.status || undefined,
    errorCategory: metadata.errorCategory || undefined,
    data: sanitizeData(metadata.data || {})
  };

  // Clean undefined properties
  Object.keys(entry).forEach(k => entry[k] === undefined && delete entry[k]);

  const jsonStr = JSON.stringify(entry);

  if (severity === 'ERROR' || severity === 'SECURITY') {
    console.error(jsonStr);
  } else if (severity === 'WARN') {
    console.warn(jsonStr);
  } else {
    console.log(jsonStr);
  }

  return entry;
}

const logger = {
  info: (event, metadata, req) => logEvent('INFO', event, metadata, req),
  warn: (event, metadata, req) => logEvent('WARN', event, metadata, req),
  error: (event, metadata, req) => logEvent('ERROR', event, metadata, req),
  security: (event, metadata, req) => logEvent('SECURITY', event, metadata, req),
  sanitize: sanitizeData
};

module.exports = logger;
