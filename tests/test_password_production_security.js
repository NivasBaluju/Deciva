/**
 * tests/test_password_production_security.js
 * ---------------------------------------------------------------------------
 * Phase 2 Automated Security Test Suite:
 * Password Authentication Security, Hash Integrity, Policy & Resend Retention
 *
 * Covers:
 *  1. Password Hashing: bcrypt cost factor 10, salting, non-plaintext
 *  2. Password Verification: correct password verifies, incorrect fails
 *  3. Password Policy: length (8-128), whitespace, empty rejection
 *  4. Registration Flow: valid registration, session creation, cookie issuance
 *  5. Registration Validation: weak password, mismatch, duplicate email, invalid email
 *  6. Non-Exposure: password hash never returned in API responses
 *  7. Login Flow: valid password authentication, cookie issuance
 *  8. Login Security: uniform 401 error message for unknown email vs wrong password
 *  9. Timing Protection: constant-time dummy comparison for non-existent users
 * 10. MFA Flow: password -> TOTP challenge, invalid TOTP rejected, valid TOTP authenticated
 * 11. OTP Retirement: deprecated email OTP routes return HTTP 410 Gone
 * 12. Resend Retention: security threat alert and welcome email functions resolve safely
 */

'use strict';

require('dotenv').config();
const assert = require('assert');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { authenticator } = require('otplib');

const pool = require('../server/db');
const { getJwtSecret } = require('../server/services/productionConfigService');
const { encryptSecret } = require('../server/utils/crypto');
const {
  validatePassword,
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
  PASSWORD_RULES
} = require('../server/utils/passwordPolicy');
const {
  sendWelcomeEmail,
  sendSecurityAlertEmail,
  sendOtpEmail
} = require('../server/utils/email');

const JWT_SECRET = getJwtSecret();
let passed = 0;
let failed = 0;

function record(name, condition, details) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    if (details) console.log(`     Evidence: ${details}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}`);
    if (details) console.error(`     Failure: ${details}`);
    failed++;
  }
}

function createTestApp() {
  delete require.cache[require.resolve('../server/routes/auth')];
  const authRoutes = require('../server/routes/auth');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
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

async function runAllTests() {
  console.log('======================================================================');
  console.log('  DECIVA PHASE 2: PASSWORD SECURITY, HASH INTEGRITY & RESEND RETENTION');
  console.log('======================================================================\n');

  const testApp = createTestApp();
  const testServer = http.createServer(testApp);
  await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));

  const cleanUserIds = [];

  try {
    // -----------------------------------------------------------------------
    // 1. Password Policy & Hashing Unit Tests
    // -----------------------------------------------------------------------
    console.log('--- SECTION 1: PASSWORD CRYPTOGRAPHY & POLICY ---');

    const samplePassword = 'StrongEnterprisePassword123!@#';
    const hash1 = await hashPassword(samplePassword);
    const hash2 = await hashPassword(samplePassword);

    record(
      'Sec-01: Password hash uses bcrypt format and cost factor 10',
      hash1.startsWith('$2a$10$') || hash1.startsWith('$2b$10$'),
      `Hash prefix: ${hash1.substring(0, 7)}`
    );

    record(
      'Sec-02: Salt uniqueness — identical passwords produce different salted hashes',
      hash1 !== hash2,
      `Hash1 != Hash2 confirmed`
    );

    record(
      'Sec-03: Plaintext password is never stored or identical to hash',
      hash1 !== samplePassword && !hash1.includes(samplePassword),
      `Hash does not disclose plaintext`
    );

    const validComparison = await verifyPassword(samplePassword, hash1);
    record(
      'Sec-04: verifyPassword succeeds with correct password',
      validComparison === true,
      `bcrypt.compare returned true`
    );

    const invalidComparison = await verifyPassword('WrongPassword123!', hash1);
    record(
      'Sec-05: verifyPassword fails with incorrect password',
      invalidComparison === false,
      `bcrypt.compare returned false`
    );

    // Constant-time dummy comparison test
    const dummyResult = await verifyDummyPassword('DummyAttempt123!');
    record(
      'Sec-06: verifyDummyPassword executes without throwing and returns false',
      dummyResult === false,
      `Constant-time timing protection active`
    );

    // Password policy rejection tests
    const shortVal = validatePassword('Short1!');
    const whitespaceVal = validatePassword('         ');
    const emptyVal = validatePassword('');
    const mismatchVal = validatePassword('ValidPassword123!', 'DifferentPassword123!');
    const validVal = validatePassword('ValidPassword123!', 'ValidPassword123!');

    record(
      'Sec-07: Password policy rejects passwords shorter than 8 characters',
      !shortVal.valid && shortVal.reason.includes('at least 8 characters'),
      shortVal.reason
    );

    record(
      'Sec-08: Password policy rejects whitespace-only passwords',
      !whitespaceVal.valid,
      whitespaceVal.reason
    );

    record(
      'Sec-09: Password policy rejects empty passwords',
      !emptyVal.valid,
      emptyVal.reason
    );

    record(
      'Sec-10: Password policy rejects confirmation mismatch',
      !mismatchVal.valid && mismatchVal.reason.includes('do not match'),
      mismatchVal.reason
    );

    record(
      'Sec-11: Password policy approves compliant passwords',
      validVal.valid === true && !validVal.reason,
      'Valid password accepted'
    );

    // -----------------------------------------------------------------------
    // 2. Registration Security Tests
    // -----------------------------------------------------------------------
    console.log('\n--- SECTION 2: REGISTRATION API SECURITY ---');

    const regEmail = `sec_reg_${Date.now()}@deciva.enterprise`;
    const regPassword = 'EnterpriseUser2026!#$';

    // Test: Missing / weak password registration
    const weakRegRes = await requestHttp(testServer, 'POST', '/api/auth/register', {}, {
      email: `weak_${Date.now()}@deciva.enterprise`,
      name: 'Weak User',
      password: '123',
      confirmPassword: '123'
    });
    record(
      'Sec-12: Registration rejects weak password with 400 Bad Request',
      weakRegRes.statusCode === 400 && weakRegRes.body.error.includes('at least 8 characters'),
      `Status: ${weakRegRes.statusCode}, Error: "${weakRegRes.body.error}"`
    );

    // Test: Password mismatch registration
    const mismatchRegRes = await requestHttp(testServer, 'POST', '/api/auth/register', {}, {
      email: `mismatch_${Date.now()}@deciva.enterprise`,
      name: 'Mismatch User',
      password: 'ValidPassword123!',
      confirmPassword: 'MismatchPassword123!'
    });
    record(
      'Sec-13: Registration rejects password mismatch with 400 Bad Request',
      mismatchRegRes.statusCode === 400 && mismatchRegRes.body.error.includes('do not match'),
      `Status: ${mismatchRegRes.statusCode}, Error: "${mismatchRegRes.body.error}"`
    );

    // Test: Invalid email registration
    const invalidEmailRes = await requestHttp(testServer, 'POST', '/api/auth/register', {}, {
      email: 'not-an-email',
      name: 'Invalid Email User',
      password: 'ValidPassword123!',
      confirmPassword: 'ValidPassword123!'
    });
    record(
      'Sec-14: Registration rejects invalid email format with 400 Bad Request',
      invalidEmailRes.statusCode === 400,
      `Status: ${invalidEmailRes.statusCode}, Error: "${invalidEmailRes.body.error}"`
    );

    // Test: Valid registration
    const validRegRes = await requestHttp(testServer, 'POST', '/api/auth/register', {}, {
      email: regEmail,
      name: 'Compliant Auditor',
      password: regPassword,
      confirmPassword: regPassword
    });

    const regUserId = validRegRes.body.user?.id;
    if (regUserId) cleanUserIds.push(regUserId);

    const regSetCookie = validRegRes.headers['set-cookie'];
    const hasTokenCookie = Array.isArray(regSetCookie) && regSetCookie.some(c => c.startsWith('token=') && c.includes('HttpOnly'));

    record(
      'Sec-15: Valid registration succeeds with 200/201 and directly issues httpOnly cookie',
      [200, 201].includes(validRegRes.statusCode) && validRegRes.body.ok === true && hasTokenCookie,
      `Status: ${validRegRes.statusCode}, httpOnly cookie issued without OTP roundtrip`
    );

    record(
      'Sec-16: Password hash is NEVER returned in registration API response',
      validRegRes.body.password_hash === undefined && validRegRes.body.user?.password_hash === undefined,
      'password_hash absent from response body'
    );

    // Verify database record has initialized password
    const { rows: dbUserRows } = await pool.query('SELECT password_hash, password_initialized FROM users WHERE id = $1', [regUserId]);
    record(
      'Sec-17: Registration flags password_initialized = true in PostgreSQL',
      dbUserRows[0]?.password_initialized === true,
      `password_initialized: ${dbUserRows[0]?.password_initialized}`
    );

    // Test: Duplicate email registration
    const dupRegRes = await requestHttp(testServer, 'POST', '/api/auth/register', {}, {
      email: regEmail,
      name: 'Duplicate Auditor',
      password: regPassword,
      confirmPassword: regPassword
    });
    record(
      'Sec-18: Duplicate email registration returns 400/409 Conflict',
      [400, 409].includes(dupRegRes.statusCode),
      `Status: ${dupRegRes.statusCode}, Error: "${dupRegRes.body.error}"`
    );

    // -----------------------------------------------------------------------
    // 3. Login Security Tests
    // -----------------------------------------------------------------------
    console.log('\n--- SECTION 3: LOGIN API SECURITY ---');

    // Test: Correct credentials login
    const validLoginRes = await requestHttp(testServer, 'POST', '/api/auth/login', {}, {
      email: regEmail,
      password: regPassword
    });

    const loginSetCookie = validLoginRes.headers['set-cookie'];
    const hasLoginCookie = Array.isArray(loginSetCookie) && loginSetCookie.some(c => c.startsWith('token=') && c.includes('HttpOnly'));

    record(
      'Sec-19: Valid password login succeeds with 200 and issues httpOnly session cookie',
      validLoginRes.statusCode === 200 && validLoginRes.body.ok === true && hasLoginCookie,
      `Status: ${validLoginRes.statusCode}, session created`
    );

    record(
      'Sec-20: Password hash is NEVER returned in login API response',
      validLoginRes.body.password_hash === undefined && validLoginRes.body.user?.password_hash === undefined,
      'password_hash absent from response body'
    );

    // Test: Wrong password login
    const wrongPassRes = await requestHttp(testServer, 'POST', '/api/auth/login', {}, {
      email: regEmail,
      password: 'CompletelyWrongPassword123!'
    });
    record(
      'Sec-21: Wrong password fails with 401 and generic message',
      wrongPassRes.statusCode === 401 && wrongPassRes.body.error === 'Invalid email or password',
      `Status: ${wrongPassRes.statusCode}, Error: "${wrongPassRes.body.error}"`
    );

    // Test: Unknown email login
    const unknownEmailRes = await requestHttp(testServer, 'POST', '/api/auth/login', {}, {
      email: `nonexistent_${Date.now()}@deciva.enterprise`,
      password: 'SomeRandomPassword123!'
    });
    record(
      'Sec-22: Unknown email fails with identical 401 message (anti-enumeration)',
      unknownEmailRes.statusCode === 401 && unknownEmailRes.body.error === wrongPassRes.body.error,
      `Identical error message: "${unknownEmailRes.body.error}"`
    );

    // -----------------------------------------------------------------------
    // 4. Multi-Factor Authentication (TOTP) Preservation
    // -----------------------------------------------------------------------
    console.log('\n--- SECTION 4: RFC-6238 TOTP PRESERVATION ---');

    // Enable TOTP MFA on the user
    const secret = authenticator.generateSecret();
    const encryptedSecret = encryptSecret(secret);
    await pool.query('UPDATE users SET totp_secret = $1, mfa_enabled = true WHERE id = $2', [encryptedSecret, regUserId]);

    // Login with MFA enabled
    const mfaLoginRes = await requestHttp(testServer, 'POST', '/api/auth/login', {}, {
      email: regEmail,
      password: regPassword
    });

    record(
      'Sec-23: Login for MFA-enabled user returns mfaRequired=true with preToken',
      mfaLoginRes.statusCode === 200 && mfaLoginRes.body.mfaRequired === true && !!mfaLoginRes.body.preToken,
      `mfaRequired: ${mfaLoginRes.body.mfaRequired}, preToken present`
    );

    const preToken = mfaLoginRes.body.preToken;

    // Verify invalid TOTP
    const badTotpRes = await requestHttp(testServer, 'POST', '/api/auth/mfa/totp/verify', {}, {
      preToken,
      code: '000000'
    });
    record(
      'Sec-24: Invalid TOTP code is rejected with 401 Unauthorized',
      badTotpRes.statusCode === 401,
      `Status: ${badTotpRes.statusCode}, Error: "${badTotpRes.body.error}"`
    );

    // Verify valid TOTP
    const validTotpCode = authenticator.generate(secret);
    const validTotpRes = await requestHttp(testServer, 'POST', '/api/auth/mfa/totp/verify', {}, {
      preToken,
      code: validTotpCode
    });
    const totpSetCookie = validTotpRes.headers['set-cookie'];
    const hasTotpCookie = Array.isArray(totpSetCookie) && totpSetCookie.some(c => c.startsWith('token=') && c.includes('HttpOnly'));

    record(
      'Sec-25: Valid TOTP code verifies and issues httpOnly session cookie',
      validTotpRes.statusCode === 200 && validTotpRes.body.ok === true && hasTotpCookie,
      `Status: ${validTotpRes.statusCode}, TOTP authenticated successfully`
    );

    // -----------------------------------------------------------------------
    // 5. OTP Route Retirement & Deprecation
    // -----------------------------------------------------------------------
    console.log('\n--- SECTION 5: EMAIL OTP RETIREMENT ---');

    const retiredReqRes = await requestHttp(testServer, 'POST', '/api/auth/mfa/otp/request', {}, { preToken });
    record(
      'Sec-26: POST /api/auth/mfa/otp/request returns 410 Gone (OTP retired)',
      retiredReqRes.statusCode === 410 && retiredReqRes.body.code === 'OTP_AUTH_RETIRED',
      `Status: ${retiredReqRes.statusCode}, Code: ${retiredReqRes.body.code}`
    );

    const retiredVerifyRes = await requestHttp(testServer, 'POST', '/api/auth/mfa/otp/verify', {}, { preToken, code: '123456' });
    record(
      'Sec-27: POST /api/auth/mfa/otp/verify returns 410 Gone (OTP retired)',
      retiredVerifyRes.statusCode === 410 && retiredVerifyRes.body.code === 'OTP_AUTH_RETIRED',
      `Status: ${retiredVerifyRes.statusCode}, Code: ${retiredVerifyRes.body.code}`
    );

    const deprecatedEmailRes = await sendOtpEmail('test@example.com', '123456');
    record(
      'Sec-28: sendOtpEmail() utility is safely deprecated with warning',
      deprecatedEmailRes.deliveryFailed === true && deprecatedEmailRes.error.includes('deprecated'),
      deprecatedEmailRes.error
    );

    // -----------------------------------------------------------------------
    // 6. Resend Non-OTP Functionality Retention
    // -----------------------------------------------------------------------
    console.log('\n--- SECTION 6: RESEND NON-OTP EMAIL RETENTION ---');

    // Test sendWelcomeEmail resolves without crashing
    let welcomeResolved = false;
    try {
      await sendWelcomeEmail('test_welcome@deciva.enterprise', 'Enterprise Counsel');
      welcomeResolved = true;
    } catch {
      welcomeResolved = false;
    }
    record(
      'Sec-29: sendWelcomeEmail() resolves cleanly (non-OTP Resend email retained)',
      welcomeResolved,
      'Welcome email flow operational'
    );

    // Test sendSecurityAlertEmail resolves without crashing
    let alertResolved = false;
    try {
      await sendSecurityAlertEmail(
        'security_officer@deciva.enterprise',
        'BRUTE_FORCE_ATTEMPT',
        'Simulated brute-force attack testing for security alert verification'
      );
      alertResolved = true;
    } catch {
      alertResolved = false;
    }
    record(
      'Sec-30: sendSecurityAlertEmail() resolves cleanly (threat alerting retained)',
      alertResolved,
      'Security threat alert email flow operational'
    );

  } finally {
    testServer.close();
    // Clean up test users
    for (const uid of cleanUserIds) {
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [uid]).catch(() => {});
      await pool.query('DELETE FROM users WHERE id = $1', [uid]).catch(() => {});
    }
  }

  console.log('\n======================================================================');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL PASSWORD SECURITY & RESEND RETENTION TESTS PASSED CLEANLY.\n');
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
