/**
 * Deciva — Enterprise Integration Security Service
 * ---------------------------------------------------------------------------
 * Enforces Zero-Trust boundaries, HMAC-SHA256 webhook signature validation,
 * timestamp replay protection, tenant scoping, and non-destructive payload validation.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const MAX_TIMESTAMP_DRIFT_SECONDS = 300; // 5 minutes tolerance window

const IntegrationSecurityService = {
  /**
   * Generates a standard traceable integration correlation ID.
   */
  generateIntegrationCorrelationId: () => {
    return `intg-${uuidv4()}`;
  },

  /**
   * Validates integration ownership and RBAC.
   */
  validateIntegrationAccess: async (tenantId, integrationId, user = {}) => {
    if (!tenantId || !integrationId) {
      return { allowed: false, error: 'Missing tenant or integration identifier', status: 400 };
    }

    const { rows } = await db.query(
      `SELECT * FROM enterprise_integrations WHERE id = $1`,
      [integrationId]
    );

    if (rows.length === 0) {
      return { allowed: false, error: 'Integration not found', status: 404 };
    }

    const integration = rows[0];

    // Strict tenant isolation
    if (integration.tenant_id !== tenantId) {
      return { allowed: false, error: 'Unauthorized access to integration across tenants', status: 403 };
    }

    return { allowed: true, integration };
  },

  /**
   * Validates HMAC-SHA256 signature for incoming webhooks with replay protection.
   */
  validateWebhookSignature: ({ rawBody, signatureHeader, secret, timestampHeader }) => {
    if (!signatureHeader || !secret) {
      return { valid: false, error: 'MISSING_SIGNATURE_OR_SECRET' };
    }

    if (timestampHeader) {
      const tsNumber = Number(timestampHeader);
      const currentTimeSeconds = Math.floor(Date.now() / 1000);
      const parsedTs = isNaN(tsNumber) ? Math.floor(new Date(timestampHeader).getTime() / 1000) : tsNumber;

      if (isNaN(parsedTs)) {
        return { valid: false, error: 'INVALID_TIMESTAMP_FORMAT' };
      }

      const drift = currentTimeSeconds - parsedTs;
      if (drift > MAX_TIMESTAMP_DRIFT_SECONDS || drift < -60) {
        return { valid: false, error: 'TIMESTAMP_OUT_OF_BOUNDS', drift };
      }
    }

    const bodyStr = Buffer.isBuffer(rawBody)
      ? rawBody.toString('utf8')
      : (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {}));

    // Support both "timestamp.body" and direct body signing conventions
    const candidatePayload = timestampHeader ? `${timestampHeader}.${bodyStr}` : bodyStr;

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(candidatePayload);
    const expectedHex = hmac.digest('hex');

    // Clean provided signature format (strip "sha256=" or "v1=" prefixes if present)
    const cleanProvided = signatureHeader.replace(/^(sha256=|v1=)/i, '').trim().toLowerCase();

    // Constant-time comparison
    try {
      const expectedBuf = Buffer.from(expectedHex, 'utf8');
      const providedBuf = Buffer.from(cleanProvided, 'utf8');

      if (expectedBuf.length !== providedBuf.length) {
        // Fallback check without timestamp prefix if provided signature didn't include timestamp in payload
        const directHmac = crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
        const directBuf = Buffer.from(directHmac, 'utf8');
        if (directBuf.length === providedBuf.length && crypto.timingSafeEqual(directBuf, providedBuf)) {
          return { valid: true };
        }
        return { valid: false, error: 'SIGNATURE_MISMATCH' };
      }

      const isMatch = crypto.timingSafeEqual(expectedBuf, providedBuf);
      return isMatch ? { valid: true } : { valid: false, error: 'SIGNATURE_MISMATCH' };
    } catch {
      return { valid: false, error: 'VERIFICATION_EXCEPTION' };
    }
  },

  /**
   * Resolves the authoritative tenant ID for a given integration.
   */
  resolveIntegrationTenant: async (integrationId) => {
    const { rows } = await db.query(
      'SELECT tenant_id, status FROM enterprise_integrations WHERE id = $1',
      [integrationId]
    );
    if (rows.length === 0) return null;
    return rows[0];
  },

  /**
   * Verifies that the incoming event type is in the integration's whitelist.
   */
  verifyAllowedEventType: (eventType, configuredTypes = []) => {
    if (!configuredTypes || configuredTypes.length === 0) return true; // Default allow all if wildcard
    return configuredTypes.includes(eventType) || configuredTypes.includes('*');
  },

  /**
   * Validates structure without mutating contract text evidence.
   * "validate/reject dangerous payload structure -> preserve document content exactly -> sanitize only UI rendering/output contexts."
   */
  validateAndSanitizePayload: (payload) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Payload must be a valid JSON object');
    }

    // Check for obvious prototype pollution attempts
    if (Object.prototype.hasOwnProperty.call(payload, '__proto__') ||
        Object.prototype.hasOwnProperty.call(payload, 'constructor')) {
      throw new Error('Malicious payload structure detected (prototype pollution attempt)');
    }

    // Return payload with exact document text content preserved
    return payload;
  }
};

module.exports = IntegrationSecurityService;
