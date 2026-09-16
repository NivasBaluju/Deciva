/**
 * Deciva — Phase 2, Task 7: Gemini Model Harmonization & AI Gateway Alignment Test Suite
 * -------------------------------------------------------------------------------------
 * Verifies that Node.js and Python/Flask runtimes maintain strict configuration parity:
 * 1. Both runtimes resolve the identical default model ('gemini-1.5-flash') when GEMINI_MODEL is unset.
 * 2. Both runtimes resolve the identical configured model when GEMINI_MODEL is set.
 * 3. Strict model identifier validation: invalid syntax does not magically transform into another model;
 *    instead it falls back safely to the canonical default identifier.
 * 4. API key resolution is unified across GEMINI_API_KEY and GOOGLE_API_KEY without secret leakage.
 * 5. Single configured model target: no hidden multi-model retry drift (e.g. gemini-2.0-flash).
 * 6. Truthful provenance: actual model invoked is recorded; deterministic fallback sets provider/model = null.
 * 7. Timeout hierarchy: Gateway proxy timeout (16s) > Microservice processing & Gemini request timeout (10-12s).
 * 8. Configuration fingerprinting includes active AI model.
 */

'use strict';

const assert = require('assert');
const { execSync } = require('child_process');
const {
  validateGeminiModelName,
  getGeminiApiKey,
  getActiveGeminiModel,
  getConfigurationFingerprint
} = require('../server/services/productionConfigService');
const { askGeminiOrFallback } = require('../server/utils/gemini');
const { createProvenance, createLlmProvenance, createDeterministicProvenance } = require('../server/utils/aiProvenance');

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

// Helper to query Python ai_provenance module
function getPythonModel(envModel, geminiKey, googleKey) {
  const env = { ...process.env };
  if (envModel !== undefined) env.GEMINI_MODEL = envModel;
  else delete env.GEMINI_MODEL;

  if (geminiKey !== undefined) env.GEMINI_API_KEY = geminiKey;
  else delete env.GEMINI_API_KEY;

  if (googleKey !== undefined) env.GOOGLE_API_KEY = googleKey;
  else delete env.GOOGLE_API_KEY;

  const pythonCode = "import sys, json; from backend.services.ai_provenance import get_active_gemini_model, get_gemini_api_key; print(json.dumps({'model': get_active_gemini_model(), 'hasKey': bool(get_gemini_api_key())}))";

  const output = execSync(`python -c "${pythonCode}"`, {
    env,
    encoding: 'utf8'
  });
  return JSON.parse(output.trim().split('\n').pop());
}

console.log('======================================================================');
console.log('  DECIVA PHASE 2, TASK 7: GEMINI HARMONIZATION & GATEWAY TEST SUITE   ');
console.log('======================================================================\n');

// -----------------------------------------------------------------------------
// Test 1: Node and Python resolve the identical default model when unset
// -----------------------------------------------------------------------------
runTest('Test 1: Node and Python resolve identical default model (gemini-1.5-flash) when unset', () => {
  const orig = process.env.GEMINI_MODEL;
  delete process.env.GEMINI_MODEL;
  try {
    const nodeModel = getActiveGeminiModel();
    const pyData = getPythonModel(undefined);

    assert.strictEqual(nodeModel, 'gemini-1.5-flash');
    assert.strictEqual(pyData.model, 'gemini-1.5-flash');
    assert.strictEqual(nodeModel, pyData.model, 'Node and Python default models must match');
  } finally {
    if (orig !== undefined) process.env.GEMINI_MODEL = orig;
  }
});

// -----------------------------------------------------------------------------
// Test 2: Node and Python resolve identical configured model
// -----------------------------------------------------------------------------
runTest('Test 2: Node and Python resolve identical configured model when GEMINI_MODEL is set', () => {
  const orig = process.env.GEMINI_MODEL;
  const target = 'gemini-2.0-flash';
  process.env.GEMINI_MODEL = target;
  try {
    const nodeModel = getActiveGeminiModel();
    const pyData = getPythonModel(target);

    assert.strictEqual(nodeModel, target);
    assert.strictEqual(pyData.model, target);
    assert.strictEqual(nodeModel, pyData.model);
  } finally {
    if (orig !== undefined) process.env.GEMINI_MODEL = orig;
    else delete process.env.GEMINI_MODEL;
  }
});

// -----------------------------------------------------------------------------
// Test 3: Strict model identifier syntax validation (no magical sanitization)
// -----------------------------------------------------------------------------
runTest('Test 3: Strict model identifier syntax validation without magical sanitization', () => {
  const validCheck = validateGeminiModelName('gemini-1.5-pro-preview-0409');
  assert.strictEqual(validCheck.valid, true);
  assert.strictEqual(validCheck.model, 'gemini-1.5-pro-preview-0409');

  // Spaces or invalid characters are strictly rejected
  const invalidSpace = validateGeminiModelName('gemini 2.0 flash');
  assert.strictEqual(invalidSpace.valid, false);

  const invalidChars = validateGeminiModelName('gemini$flash;rm -rf');
  assert.strictEqual(invalidChars.valid, false);

  // Both runtimes fall back to canonical default rather than guessing
  const orig = process.env.GEMINI_MODEL;
  process.env.GEMINI_MODEL = 'invalid model name with spaces';
  try {
    const nodeModel = getActiveGeminiModel();
    const pyData = getPythonModel('invalid model name with spaces');

    assert.strictEqual(nodeModel, 'gemini-1.5-flash', 'Node must safely fall back to default');
    assert.strictEqual(pyData.model, 'gemini-1.5-flash', 'Python must safely fall back to default');
    assert.strictEqual(nodeModel, pyData.model);
  } finally {
    if (orig !== undefined) process.env.GEMINI_MODEL = orig;
    else delete process.env.GEMINI_MODEL;
  }
});

// -----------------------------------------------------------------------------
// Test 4: API Key Resolution Parity (GEMINI_API_KEY)
// -----------------------------------------------------------------------------
runTest('Test 4: Both runtimes resolve API key from GEMINI_API_KEY', () => {
  const origGemini = process.env.GEMINI_API_KEY;
  const origGoogle = process.env.GOOGLE_API_KEY;
  process.env.GEMINI_API_KEY = 'test-gemini-key-12345';
  delete process.env.GOOGLE_API_KEY;
  try {
    const nodeKey = getGeminiApiKey();
    const pyData = getPythonModel(undefined, 'test-gemini-key-12345', undefined);

    assert.strictEqual(nodeKey, 'test-gemini-key-12345');
    assert.strictEqual(pyData.hasKey, true);
  } finally {
    if (origGemini !== undefined) process.env.GEMINI_API_KEY = origGemini;
    else delete process.env.GEMINI_API_KEY;
    if (origGoogle !== undefined) process.env.GOOGLE_API_KEY = origGoogle;
  }
});

// -----------------------------------------------------------------------------
// Test 5: API Key Resolution Parity (GOOGLE_API_KEY fallback)
// -----------------------------------------------------------------------------
runTest('Test 5: Both runtimes resolve API key from GOOGLE_API_KEY fallback', () => {
  const origGemini = process.env.GEMINI_API_KEY;
  const origGoogle = process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  process.env.GOOGLE_API_KEY = 'test-google-key-67890';
  try {
    const nodeKey = getGeminiApiKey();
    const pyData = getPythonModel(undefined, undefined, 'test-google-key-67890');

    assert.strictEqual(nodeKey, 'test-google-key-67890');
    assert.strictEqual(pyData.hasKey, true);
  } finally {
    if (origGemini !== undefined) process.env.GEMINI_API_KEY = origGemini;
    if (origGoogle !== undefined) process.env.GOOGLE_API_KEY = origGoogle;
    else delete process.env.GOOGLE_API_KEY;
  }
});

// -----------------------------------------------------------------------------
// Test 6: Single Configured Model Target (No Hidden Retry Drift)
// -----------------------------------------------------------------------------
runTest('Test 6: Node targets strictly the single configured model without hidden multi-model retry drift', () => {
  const fs = require('fs');
  const geminiJsContent = fs.readFileSync(require.resolve('../server/utils/gemini'), 'utf8');

  // Assert gemini-2.0-flash is no longer hardcoded into a silent fallback loop
  assert(!geminiJsContent.includes("'gemini-2.0-flash'"), 'Hidden gemini-2.0-flash retry target must be removed');
  assert(!geminiJsContent.includes("for (const model of models)"), 'Multi-model retry loop must be eliminated');
});

// -----------------------------------------------------------------------------
// Test 7: Truthful Provenance Reflects Actual Configured Model
// -----------------------------------------------------------------------------
runTest('Test 7: LLM provenance records the exact configured active model', () => {
  const orig = process.env.GEMINI_MODEL;
  process.env.GEMINI_MODEL = 'gemini-1.5-pro';
  try {
    const prov = createLlmProvenance({
      provider: 'gemini',
      grounded: true,
      evidence: [{ text: 'Section 1' }]
    });

    assert.strictEqual(prov.engine, 'llm');
    assert.strictEqual(prov.provider, 'gemini');
    assert.strictEqual(prov.model, 'gemini-1.5-pro');
  } finally {
    if (orig !== undefined) process.env.GEMINI_MODEL = orig;
    else delete process.env.GEMINI_MODEL;
  }
});

// -----------------------------------------------------------------------------
// Test 8: Deterministic Offline Fallback Parity
// -----------------------------------------------------------------------------
async function testOfflineFallback() {
  const origGemini = process.env.GEMINI_API_KEY;
  const origGoogle = process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;

  try {
    const res = await askGeminiOrFallback('What are the payment terms?', 'Payment is due Net 30.');
    assert.strictEqual(res.engine, 'deterministic');
    assert.strictEqual(res.provider, null, 'Deterministic fallback must have provider = null');
    assert.strictEqual(res.model, null, 'Deterministic fallback must have model = null');
    assert.strictEqual(res.fallbackUsed, true);
    assert.strictEqual(res.confidence.score, null);
  } finally {
    if (origGemini !== undefined) process.env.GEMINI_API_KEY = origGemini;
    if (origGoogle !== undefined) process.env.GOOGLE_API_KEY = origGoogle;
  }
}

// -----------------------------------------------------------------------------
// Test 9: Zero Secret Leakage into Provenance or Responses
// -----------------------------------------------------------------------------
runTest('Test 9: API keys never leak into serialized provenance metadata', () => {
  const prov = createProvenance({
    engine: 'llm',
    provider: 'gemini',
    model: 'gemini-1.5-flash',
    grounded: true
  });
  const serialized = JSON.stringify(prov);
  assert(!serialized.includes('key'), 'Keys must not exist on provenance');
  assert(!prov.apiKey);
  assert(!prov.googleKey);
});

// -----------------------------------------------------------------------------
// Test 10: Timeout Hierarchy Invariant
// -----------------------------------------------------------------------------
runTest('Test 10: Timeout hierarchy ensures Gateway timeout (16s) > Flask timeout (12s)', () => {
  const fs = require('fs');
  const docRoutesContent = fs.readFileSync(require.resolve('../server/routes/documents'), 'utf8');

  // Find all proxy timeouts for /chat, /negotiate, /simulate
  const matches = docRoutesContent.match(/AbortSignal\.timeout\((\d+)\)/g) || [];
  const timeouts = matches.map(m => parseInt(m.match(/\d+/)[0], 10));

  // The AI proxy timeouts are 16000ms
  const aiProxyTimeouts = timeouts.filter(t => t >= 10000);
  assert(aiProxyTimeouts.length >= 3, 'All 3 AI gateway proxies must have aligned timeouts >= 10s');
  for (const t of aiProxyTimeouts) {
    assert(t >= 14000, `Gateway proxy timeout (${t}ms) must be >= 14000ms to exceed Flask 12s budget`);
  }
});

// -----------------------------------------------------------------------------
// Test 11: Active Model Included in Configuration Fingerprint
// -----------------------------------------------------------------------------
runTest('Test 11: Configuration fingerprint contains active AI model identifier', () => {
  const fingerprint = getConfigurationFingerprint();
  assert(fingerprint.ai_model, 'ai_model must be present in safe configuration');
  assert.strictEqual(fingerprint.ai_model, getActiveGeminiModel());
  assert(typeof fingerprint.fingerprint === 'string' && fingerprint.fingerprint.length === 64);
});

// -----------------------------------------------------------------------------
// Test 12: Environment Documentation Integrity
// -----------------------------------------------------------------------------
runTest('Test 12: .env.example documents GEMINI_API_KEY and GEMINI_MODEL without leaking secrets', () => {
  const fs = require('fs');
  const path = require('path');
  const envExample = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');

  assert(envExample.includes('GEMINI_API_KEY='), '.env.example must document GEMINI_API_KEY');
  assert(envExample.includes('GEMINI_MODEL=gemini-1.5-flash'), '.env.example must document GEMINI_MODEL default');
  assert(!envExample.includes('AIzaSy'), 'No live API keys in .env.example');
});

// -----------------------------------------------------------------------------
// Execution Runner
// -----------------------------------------------------------------------------
(async () => {
  await runAsyncTest('Test 8: Deterministic offline fallback returns provider=null and model=null', testOfflineFallback);

  console.log('\n======================================================================');
  console.log(`  RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('======================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
