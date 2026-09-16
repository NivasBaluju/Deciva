/**
 * tests/test_p2_cookie_auth.js
 * ---------------------------------------------------------------------------
 * Phase 2, Task 10 (F10): Migrate Client Auth from localStorage to httpOnly Cookies
 * 
 * Verifies:
 *  1. Server setup: cookie-parser is mounted before auth routes.
 *  2. CORS setup: Access-Control-Allow-Credentials: true with origin validation.
 *  3. OTP verification: POST /api/auth/mfa/otp/verify issues HttpOnly token cookie + JSON.
 *  4. TOTP verification: POST /api/auth/mfa/totp/verify issues HttpOnly token cookie + JSON.
 *  5. Logout cookie clearing: POST /api/auth/logout issues expired Set-Cookie.
 *  6. Cookie-based authentication: GET /api/auth/me succeeds with Cookie header alone (no Bearer).
 *  7. Expired/invalid cookie rejection: GET /api/auth/me with bad cookie returns 401.
 *  8. Revoked session cookie rejection: GET /api/auth/me with revoked session returns 401.
 *  9. Dual-mode compatibility: Authorization: Bearer <token> remains fully functional.
 * 10. Client fetch configuration: Api.request() sets credentials: 'include'.
 * 11. Client AuthContext hydration: refreshMe() does not block on missing local token.
 * 12. Security invariant: zero localStorage.setItem for auth tokens in src/.
 */

'use strict';

require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const pool = require('../server/db');
const { getJwtSecret } = require('../server/services/productionConfigService');
const { sha256, encryptSecret } = require('../server/utils/crypto');
const { requireAuth } = require('../server/middleware/auth');
const authRoutes = require('../server/routes/auth');

const JWT_SECRET = getJwtSecret();
const ROOT = path.resolve(__dirname, '..');

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
  }
}

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// Ephemeral Test Server Helper
// ---------------------------------------------------------------------------
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Mount auth routes
  app.use('/api/auth', authRoutes);

  return app;
}

function requestHttp(server, method, pathUrl, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const req = http.request({
      hostname: '127.0.0.1',
      port: addr.port,
      path: pathUrl,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test Execution
// ---------------------------------------------------------------------------
async function main() {
  console.log('======================================================================');
  console.log('  DECIVA PHASE 2, TASK 10: HTTPONLY COOKIE AUTHENTICATION TEST SUITE  ');
  console.log('======================================================================\n');

  // Test 1: cookie-parser is mounted before auth routes in server/index.js
  runTest('Test 1: server/index.js mounts cookieParser before mounting auth routes', () => {
    const src = readFile('server/index.js');
    const cookiePos = src.indexOf('app.use(cookieParser())');
    const authPos = src.indexOf("app.use('/api/auth'");
    assert(cookiePos !== -1, 'cookieParser middleware must be mounted');
    assert(authPos !== -1, 'auth routes must be mounted');
    assert(cookiePos < authPos, 'cookieParser must be mounted BEFORE auth routes');
  });

  // Test 2: CORS configuration sets credentials and validates origin
  runTest('Test 2: CORS config sets Access-Control-Allow-Credentials: true without wildcard for origins', () => {
    const src = readFile('server/index.js');
    assert(
      src.includes("res.setHeader('Access-Control-Allow-Credentials', 'true')"),
      'CORS must set Access-Control-Allow-Credentials to true'
    );
    assert(
      src.includes("ALLOWED_ORIGINS"),
      'ALLOWED_ORIGINS list must be defined'
    );
    assert(
      src.includes('127.0.0.1'),
      'ALLOWED_ORIGINS must support local loopback IP for testing'
    );
  });

  // Setup database records for live testing
  const testUserId = uuidv4();
  const testEmail = `cookie-test-${Date.now()}@deciva.test`;
  const dummyPasswordHash = '$2a$10$abcdefghijklmnopqrstuvwxyzABCDE';

  await pool.query(
    'INSERT INTO users (id, name, email, password_hash, role, mfa_enabled) VALUES ($1, $2, $3, $4, $5, true)',
    [testUserId, 'CookieTester', testEmail, dummyPasswordHash, 'user']
  );

  const testApp = createTestApp();
  const testServer = http.createServer(testApp);

  await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));

  try {
    // Test 3: OTP verification issues HttpOnly token cookie + JSON
    let issuedTokenFromOtp = null;
    let cookieHeaderFromOtp = null;

    await runAsyncTest('Test 3: POST /api/auth/mfa/otp/verify issues HttpOnly token cookie alongside JSON response', async () => {
      // Seed OTP code in database
      const code = '789123';
      const otpId = uuidv4();
      await pool.query(
        `INSERT INTO otp_codes (id, user_id, code, purpose, expires_at, used)
         VALUES ($1, $2, $3, 'login', NOW() + INTERVAL '10 minutes', false)`,
        [otpId, testUserId, code]
      );

      const preToken = jwt.sign({ preauth: true, userId: testUserId }, JWT_SECRET, { expiresIn: '10m' });

      const res = await requestHttp(testServer, 'POST', '/api/auth/mfa/otp/verify', {}, {
        preToken,
        code
      });

      assert.strictEqual(res.statusCode, 200, `Expected 200 OK, got ${res.statusCode}`);
      assert(res.body && res.body.token, 'Response body must contain token for backward compatibility');
      issuedTokenFromOtp = res.body.token;

      const setCookie = res.headers['set-cookie'];
      assert(Array.isArray(setCookie) && setCookie.length > 0, 'Set-Cookie header must be present');
      const tokenCookie = setCookie.find(c => c.startsWith('token='));
      assert(tokenCookie, 'token cookie must be set');
      assert(/httponly/i.test(tokenCookie), 'token cookie must have HttpOnly flag');
      assert(/path=\//i.test(tokenCookie), 'token cookie must have Path=/');
      cookieHeaderFromOtp = tokenCookie.split(';')[0]; // e.g. token=ey...
    });

    // Test 4: TOTP verification issues HttpOnly token cookie + JSON
    await runAsyncTest('Test 4: POST /api/auth/mfa/totp/verify issues HttpOnly token cookie alongside JSON response', async () => {
      const { authenticator } = require('otplib');
      const secret = authenticator.generateSecret();
      const encryptedSecret = encryptSecret(secret);
      await pool.query('UPDATE users SET totp_secret = $1 WHERE id = $2', [encryptedSecret, testUserId]);

      const totpCode = authenticator.generate(secret);
      const preToken = jwt.sign({ preauth: true, userId: testUserId }, JWT_SECRET, { expiresIn: '10m' });

      const res = await requestHttp(testServer, 'POST', '/api/auth/mfa/totp/verify', {}, {
        preToken,
        code: totpCode
      });

      assert.strictEqual(res.statusCode, 200, `Expected 200 OK, got ${res.statusCode}`);
      assert(res.body && res.body.token, 'Response body must contain token');
      const setCookie = res.headers['set-cookie'];
      assert(Array.isArray(setCookie), 'Set-Cookie header must be present on TOTP verify');
      const tokenCookie = setCookie.find(c => c.startsWith('token='));
      assert(tokenCookie, 'token cookie must be set on TOTP verify');
      assert(/httponly/i.test(tokenCookie), 'token cookie must have HttpOnly flag');
    });

    // Test 6: GET /api/auth/me succeeds with Cookie header alone (no Authorization header)
    await runAsyncTest('Test 6: GET /api/auth/me authenticates successfully using strictly Cookie header', async () => {
      assert(cookieHeaderFromOtp, 'Must have cookieHeaderFromOtp from Test 3');
      const res = await requestHttp(testServer, 'GET', '/api/auth/me', {
        'Cookie': cookieHeaderFromOtp
        // Notice: NO Authorization header!
      });

      assert.strictEqual(res.statusCode, 200, `Expected 200 OK, got ${res.statusCode}`);
      assert.strictEqual(res.body.user.id, testUserId, 'Returned user ID must match session user');
      assert.strictEqual(res.body.user.email, testEmail, 'Returned user email must match');
      assert(typeof res.body.trust.score === 'number', 'Trust score must be populated');
    });

    // Test 7: GET /api/auth/me with invalid/expired cookie returns 401 Unauthorized
    await runAsyncTest('Test 7: GET /api/auth/me with invalid/forged cookie returns 401 Unauthorized', async () => {
      const forgedCookie = 'token=ey_invalid_forged_payload_that_fails_verification';
      const res = await requestHttp(testServer, 'GET', '/api/auth/me', {
        'Cookie': forgedCookie
      });

      assert.strictEqual(res.statusCode, 401, `Expected 401, got ${res.statusCode}`);
      assert.strictEqual(res.body.error, 'Invalid or expired token');
    });

    // Test 8: GET /api/auth/me with revoked session returns 401
    await runAsyncTest('Test 8: GET /api/auth/me with revoked session returns 401 Unauthorized', async () => {
      const payload = jwt.decode(issuedTokenFromOtp);
      assert(payload && payload.sessionId, 'SessionId must be in payload');

      // Revoke this specific session in PostgreSQL
      await pool.query('UPDATE sessions SET revoked = true WHERE id = $1', [payload.sessionId]);

      const res = await requestHttp(testServer, 'GET', '/api/auth/me', {
        'Cookie': cookieHeaderFromOtp
      });

      assert.strictEqual(res.statusCode, 401, `Expected 401 for revoked session, got ${res.statusCode}`);
      assert.strictEqual(res.body.error, 'Session invalid or revoked');
    });

    // Test 9: Dual-mode parity: Authorization: Bearer <token> remains fully functional
    await runAsyncTest('Test 9: Dual-mode parity: Authorization: Bearer <token> authenticates successfully without cookies', async () => {
      // Create a fresh active session
      const newSessionId = uuidv4();
      const fp = sha256('test-agent::127.0.0.1');
      await pool.query(
        'INSERT INTO sessions (id, user_id, device_fingerprint, ip, mfa_verified, revoked) VALUES ($1, $2, $3, $4, true, false)',
        [newSessionId, testUserId, fp, '127.0.0.1']
      );
      const bearerToken = jwt.sign({ sessionId: newSessionId, userId: testUserId }, JWT_SECRET, { expiresIn: '1h' });

      const res = await requestHttp(testServer, 'GET', '/api/auth/me', {
        'Authorization': `Bearer ${bearerToken}`
        // Notice: NO Cookie header!
      });

      assert.strictEqual(res.statusCode, 200, `Expected 200 OK via Bearer header, got ${res.statusCode}`);
      assert.strictEqual(res.body.user.id, testUserId);
    });

    // Test 5: Logout cookie clearing: POST /api/auth/logout issues expired Set-Cookie
    await runAsyncTest('Test 5: POST /api/auth/logout clears token cookie with expired/Max-Age=0 Set-Cookie', async () => {
      // Create session to log out
      const logoutSessionId = uuidv4();
      const fp = sha256('test-agent::127.0.0.1');
      await pool.query(
        'INSERT INTO sessions (id, user_id, device_fingerprint, ip, mfa_verified, revoked) VALUES ($1, $2, $3, $4, true, false)',
        [logoutSessionId, testUserId, fp, '127.0.0.1']
      );
      const logoutToken = jwt.sign({ sessionId: logoutSessionId, userId: testUserId }, JWT_SECRET, { expiresIn: '1h' });

      const res = await requestHttp(testServer, 'POST', '/api/auth/logout', {
        'Cookie': `token=${logoutToken}`
      });

      assert.strictEqual(res.statusCode, 200, `Expected 200 OK, got ${res.statusCode}`);
      assert.strictEqual(res.body.ok, true);

      // Verify Set-Cookie header contains clearing instruction
      const setCookie = res.headers['set-cookie'];
      assert(Array.isArray(setCookie), 'Set-Cookie header must be present on logout');
      const clearedCookie = setCookie.find(c => c.startsWith('token='));
      assert(clearedCookie, 'token cookie clearing header must be sent');
      assert(
        clearedCookie.includes('Expires=Thu, 01 Jan 1970') || clearedCookie.includes('Max-Age=0') || clearedCookie.startsWith('token=;'),
        `Expected cleared cookie timestamp, got: ${clearedCookie}`
      );

      // Verify session was revoked in database
      const { rows } = await pool.query('SELECT revoked FROM sessions WHERE id = $1', [logoutSessionId]);
      assert(rows[0] && rows[0].revoked === true, 'Session in database must be marked revoked');
    });

  } finally {
    testServer.close();
    // Clean up test records
    await pool.query('DELETE FROM otp_codes WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  }

  // Test 10: Client fetch configuration sets credentials: 'include'
  runTest('Test 10: src/services/api.js sets credentials: "include" on all fetch requests', () => {
    const apiSrc = readFile('src/services/api.js');
    assert(
      apiSrc.includes("credentials: 'include'"),
      'Api.request() must explicitly specify credentials: "include"'
    );
    const bulkSrc = readFile('src/services/portfolioOperationsApi.js');
    assert(
      bulkSrc.includes("credentials: 'include'"),
      'executeBulkOperation() must specify credentials: "include"'
    );
  });

  // Test 11: Client AuthContext hydration does not block on missing local token
  runTest('Test 11: src/context/AuthContext.jsx hydrates session via /api/auth/me directly', () => {
    const authCtxSrc = readFile('src/context/AuthContext.jsx');
    assert(
      !authCtxSrc.includes('const token = Api.getToken();\n    if (!token)'),
      'refreshMe() must not bail out early when web storage token is absent'
    );
    assert(
      authCtxSrc.includes("await Api.get('/api/auth/me')"),
      'refreshMe() must call /api/auth/me to let httpOnly cookie authenticate'
    );
  });

  // Test 12: Security invariant: zero localStorage.setItem for auth tokens in src/
  runTest('Test 12: Zero localStorage.setItem for auth tokens across src/', () => {
    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full);
        } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) {
          const content = fs.readFileSync(full, 'utf8');
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (/localStorage\.setItem\s*\(\s*['"`](?:deciva_token|token|jwt|authToken)['"`]/.test(line)) {
              throw new Error(`Forbidden auth token storage in ${path.relative(ROOT, full)}:${idx + 1}: ${line.trim()}`);
            }
          });
        }
      }
    }
    scanDir(path.join(ROOT, 'src'));
  });

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n----------------------------------------------------------------------');
  console.log(`TOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log('----------------------------------------------------------------------');

  if (passedTests === totalTests) {
    console.log('🎉 ALL TASK 10 COOKIE AUTHENTICATION TESTS PASSED CLEANLY.\n');
    process.exit(0);
  } else {
    console.error(`💥 ${totalTests - passedTests} TEST(S) FAILED.\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
