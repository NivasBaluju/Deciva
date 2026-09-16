/**
 * server/services/adminProvisioningService.js
 * Phase 2 Task 6 (F7): Controlled Admin Role Governance & Invariant Enforcement
 * 
 * Invariants:
 *  1. ADMIN_EMAILS is strictly cold-start bootstrap configuration. Never auto-elevates on login.
 *  2. Database role (users.role) is authoritative.
 *  3. Last-admin protection: cannot demote the last remaining administrator.
 *  4. Anti-self-demotion: an administrator cannot demote their own account.
 *  5. Demoting an administrator immediately revokes their active sessions.
 *  6. All role transitions are immutably logged to the cryptographic audit ledger.
 */

'use strict';

const { EnterpriseError, ERROR_CODES } = require('../utils/errorTaxonomy');
const { getAdminEmails } = require('./productionConfigService');
const { recordAudit } = require('../utils/audit');

const ALLOWED_ROLES = Object.freeze([
  'admin',
  'legal_counsel',
  'compliance_officer',
  'auditor',
  'user'
]);

/**
 * Executes a cold-start bootstrap of configured administrators.
 * ONLY elevates an existing user if exactly zero administrators currently exist in PostgreSQL.
 * If configured emails do not exist in the database, does NOT create accounts.
 * Safe under multi-instance concurrency via PostgreSQL transaction advisory lock.
 */
async function bootstrapInitialAdmin(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Advisory lock 763018 serializes concurrent server bootstrap attempts
    await client.query('SELECT pg_advisory_xact_lock(763018)');

    const { rows: countRows } = await client.query("SELECT count(*) AS count FROM users WHERE role = 'admin'");
    const currentAdminCount = Number(countRows[0].count);

    if (currentAdminCount > 0) {
      await client.query('COMMIT');
      return {
        bootstrapped: false,
        reason: 'ADMINS_ALREADY_EXIST',
        adminCount: currentAdminCount
      };
    }

    const configuredEmails = getAdminEmails();
    if (!configuredEmails || configuredEmails.length === 0) {
      await client.query('COMMIT');
      return {
        bootstrapped: false,
        reason: 'NO_ADMIN_EMAILS_CONFIGURED'
      };
    }

    // Query for existing registered users matching any of the configured admin emails
    const { rows: matchingUsers } = await client.query(
      'SELECT id, name, email, role FROM users WHERE LOWER(email) = ANY($1::text[]) ORDER BY created_at ASC',
      [configuredEmails]
    );

    if (matchingUsers.length === 0) {
      await client.query('COMMIT');
      return {
        bootstrapped: false,
        reason: 'CONFIGURED_USERS_NOT_FOUND',
        configuredEmails
      };
    }

    // Elevate the matching existing user(s) to 'admin'
    const provisioned = [];
    for (const u of matchingUsers) {
      if (u.role !== 'admin') {
        await client.query("UPDATE users SET role = 'admin' WHERE id = $1", [u.id]);
        provisioned.push({ id: u.id, email: u.email, previousRole: u.role });
      }
    }

    await client.query('COMMIT');

    // Record immutable audit blocks in cryptographic audit ledger
    for (const p of provisioned) {
      await recordAudit(p.id, 'ADMIN_BOOTSTRAPPED', {
        email: p.email,
        previousRole: p.previousRole,
        newRole: 'admin',
        source: 'ADMIN_EMAILS_COLD_START'
      });
    }

    return {
      bootstrapped: true,
      provisionedUsers: provisioned
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Explicitly updates a user's role with full anti-lockout and transactional integrity.
 * 
 * @param {object} pool - PostgreSQL pool or client
 * @param {string} targetUserId - User ID being modified
 * @param {string} newRole - Target role to assign
 * @param {object} adminUser - Authenticated admin caller ({ id, email, role })
 * @param {string} reason - Justification for role change
 */
async function provisionUserRole(pool, targetUserId, newRole, adminUser, reason) {
  if (!adminUser || adminUser.role !== 'admin') {
    throw new EnterpriseError(
      ERROR_CODES.AUTHORIZATION_ERROR,
      'Access denied: Administrator privileges required.',
      { statusCode: 403 }
    );
  }

  if (!newRole || !ALLOWED_ROLES.includes(newRole)) {
    throw new EnterpriseError(
      ERROR_CODES.VALIDATION_ERROR,
      `Invalid target role '${newRole}'. Allowed roles: ${ALLOWED_ROLES.join(', ')}`,
      { statusCode: 400 }
    );
  }

  if (!targetUserId || typeof targetUserId !== 'string') {
    throw new EnterpriseError(
      ERROR_CODES.VALIDATION_ERROR,
      'targetUserId is required.',
      { statusCode: 400 }
    );
  }

  // Anti-self-demotion: an admin cannot demote their own account
  if (adminUser.id === targetUserId && newRole !== 'admin') {
    throw new EnterpriseError(
      ERROR_CODES.AUTHORIZATION_ERROR,
      'Access denied: Cannot revoke your own administrator privileges (anti-lockout invariant).',
      { statusCode: 403 }
    );
  }

  const client = await pool.connect();
  let targetUser;
  let previousRole;

  try {
    await client.query('BEGIN');

    // Lock the target user row
    const { rows: targetRows } = await client.query(
      'SELECT id, name, email, role FROM users WHERE id = $1 FOR UPDATE',
      [targetUserId]
    );

    if (targetRows.length === 0) {
      throw new EnterpriseError(
        ERROR_CODES.VALIDATION_ERROR,
        'Target user not found.',
        { statusCode: 404 }
      );
    }

    targetUser = targetRows[0];
    previousRole = targetUser.role;

    // If target is currently an admin and being demoted, lock and verify admin count
    if (previousRole === 'admin' && newRole !== 'admin') {
      const { rows: countRows } = await client.query(
        "SELECT count(*) AS count FROM users WHERE role = 'admin'"
      );
      const adminCount = Number(countRows[0].count);

      if (adminCount <= 1) {
        throw new EnterpriseError(
          ERROR_CODES.AUTHORIZATION_ERROR,
          'Access denied: Cannot demote the last remaining administrator (zero-admin lockout prevention).',
          { statusCode: 403 }
        );
      }
    }

    // Apply role update
    await client.query('UPDATE users SET role = $1 WHERE id = $2', [newRole, targetUserId]);

    // If demoting from admin, immediately revoke all active sessions for that user
    if (previousRole === 'admin' && newRole !== 'admin') {
      await client.query('UPDATE sessions SET revoked = true WHERE user_id = $1', [targetUserId]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Record transition in cryptographic audit ledger
  const auditBlock = await recordAudit(adminUser.id, 'ADMIN_ROLE_CHANGED', {
    targetUserId: targetUser.id,
    targetEmail: targetUser.email,
    previousRole,
    newRole,
    reason: reason || 'Administrative role adjustment'
  });

  return {
    ok: true,
    user: {
      id: targetUser.id,
      email: targetUser.email,
      previousRole,
      role: newRole
    },
    audit: {
      action: 'ADMIN_ROLE_CHANGED',
      blockIndex: auditBlock?.blockIndex
    }
  };
}

module.exports = {
  ALLOWED_ROLES,
  bootstrapInitialAdmin,
  provisionUserRole
};
