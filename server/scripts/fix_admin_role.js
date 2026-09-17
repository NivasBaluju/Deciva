/**
 * Administrative script: Demote a target user from admin to user.
 * Relocated from tests/v3/ as part of repository test-directory cleanup.
 *
 * Usage: node server/scripts/fix_admin_role.js [email]
 */
require('dotenv').config();
const db = require('../db');

async function main() {
  const targetEmail = process.argv[2] || 'balujunivas@gmail.com';
  const { rows } = await db.query('SELECT id, email, role FROM users WHERE email = $1', [targetEmail]);
  if (rows.length === 0) {
    console.log(`User ${targetEmail} not found — nothing to do.`);
    process.exit(0);
  }
  const u = rows[0];
  console.log(`Found: ${u.email} | current role: ${u.role}`);
  if (u.role === 'user') {
    console.log('Already user — no change needed.');
    process.exit(0);
  }
  await db.query("UPDATE users SET role = 'user' WHERE id = $1", [u.id]);
  const { rows: after } = await db.query('SELECT role FROM users WHERE id = $1', [u.id]);
  console.log(`Updated to: ${after[0].role}`);
  process.exit(0);
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
