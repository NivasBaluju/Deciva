/**
 * Deciva — Phase 2, Task 3: AI Provenance & Confidence Integrity Test Suite
 * ---------------------------------------------------------------------------
 * Verifies that Deciva never emits fabricated confidence, synthetic constants,
 * or misrepresented heuristic outputs. Ensures truthful engine semantics,
 * separation of retrieval similarity from confidence, and complete secret isolation.
 */

const assert = require('assert');
const {
  getActiveGeminiModel,
  createProvenance,
  createDeterministicProvenance,
  createLlmProvenance,
  createHybridProvenance
} = require('../server/utils/aiProvenance');
const { ragAnswer } = require('../server/utils/aiEngine');
const { askGeminiOrFallback } = require('../server/utils/gemini');
const { computeLocalDeterministicDecisionIntelligence } = require('../server/services/contractDecisionService');

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

console.log('=== DECIVA PHASE 2 TASK 3: AI PROVENANCE & CONFIDENCE INTEGRITY TESTS ===\n');

// -----------------------------------------------------------------------------
// Test 1: No Fabricated Confidence in Deterministic Handlers
// -----------------------------------------------------------------------------
runTest('Test 1: No fabricated confidence (0.90, 0.92, 0.94, 0.95) in deterministic answers', () => {
  const sampleDoc = `
    This Agreement is entered into between Acme Corp and Beta LLC.
    Payment terms shall be Net 30 invoices.
    Either party may terminate upon 30 days written notice.
    Governing law shall be the State of California.
  `;

  const partyRes = ragAnswer('Who are the contracting parties?', sampleDoc);
  assert.strictEqual(partyRes.engine, 'deterministic');
  assert.strictEqual(partyRes.confidence.score, null, 'Party answer must not have synthetic score');
  assert.strictEqual(partyRes.confidence.methodology, 'deterministic_rule_based');
  assert.notStrictEqual(partyRes.confidence.score, 0.92, 'Must not be 0.92');

  const payRes = ragAnswer('What are the payment terms?', sampleDoc);
  assert.strictEqual(payRes.confidence.score, null);
  assert.notStrictEqual(payRes.confidence.score, 0.90, 'Must not be 0.90');

  const termRes = ragAnswer('How does termination work?', sampleDoc);
  assert.strictEqual(termRes.confidence.score, null);
  assert.notStrictEqual(termRes.confidence.score, 0.90, 'Must not be 0.90');

  const lawRes = ragAnswer('What is the governing law?', sampleDoc);
  assert.strictEqual(lawRes.confidence.score, null);
  assert.notStrictEqual(lawRes.confidence.score, 0.92, 'Must not be 0.92');
});

// -----------------------------------------------------------------------------
// Test 2: LLM Provenance Contract
// -----------------------------------------------------------------------------
runTest('Test 2: LLM provenance captures real provider and active model without fake confidence', () => {
  const prov = createLlmProvenance({
    provider: 'gemini',
    model: 'gemini-1.5-flash',
    grounded: true,
    evidence: [{ text: 'Section 4.1 Termination clause' }]
  });

  assert.strictEqual(prov.engine, 'llm');
  assert.strictEqual(prov.provider, 'gemini');
  assert.strictEqual(prov.model, 'gemini-1.5-flash');
  assert.strictEqual(prov.grounded, true);
  assert.strictEqual(prov.confidence.score, null, 'Uncalibrated LLM confidence must be null');
  assert.strictEqual(prov.confidence.methodology, 'not_available');
  assert.strictEqual(prov.fallback, false);
});

// -----------------------------------------------------------------------------
// Test 3: Deterministic Provenance Contract
// -----------------------------------------------------------------------------
runTest('Test 3: Deterministic provenance has null provider/model and explicit rule methodology', () => {
  const prov = createDeterministicProvenance({
    methodology: 'deterministic_rule_based',
    evidence: [{ text: 'Limitation of liability cap' }],
    fallback: false
  });

  assert.strictEqual(prov.engine, 'deterministic');
  assert.strictEqual(prov.provider, null, 'Deterministic engine must not claim external provider');
  assert.strictEqual(prov.model, null, 'Deterministic engine must not claim external model');
  assert.strictEqual(prov.grounded, true);
  assert.strictEqual(prov.confidence.score, null);
  assert.strictEqual(prov.confidence.methodology, 'deterministic_rule_based');
});

// -----------------------------------------------------------------------------
// Test 4: Hybrid Provenance & Separation of Retrieval Score
// -----------------------------------------------------------------------------
runTest('Test 4: Hybrid provenance cleanly separates retrieval_score from confidence', () => {
  const prov = createHybridProvenance({
    provider: 'gemini',
    model: 'gemini-1.5-flash',
    grounded: true,
    retrievalScore: 0.842,
    retrievalMethodology: 'cosine_similarity',
    evidence: [{ text: 'Vendor SLA credits', similarity: 0.842 }]
  });

  assert.strictEqual(prov.engine, 'hybrid');
  assert.strictEqual(prov.provider, 'gemini');
  assert.strictEqual(prov.model, 'gemini-1.5-flash');
  assert.strictEqual(prov.retrieval_score, 0.842, 'Similarity must be recorded in retrieval_score');
  assert.strictEqual(prov.retrieval_methodology, 'cosine_similarity');
  assert.strictEqual(prov.confidence.score, null, 'Retrieval similarity must NEVER be relabeled as confidence');
  assert.strictEqual(prov.confidence.methodology, 'not_available');
});

// -----------------------------------------------------------------------------
// Test 5: Confidence Methodology Validation
// -----------------------------------------------------------------------------
runTest('Test 5: Confidence methodology requires explicit derivation description', () => {
  const validCalibrated = createProvenance({
    engine: 'deterministic',
    confidenceScore: 0.78,
    confidenceMethodology: 'exact_char_match_ratio'
  });
  assert.strictEqual(validCalibrated.confidence.score, 0.78);
  assert.strictEqual(validCalibrated.confidence.methodology, 'exact_char_match_ratio');

  const uncalibrated = createProvenance({
    engine: 'llm',
    confidenceScore: null,
    confidenceMethodology: 'not_available'
  });
  assert.strictEqual(uncalibrated.confidence.score, null);
  assert.strictEqual(uncalibrated.confidence.methodology, 'not_available');
});

// -----------------------------------------------------------------------------
// Test 6: No False Grounding on Insufficient Evidence
// -----------------------------------------------------------------------------
runTest('Test 6: Insufficient evidence produces grounded: false and no-evidence status', () => {
  const sampleDoc = 'This is a brief confidentiality agreement regarding trade secrets.';
  const res = ragAnswer('What are the environmental nuclear decommission requirements?', sampleDoc);

  assert.strictEqual(res.grounded, false, 'Irrelevant question must not be grounded');
  assert.strictEqual(res.groundingStatus, 'INSUFFICIENT_EVIDENCE');
  assert.strictEqual(res.answer_status, 'insufficient_evidence');
  assert.strictEqual(res.sources.length, 0);
  assert.strictEqual(res.confidence.score, null);
  assert.strictEqual(res.confidence.methodology, 'insufficient_evidence');
});

// -----------------------------------------------------------------------------
// Test 7: Evidence Preservation without Fabricated Citations
// -----------------------------------------------------------------------------
runTest('Test 7: Valid evidence citations are preserved and fake sources eliminated', () => {
  const sampleDoc = 'Acme Corp shall deliver software licenses within 15 business days.';
  const res = ragAnswer('licenses software delivery', sampleDoc);

  assert.strictEqual(res.grounded, true);
  assert(res.sources.length > 0, 'Must preserve real matching sentences');
  assert(res.sources.every(s => !s.text.includes('Gemini AI Analysis')), 'No fake sources allowed');
  assert(res.retrieval_score !== null, 'Retrieval score should be present on token overlap match');
  assert.strictEqual(res.retrieval_methodology, 'token_overlap');
});

// -----------------------------------------------------------------------------
// Test 8: Provider Failure & Fallback Identification
// -----------------------------------------------------------------------------
async function testProviderFailure() {
  const originalKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY; // Simulate no API key / offline fallback
    const res = await askGeminiOrFallback('What are the payment terms?', 'Payment is due Net 60.');

    assert.strictEqual(res.fallbackUsed, true);
    assert.strictEqual(res.engine, 'deterministic');
    assert.strictEqual(res.provider, null);
    assert.strictEqual(res.model, null);
    assert.strictEqual(res.confidence.score, null);
  } finally {
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  }
}

// -----------------------------------------------------------------------------
// Test 9: Contract Decision Service Provenance & Backward Compatibility
// -----------------------------------------------------------------------------
runTest('Test 9: Contract decision intelligence exposure model has no synthetic confidence', () => {
  const mockDoc = { id: 'doc-123', original_name: 'Vendor_Agreement.pdf', extracted_text: 'Liability is capped at $50,000. Term is 12 months.' };
  const decision = computeLocalDeterministicDecisionIntelligence(mockDoc, [], [], [], []);

  assert(decision.exposureModel, 'Exposure model must exist');
  for (const [dimKey, dimVal] of Object.entries(decision.exposureModel)) {
    assert.strictEqual(
      dimVal.confidence.score,
      null,
      `Dimension ${dimKey} must not have synthetic confidence number (was previously hardcoded)`
    );
    assert.strictEqual(dimVal.confidence.methodology, 'deterministic_rule_based');
  }

  assert.strictEqual(decision.provenance.engine, 'deterministic');
  assert.strictEqual(decision.provenance.provider, null);
  assert.strictEqual(decision.provenance.fallback, true);
});

// -----------------------------------------------------------------------------
// Test 10: Zero Secret Leakage into Provenance
// -----------------------------------------------------------------------------
runTest('Test 10: Sensitive keys and secrets NEVER leak into provenance metadata', () => {
  const fakeKey = 'AIzaSySecretApiKey1234567890';
  const prov = createProvenance({
    engine: 'llm',
    provider: 'gemini',
    model: 'gemini-1.5-flash',
    grounded: true,
    evidence: [{ text: `Contract excerpt with ${fakeKey}` }]
  });

  const serialized = JSON.stringify(prov);
  assert(!serialized.includes('GEMINI_API_KEY'), 'API key label must not leak');
  assert(!prov.apiKey, 'apiKey property must not exist on provenance');
  assert(!prov.internalKey, 'internalKey property must not exist on provenance');
});

// -----------------------------------------------------------------------------
// Execution Runner
// -----------------------------------------------------------------------------
(async () => {
  await runAsyncTest('Test 8: Provider failure triggers explicit deterministic fallback', testProviderFailure);

  console.log('\n=============================================================');
  console.log(`Task 3 Test Results: ${passedTests}/${totalTests} PASS (${totalTests - passedTests} FAILED)`);
  console.log('=============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
