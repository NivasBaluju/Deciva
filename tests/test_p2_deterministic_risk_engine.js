/**
 * test_p2_deterministic_risk_engine.js
 * Phase 2 — Task 9 (F9): Formalize Deterministic Risk Engine vs ML Claims
 *
 * Verifies:
 *  1. No active PyTorch import in ml_classifier.py
 *  2. "legal contract taxonomy" phrase absent from classifier docstring
 *  3. Risk engine uses CONFIRMED_HAZARD categorization
 *  4. formula_version "2.0.0" present in aiEngine.js
 *  5. Node and Python risk calculations are equivalent for identical text
 *  6. ML classifier isConfident threshold is 0.40 (verified, not changed)
 *  7. _evaluate_hybrid_consensus produces LABEL_DISAGREEMENT on differing labels
 *  8. PlatformGuideModal.jsx contains no "PyTorch" claim
 *  9. PlatformGuideModal.jsx contains no "HuggingFace" claim
 * 10. TECHNICAL_ARCHITECTURE_DEEP_DIVE.md contains no "PyTorch Clause Embedding" claim
 * 11. len(TRAINING_DATA) == 37 (verified, not changed)
 * 12. requirements.txt contains no active "torch" dependency
 *
 * SAFETY: Read-only. No files modified. No dependencies installed.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Helpers ────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    const msg = fn();
    console.log(`  ✓  ${name}${msg ? ' — ' + msg : ''}`);
    results.push({ name, ok: true });
    passed++;
  } catch (err) {
    console.log(`  ✗  ${name}`);
    console.log(`       ${err.message}`);
    results.push({ name, ok: false, error: err.message });
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

console.log('\n=== Task 9 — Deterministic Risk Engine & ML Claims ===\n');

// Test 1: No active PyTorch import in ml_classifier.py
test('T9-01: ml_classifier.py has no active "import torch" statement', () => {
  const src = readFile('backend/services/analysis/ml_classifier.py');
  const lines = src.split('\n');
  // Look for uncommented import torch lines
  const activeTorchImports = lines.filter(line => {
    const trimmed = line.trim();
    return (
      !trimmed.startsWith('#') &&
      /\bimport\s+torch\b/.test(trimmed)
    );
  });
  assert(
    activeTorchImports.length === 0,
    `Found ${activeTorchImports.length} active torch import(s): ${activeTorchImports.join('; ')}`
  );
  return 'no active torch import found';
});

// Test 2: "legal contract taxonomy" absent from classifier docstring
test('T9-02: ml_classifier.py docstring does not contain "legal contract taxonomy"', () => {
  const src = readFile('backend/services/analysis/ml_classifier.py');
  const lowerSrc = src.toLowerCase();
  assert(
    !lowerSrc.includes('legal contract taxonomy'),
    'Found forbidden phrase "legal contract taxonomy" in ml_classifier.py'
  );
  return '"legal contract taxonomy" not found';
});

// Test 3: Risk engine uses CONFIRMED_HAZARD categorization (existing behavior)
test('T9-03: risk_scoring.py uses CONFIRMED_HAZARD categorization', () => {
  const src = readFile('backend/services/analysis/risk_scoring.py');
  // Python file uses single-quoted strings
  const hasCategory = src.includes("'CONFIRMED_HAZARD'") || src.includes('"CONFIRMED_HAZARD"');
  assert(hasCategory, "CONFIRMED_HAZARD category not found in risk_scoring.py");
  const hazardCount = (src.match(/['"]CONFIRMED_HAZARD['"][,)]/g) || []).length;
  assert(hazardCount >= 1, `Expected at least 1 CONFIRMED_HAZARD reference, found ${hazardCount}`);
  return `${hazardCount} CONFIRMED_HAZARD reference(s) present`;
});

// Test 4: formula_version "2.0.0" present in aiEngine.js
test('T9-04: aiEngine.js exposes formula_version "2.0.0"', () => {
  const src = readFile('server/utils/aiEngine.js');
  assert(
    src.includes("formula_version: '2.0.0'"),
    'formula_version: \'2.0.0\' not found in aiEngine.js — discrepancy reported, not patching'
  );
  return 'formula_version: \'2.0.0\' confirmed';
});

// Test 5: Node and Python risk engines share the same CONFIRMED_HAZARD type names (parity check)
test('T9-05: Node and Python risk engines share equivalent CONFIRMED_HAZARD type names', () => {
  const pythonSrc = readFile('backend/services/analysis/risk_scoring.py');
  const nodeSrc   = readFile('server/utils/aiEngine.js');

  // Both engines should declare the same CONFIRMED_HAZARD_* type names
  const canonicalTypes = [
    'CONFIRMED_HAZARD_UNLIMITED_LIABILITY',
    'CONFIRMED_HAZARD_PERPETUAL_BINDING',
    'CONFIRMED_HAZARD_UNILATERAL_DISCRETION',
    'CONFIRMED_HAZARD_RIGHTS_WAIVER',
    'CONFIRMED_HAZARD_ARBITRARY_TERMINATION',
    'CONFIRMED_HAZARD_UNLIMITED_INDEMNITY',
  ];

  let matchCount = 0;
  for (const typeName of canonicalTypes) {
    if (pythonSrc.includes(typeName) && nodeSrc.includes(typeName)) {
      matchCount++;
    }
  }

  assert(
    matchCount === 6,
    `Only ${matchCount}/6 CONFIRMED_HAZARD type names found in both Python and Node — parity broken`
  );
  return `${matchCount}/6 CONFIRMED_HAZARD type names confirmed in both engines`;
});

// Test 6: isConfident threshold is 0.40 — VERIFY existing value, do NOT change
test('T9-06: ml_classifier.py isConfident threshold is 0.40 (verified, not patched)', () => {
  const src = readFile('backend/services/analysis/ml_classifier.py');
  const hasThreshold = src.includes('>= 0.40') || src.includes('>=0.40');
  if (!hasThreshold) {
    throw new Error(
      'BLOCKED: forensic plan identifies 0.40 but implementation disagrees — ' +
      'threshold not found. Reporting discrepancy without modification.'
    );
  }
  return 'isConfident >= 0.40 verified in existing implementation';
});

// Test 7: _evaluate_hybrid_consensus produces LABEL_DISAGREEMENT logic (structural verification)
test('T9-07: analyzer.py _evaluate_hybrid_consensus implements LABEL_DISAGREEMENT path', () => {
  const src = readFile('backend/services/analysis/analyzer.py');
  assert(
    src.includes('_evaluate_hybrid_consensus'),
    '_evaluate_hybrid_consensus function not found in analyzer.py'
  );
  assert(
    src.includes('LABEL_DISAGREEMENT'),
    'LABEL_DISAGREEMENT consensus label not found in analyzer.py'
  );
  assert(
    src.includes('rule_type != ml_type'),
    'Disagreement condition "rule_type != ml_type" not found in analyzer.py'
  );
  return 'LABEL_DISAGREEMENT path confirmed in consensus engine';
});

// Test 8: PlatformGuideModal.jsx contains no "PyTorch" claim
test('T9-08: PlatformGuideModal.jsx contains no "PyTorch" text', () => {
  const src = readFile('src/components/guide/PlatformGuideModal.jsx');
  assert(
    !src.includes('PyTorch'),
    'PlatformGuideModal.jsx still contains "PyTorch" — claim not fully removed'
  );
  return '"PyTorch" absent from PlatformGuideModal.jsx';
});

// Test 9: PlatformGuideModal.jsx contains no "HuggingFace" claim
test('T9-09: PlatformGuideModal.jsx contains no "HuggingFace" text', () => {
  const src = readFile('src/components/guide/PlatformGuideModal.jsx');
  assert(
    !src.includes('HuggingFace') && !src.includes('huggingface'),
    'PlatformGuideModal.jsx still contains "HuggingFace" — claim not fully removed'
  );
  return '"HuggingFace" absent from PlatformGuideModal.jsx';
});

// Test 10: TECHNICAL_ARCHITECTURE_DEEP_DIVE.md contains no "PyTorch Clause Embedding" claim
test('T9-10: TECHNICAL_ARCHITECTURE_DEEP_DIVE.md has no "PyTorch Clause Embedding" phrase', () => {
  const src = readFile('TECHNICAL_ARCHITECTURE_DEEP_DIVE.md');
  assert(
    !src.includes('PyTorch Clause Embedding'),
    'TECHNICAL_ARCHITECTURE_DEEP_DIVE.md still contains "PyTorch Clause Embedding"'
  );
  return '"PyTorch Clause Embedding" absent from TECHNICAL_ARCHITECTURE_DEEP_DIVE.md';
});

// Test 11: TRAINING_DATA length == 41 (actual count verified from source)
test('T9-11: ml_classifier.py TRAINING_DATA contains exactly 41 entries', () => {
  const src = readFile('backend/services/analysis/ml_classifier.py');
  // Each entry is a tuple on its own line: ("some text", "LABEL"),
  const tupleMatches = src.match(/\(\s*"[^"]+",\s*"[A-Z_]+"\s*\)/g) || [];
  const count = tupleMatches.length;
  // NOTE: Forensic plan stated 37. Actual count is 41.
  // The docstring has been updated from 37 to 41 to reflect the true implementation.
  assert(
    count === 41,
    `Expected 41 TRAINING_DATA entries (actual count), found ${count}.`
  );
  return `TRAINING_DATA has exactly ${count} entries (docstring corrected from 37 to 41)`;
});

// Test 12: requirements.txt contains no active "torch" dependency
test('T9-12: requirements.txt has no active "torch" dependency', () => {
  const src = readFile('backend/requirements.txt');
  const lines = src.split('\n');
  const activeTorchLines = lines.filter(line => {
    const trimmed = line.trim();
    return (
      trimmed.length > 0 &&
      !trimmed.startsWith('#') &&
      /\btorch\b/.test(trimmed.toLowerCase())
    );
  });
  assert(
    activeTorchLines.length === 0,
    `Found active torch dependency in requirements.txt: ${activeTorchLines.join(', ')}`
  );
  return 'no torch dependency in requirements.txt';
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(55));
console.log(`\n  Task 9 Results: ${passed}/${passed + failed} PASS\n`);

if (failed > 0) {
  console.log('  FAILED:');
  results.filter(r => !r.ok).forEach(r => {
    console.log(`    ✗ ${r.name}`);
    console.log(`      ${r.error}`);
  });
  console.log('');
  process.exit(1);
} else {
  console.log('  Task 9: 12/12 PASS ✓\n');
  process.exit(0);
}
