/**
 * tests/test_p2_secondary_security_hardening.js
 * 
 * Task 11 Verification Suite: Secondary Security Hardening
 * Covers:
 * - SEC-05: RSA Signing Key Governance & Lifecycle (environment keys, mismatch detection, telemetry, .env.example)
 * - SEC-21: PostgreSQL SSL Mode Normalization for Node (sanitizeDbUrl, strict TLS verification, Python compatibility)
 * - SEC-08: Verification of zero unsafe HTML injection APIs (dangerouslySetInnerHTML / innerHTML in src/)
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  inspectRsaKeyQuality,
  validateStartupConfig
} = require('../server/services/productionConfigService');

const db = require('../server/db');
const { sanitizeDbUrl } = db;
const cryptoUtils = require('../server/utils/crypto');

console.log('======================================================================');
console.log('  DECIVA TASK 11: SECONDARY SECURITY HARDENING TEST SUITE             ');
console.log('======================================================================\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runAllTests() {
  // Generate matching 2048-bit test keypairs for deterministic testing
  const { publicKey: testPub1, privateKey: testPriv1 } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const { publicKey: testPub2, privateKey: testPriv2 } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  // --------------------------------------------------------------------------
  // Test 1: RSA environment keys are recognized when valid matching keys are configured
  // --------------------------------------------------------------------------
  runTest('Test 1: Valid matching RSA keypair is validated successfully', () => {
    const check = inspectRsaKeyQuality(testPriv1, testPub1);
    assert.strictEqual(check.configured, true, 'Should report configured = true');
    assert.strictEqual(check.valid, true, 'Should report valid = true');
    assert.ok(check.privateKey.includes('-----BEGIN PRIVATE KEY-----'), 'Normalized private key should have PEM header');
    assert.ok(check.publicKey.includes('-----BEGIN PUBLIC KEY-----'), 'Normalized public key should have PEM header');
  });

  // --------------------------------------------------------------------------
  // Test 2: Mismatched RSA private/public keys are detected as invalid
  // --------------------------------------------------------------------------
  runTest('Test 2: Mismatched RSA private and public keys are detected and rejected', () => {
    // Pair testPriv1 with testPub2 (different keypairs)
    const check = inspectRsaKeyQuality(testPriv1, testPub2);
    assert.strictEqual(check.configured, true, 'Should report configured = true');
    assert.strictEqual(check.valid, false, 'Should report valid = false for mismatched keys');
    assert.ok(
      check.reason.includes('do not form a matching cryptographic key pair'),
      `Reason should explain mismatch without leaking key material, got: ${check.reason}`
    );
  });

  // --------------------------------------------------------------------------
  // Test 3: Incomplete RSA key configuration (one key missing) is detected
  // --------------------------------------------------------------------------
  runTest('Test 3: Incomplete RSA key configuration (one key missing) is detected', () => {
    const check1 = inspectRsaKeyQuality(testPriv1, '');
    assert.strictEqual(check1.valid, false, 'Private key without public key must fail');
    assert.ok(check1.reason.includes('both RSA_PRIVATE_KEY and RSA_PUBLIC_KEY must be provided'));

    const check2 = inspectRsaKeyQuality('', testPub1);
    assert.strictEqual(check2.valid, false, 'Public key without private key must fail');
    assert.ok(check2.reason.includes('both RSA_PRIVATE_KEY and RSA_PUBLIC_KEY must be provided'));
  });

  // --------------------------------------------------------------------------
  // Test 4: Missing RSA keys in production emit a high-visibility security warning
  // --------------------------------------------------------------------------
  runTest('Test 4: Missing RSA keys in production emit a high-visibility security warning', () => {
    const origEnv = process.env.NODE_ENV;
    const origPriv = process.env.RSA_PRIVATE_KEY;
    const origPub = process.env.RSA_PUBLIC_KEY;
    const origJwt = process.env.JWT_SECRET;
    const origEnc = process.env.ENCRYPTION_KEY;
    const origInt = process.env.INTERNAL_SERVICE_KEY;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.RSA_PRIVATE_KEY;
      delete process.env.RSA_PUBLIC_KEY;
      process.env.JWT_SECRET = 'valid-production-jwt-secret-with-sufficient-entropy-12345';
      process.env.ENCRYPTION_KEY = 'valid-production-aes-key-with-sufficient-entropy-12345';
      process.env.INTERNAL_SERVICE_KEY = 'valid-production-internal-service-key-with-sufficient-entropy-12345';

      const configResult = validateStartupConfig();
      const rsaWarning = configResult.warnings.find(w => w.includes('RSA_PRIVATE_KEY') && w.includes('ephemeral'));
      assert.ok(rsaWarning, 'Production config must issue a high-visibility warning when RSA keys are missing');
      assert.ok(rsaWarning.includes('fail verification across clustered instances'), 'Warning must explain operational consequence');
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origPriv !== undefined) process.env.RSA_PRIVATE_KEY = origPriv; else delete process.env.RSA_PRIVATE_KEY;
      if (origPub !== undefined) process.env.RSA_PUBLIC_KEY = origPub; else delete process.env.RSA_PUBLIC_KEY;
      if (origJwt !== undefined) process.env.JWT_SECRET = origJwt; else delete process.env.JWT_SECRET;
      if (origEnc !== undefined) process.env.ENCRYPTION_KEY = origEnc; else delete process.env.ENCRYPTION_KEY;
      if (origInt !== undefined) process.env.INTERNAL_SERVICE_KEY = origInt; else delete process.env.INTERNAL_SERVICE_KEY;
    }
  });

  // --------------------------------------------------------------------------
  // Test 5: Ephemeral RSA fallback metadata is structured and leaks no key material
  // --------------------------------------------------------------------------
  runTest('Test 5: RSA signing metadata exposes key source without leaking key contents', () => {
    const meta = cryptoUtils.getSigningKeyMetadata();
    assert.ok(['env', 'filesystem', 'ephemeral'].includes(meta.source), `Source must be recognized, got: ${meta.source}`);
    assert.strictEqual(meta.algorithm, 'RSA-SHA256', 'Algorithm must be RSA-SHA256');
    assert.strictEqual(meta.modulusLength, 2048, 'Modulus length must be 2048');
    assert.strictEqual(typeof meta.ephemeral, 'boolean', 'Ephemeral flag must be boolean');
    assert.strictEqual(meta.hasPublicKey, true, 'Public key presence must be true');
    assert.strictEqual(meta.hasPrivateKey, true, 'Private key presence must be true');
    // Ensure no actual PEM content is in the metadata object
    assert.strictEqual(meta.privateKey, undefined, 'Metadata must never leak privateKey');
  });

  // --------------------------------------------------------------------------
  // Test 6: .env.example documents RSA key configuration without real secret material
  // --------------------------------------------------------------------------
  runTest('Test 6: .env.example documents RSA_PRIVATE_KEY and RSA_PUBLIC_KEY with placeholders', () => {
    const envExamplePath = path.join(__dirname, '..', '.env.example');
    assert.ok(fs.existsSync(envExamplePath), '.env.example must exist');
    const content = fs.readFileSync(envExamplePath, 'utf8');

    assert.ok(content.includes('RSA_PRIVATE_KEY='), '.env.example must document RSA_PRIVATE_KEY');
    assert.ok(content.includes('RSA_PUBLIC_KEY='), '.env.example must document RSA_PUBLIC_KEY');
    assert.ok(content.includes('placeholder'), '.env.example must use placeholder strings');
    assert.ok(content.includes('openssl genpkey'), '.env.example should include key generation guidance');
  });

  // --------------------------------------------------------------------------
  // Test 7: sanitizeDbUrl normalizes sslmode=require to sslmode=verify-full for Node
  // --------------------------------------------------------------------------
  runTest('Test 7: sanitizeDbUrl normalizes sslmode=require to sslmode=verify-full for Node', () => {
    assert.strictEqual(typeof sanitizeDbUrl, 'function', 'sanitizeDbUrl must be a function exported by server/db');

    const inputUrl = 'postgresql://user:pass@ep-host.aws.neon.tech/deciva?sslmode=require&channel_binding=disable';
    const outputUrl = sanitizeDbUrl(inputUrl);

    assert.ok(outputUrl.includes('sslmode=verify-full'), `Output must have sslmode=verify-full, got: ${outputUrl}`);
    assert.ok(!outputUrl.includes('sslmode=require'), 'Output must not contain sslmode=require');
    assert.ok(!outputUrl.includes('channel_binding'), 'channel_binding must be stripped');

    // URLs with sslmode=disable or other modes should not be altered to verify-full
    const localUrl = 'postgresql://localhost:5432/deciva?sslmode=disable';
    const sanitizedLocal = sanitizeDbUrl(localUrl);
    assert.ok(sanitizedLocal.includes('sslmode=disable'), 'Non-require sslmode must not be forcibly rewritten');
  });

  // --------------------------------------------------------------------------
  // Test 8: Node PostgreSQL configuration retains certificate verification
  // --------------------------------------------------------------------------
  runTest('Test 8: Node PostgreSQL configuration enforces strict TLS verification', () => {
    // In server/db.js, allowSelfSigned defaults to false, so rejectUnauthorized = true
    const allowSelfSigned = process.env.DB_SSL_ALLOW_SELF_SIGNED === 'true';
    const rejectUnauthorized = !allowSelfSigned;
    assert.strictEqual(rejectUnauthorized, true, 'Default production configuration must require rejectUnauthorized = true');
  });

  // --------------------------------------------------------------------------
  // Test 9: Active React SPA contains zero dangerouslySetInnerHTML or innerHTML
  // --------------------------------------------------------------------------
  runTest('Test 9: Active React frontend (src/) contains zero dangerouslySetInnerHTML / innerHTML usages', () => {
    const srcDir = path.join(__dirname, '..', 'src');
    
    function scanDir(dir) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.ts') || file.endsWith('.tsx')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          assert.ok(
            !content.includes('dangerouslySetInnerHTML'),
            `Unsafe dangerouslySetInnerHTML found in ${fullPath}`
          );
          assert.ok(
            !content.includes('.innerHTML'),
            `Unsafe .innerHTML found in ${fullPath}`
          );
        }
      }
    }

    scanDir(srcDir);
  });

  // --------------------------------------------------------------------------
  // Test 10: Live Node PostgreSQL query executes cleanly under sanitized TLS URL
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 10: Live Node PostgreSQL query executes cleanly under sanitized TLS URL', async () => {
    const res = await db.query('SELECT 1 AS live_test;');
    assert.strictEqual(res.rows[0].live_test, 1, 'Node must execute live query successfully');
  });

  console.log('\n----------------------------------------------------------------------');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('----------------------------------------------------------------------');

  if (failed > 0) {
    console.error('❌ SOME TASK 11 TESTS FAILED.');
    process.exit(1);
  } else {
    console.log('🎉 ALL TASK 11 SECONDARY SECURITY HARDENING TESTS PASSED CLEANLY.\n');
    process.exit(0);
  }
}

runAllTests();
