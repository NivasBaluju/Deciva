/**
 * server/services/productionConfigService.js
 * Components 22 & 23: Configuration Validation & Fingerprinting
 * Single source of truth for startup environment configuration and secret governance.
 * Enforces fail-closed checks in production for critical secrets (JWT_SECRET,
 * ENCRYPTION_KEY / AES_MASTER_KEY, INTERNAL_SERVICE_KEY) without leaking secret values.
 */

const crypto = require('crypto');
const { EnterpriseError, ERROR_CODES } = require('../utils/errorTaxonomy');

const DEFAULT_JWT_SECRET = 'dev_insecure_secret_change_me';
const DEFAULT_ENCRYPTION_KEY = 'deciva-secret-encryption-key-32-bytes!!';
const DEFAULT_INTERNAL_SERVICE_KEY = 'deciva-internal-service-secret-key-default';

const KNOWN_INSECURE_DEFAULTS = new Set([
  DEFAULT_JWT_SECRET,
  DEFAULT_ENCRYPTION_KEY,
  DEFAULT_INTERNAL_SERVICE_KEY
]);

/**
 * Validates the quality of a sensitive secret string.
 * Never leaks the actual secret value in the response or logs.
 */
function inspectSecretQuality(key, val) {
  if (!val || typeof val !== 'string' || !val.trim()) {
    return { valid: false, reason: 'is missing or empty in production' };
  }
  const trimmed = val.trim();
  if (KNOWN_INSECURE_DEFAULTS.has(trimmed)) {
    return { valid: false, reason: 'matches a known default fallback string in production' };
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes('default') || lower.includes('change_me')) {
    return { valid: false, reason: 'contains an insecure placeholder token ("default" or "change_me") in production' };
  }
  if (trimmed.length < 16) {
    return { valid: false, reason: 'has insufficient entropy (minimum 16 characters required in production)' };
  }
  return { valid: true };
}

// Canonical model identifier regex: alphanumeric, dots, hyphens, underscores (e.g. gemini-1.5-flash)
const MODEL_NAME_REGEX = /^[a-zA-Z0-9][-._a-zA-Z0-9]{2,63}$/;

/**
 * Validates a Gemini model name string.
 * Strict syntax validation without magical sanitization.
 */
function validateGeminiModelName(rawModel) {
  if (!rawModel || typeof rawModel !== 'string') {
    return { valid: false, reason: 'model name must be a non-empty string' };
  }
  const trimmed = rawModel.trim();
  if (!MODEL_NAME_REGEX.test(trimmed)) {
    return { valid: false, reason: `model name '${trimmed}' contains invalid characters or has invalid length (allowed: 3-64 chars, alphanumeric, dots, hyphens, underscores)` };
  }
  return { valid: true, model: trimmed };
}

/**
 * Single source of truth for Gemini API Key resolution.
 * Harmonizes across both GEMINI_API_KEY and GOOGLE_API_KEY.
 */
function getGeminiApiKey() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key || typeof key !== 'string' || !key.trim()) {
    return null;
  }
  return key.trim();
}

/**
 * Single source of truth for active Gemini Model target.
 * Resolves GEMINI_MODEL with fallback to canonical 'gemini-1.5-flash'.
 * Strict syntax validation: invalid values fall back to default with a warning (or throw in production if configured).
 */
function getActiveGeminiModel() {
  const envModel = process.env.GEMINI_MODEL;
  if (!envModel || !envModel.trim()) {
    return 'gemini-1.5-flash';
  }
  const check = validateGeminiModelName(envModel);
  if (!check.valid) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(`[SECURITY WARNING] Insecure or invalid GEMINI_MODEL '${envModel}': ${check.reason}. Falling back to default 'gemini-1.5-flash'.`);
    } else {
      console.warn(`[CONFIG WARNING] Invalid GEMINI_MODEL '${envModel}': ${check.reason}. Falling back to 'gemini-1.5-flash'.`);
    }
    return 'gemini-1.5-flash';
  }
  return check.model;
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const INSECURE_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'test.local',
  'change_me.com'
]);

/**
 * Validates and parses the ADMIN_EMAILS environment variable.
 * Does not silently discard invalid entries in production.
 */
function parseAndValidateAdminEmails(rawVal, isProd) {
  if (!rawVal || typeof rawVal !== 'string' || !rawVal.trim()) {
    return { valid: true, emails: [], warnings: [], errors: [] };
  }

  const errors = [];
  const warnings = [];
  const rawParts = rawVal.split(',');
  const parsedSet = new Set();

  for (let i = 0; i < rawParts.length; i++) {
    const originalPart = rawParts[i];
    const trimmed = originalPart.trim();

    if (!trimmed) {
      if (isProd) {
        errors.push(`ADMIN_EMAILS entry at position ${i + 1} is empty (trailing or consecutive commas)`);
      } else {
        warnings.push(`ADMIN_EMAILS entry at position ${i + 1} is empty and ignored`);
      }
      continue;
    }

    const lower = trimmed.toLowerCase();

    // Check for dangerous wildcards or universal keywords
    if (lower === '*' || lower === 'all' || lower === 'any' || lower === 'admin') {
      errors.push(`ADMIN_EMAILS contains forbidden wildcard or universal keyword '${trimmed}'`);
      continue;
    }

    // Check for insecure placeholder domains in production
    const domain = lower.split('@')[1];
    if (isProd && (INSECURE_EMAIL_DOMAINS.has(domain) || lower.includes('change_me') || lower.includes('change-me'))) {
      errors.push(`ADMIN_EMAILS entry '${trimmed}' uses an insecure or placeholder domain in production`);
      continue;
    }

    // Check email syntax
    if (!EMAIL_REGEX.test(lower) || lower.includes(' ') || !lower.includes('@')) {
      errors.push(`ADMIN_EMAILS entry '${trimmed}' is not a valid email address`);
      continue;
    }

    parsedSet.add(lower);
  }

  const emails = Array.from(parsedSet);

  if (isProd && errors.length > 0) {
    return { valid: false, emails: [], warnings, errors };
  }

  return { valid: true, emails, warnings, errors: [] };
}

/**
 * Validates the syntax, presence, and matching cryptographic consistency of RSA signing keys (SEC-05).
 * NEVER leaks private key material, PEM blocks, or secret values in error messages or logs.
 */
function inspectRsaKeyQuality(privKey, pubKey) {
  const hasPriv = Boolean(privKey && typeof privKey === 'string' && privKey.trim());
  const hasPub = Boolean(pubKey && typeof pubKey === 'string' && pubKey.trim());

  if (!hasPriv && !hasPub) {
    return {
      configured: false,
      valid: true,
      reason: 'both RSA keys are missing; fallback to local filesystem or ephemeral keys will occur'
    };
  }

  if (hasPriv !== hasPub) {
    return {
      configured: false,
      valid: false,
      reason: 'incomplete RSA key configuration: both RSA_PRIVATE_KEY and RSA_PUBLIC_KEY must be provided together'
    };
  }

  const normPriv = privKey.replace(/\\n/g, '\n').trim();
  const normPub = pubKey.replace(/\\n/g, '\n').trim();

  // Check for placeholder strings
  const lowerPriv = normPriv.toLowerCase();
  const lowerPub = normPub.toLowerCase();
  if (lowerPriv.includes('change_this') || lowerPub.includes('change_this') ||
      lowerPriv.includes('placeholder') || lowerPub.includes('placeholder') ||
      lowerPriv.includes('default') || lowerPub.includes('default')) {
    return {
      configured: true,
      valid: false,
      reason: 'RSA key contains an insecure placeholder or template string'
    };
  }

  // Check for minimal PEM markers without leaking contents
  if (!normPriv.includes('-----BEGIN') || !normPub.includes('-----BEGIN')) {
    return {
      configured: true,
      valid: false,
      reason: 'RSA key does not contain valid PEM header markers'
    };
  }

  // Cryptographic keypair consistency validation: sign with private key and verify with public key
  try {
    const probe = Buffer.from('deciva-rsa-consistency-probe-' + Date.now(), 'utf8');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(probe);
    signer.end();
    const signature = signer.sign(normPriv, 'base64');

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(probe);
    verifier.end();
    const verified = verifier.verify(normPub, signature, 'base64');

    if (!verified) {
      return {
        configured: true,
        valid: false,
        reason: 'RSA_PRIVATE_KEY and RSA_PUBLIC_KEY do not form a matching cryptographic key pair'
      };
    }
  } catch (err) {
    return {
      configured: true,
      valid: false,
      reason: `failed to parse or verify RSA key pair: ${err.message}`
    };
  }

  return {
    configured: true,
    valid: true,
    privateKey: normPriv,
    publicKey: normPub
  };
}

/**
 * Validates the startup environment configuration.
 * Fails closed immediately in production if required secrets are absent, weak, or defaults.
 * Preserves development defaults with warnings when NODE_ENV !== 'production'.
 */
function validateStartupConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  const errors = [];
  const warnings = [];

  // 1. JWT_SECRET
  const jwtVal = process.env.JWT_SECRET;
  const jwtCheck = inspectSecretQuality('JWT_SECRET', jwtVal);
  if (!jwtCheck.valid) {
    if (isProd) {
      errors.push(`JWT_SECRET ${jwtCheck.reason}`);
    } else {
      warnings.push(`JWT_SECRET ${jwtCheck.reason}; using development fallback`);
    }
  }

  // 2. ENCRYPTION_KEY / AES_MASTER_KEY
  const encVal = process.env.ENCRYPTION_KEY || process.env.AES_MASTER_KEY;
  const encKeyName = process.env.ENCRYPTION_KEY ? 'ENCRYPTION_KEY' : (process.env.AES_MASTER_KEY ? 'AES_MASTER_KEY' : 'ENCRYPTION_KEY');
  const encCheck = inspectSecretQuality(encKeyName, encVal);
  if (!encCheck.valid) {
    if (isProd) {
      errors.push(`${encKeyName} ${encCheck.reason}`);
    } else {
      warnings.push(`${encKeyName} ${encCheck.reason}; using development fallback`);
    }
  }

  // 3. INTERNAL_SERVICE_KEY
  const internalVal = process.env.INTERNAL_SERVICE_KEY;
  const internalCheck = inspectSecretQuality('INTERNAL_SERVICE_KEY', internalVal);
  if (!internalCheck.valid) {
    if (isProd) {
      errors.push(`INTERNAL_SERVICE_KEY ${internalCheck.reason}`);
    } else {
      warnings.push(`INTERNAL_SERVICE_KEY ${internalCheck.reason}; using development fallback`);
    }
  }

  // 4. ADMIN_EMAILS (if configured)
  const adminRaw = process.env.ADMIN_EMAILS;
  if (adminRaw && adminRaw.trim()) {
    const adminCheck = parseAndValidateAdminEmails(adminRaw, isProd);
    if (!adminCheck.valid) {
      errors.push(...adminCheck.errors);
    }
    if (adminCheck.warnings.length > 0) {
      warnings.push(...adminCheck.warnings);
    }
  } else if (isProd) {
    warnings.push('ADMIN_EMAILS is not configured; initial bootstrap provisioning is disabled (database-authoritative)');
  }

  // 5. RSA Signing Keys (SEC-05)
  const rsaPriv = process.env.RSA_PRIVATE_KEY;
  const rsaPub = process.env.RSA_PUBLIC_KEY;
  const rsaCheck = inspectRsaKeyQuality(rsaPriv, rsaPub);

  if (rsaCheck.configured && !rsaCheck.valid) {
    if (isProd) {
      errors.push(`RSA Signing Key Error: ${rsaCheck.reason}`);
    } else {
      warnings.push(`RSA Signing Key Error: ${rsaCheck.reason}; using local filesystem or ephemeral fallback`);
    }
  } else if (!rsaCheck.configured) {
    if (isProd) {
      warnings.push('RSA_PRIVATE_KEY / RSA_PUBLIC_KEY are not configured in production; contract signatures will rely on local filesystem or ephemeral keys and will fail verification across clustered instances.');
    } else {
      warnings.push('RSA_PRIVATE_KEY / RSA_PUBLIC_KEY are not configured; using local filesystem or ephemeral signing keys.');
    }
  }

  if (isProd && errors.length > 0) {
    const diagnostics = errors.map(e => `[FATAL] ${e}`).join('\n');
    console.error(`\n❌ CRITICAL PRODUCTION SECURITY ERROR:\n${diagnostics}\n`);
    throw new EnterpriseError(
      ERROR_CODES.VALIDATION_ERROR,
      `Production startup blocked due to insecure configuration:\n${diagnostics}`
    );
  }

  if (!isProd && warnings.length > 0) {
    warnings.forEach(w => console.warn(`[SECURITY WARNING] ${w}`));
  }

  return {
    isValid: errors.length === 0,
    valid: errors.length === 0,
    errors,
    warnings,
    is_production: isProd
  };
}

/**
 * Accessor for JWT_SECRET adhering to single-source-of-truth governance.
 */
function getJwtSecret() {
  const isProd = process.env.NODE_ENV === 'production';
  const val = process.env.JWT_SECRET;
  if (isProd) {
    const check = inspectSecretQuality('JWT_SECRET', val);
    if (!check.valid) {
      throw new EnterpriseError(ERROR_CODES.AUTHENTICATION_ERROR, `[FATAL] JWT_SECRET ${check.reason}.`);
    }
    return val.trim();
  }
  return (val && val.trim()) || DEFAULT_JWT_SECRET;
}

/**
 * Accessor for Master AES Encryption Key adhering to single-source-of-truth governance.
 */
function getEncryptionKey() {
  const isProd = process.env.NODE_ENV === 'production';
  const rawKey = process.env.ENCRYPTION_KEY || process.env.AES_MASTER_KEY;
  const keyName = process.env.ENCRYPTION_KEY ? 'ENCRYPTION_KEY' : 'AES_MASTER_KEY';
  if (isProd) {
    const check = inspectSecretQuality(keyName, rawKey);
    if (!check.valid) {
      throw new EnterpriseError(ERROR_CODES.AUTHENTICATION_ERROR, `[FATAL] ${keyName} ${check.reason}.`);
    }
    return rawKey.trim();
  }
  if (!rawKey || rawKey === DEFAULT_ENCRYPTION_KEY) {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET !== DEFAULT_JWT_SECRET) {
      return crypto.createHmac('sha256', 'deciva-encryption-salt-v1').update(process.env.JWT_SECRET).digest('hex');
    }
    return DEFAULT_ENCRYPTION_KEY;
  }
  return rawKey.trim();
}

/**
 * Accessor for INTERNAL_SERVICE_KEY adhering to single-source-of-truth governance.
 */
function getInternalServiceKey() {
  const isProd = process.env.NODE_ENV === 'production';
  const val = process.env.INTERNAL_SERVICE_KEY;
  if (isProd) {
    const check = inspectSecretQuality('INTERNAL_SERVICE_KEY', val);
    if (!check.valid) {
      throw new EnterpriseError(ERROR_CODES.AUTHENTICATION_ERROR, `[FATAL] INTERNAL_SERVICE_KEY ${check.reason}.`);
    }
    return val.trim();
  }
  return (val && val.trim()) || DEFAULT_INTERNAL_SERVICE_KEY;
}

/**
 * Generates an immutable, non-sensitive configuration fingerprint.
 * Allows operators to audit which configuration was active without revealing secrets.
 */
function getConfigurationFingerprint() {
  const safeConfig = {
    application_version: '1.0.0-phase15.enterprise',
    schema_version: '20260905_013',
    node_version: process.version,
    platform: process.platform,
    env: process.env.NODE_ENV || 'development',
    ai_model: getActiveGeminiModel(),
    rpo_target_minutes: process.env.RPO_TARGET_MINUTES || '60',
    rto_target_minutes: process.env.RTO_TARGET_MINUTES || '30',
    backup_retention_days: process.env.BACKUP_RETENTION_DAYS || '30'
  };

  const serialized = JSON.stringify(safeConfig);
  const hash = crypto.createHash('sha256').update(serialized).digest('hex');

  return {
    ...safeConfig,
    configuration_hash: hash,
    fingerprint: hash
  };
}

/**
 * Returns just the SHA-256 configuration fingerprint string.
 */
function getConfigFingerprint() {
  const config = getConfigurationFingerprint();
  return config.configuration_hash;
}

/**
 * Accessor for validated ADMIN_EMAILS list adhering to single-source-of-truth governance.
 */
function getAdminEmails() {
  const isProd = process.env.NODE_ENV === 'production';
  const rawVal = process.env.ADMIN_EMAILS;
  const result = parseAndValidateAdminEmails(rawVal, isProd);
  if (!result.valid) {
    throw new EnterpriseError(
      ERROR_CODES.VALIDATION_ERROR,
      `[FATAL] Insecure or malformed ADMIN_EMAILS configuration:\n${result.errors.map(e => `[FATAL] ${e}`).join('\n')}`
    );
  }
  return result.emails;
}

module.exports = {
  DEFAULT_JWT_SECRET,
  DEFAULT_ENCRYPTION_KEY,
  DEFAULT_INTERNAL_SERVICE_KEY,
  validateStartupConfig,
  validateStartupConfiguration: validateStartupConfig,
  getJwtSecret,
  getEncryptionKey,
  getInternalServiceKey,
  getConfigurationFingerprint,
  getConfigFingerprint,
  parseAndValidateAdminEmails,
  getAdminEmails,
  validateGeminiModelName,
  getGeminiApiKey,
  getActiveGeminiModel,
  inspectRsaKeyQuality
};
