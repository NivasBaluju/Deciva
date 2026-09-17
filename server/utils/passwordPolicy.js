/**
 * server/utils/passwordPolicy.js
 * Enterprise Password Governance & Cryptographic Hashing Specification
 *
 * Requirements:
 *  - Minimum length: 8 characters
 *  - Maximum length: 128 characters
 *  - Rejects empty and whitespace-only passwords
 *  - Avoids accidental trimming that corrupts legitimate passwords
 *  - Uses bcrypt with cost factor 10 (compatible with existing Deciva architecture)
 *  - Timing-attack resistant verification with constant-time dummy comparisons
 *  - Never logs or exposes plaintext passwords in responses or errors
 */

'use strict';

const bcrypt = require('bcryptjs');

const BCRYPT_COST_FACTOR = 10;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

// Pre-computed bcrypt hash of a random token used to equalize timing when an account is not found
const DUMMY_HASH = '$2a$10$1h9s5bB9vOQ7bEeq0qPjYe8q1zE0oA7gN4g0mF1sF7kK0dC4kF7kK';

/**
 * Validates a plaintext password against the Deciva password policy.
 * @param {string} password - The candidate plaintext password.
 * @param {string|null} [confirmPassword=null] - Optional confirmation password for registration.
 * @returns {{ valid: boolean, reason?: string }}
 */
function validatePassword(password, confirmPassword = null) {
  if (password === undefined || password === null) {
    return { valid: false, reason: 'Password is required' };
  }

  if (typeof password !== 'string') {
    return { valid: false, reason: 'Password must be a string' };
  }

  if (password.length === 0) {
    return { valid: false, reason: 'Password cannot be empty' };
  }

  if (password.trim().length === 0) {
    return { valid: false, reason: 'Password cannot consist solely of whitespace characters' };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`
    };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      valid: false,
      reason: `Password cannot exceed ${MAX_PASSWORD_LENGTH} characters`
    };
  }

  if (confirmPassword !== null) {
    if (confirmPassword === undefined || confirmPassword === null) {
      return { valid: false, reason: 'Password confirmation is required' };
    }
    if (password !== confirmPassword) {
      return { valid: false, reason: 'Passwords do not match' };
    }
  }

  return { valid: true };
}

/**
 * Hashes a plaintext password using bcrypt with standard cost factor 10.
 * @param {string} password 
 * @returns {Promise<string>} Salted bcrypt hash
 */
async function hashPassword(password) {
  const check = validatePassword(password);
  if (!check.valid) {
    throw new Error(check.reason);
  }
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

/**
 * Verifies a candidate password against a stored bcrypt hash.
 * @param {string} password 
 * @param {string} hash 
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, hash) {
  if (!password || !hash || typeof password !== 'string' || typeof hash !== 'string') {
    return false;
  }
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * Performs a constant-time dummy verification when user is not found to prevent timing side channels.
 * @param {string} password 
 * @returns {Promise<boolean>} Always false
 */
async function verifyDummyPassword(password) {
  try {
    await bcrypt.compare(String(password || ''), DUMMY_HASH);
  } catch {}
  return false;
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  BCRYPT_COST_FACTOR,
  validatePassword,
  hashPassword,
  verifyPassword,
  verifyDummyPassword
};
