/**
 * tests/test_p0_secret_validation.js
 * Automated Regression Test Suite for P0 Secret Validation
 *
 * Spawns isolated Node child processes to validate productionConfigService.validateStartupConfig()
 * across all production fail-fast conditions and development fallback conditions.
 *
 * Asserts:
 *  1. Production + missing JWT_SECRET -> Process exits with failure (!= 0)
 *  2. Production + default JWT_SECRET -> Process exits with failure (!= 0)
 *  3. Production + missing ENCRYPTION_KEY -> Process exits with failure (!= 0)
 *  4. Production + default ENCRYPTION_KEY -> Process exits with failure (!= 0)
 *  5. Production + missing INTERNAL_SERVICE_KEY -> Process exits with failure (!= 0)
 *  6. Production + default INTERNAL_SERVICE_KEY -> Process exits with failure (!= 0)
 *  7. Production + weak secret (< 16 chars) -> Process exits with failure (!= 0)
 *  8. Production + valid production secrets -> Process exits cleanly (== 0)
 *  9. Development + missing / default secrets -> Process exits cleanly (== 0, dev workflow preserved)
 * 10. Security assertion: Secret values are never printed in diagnostic output
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const VALID_PROD_SECRETS = {
  JWT_SECRET: 'production_high_entropy_jwt_secret_994821',
  ENCRYPTION_KEY: 'production_aes_master_key_32_bytes_super_secure',
  INTERNAL_SERVICE_KEY: 'production_internal_microservice_secret_key_88412'
};

const servicePath = path.resolve(__dirname, '../server/services/productionConfigService.js');

function runIsolatedValidation(envOverrides) {
  // Isolate environment completely: clear process.env secrets
  const baseEnv = {
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT,
    NODE_ENV: envOverrides.NODE_ENV || 'production'
  };

  const env = { ...baseEnv, ...envOverrides };

  const script = `
    const { validateStartupConfig } = require(${JSON.stringify(servicePath)});
    try {
      const res = validateStartupConfig();
      if (res && (res.valid || res.isValid)) {
        console.log('[TEST_OUTPUT] VALIDATION_SUCCESS');
        process.exit(0);
      } else {
        console.error('[TEST_OUTPUT] VALIDATION_FAILED_CLEAN');
        process.exit(1);
      }
    } catch (err) {
      console.error('[TEST_OUTPUT] THROWN_ERROR: ' + err.message);
      process.exit(1);
    }
  `;

  const res = spawnSync(process.execPath, ['-e', script], {
    env,
    encoding: 'utf8',
    timeout: 5000
  });

  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    combined: (res.stdout || '') + (res.stderr || '')
  };
}

const testCases = [
  {
    name: '1. Production + missing JWT_SECRET -> FAIL',
    env: {
      NODE_ENV: 'production',
      ENCRYPTION_KEY: VALID_PROD_SECRETS.ENCRYPTION_KEY,
      INTERNAL_SERVICE_KEY: VALID_PROD_SECRETS.INTERNAL_SERVICE_KEY
    },
    expectFail: true,
    expectDiagnostic: 'JWT_SECRET is missing or empty in production'
  },
  {
    name: '2. Production + default JWT_SECRET -> FAIL',
    env: {
      NODE_ENV: 'production',
      JWT_SECRET: 'dev_insecure_secret_change_me',
      ENCRYPTION_KEY: VALID_PROD_SECRETS.ENCRYPTION_KEY,
      INTERNAL_SERVICE_KEY: VALID_PROD_SECRETS.INTERNAL_SERVICE_KEY
    },
    expectFail: true,
    expectDiagnostic: 'JWT_SECRET matches a known default fallback string in production'
  },
  {
    name: '3. Production + missing ENCRYPTION_KEY -> FAIL',
    env: {
      NODE_ENV: 'production',
      JWT_SECRET: VALID_PROD_SECRETS.JWT_SECRET,
      INTERNAL_SERVICE_KEY: VALID_PROD_SECRETS.INTERNAL_SERVICE_KEY
    },
    expectFail: true,
    expectDiagnostic: 'ENCRYPTION_KEY is missing or empty in production'
  },
  {
    name: '4. Production + default ENCRYPTION_KEY -> FAIL',
    env: {
      NODE_ENV: 'production',
      JWT_SECRET: VALID_PROD_SECRETS.JWT_SECRET,
      ENCRYPTION_KEY: 'deciva-secret-encryption-key-32-bytes!!',
      INTERNAL_SERVICE_KEY: VALID_PROD_SECRETS.INTERNAL_SERVICE_KEY
    },
    expectFail: true,
    expectDiagnostic: 'ENCRYPTION_KEY matches a known default fallback string in production'
  },
  {
    name: '5. Production + missing INTERNAL_SERVICE_KEY -> FAIL',
    env: {
      NODE_ENV: 'production',
      JWT_SECRET: VALID_PROD_SECRETS.JWT_SECRET,
      ENCRYPTION_KEY: VALID_PROD_SECRETS.ENCRYPTION_KEY
    },
    expectFail: true,
    expectDiagnostic: 'INTERNAL_SERVICE_KEY is missing or empty in production'
  },
  {
    name: '6. Production + default INTERNAL_SERVICE_KEY -> FAIL',
    env: {
      NODE_ENV: 'production',
      JWT_SECRET: VALID_PROD_SECRETS.JWT_SECRET,
      ENCRYPTION_KEY: VALID_PROD_SECRETS.ENCRYPTION_KEY,
      INTERNAL_SERVICE_KEY: 'deciva-internal-service-secret-key-default'
    },
    expectFail: true,
    expectDiagnostic: 'INTERNAL_SERVICE_KEY matches a known default fallback string in production'
  },
  {
    name: '7. Production + weak secret (< 16 chars) -> FAIL',
    env: {
      NODE_ENV: 'production',
      JWT_SECRET: 'short_secret',
      ENCRYPTION_KEY: VALID_PROD_SECRETS.ENCRYPTION_KEY,
      INTERNAL_SERVICE_KEY: VALID_PROD_SECRETS.INTERNAL_SERVICE_KEY
    },
    expectFail: true,
    expectDiagnostic: 'JWT_SECRET has insufficient entropy (minimum 16 characters required in production)'
  },
  {
    name: '8. Production + all valid secrets -> PASS',
    env: {
      NODE_ENV: 'production',
      JWT_SECRET: VALID_PROD_SECRETS.JWT_SECRET,
      ENCRYPTION_KEY: VALID_PROD_SECRETS.ENCRYPTION_KEY,
      INTERNAL_SERVICE_KEY: VALID_PROD_SECRETS.INTERNAL_SERVICE_KEY
    },
    expectFail: false,
    expectDiagnostic: 'VALIDATION_SUCCESS'
  },
  {
    name: '9. Development + missing / default secrets -> PASS (Workflow Preserved)',
    env: {
      NODE_ENV: 'development',
      JWT_SECRET: 'dev_insecure_secret_change_me'
    },
    expectFail: false,
    expectDiagnostic: 'VALIDATION_SUCCESS'
  }
];

console.log('===========================================================');
console.log('  DECIVA P0 SECRET VALIDATION REGRESSION TEST SUITE');
console.log('===========================================================\n');

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = runIsolatedValidation(tc.env);
  const failedAsExpected = tc.expectFail ? (result.status !== 0) : (result.status === 0);
  const diagnosticMatch = result.combined.includes(tc.expectDiagnostic);

  // Security check: ensure the actual secret value is NEVER printed in error messages
  let secretLeaked = false;
  if (tc.expectFail) {
    for (const [k, v] of Object.entries(tc.env)) {
      if (k !== 'NODE_ENV' && v && v.length > 5 && result.combined.includes(`=${v}`)) {
        secretLeaked = true;
        break;
      }
    }
  }

  if (failedAsExpected && diagnosticMatch && !secretLeaked) {
    console.log(`✅ PASS: ${tc.name}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${tc.name}`);
    console.error(`   Exit code: ${result.status} (Expected fail: ${tc.expectFail})`);
    console.error(`   Diagnostic matched: ${diagnosticMatch} (Expected: "${tc.expectDiagnostic}")`);
    if (secretLeaked) {
      console.error('   SECURITY VIOLATION: Secret value was echoed into output!');
    }
    console.error(`   Raw output:\n${result.combined.trim()}`);
    failed++;
  }
}

console.log('\n-----------------------------------------------------------');
console.log(`TOTAL: ${testCases.length} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('-----------------------------------------------------------');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL P0 SECRET VALIDATION REGRESSION TESTS PASSED CLEANLY.');
  process.exit(0);
}
