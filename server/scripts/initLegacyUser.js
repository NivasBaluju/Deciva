/**
 * server/scripts/initLegacyUser.js
 * CLI Utility for Host Administrator to initialize passwords for legacy accounts.
 *
 * Usage:
 *   node server/scripts/initLegacyUser.js <email> <new_password>
 *
 * Security:
 *   - Strictly validates password policy (min 8 chars, non-whitespace).
 *   - Uses bcrypt with cost factor 10.
 *   - Revokes active sessions for the target user.
 *   - Appends tamper-evident audit record to cryptographic audit ledger.
 *   - Never echoes plaintext password in output.
 */

'use strict';

const db = require('../db');
const { validatePassword, hashPassword } = require('../utils/passwordPolicy');
const { recordAudit } = require('../utils/audit');

async function main() {
  const args = process.argv.slice(2);
  const email = (args[0] || '').trim().toLowerCase();
  const password = args[1] || '';

  if (!email || !password) {
    console.error('Usage: node server/scripts/initLegacyUser.js <email> <new_password>');
    process.exit(1);
  }

  const check = validatePassword(password);
  if (!check.valid) {
    console.error('❌ Password policy error:', check.reason);
    process.exit(1);
  }

  try {
    const { rows: users } = await db.query('SELECT id, name, email, role, password_initialized FROM users WHERE email = $1', [email]);
    if (users.length === 0) {
      console.error(`❌ User not found for email: ${email}`);
      process.exit(1);
    }

    const user = users[0];
    const hashedPassword = await hashPassword(password);

    await db.query(
      'UPDATE users SET password_hash = $1, password_initialized = true WHERE id = $2',
      [hashedPassword, user.id]
    );

    // Invalidate active sessions to enforce fresh login with the new credentials
    await db.query('UPDATE sessions SET revoked = true WHERE user_id = $1', [user.id]);

    await recordAudit(user.id, 'LEGACY_USER_INITIALIZED_CLI', {
      email: user.email,
      source: 'host_cli'
    });

    console.log(`✅ Success: Password initialized for ${user.email} (Role: ${user.role}).`);
    console.log('   All prior sessions revoked. User can now sign in using their email and password.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Database error:', err.message);
    process.exit(1);
  }
}

main();
