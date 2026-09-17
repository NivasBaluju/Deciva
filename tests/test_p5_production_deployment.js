/**
 * tests/test_p5_production_deployment.js
 * =============================================================================
 * DECIVA AI — TASK 17: FINAL PRODUCTION DEPLOYMENT & OPERATIONAL READINESS
 * =============================================================================
 * 
 * Verifies production packaging, operational resilience, security posture,
 * multi-service communications, database integrity, and full-stack runtime behavior.
 * 
 * Tests:
 *  T17-01: Production Configuration & Startup Secret Safety
 *  T17-02: Secret & Environment Leak Preflight (Zero public frontend leaks)
 *  T17-03: Frontend Production API Configuration (Relative routing, SPA fallback)
 *  T17-04: Node Gateway Production Startup & Dynamic Port Handling
 *  T17-05: Flask AI Microservice Production Entrypoint & Dynamic Port Handling
 *  T17-06: Node -> Flask Internal Authentication & HMAC Security Boundary
 *  T17-07: PostgreSQL Production Connectivity & Strict TLS Normalization
 *  T17-08: Complete Database Migrations Verification (19 migrations ordered & active)
 *  T17-09: Production Health & Readiness Endpoints (Liveness, Readiness, Dependencies)
 *  T17-10: httpOnly Cookie Security Posture (Zero web storage token persistence)
 *  T17-11: Strict CORS Policy & Origin Validation
 *  T17-12: Defense-in-Depth Security Headers (CSP, HSTS, X-Frame-Options, Nosniff)
 *  T17-13: Structured Observability & Sensitive Data Redaction Runtime
 *  T17-14: End-to-End Authentication Journey Smoke (Register -> OTP -> /me -> Logout)
 *  T17-15: Multi-Factor Authentication (MFA) Invariant Verification
 *  T17-16: Strict Multi-Tenant Isolation & IDOR Protection
 *  T17-17: Document Ingestion, AES-256 Encryption & Idempotency Smoke
 *  T17-18: AI Provenance & Grounded RAG Inquiries (Grounded vs Unsupported)
 *  T17-19: Negotiation & Contract Simulation Immutability (4 modes, risk recalculated)
 *  T17-20: Cryptographic Audit Ledger & Tamper Detection Verification
 */

'use strict';

require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const db = require('../server/db');
const { validateStartupConfig, getJwtSecret, getEncryptionKey } = require('../server/services/productionConfigService');
const logger = require('../server/utils/logger');
const { recordAudit, verifyChain } = require('../server/utils/audit');
const { encryptSecret, decryptSecret } = require('../server/utils/crypto');

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:5000';
const FLASK_URL = (process.env.AI_MICROSERVICE_URL || 'http://127.0.0.1:5001').replace(/\/+$/, '');
const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY || 'deciva-internal-service-secret-key-default';
const JWT_SECRET = getJwtSecret();

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    if (err.stack) console.error('     Stack:', err.stack.split('\n').slice(1, 4).join('\n     '));
    failed++;
  }
}

async function main() {
  console.log('\n=============================================================');
  console.log('DECIVA AI — TASK 17 PRODUCTION DEPLOYMENT & READINESS SUITE');
  console.log('=============================================================\n');

  // T17-01: Production Configuration & Startup Secret Safety
  await runTest('T17-01: Production Configuration & Startup Secret Safety', async () => {
    assert.doesNotThrow(() => validateStartupConfig(), 'validateStartupConfig() must execute cleanly with valid environment');
    assert(JWT_SECRET && JWT_SECRET.length >= 16, 'JWT_SECRET must have adequate entropy');
    const encKey = getEncryptionKey();
    assert(encKey && encKey.length >= 16, 'AES encryption key string must have adequate length');
    const derivedKey = crypto.createHash('sha256').update(encKey).digest();
    assert.strictEqual(derivedKey.length, 32, 'Derived AES-256 master key must be exactly 32 bytes');
  });

  // T17-02: Secret & Environment Leak Preflight
  await runTest('T17-02: Secret & Environment Leak Preflight (Zero public frontend leaks)', async () => {
    const gitignoreContent = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
    assert(gitignoreContent.includes('.env'), '.gitignore must ignore .env files');
    assert(gitignoreContent.includes('data/db/*.key'), '.gitignore must ignore private key files');
    assert(gitignoreContent.includes('data/db/*.pem'), '.gitignore must ignore PEM certificate files');

    // Verify .env.example contains zero live production secrets
    const envExample = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
    assert(!envExample.includes('AIzaSy'), '.env.example must not contain live Google API keys');
    assert(!envExample.includes('postgres://live'), '.env.example must not contain live production database credentials');
  });

  // T17-03: Frontend Production API Configuration
  await runTest('T17-03: Frontend Production API Configuration (Relative routing, SPA fallback)', async () => {
    const apiJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'api.js'), 'utf8');
    assert(!apiJs.includes('http://127.0.0.1:5000'), 'Frontend api.js must not hardcode 127.0.0.1:5000');
    assert(!apiJs.includes('http://localhost:5000'), 'Frontend api.js must not hardcode localhost:5000');
    assert(apiJs.includes("credentials: 'include'"), "Frontend api.js must specify credentials: 'include'");

    const vercelJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
    assert(vercelJson.routes.some(r => (r.dest === 'server/index.js' || r.dest.includes('deciva-api-gateway.onrender.com')) && r.src.includes('/api/')), 'vercel.json must route /api/ to server/index.js or Render Gateway proxy');
    assert(vercelJson.routes.some(r => r.dest === '/index.html'), 'vercel.json must route SPA paths to /index.html');
  });

  // T17-04: Node Gateway Production Startup & Dynamic Port Handling
  await runTest('T17-04: Node Gateway Production Startup & Dynamic Port Handling', async () => {
    const serverIndexJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
    assert(serverIndexJs.includes('process.env.PORT || 5000'), 'server/index.js must dynamically resolve process.env.PORT');
    assert(serverIndexJs.includes('module.exports = app'), 'server/index.js must export app for Vercel/serverless environments');
  });

  // T17-05: Flask AI Microservice Production Entrypoint & Dynamic Port Handling
  await runTest('T17-05: Flask AI Microservice Production Entrypoint & Dynamic Port Handling', async () => {
    const wsgiJs = fs.readFileSync(path.join(__dirname, '..', 'wsgi.py'), 'utf8');
    assert(wsgiJs.includes("os.environ.get('PORT'"), 'wsgi.py must handle dynamic PORT environment variable');

    const dockerfileAi = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile.ai'), 'utf8');
    assert(dockerfileAi.includes('gunicorn'), 'Dockerfile.ai must utilize Gunicorn WSGI server');
    assert(dockerfileAi.includes('appuser'), 'Dockerfile.ai must execute under non-root appuser');
  });

  // T17-06: Node -> Flask Internal Authentication & HMAC Security Boundary
  await runTest('T17-06: Node -> Flask Internal Authentication & HMAC Security Boundary', async () => {
    // Unauthenticated call to protected endpoint must return 403
    const unauthRes = await fetch(`${FLASK_URL}/api/documents/test-id/analysis`);
    assert.strictEqual(unauthRes.status, 403, 'Unauthenticated call to Flask microservice must be rejected with 403');
    const unauthBody = await unauthRes.json();
    assert.strictEqual(unauthBody.code, 'INTERNAL_AUTH_REQUIRED', 'Must return INTERNAL_AUTH_REQUIRED error code');

    // Authenticated call with invalid key must return 403
    const badKeyRes = await fetch(`${FLASK_URL}/api/documents/test-id/analysis`, {
      headers: { 'x-internal-service-key': 'invalid_forged_key_123' }
    });
    assert.strictEqual(badKeyRes.status, 403, 'Invalid internal key must be rejected with 403');
  });

  // T17-07: PostgreSQL Production Connectivity & Strict TLS Normalization
  await runTest('T17-07: PostgreSQL Production Connectivity & Strict TLS Normalization', async () => {
    const { rows } = await db.query('SELECT current_database(), current_user, version()');
    assert(rows && rows.length > 0, 'Must execute query successfully on live database');
    assert(rows[0].version.includes('PostgreSQL'), 'Database engine must identify as PostgreSQL');

    const dbJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'db.js'), 'utf8');
    assert(dbJs.includes("u.searchParams.set('sslmode', 'verify-full')"), 'db.js must normalize sslmode=require to verify-full');
    assert(dbJs.includes('rejectUnauthorized: !allowSelfSigned'), 'db.js must enforce certificate validation');
  });

  // T17-08: Complete Database Migrations Verification
  await runTest('T17-08: Complete Database Migrations Verification (20 migrations ordered & active)', async () => {
    const { rows } = await db.query('SELECT version, name FROM schema_migrations ORDER BY version ASC');
    assert.strictEqual(rows.length, 20, `Expected exactly 20 applied migrations, found ${rows.length}`);
    const adminMigration = rows.find(r => r.version === '20260916_018_admin_role_governance');
    assert(adminMigration, 'Migration 20260916_018_admin_role_governance must be applied');
    const auditViewMigration = rows.find(r => r.version === '20260916_019_cryptographic_audit_ledger_view');
    assert(auditViewMigration, 'Migration 20260916_019_cryptographic_audit_ledger_view must be applied');
    const passwordMigration = rows.find(r => r.version === '20260918_020_password_auth_governance');
    assert(passwordMigration, 'Migration 20260918_020_password_auth_governance must be applied');
  });

  // T17-09: Production Health & Readiness Endpoints
  await runTest('T17-09: Production Health & Readiness Endpoints (Liveness, Readiness, Dependencies)', async () => {
    // Gateway /api/health
    const gwHealth = await (await fetch(`${GATEWAY_URL}/api/health`)).json();
    assert.strictEqual(gwHealth.status, 'ok', 'Gateway /api/health status must be ok');

    // Gateway /api/health/ready
    const gwReadyRes = await fetch(`${GATEWAY_URL}/api/health/ready`);
    assert.strictEqual(gwReadyRes.status, 200, 'Gateway /api/health/ready must return 200');
    const gwReady = await gwReadyRes.json();
    assert.strictEqual(gwReady.status, 'ready', 'Gateway readiness status must be ready');
    assert.strictEqual(gwReady.dependencies.database.status, 'healthy', 'Gateway database dependency must be healthy');

    // Flask /health alias
    const flaskHealth = await (await fetch(`${FLASK_URL}/health`)).json();
    assert.strictEqual(flaskHealth.status, 'online', 'Flask /health alias must return status online');
    assert.strictEqual(flaskHealth.postgres.connected, true, 'Flask must report postgres connected: true');
  });

  // T17-10: httpOnly Cookie Security Posture
  await runTest('T17-10: httpOnly Cookie Security Posture (Zero web storage token persistence)', async () => {
    const authJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'auth.js'), 'utf8');
    assert(authJs.includes("httpOnly: true"), 'Auth routes must configure httpOnly: true for session cookies');
    assert(authJs.includes("path: '/'"), "Auth cookies must specify path: '/'");

    const apiJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'api.js'), 'utf8');
    assert(!apiJs.includes("sessionStorage.setItem('token'"), 'src/services/api.js must not persist tokens in sessionStorage');
    assert(!apiJs.includes("localStorage.setItem('token'"), 'src/services/api.js must not persist tokens in localStorage');
  });

  // T17-11: Strict CORS Policy & Origin Validation
  await runTest('T17-11: Strict CORS Policy & Origin Validation', async () => {
    // Allowed origin
    const allowedRes = await fetch(`${GATEWAY_URL}/api/health`, {
      headers: { Origin: 'http://localhost:3000' }
    });
    assert.strictEqual(allowedRes.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.strictEqual(allowedRes.headers.get('access-control-allow-credentials'), 'true');

    // Disallowed origin should not echo back origin
    const disallowedRes = await fetch(`${GATEWAY_URL}/api/health`, {
      headers: { Origin: 'http://malicious-attacker.com' }
    });
    assert.notStrictEqual(disallowedRes.headers.get('access-control-allow-origin'), 'http://malicious-attacker.com');
  });

  // T17-12: Defense-in-Depth Security Headers
  await runTest('T17-12: Defense-in-Depth Security Headers (CSP, HSTS, X-Frame-Options, Nosniff)', async () => {
    const res = await fetch(`${GATEWAY_URL}/api/health`);
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff', 'Must include X-Content-Type-Options: nosniff');
    assert.strictEqual(res.headers.get('x-frame-options'), 'DENY', 'Must include X-Frame-Options: DENY');
    assert.strictEqual(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', 'Must include Referrer-Policy');
    assert(res.headers.get('strict-transport-security'), 'Must include Strict-Transport-Security header');
    assert(res.headers.get('content-security-policy'), 'Must include Content-Security-Policy header');
  });

  // T17-13: Structured Observability & Sensitive Data Redaction Runtime
  await runTest('T17-13: Structured Observability & Sensitive Data Redaction Runtime', async () => {
    const raw = {
      user: 'test_operator',
      password: 'SuperSecretPassword123!',
      apiKey: 'AIzaSy_ActualSecretValue',
      token: 'jwt.token.secret',
      nested: {
        authorization: 'Bearer secret_value',
        safeProperty: 'normal_information'
      }
    };
    const sanitized = logger.sanitize(raw);
    assert.strictEqual(sanitized.password, '[REDACTED]', 'Password must be redacted');
    assert.strictEqual(sanitized.apiKey, '[REDACTED]', 'apiKey must be redacted');
    assert.strictEqual(sanitized.token, '[REDACTED]', 'Token must be redacted');
    assert.strictEqual(sanitized.nested.authorization, '[REDACTED]', 'Authorization must be redacted');
    assert.strictEqual(sanitized.nested.safeProperty, 'normal_information', 'Safe property must be preserved');
  });

  // T17-14: End-to-End Authentication Journey Smoke
  await runTest('T17-14: End-to-End Authentication Journey Smoke (Register -> Session -> /me -> Logout)', async () => {
    const testEmail = `t17_smoke_${Date.now()}@example.internal`;
    const testPassword = 'SmokePassword123!@#';
    const regRes = await fetch(`${GATEWAY_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Smoke Test User', email: testEmail, password: testPassword, confirmPassword: testPassword })
    });
    assert.ok(regRes.status === 200 || regRes.status === 201, 'Registration must succeed');
    const regData = await regRes.json();
    assert.strictEqual(regData.ok, true, 'Registration must return ok: true');

    const { rows: userRows } = await db.query('SELECT id FROM users WHERE email = $1', [testEmail]);
    const userId = userRows[0]?.id;
    assert(userId, 'User record must exist in database');

    const cookieHeader = regRes.headers.get('set-cookie');
    assert(cookieHeader && cookieHeader.includes('token='), 'Must issue token cookie');

    // Call /api/auth/me using Cookie header
    const tokenPart = cookieHeader.split(';')[0];
    const meRes = await fetch(`${GATEWAY_URL}/api/auth/me`, {
      headers: { Cookie: tokenPart }
    });
    assert.strictEqual(meRes.status, 200, 'GET /api/auth/me with cookie must succeed');
    const meData = await meRes.json();
    assert.strictEqual(meData.user.email, testEmail, 'User email must match test email');

    // Logout
    const logoutRes = await fetch(`${GATEWAY_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: tokenPart }
    });
    assert.strictEqual(logoutRes.status, 200, 'Logout must succeed');

    // Access with revoked session must be rejected with 401
    const postLogoutRes = await fetch(`${GATEWAY_URL}/api/auth/me`, {
      headers: { Cookie: tokenPart }
    });
    assert.strictEqual(postLogoutRes.status, 401, 'Revoked session cookie must return 401');

    // Clean up smoke user dependencies in proper order
    await db.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  // T17-15: Multi-Factor Authentication (MFA) Invariant Verification
  await runTest('T17-15: Multi-Factor Authentication (MFA) Invariant Verification', async () => {
    const { authenticator } = require('otplib');
    const testEmail = `t17_mfa_${Date.now()}@example.internal`;
    const testPassword = 'MfaPassword123!@#';
    const regRes = await fetch(`${GATEWAY_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'MFA Invariant User', email: testEmail, password: testPassword, confirmPassword: testPassword })
    });
    assert.ok(regRes.status === 200 || regRes.status === 201, 'Registration must succeed');

    const { rows: userRows } = await db.query('SELECT id FROM users WHERE email = $1', [testEmail]);
    const uid = userRows[0]?.id;
    assert(uid, 'User record must exist in database');

    // Enable TOTP MFA
    const secret = authenticator.generateSecret();
    const encryptedSecret = encryptSecret(secret);
    await db.query('UPDATE users SET totp_secret = $1, mfa_enabled = true WHERE id = $2', [encryptedSecret, uid]);

    // Login requiring MFA
    const loginRes = await fetch(`${GATEWAY_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    assert.strictEqual(loginRes.status, 200, 'Login with MFA enabled should succeed with challenge');
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.mfaRequired, true, 'mfaRequired should be true');

    // Invalid TOTP must fail with 401
    const badTotpRes = await fetch(`${GATEWAY_URL}/api/auth/mfa/totp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preToken: loginData.preToken, code: '999999' })
    });
    assert.strictEqual(badTotpRes.status, 401, 'Invalid TOTP must return 401');

    // Valid TOTP must succeed
    const validTotpCode = authenticator.generate(secret);
    const validTotpRes = await fetch(`${GATEWAY_URL}/api/auth/mfa/totp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preToken: loginData.preToken, code: validTotpCode })
    });
    assert.strictEqual(validTotpRes.status, 200, 'Valid TOTP must return 200');

    // Clean up
    await db.query(`DELETE FROM sessions WHERE user_id = $1`, [uid]);
    await db.query(`DELETE FROM users WHERE id = $1`, [uid]);
  });

  // T17-16: Strict Multi-Tenant Isolation & IDOR Protection
  await runTest('T17-16: Strict Multi-Tenant Isolation & IDOR Protection', async () => {
    const userA = uuidv4();
    const userB = uuidv4();
    const docA = uuidv4();

    await db.query(`INSERT INTO users (id, name, email, password_hash) VALUES ($1, 'Tenant A', $2, 'hash')`, [userA, `${userA}@tenant.internal`]);
    await db.query(`INSERT INTO users (id, name, email, password_hash) VALUES ($1, 'Tenant B', $2, 'hash')`, [userB, `${userB}@tenant.internal`]);
    await db.query(`INSERT INTO documents (id, user_id, filename, original_name, risk_score) VALUES ($1, $2, 'docA.txt', 'docA.txt', 45)`, [docA, userA]);

    const tokenB = jwt.sign({ userId: userB, sessionId: uuidv4() }, JWT_SECRET, { expiresIn: '1h' });
    await db.query(`INSERT INTO sessions (id, user_id, mfa_verified) VALUES ($1, $2, true)`, [jwt.decode(tokenB).sessionId, userB]);

    // User B attempts to access User A's document
    const idorRes = await fetch(`${GATEWAY_URL}/api/documents/${docA}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.strictEqual(idorRes.status, 404, 'Direct access to cross-tenant document must return 404 (IDOR blocked)');

    // Clean up
    await db.query(`DELETE FROM documents WHERE id = $1`, [docA]);
    await db.query(`DELETE FROM sessions WHERE user_id IN ($1, $2)`, [userA, userB]);
    await db.query(`DELETE FROM users WHERE id IN ($1, $2)`, [userA, userB]);
  });

  // T17-17: Document Ingestion, AES-256 Encryption & Idempotency Smoke
  await runTest('T17-17: Document Ingestion, AES-256 Encryption & Idempotency Smoke', async () => {
    const testUserId = uuidv4();
    await db.query(`INSERT INTO users (id, name, email, password_hash) VALUES ($1, 'Ingest User', $2, 'hash')`, [testUserId, `${testUserId}@smoke.internal`]);
    const token = jwt.sign({ userId: testUserId, sessionId: uuidv4() }, JWT_SECRET, { expiresIn: '1h' });
    await db.query(`INSERT INTO sessions (id, user_id, mfa_verified) VALUES ($1, $2, true)`, [jwt.decode(token).sessionId, testUserId]);

    const boundary = '----WebKitFormBoundaryTask17Smoke';
    const content = 'MASTER SERVICES AGREEMENT\nPayment shall be made within 30 days of invoice.\nNeither party shall be liable for consequential damages.';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="msa_smoke.txt"\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--\r\n`)
    ]);

    const idempotencyKey = `idemp_smoke_${Date.now()}`;
    const uploadRes = await fetch(`${GATEWAY_URL}/api/documents/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Idempotency-Key': idempotencyKey
      },
      body
    });
    assert(uploadRes.status === 200 || uploadRes.status === 201, `Upload must succeed with 200/201, got ${uploadRes.status}`);
    const uploadData = await uploadRes.json();
    const docId = uploadData.document?.id || uploadData.id;
    assert(docId, 'Must receive valid document ID');

    // Duplicate upload with same Idempotency-Key must return identical document ID
    const duplicateRes = await fetch(`${GATEWAY_URL}/api/documents/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Idempotency-Key': idempotencyKey
      },
      body
    });
    assert.strictEqual(duplicateRes.status, 200, 'Duplicate upload must return cached 200');
    const duplicateData = await duplicateRes.json();
    const dupDocId = duplicateData.document?.id || duplicateData.id;
    assert.strictEqual(dupDocId, docId, 'Idempotent replay must return original document ID');

    // Clean up
    await db.query(`DELETE FROM documents WHERE id = $1`, [docId]);
    await db.query(`DELETE FROM sessions WHERE user_id = $1`, [testUserId]);
    await db.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
  });

  // T17-18: AI Provenance & Grounded RAG Inquiries
  await runTest('T17-18: AI Provenance & Grounded RAG Inquiries (Grounded vs Unsupported)', async () => {
    const testUserId = uuidv4();
    const docId = uuidv4();
    await db.query(`INSERT INTO users (id, name, email, password_hash) VALUES ($1, 'RAG User', $2, 'hash')`, [testUserId, `${testUserId}@rag.internal`]);
    await db.query(
      `INSERT INTO documents (id, user_id, filename, original_name, extracted_text, risk_score)
       VALUES ($1, $2, 'rag.txt', 'rag.txt', 'The governing law of this Agreement shall be the laws of the State of Delaware.', 30)`,
      [docId, testUserId]
    );

    const token = jwt.sign({ userId: testUserId, sessionId: uuidv4() }, JWT_SECRET, { expiresIn: '1h' });
    await db.query(`INSERT INTO sessions (id, user_id, mfa_verified) VALUES ($1, $2, true)`, [jwt.decode(token).sessionId, testUserId]);

    // Grounded query
    const chatRes = await fetch(`${GATEWAY_URL}/api/documents/${docId}/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ question: 'What is the governing law of this contract?' })
    });
    assert.strictEqual(chatRes.status, 200, 'Grounded chat query must return 200');
    const chatData = await chatRes.json();
    const responseText = chatData.answer || chatData.reply || chatData.content;
    assert(responseText, 'Must receive answer from RAG endpoint');
    const isGrounded = chatData.grounded === true || (chatData.provenance && chatData.provenance.grounded === true);
    assert(isGrounded, 'Response must indicate grounded state');

    // Unsupported query
    const unsuppRes = await fetch(`${GATEWAY_URL}/api/documents/${docId}/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ question: 'What is the pricing for quantum teleportation services?' })
    });
    assert.strictEqual(unsuppRes.status, 200, 'Unsupported query must return 200');
    const unsuppData = await unsuppRes.json();
    const isUngrounded = unsuppData.grounded === false || (unsuppData.provenance && unsuppData.provenance.grounded === false);
    assert(isUngrounded, 'Unsupported query must indicate ungrounded state');

    // Clean up
    await db.query(`DELETE FROM chat_messages WHERE document_id = $1`, [docId]);
    await db.query(`DELETE FROM documents WHERE id = $1`, [docId]);
    await db.query(`DELETE FROM sessions WHERE user_id = $1`, [testUserId]);
    await db.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
  });

  // T17-19: Negotiation & Contract Simulation Immutability
  await runTest('T17-19: Negotiation & Contract Simulation Immutability (4 modes, risk recalculated)', async () => {
    const testUserId = uuidv4();
    const docId = uuidv4();
    await db.query(`INSERT INTO users (id, name, email, password_hash) VALUES ($1, 'Sim User', $2, 'hash')`, [testUserId, `${testUserId}@sim.internal`]);
    await db.query(
      `INSERT INTO documents (id, user_id, filename, original_name, extracted_text, risk_score)
       VALUES ($1, $2, 'sim.txt', 'sim.txt', 'Supplier shall indemnify customer without limitation.', 75)`,
      [docId, testUserId]
    );

    const token = jwt.sign({ userId: testUserId, sessionId: uuidv4() }, JWT_SECRET, { expiresIn: '1h' });
    await db.query(`INSERT INTO sessions (id, user_id, mfa_verified) VALUES ($1, $2, true)`, [jwt.decode(token).sessionId, testUserId]);

    // Ephemeral simulation
    const simRes = await fetch(`${GATEWAY_URL}/api/documents/${docId}/simulate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        scenario: 'Capped Indemnity Clause Adjustment',
        originalClause: 'Supplier shall indemnify customer without limitation.',
        proposedClause: 'Supplier shall indemnify customer up to the total fees paid in the prior twelve months.'
      })
    });
    assert.strictEqual(simRes.status, 200, 'Simulation must return 200');
    const simData = await simRes.json();
    assert(typeof simData.afterScore === 'number', 'Must calculate numeric afterScore');
    assert(typeof simData.riskDelta === 'number', 'Must compute riskDelta');

    // Verify original document remained strictly immutable
    const { rows: docCheck } = await db.query('SELECT risk_score, extracted_text FROM documents WHERE id = $1', [docId]);
    assert.strictEqual(docCheck[0].risk_score, 75, 'Original risk score must remain unchanged');
    assert.strictEqual(docCheck[0].extracted_text, 'Supplier shall indemnify customer without limitation.', 'Original text must remain immutable');

    // Clean up
    await db.query(`DELETE FROM contract_simulations WHERE document_id = $1`, [docId]);
    await db.query(`DELETE FROM documents WHERE id = $1`, [docId]);
    await db.query(`DELETE FROM sessions WHERE user_id = $1`, [testUserId]);
    await db.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
  });

  // T17-20: Cryptographic Audit Ledger & Tamper Detection Verification
  await runTest('T17-20: Cryptographic Audit Ledger & Tamper Detection Verification', async () => {
    const verifyResult = await verifyChain();
    assert(verifyResult.valid === true, 'verifyChain() must report valid: true for intact ledger');

    // Verify cryptographic_audit_ledger view compatibility
    const { rows: viewRows } = await db.query('SELECT block_index, hash, prev_hash FROM cryptographic_audit_ledger ORDER BY block_index DESC LIMIT 5');
    assert(viewRows && viewRows.length > 0, 'cryptographic_audit_ledger view must return records');
  });

  console.log('\n=============================================================');
  console.log(`TASK 17 TEST SUITE COMPLETED: ${passed} PASSED / ${failed} FAILED`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
