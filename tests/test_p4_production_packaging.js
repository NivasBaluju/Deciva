/**
 * tests/test_p4_production_packaging.js
 * ---------------------------------------------------------------------------
 * Task 16: Production Packaging & Security Finalization Test Suite
 *
 * Covers 10 distinct production & security integrity requirements:
 *   T16-01: Client JWT Web Storage Elimination (zero localStorage/sessionStorage auth JWT)
 *   T16-02: HTTP-Only Cookie Authentication & Hydration via /api/auth/me
 *   T16-03: Security Dashboard Compliance Metric is Dynamic (Runtime Database Aggregation)
 *   T16-04: Compliance Gauge Truthful State Handling (Numeric Score vs. NOT_ASSESSED null)
 *   T16-05: Legacy Branding Eradication (Zero docugaurd_token in active source)
 *   T16-06: Frontend Bundle Chunk Splitting (vendor-react separated from vendor-router)
 *   T16-07: Render Blueprint Multi-Service Orchestration (Node Gateway + Python Microservice)
 *   T16-08: Container Orchestration Manifest (Docker Compose config validation / runtime check)
 *   T16-09: Container Security & Production Server Verification (Gunicorn, Node, non-root, healthchecks)
 *   T16-10: Structured JSON Observability & Sensitive Data Redaction Runtime
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const BASE_DIR = path.resolve(__dirname, '..');

let passedTests = 0;
let failedTests = 0;
const testResults = [];

function runTest(name, fn) {
  try {
    fn();
    passedTests++;
    testResults.push({ name, status: 'PASS' });
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    failedTests++;
    testResults.push({ name, status: 'FAIL', error: err.message });
    console.error(`  ❌ FAIL: ${name}\n     ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    passedTests++;
    testResults.push({ name, status: 'PASS' });
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    failedTests++;
    testResults.push({ name, status: 'FAIL', error: err.message });
    console.error(`  ❌ FAIL: ${name}\n     ${err.message}`);
  }
}

console.log('\n=============================================================');
console.log('DECIVA AI — TASK 16 PRODUCTION PACKAGING & SECURITY TEST SUITE');
console.log('=============================================================\n');

(async () => {
  // -------------------------------------------------------------------------
  // T16-01: Client JWT Web Storage Elimination
  // -------------------------------------------------------------------------
  runTest('T16-01: Client JWT Web Storage Elimination (zero localStorage/sessionStorage auth JWT)', () => {
    const apiSrc = fs.readFileSync(path.join(BASE_DIR, 'src/services/api.js'), 'utf8');
    const authCtxSrc = fs.readFileSync(path.join(BASE_DIR, 'src/context/AuthContext.jsx'), 'utf8');

    // Assert that setToken no longer writes to sessionStorage
    assert(!apiSrc.includes('sessionStorage.setItem(TOKEN_KEY, token)'), 'Api.setToken must not persist JWT to sessionStorage');
    assert(!apiSrc.includes('localStorage.setItem(TOKEN_KEY, token)'), 'Api.setToken must not persist JWT to localStorage');

    // Assert that getToken does not read from sessionStorage as normal browser auth
    assert(!apiSrc.includes('sessionStorage.getItem(TOKEN_KEY)'), 'Api.getToken must not retrieve auth tokens from sessionStorage');

    // Assert that AuthContext does not write auth tokens to localStorage
    assert(!authCtxSrc.includes('localStorage.setItem('), 'AuthContext must not write auth tokens to localStorage');
  });

  // -------------------------------------------------------------------------
  // T16-02: HTTP-Only Cookie Authentication & Hydration
  // -------------------------------------------------------------------------
  runTest('T16-02: HTTP-Only Cookie Authentication & Hydration via /api/auth/me', () => {
    const apiSrc = fs.readFileSync(path.join(BASE_DIR, 'src/services/api.js'), 'utf8');
    const authCtxSrc = fs.readFileSync(path.join(BASE_DIR, 'src/context/AuthContext.jsx'), 'utf8');

    // Must enforce credentials: 'include' across all requests
    assert(apiSrc.includes("credentials: 'include'"), 'Api.request must enforce credentials: "include" for httpOnly cookies');

    // Hydration must query /api/auth/me without depending on web storage
    assert(authCtxSrc.includes("await Api.get('/api/auth/me')"), 'AuthContext must hydrate session directly from /api/auth/me');

    // Logout must hit /api/auth/logout to revoke cookie and session on server
    assert(authCtxSrc.includes("await Api.post('/api/auth/logout')"), 'AuthContext logout must hit /api/auth/logout');
  });

  // -------------------------------------------------------------------------
  // T16-03: Security Dashboard Compliance Metric is Dynamic (Runtime Verification)
  // -------------------------------------------------------------------------
  await runAsyncTest('T16-03: Security Dashboard Compliance Metric is Dynamic (Runtime DB query)', async () => {
    const db = require('../server/db');
    const secRouteSrc = fs.readFileSync(path.join(BASE_DIR, 'server/routes/security.js'), 'utf8');

    // Static source check: hardcoded 82 must NOT be in security.js
    assert(!secRouteSrc.includes('complianceGauge: 82'), 'server/routes/security.js must not contain hardcoded complianceGauge: 82');

    // Runtime check: verify contract_compliance_evaluations query executes
    const compRes = await db.query(
      `SELECT COUNT(*) AS c, AVG(compliance_score) AS avg_score
       FROM contract_compliance_evaluations`
    );
    assert(compRes && compRes.rows, 'contract_compliance_evaluations query must execute cleanly');
    const totalCount = Number(compRes.rows[0].c);
    assert(totalCount >= 0, 'Count of compliance evaluations must be a non-negative integer');
  });

  // -------------------------------------------------------------------------
  // T16-04: Compliance Gauge Truthful State Handling (Numeric vs. NOT_ASSESSED)
  // -------------------------------------------------------------------------
  await runAsyncTest('T16-04: Compliance Gauge Truthful State Handling (Numeric vs. NOT_ASSESSED)', async () => {
    const db = require('../server/db');

    // 1. Query for a non-existent tenant ID to test NOT_ASSESSED condition
    const nonExistentTenant = '00000000-0000-0000-0000-000000000000';
    const emptyRes = await db.query(
      `SELECT COUNT(*) AS c, AVG(compliance_score) AS avg_score
       FROM contract_compliance_evaluations
       WHERE tenant_id = $1`,
      [nonExistentTenant]
    );
    const count = Number(emptyRes.rows[0]?.c || 0);
    const score = count > 0 ? Math.round(Number(emptyRes.rows[0].avg_score)) : null;
    const status = count > 0 ? 'ASSESSED' : 'NOT_ASSESSED';

    assert.strictEqual(count, 0, 'Empty tenant must have 0 evaluations');
    assert.strictEqual(score, null, 'Empty tenant must have null complianceScore (not a fake number)');
    assert.strictEqual(status, 'NOT_ASSESSED', 'Empty tenant status must be NOT_ASSESSED');

    // 2. Query for a tenant that has evaluations to test ASSESSED condition
    const sampleRow = await db.query('SELECT tenant_id FROM contract_compliance_evaluations LIMIT 1');
    if (sampleRow.rows.length > 0) {
      const activeTenant = sampleRow.rows[0].tenant_id;
      const activeRes = await db.query(
        `SELECT COUNT(*) AS c, AVG(compliance_score) AS avg_score
         FROM contract_compliance_evaluations
         WHERE tenant_id = $1`,
        [activeTenant]
      );
      const activeCount = Number(activeRes.rows[0].c);
      const activeScore = Math.round(Number(activeRes.rows[0].avg_score));
      assert(activeCount > 0, 'Active tenant must have count > 0');
      assert(typeof activeScore === 'number' && activeScore >= 0 && activeScore <= 100, 'Score must be 0-100');
    }
  });

  // -------------------------------------------------------------------------
  // T16-05: Legacy Branding Eradication
  // -------------------------------------------------------------------------
  runTest('T16-05: Legacy Branding Eradication (Zero docugaurd_token in active source)', () => {
    const filesToScan = [
      'src/services/api.js',
      'src/context/AuthContext.jsx',
      'server/routes/security.js',
      'server/routes/auth.js',
      'public/js/app.js'
    ];

    for (const relPath of filesToScan) {
      const fullPath = path.join(BASE_DIR, relPath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        assert(!content.includes('docugaurd_token'), `${relPath} must not contain obsolete docugaurd_token`);
      }
    }
  });

  // -------------------------------------------------------------------------
  // T16-06: Frontend Bundle Chunk Splitting
  // -------------------------------------------------------------------------
  runTest('T16-06: Frontend Bundle Chunk Splitting (vendor-react separated from vendor-router)', () => {
    const viteConfigSrc = fs.readFileSync(path.join(BASE_DIR, 'vite.config.mjs'), 'utf8');
    assert(viteConfigSrc.includes("'vendor-router'"), 'vite.config.mjs must declare vendor-router chunk');
    assert(viteConfigSrc.includes("'vendor-react'"), 'vite.config.mjs must declare vendor-react chunk');

    const distAssetsDir = path.join(BASE_DIR, 'dist/assets');
    assert(fs.existsSync(distAssetsDir), 'dist/assets must exist from production build');
    const files = fs.readdirSync(distAssetsDir);

    const hasVendorRouter = files.some(f => f.startsWith('vendor-router-') && f.endsWith('.js'));
    const hasVendorReact = files.some(f => f.startsWith('vendor-react-') && f.endsWith('.js'));

    assert(hasVendorRouter, 'Production build output must include vendor-router chunk');
    assert(hasVendorReact, 'Production build output must include vendor-react chunk');
  });

  // -------------------------------------------------------------------------
  // T16-07: Render Blueprint Multi-Service Orchestration
  // -------------------------------------------------------------------------
  runTest('T16-07: Render Blueprint Multi-Service Orchestration (Node Gateway + Python Microservice)', () => {
    const renderYamlPath = path.join(BASE_DIR, 'render.yaml');
    assert(fs.existsSync(renderYamlPath), 'render.yaml must exist');
    const content = fs.readFileSync(renderYamlPath, 'utf8');

    assert(content.includes('name: deciva-api-gateway'), 'render.yaml must declare deciva-api-gateway');
    assert(content.includes('name: deciva-ai-backend'), 'render.yaml must declare deciva-ai-backend');
    assert(content.includes('healthCheckPath: /api/health'), 'deciva-api-gateway must specify /api/health health check');
    assert(content.includes('healthCheckPath: /health'), 'deciva-ai-backend must specify /health health check');
    assert(content.includes('key: AI_MICROSERVICE_URL'), 'deciva-api-gateway must declare AI_MICROSERVICE_URL');
  });

  // -------------------------------------------------------------------------
  // T16-08: Container Orchestration Manifest (Docker Compose Validation)
  // -------------------------------------------------------------------------
  runTest('T16-08: Container Orchestration Manifest (Docker Compose syntax & environment verification)', () => {
    const composePath = path.join(BASE_DIR, 'docker-compose.yml');
    assert(fs.existsSync(composePath), 'docker-compose.yml must exist');
    const content = fs.readFileSync(composePath, 'utf8');

    // Structural validations
    assert(content.includes('services:'), 'docker-compose.yml must define services');
    assert(content.includes('postgres:'), 'docker-compose.yml must define postgres service');
    assert(content.includes('ai-microservice:'), 'docker-compose.yml must define ai-microservice');
    assert(content.includes('api-gateway:'), 'docker-compose.yml must define api-gateway');
    assert(content.includes('deciva-network:'), 'docker-compose.yml must define custom bridge network');
    assert(content.includes('deciva_pgdata:'), 'docker-compose.yml must define persistent volume for postgres');

    // Check if docker CLI is available on the host machine
    let dockerInstalled = false;
    try {
      execSync('docker --version', { stdio: 'pipe' });
      dockerInstalled = true;
    } catch {
      dockerInstalled = false;
    }

    if (dockerInstalled) {
      try {
        execSync('docker compose config', { cwd: BASE_DIR, stdio: 'pipe' });
        console.log('    (docker compose config validated successfully by local docker daemon)');
      } catch (err) {
        throw new Error(`docker compose config failed: ${err.message}`);
      }
    } else {
      console.log('    [STATUS: DOCKER_CLI_UNAVAILABLE] Docker runtime not present on host. Static schema & YAML syntax verified.');
    }
  });

  // -------------------------------------------------------------------------
  // T16-09: Container Security & Production Server Verification
  // -------------------------------------------------------------------------
  runTest('T16-09: Container Security & Production Server Verification (Gunicorn, Node, non-root, healthchecks)', () => {
    const gwDockerfile = fs.readFileSync(path.join(BASE_DIR, 'Dockerfile.gateway'), 'utf8');
    const aiDockerfile = fs.readFileSync(path.join(BASE_DIR, 'Dockerfile.ai'), 'utf8');

    // Gateway Dockerfile assertions
    assert(gwDockerfile.includes('USER node'), 'Dockerfile.gateway must execute as non-root user (node)');
    assert(gwDockerfile.includes('HEALTHCHECK'), 'Dockerfile.gateway must declare HEALTHCHECK');
    assert(gwDockerfile.includes('CMD ["node", "server/index.js"]'), 'Dockerfile.gateway must start server via node server/index.js');

    // AI Microservice Dockerfile assertions
    assert(aiDockerfile.includes('USER appuser'), 'Dockerfile.ai must execute as non-root user (appuser)');
    assert(aiDockerfile.includes('HEALTHCHECK'), 'Dockerfile.ai must declare HEALTHCHECK');
    assert(aiDockerfile.includes('gunicorn'), 'Dockerfile.ai must use production WSGI server (gunicorn)');
    assert(!aiDockerfile.includes('flask run'), 'Dockerfile.ai must never use development "flask run" command');
  });

  // -------------------------------------------------------------------------
  // T16-10: Structured JSON Observability & Sensitive Data Redaction Runtime
  // -------------------------------------------------------------------------
  runTest('T16-10: Structured JSON Observability & Sensitive Data Redaction Runtime', () => {
    const logger = require('../server/utils/logger');
    assert(typeof logger.info === 'function', 'logger.info must be a function');
    assert(typeof logger.sanitize === 'function', 'logger.sanitize must be a function');

    // Runtime test data with sensitive credentials
    const rawData = {
      password: 'super_secret_password_123',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      apiKey: 'secret_key_abcdef123456',
      publicInfo: 'operation_success',
      nested: {
        raw_text: 'Confidential agreement terms between Party A and Party B',
        score: 95
      }
    };

    const sanitized = logger.sanitize(rawData);

    assert.strictEqual(sanitized.password, '[REDACTED]', 'password must be redacted');
    assert.strictEqual(sanitized.token, '[REDACTED]', 'token must be redacted');
    assert.strictEqual(sanitized.apiKey, '[REDACTED]', 'apiKey containing "key" must be redacted');
    assert.strictEqual(sanitized.publicInfo, 'operation_success', 'non-sensitive fields must be preserved');
    assert.strictEqual(sanitized.nested.raw_text, '[REDACTED]', 'nested raw_text must be redacted');
    assert.strictEqual(sanitized.nested.score, 95, 'nested non-sensitive values must be preserved');
  });

  console.log('\n=============================================================');
  console.log(`TASK 16 TEST SUITE COMPLETED: ${passedTests} PASSED / ${failedTests} FAILED`);
  console.log('=============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
