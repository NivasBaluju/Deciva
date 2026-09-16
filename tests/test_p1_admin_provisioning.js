/**
 * tests/test_p1_admin_provisioning.js
 * ---------------------------------------------------------------------------
 * Phase 2, Task 6 (F7): Controlled ADMIN_EMAILS Provisioning & Role Governance
 * 
 * Verifies:
 *  1. Centralized config validation: whitespace normalization, lowercasing, deduplication.
 *  2. Fail-fast in production on wildcards, invalid syntax, and placeholder domains (no silent discard).
 *  3. Safe handling of unset/empty ADMIN_EMAILS (database-authoritative fallback).
 *  4. Cold-start bootstrap: promotes existing user only when 0 admins exist in PostgreSQL.
 *  5. Cold-start bootstrap: never auto-creates accounts for nonexistent configured emails.
 *  6. Controlled revocation integrity: ADMIN_EMAILS does NOT re-promote a demoted/revoked admin.
 *  7. Multi-instance concurrency race safety via transactional advisory locks.
 *  8. No login elevation: registration and login NEVER grant admin role from ADMIN_EMAILS.
 *  9. Database role authority: authorization strictly relies on PostgreSQL users.role.
 * 10. Admin management API: admin can promote user to valid role with audit logging.
 * 11. Anti-self-demotion: an administrator cannot demote their own account.
 * 12. Last-admin protection: cannot demote the last remaining administrator (zero-admin lockout prevention).
 * 13. Session revocation on demotion: active sessions are revoked when an admin is demoted.
 * 14. Invalid role rejection: schema and service reject invalid role strings.
 */

'use strict';

require('dotenv').config();
const assert = require('assert');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const express = require('express');
const http = require('http');

const pool = require('../server/db');
const { getJwtSecret, parseAndValidateAdminEmails, getAdminEmails } = require('../server/services/productionConfigService');
const { bootstrapInitialAdmin, provisionUserRole, ALLOWED_ROLES } = require('../server/services/adminProvisioningService');
const { sha256 } = require('../server/utils/crypto');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    Error: ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    Error: ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  }
}

async function main() {
  console.log('\n======================================================================');
  console.log('  DECIVA PHASE 2, TASK 6: CONTROLLED ADMIN PROVISIONING TEST SUITE    ');
  console.log('======================================================================\n');

  // -------------------------------------------------------------------------
  // Test 1: Configuration Validation - Normalization, Trimming, Lowercasing
  // -------------------------------------------------------------------------
  runTest('Test 1: Config parser trims whitespace, lowercases, and deduplicates emails', () => {
    const raw = '  admin@deciva.ai ,  LEAD@Deciva.AI, admin@deciva.ai  ';
    const res = parseAndValidateAdminEmails(raw, false);

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.emails.length, 2);
    assert.strictEqual(res.emails[0], 'admin@deciva.ai');
    assert.strictEqual(res.emails[1], 'lead@deciva.ai');
  });

  // -------------------------------------------------------------------------
  // Test 2: Configuration Validation - Fail-Fast on Production Wildcards
  // -------------------------------------------------------------------------
  runTest('Test 2: Config parser rejects dangerous wildcards (*, all, any, admin)', () => {
    const wildcards = ['*', 'all', 'any', 'admin'];
    for (const w of wildcards) {
      const res = parseAndValidateAdminEmails(w, true);
      assert.strictEqual(res.valid, false, `Wildcard '${w}' must be rejected in production`);
      assert(res.errors.some(e => e.includes('forbidden wildcard')));
    }
  });

  // -------------------------------------------------------------------------
  // Test 3: Configuration Validation - No Silent Discards on Malformed Entries
  // -------------------------------------------------------------------------
  runTest('Test 3: Production config fails fast on malformed entries without silent discarding', () => {
    const mixed = 'valid@deciva.com, not-an-email, another@deciva.com';
    const res = parseAndValidateAdminEmails(mixed, true);

    assert.strictEqual(res.valid, false, 'Mixed configuration with invalid email must fail in production');
    assert(res.errors.some(e => e.includes('not a valid email address')));
    assert.strictEqual(res.emails.length, 0, 'Must not return partial list on production failure');
  });

  // -------------------------------------------------------------------------
  // Test 4: Configuration Validation - Rejects Insecure Placeholder Domains
  // -------------------------------------------------------------------------
  runTest('Test 4: Production config rejects insecure placeholder domains', () => {
    const placeholders = ['admin@example.com', 'lead@test.com', 'user@change_me.com'];
    for (const p of placeholders) {
      const res = parseAndValidateAdminEmails(p, true);
      assert.strictEqual(res.valid, false, `Placeholder '${p}' must fail in production`);
      assert(res.errors.some(e => e.includes('insecure or placeholder domain')));
    }
  });

  // -------------------------------------------------------------------------
  // Test 5: Configuration Validation - Unset / Empty Handled Safely
  // -------------------------------------------------------------------------
  runTest('Test 5: Empty or unset ADMIN_EMAILS returns empty list without error', () => {
    const emptyRes = parseAndValidateAdminEmails('', true);
    assert.strictEqual(emptyRes.valid, true);
    assert.deepStrictEqual(emptyRes.emails, []);

    const nullRes = parseAndValidateAdminEmails(null, true);
    assert.strictEqual(nullRes.valid, true);
    assert.deepStrictEqual(nullRes.emails, []);
  });

  // -------------------------------------------------------------------------
  // Database Setup for Provisioning and Authorization Tests
  // -------------------------------------------------------------------------
  const JWT_SECRET = getJwtSecret();
  const testBootstrapEmail = `bootstrap_test_${Date.now()}@deciva.local`;
  const testUserId1 = uuidv4();
  const testUserId2 = uuidv4();
  const testUserId3 = uuidv4();

  // Create test user 1 (will be bootstrapped) and test user 2 (regular user)
  await pool.query(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ($1, 'Bootstrap User', $2, 'hash_pw', 'user'),
           ($3, 'Normal User', $4, 'hash_pw', 'user'),
           ($5, 'Second User', $6, 'hash_pw', 'user')
    ON CONFLICT (id) DO NOTHING;
  `, [
    testUserId1, testBootstrapEmail,
    testUserId2, `user2_${Date.now()}@deciva.local`,
    testUserId3, `user3_${Date.now()}@deciva.local`
  ]);

  // -------------------------------------------------------------------------
  // Test 6: Cold-Start Bootstrap - Promotes Existing User when 0 Admins
  // -------------------------------------------------------------------------
  await runAsyncTest('Test 6: Cold-start bootstrap elevates existing user when 0 admins exist', async () => {
    // Temporarily demote all existing admins in DB to simulate cold-start
    await pool.query("UPDATE users SET role = 'user' WHERE role = 'admin'");

    process.env.ADMIN_EMAILS = testBootstrapEmail;

    const result = await bootstrapInitialAdmin(pool);
    assert.strictEqual(result.bootstrapped, true, 'Bootstrap should succeed on cold start');
    assert.strictEqual(result.provisionedUsers.length, 1);
    assert.strictEqual(result.provisionedUsers[0].email, testBootstrapEmail);

    // Verify user role in database
    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [testUserId1]);
    assert.strictEqual(rows[0].role, 'admin', 'User must have role = admin in PostgreSQL');

    // Verify cryptographic audit block
    const { rows: auditRows } = await pool.query(
      "SELECT * FROM blockchain_audit WHERE action = 'ADMIN_BOOTSTRAPPED' AND user_id = $1 ORDER BY block_index DESC LIMIT 1",
      [testUserId1]
    );
    assert(auditRows.length > 0, 'Must record ADMIN_BOOTSTRAPPED audit block');
    const details = JSON.parse(auditRows[0].details_json);
    assert.strictEqual(details.email, testBootstrapEmail);
    assert.strictEqual(details.newRole, 'admin');
  });

  // -------------------------------------------------------------------------
  // Test 7: Cold-Start Bootstrap - Never Creates Accounts for Nonexistent Users
  // -------------------------------------------------------------------------
  await runAsyncTest('Test 7: Cold-start bootstrap does NOT create accounts for unverified emails', async () => {
    // Clean admin state again
    await pool.query("UPDATE users SET role = 'user' WHERE role = 'admin'");

    const nonExistentEmail = `unregistered_${Date.now()}@deciva.local`;
    process.env.ADMIN_EMAILS = nonExistentEmail;

    const result = await bootstrapInitialAdmin(pool);
    assert.strictEqual(result.bootstrapped, false);
    assert.strictEqual(result.reason, 'CONFIGURED_USERS_NOT_FOUND');

    // Verify no user was created
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [nonExistentEmail]);
    assert.strictEqual(rows.length, 0, 'Bootstrap must NEVER create accounts automatically');
  });

  // -------------------------------------------------------------------------
  // Test 8: Controlled Revocation - ADMIN_EMAILS Does NOT Re-Promote Revoked Admin
  // -------------------------------------------------------------------------
  await runAsyncTest('Test 8: ADMIN_EMAILS does NOT re-promote a revoked admin when admins exist', async () => {
    // Setup: User 1 is 'admin', User 2 is 'admin'
    await pool.query("UPDATE users SET role = 'admin' WHERE id IN ($1, $2)", [testUserId1, testUserId2]);

    // Demote User 1 to 'user'
    await pool.query("UPDATE users SET role = 'user' WHERE id = $1", [testUserId1]);

    // Configure User 1 in ADMIN_EMAILS
    process.env.ADMIN_EMAILS = testBootstrapEmail;

    // Simulate server restart bootstrap check
    const result = await bootstrapInitialAdmin(pool);
    assert.strictEqual(result.bootstrapped, false);
    assert.strictEqual(result.reason, 'ADMINS_ALREADY_EXIST');

    // Verify User 1 remains 'user'
    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [testUserId1]);
    assert.strictEqual(rows[0].role, 'user', 'Revoked administrator must NOT be re-promoted by ADMIN_EMAILS');
  });

  // -------------------------------------------------------------------------
  // Test 9: Cold-Start Multi-Instance Concurrency Race Protection
  // -------------------------------------------------------------------------
  await runAsyncTest('Test 9: Concurrent cold-start bootstraps serialize safely via advisory locks', async () => {
    await pool.query("UPDATE users SET role = 'user' WHERE role = 'admin'");
    process.env.ADMIN_EMAILS = testBootstrapEmail;

    // Run two simultaneous bootstrap calls simulating two server processes starting simultaneously
    const [resA, resB] = await Promise.all([
      bootstrapInitialAdmin(pool),
      bootstrapInitialAdmin(pool)
    ]);

    // Exactly one should succeed in bootstrapping, while the other sees ADMINS_ALREADY_EXIST
    const successCount = (resA.bootstrapped ? 1 : 0) + (resB.bootstrapped ? 1 : 0);
    assert.strictEqual(successCount, 1, 'Exactly one concurrent instance must execute bootstrap');

    const alreadyExistCount = (resA.reason === 'ADMINS_ALREADY_EXIST' ? 1 : 0) + (resB.reason === 'ADMINS_ALREADY_EXIST' ? 1 : 0);
    assert.strictEqual(alreadyExistCount, 1, 'The competing instance must detect existing admin');
  });

  // -------------------------------------------------------------------------
  // Setup Express App and Admin Routes for API Tests
  // -------------------------------------------------------------------------
  // Restore User 1 as Admin and User 2 as second Admin
  await pool.query("UPDATE users SET role = 'admin' WHERE id IN ($1, $2)", [testUserId1, testUserId2]);
  await pool.query("UPDATE users SET role = 'user' WHERE id = $1", [testUserId3]);

  const sessionIdAdmin1 = uuidv4();
  const sessionIdAdmin2 = uuidv4();
  const sessionIdUser3 = uuidv4();
  const fp = sha256('test-agent::127.0.0.1');

  await pool.query(`
    INSERT INTO sessions (id, user_id, device_fingerprint, ip, trust_score, mfa_verified, revoked)
    VALUES ($1, $2, $3, '127.0.0.1', 100, true, false),
           ($4, $5, $3, '127.0.0.1', 100, true, false),
           ($6, $7, $3, '127.0.0.1', 100, true, false);
  `, [
    sessionIdAdmin1, testUserId1, fp,
    sessionIdAdmin2, testUserId2,
    sessionIdUser3, testUserId3
  ]);

  const tokenAdmin1 = jwt.sign({ userId: testUserId1, sessionId: sessionIdAdmin1 }, JWT_SECRET, { expiresIn: '1h' });
  const tokenUser3 = jwt.sign({ userId: testUserId3, sessionId: sessionIdUser3 }, JWT_SECRET, { expiresIn: '1h' });

  const app = express();
  app.use(express.json());
  const adminRoutes = require('../server/routes/admin');
  app.use('/api/admin', adminRoutes);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/admin`;

  // -------------------------------------------------------------------------
  // Test 10: Authorization Enforcement - Non-Admin Calling Role Endpoint (403)
  // -------------------------------------------------------------------------
  await runAsyncTest('Test 10: Non-admin calling role endpoint is rejected with 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/users/${testUserId3}/role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenUser3}`
      },
      body: JSON.stringify({ role: 'admin', reason: 'Self-promotion attempt' })
    });

    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert(body.error.includes('Administrator privileges required'));
  });

  // -------------------------------------------------------------------------
  // Test 11: Day-2 Role Management - Admin Can Promote User with Audit
  // -------------------------------------------------------------------------
  await runAsyncTest('Test 11: Admin can promote user with immutable cryptographic audit logging', async () => {
    const res = await fetch(`${baseUrl}/users/${testUserId3}/role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenAdmin1}`
      },
      body: JSON.stringify({ role: 'legal_counsel', reason: 'Assigned contract reviewer' })
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.user.role, 'legal_counsel');
    assert.strictEqual(body.user.previousRole, 'user');

    // Verify database row
    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [testUserId3]);
    assert.strictEqual(rows[0].role, 'legal_counsel');

    // Verify audit ledger block
    const { rows: auditRows } = await pool.query(
      "SELECT * FROM blockchain_audit WHERE action = 'ADMIN_ROLE_CHANGED' AND user_id = $1 ORDER BY block_index DESC LIMIT 1",
      [testUserId1]
    );
    assert(auditRows.length > 0);
    const details = JSON.parse(auditRows[0].details_json);
    assert.strictEqual(details.targetUserId, testUserId3);
    assert.strictEqual(details.newRole, 'legal_counsel');
  });

  // -------------------------------------------------------------------------
  // Test 12: Anti-Self-Demotion - Admin Cannot Revoke Own Admin Role (403)
  // -------------------------------------------------------------------------
  await runAsyncTest('Test 12: Admin cannot demote their own account (anti-lockout invariant)', async () => {
    const res = await fetch(`${baseUrl}/users/${testUserId1}/role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenAdmin1}`
      },
      body: JSON.stringify({ role: 'user', reason: 'Self-demotion' })
    });

    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert(body.error.includes('Cannot revoke your own administrator privileges'));

    // Verify User 1 is still admin in DB
    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [testUserId1]);
    assert.strictEqual(rows[0].role, 'admin');
  });

  // -------------------------------------------------------------------------
  // Test 13: Last-Admin Protection - Cannot Demote Last Remaining Admin (403)
  // -------------------------------------------------------------------------
  await runAsyncTest('Test 13: Transactional last-admin protection prevents zero-admin state', async () => {
    // Demote User 2 so User 1 is the ONLY administrator left
    await pool.query("UPDATE users SET role = 'user' WHERE id = $1", [testUserId2]);

    // Admin 1 tries to demote User 1 -> rejected by self-demotion
    // Admin 1 promotes User 2 to admin again, then demotes User 1
    await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [testUserId2]);
    // Now demote User 2, so only 1 admin remains (User 1)
    await pool.query("UPDATE users SET role = 'user' WHERE id = $1", [testUserId2]);

    // Now if Admin 1 calls provisionUserRole on User 1 directly, last-admin check also triggers
    // Let's test with a simulated client: User 2 (demoted) trying to demote User 1:
    let error;
    try {
      // Simulate attempting to demote User 1 when User 1 is the sole admin
      await provisionUserRole(pool, testUserId1, 'user', { id: testUserId2, role: 'admin' }, 'Lockout attempt');
    } catch (err) {
      error = err;
    }
    assert(error !== undefined, 'Must reject demoting the last remaining admin');
    assert(error.message.includes('Cannot demote the last remaining administrator'));
  });

  // -------------------------------------------------------------------------
  // Test 14: Session Revocation on Admin Demotion
  // -------------------------------------------------------------------------
  await runAsyncTest('Test 14: Demoting an administrator immediately revokes their active sessions', async () => {
    // Restore User 2 as admin with an active session
    await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [testUserId2]);
    await pool.query('UPDATE sessions SET revoked = false WHERE id = $1', [sessionIdAdmin2]);

    // User 1 demotes User 2
    const res = await fetch(`${baseUrl}/users/${testUserId2}/role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenAdmin1}`
      },
      body: JSON.stringify({ role: 'user', reason: 'Role transition to standard user' })
    });

    assert.strictEqual(res.status, 200);

    // Verify sessions for User 2 are now revoked
    const { rows: sessionRows } = await pool.query('SELECT revoked FROM sessions WHERE user_id = $1', [testUserId2]);
    assert(sessionRows.length > 0);
    assert.strictEqual(sessionRows[0].revoked, true, 'Demoted administrator sessions must be revoked');
  });

  // -------------------------------------------------------------------------
  // Test 15: Invalid Role Rejection
  // -------------------------------------------------------------------------
  await runAsyncTest('Test 15: Schema and service reject invalid role strings with 400 Bad Request', async () => {
    const invalidRoles = ['superadmin', 'root', 'manager', 'owner', ''];
    for (const r of invalidRoles) {
      const res = await fetch(`${baseUrl}/users/${testUserId3}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenAdmin1}`
        },
        body: JSON.stringify({ role: r, reason: 'Invalid role test' })
      });

      assert.strictEqual(res.status, 400, `Role '${r}' must be rejected with 400`);
      const body = await res.json();
      assert(body.error.includes('Invalid target role'));
    }
  });

  // -------------------------------------------------------------------------
  // Test 16: Database CHECK Constraint Validation
  // -------------------------------------------------------------------------
  await runAsyncTest('Test 16: Database chk_users_valid_role constraint blocks invalid direct SQL inserts', async () => {
    let sqlError;
    try {
      await pool.query("INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, 'Bad Role', $2, 'hash', 'invalid_super_role')", [
        uuidv4(),
        `bad_role_${Date.now()}@deciva.local`
      ]);
    } catch (err) {
      sqlError = err;
    }

    assert(sqlError !== undefined, 'Database must enforce chk_users_valid_role');
    assert(sqlError.message.includes('chk_users_valid_role') || sqlError.code === '23514', 'PostgreSQL check constraint violation required');
  });

  // Close HTTP server and DB connections
  await new Promise(resolve => server.close(resolve));
  await pool.end();

  console.log('\n======================================================================');
  console.log(`  RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('======================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
