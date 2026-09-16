/**
 * One-shot remediation: demote the previously hardcoded admin
 * to role='user' now that the auto-escalation code is removed.
 * Run once: node tests/v3/fix_admin_role.js
 */
require('dotenv').config();
const db = require('../../server/db');

async function main() {
  const TARGET = 'balujunivas@gmail.com';
  const { rows } = await db.query('SELECT id, email, role FROM users WHERE email = $1', [TARGET]);
  if (rows.length === 0) {
    console.log('User not found — nothing to do.');
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

main().catch(e => { console.error(e.message); process.exit(1); });
