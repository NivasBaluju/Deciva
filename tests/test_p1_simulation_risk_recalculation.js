/**
 * tests/test_p1_simulation_risk_recalculation.js
 * ---------------------------------------------------------------------------
 * Phase 2, Task 4 (F4): Simulation Engine Risk Recalculation & Scenario Integrity
 * 
 * Verifies:
 *  1. Mechanical cross-runtime parity between Python and Node risk calculation.
 *  2. In-memory ephemeral clause substitution without touching disk or DB.
 *  3. Quantitative risk reduction on capping unlimited liability (-20 pts).
 *  4. Quantitative risk increase on adding arbitrary termination (+15 pts).
 *  5. Quantitative unchanged result on neutral textual modifications (0 pts).
 *  6. Truthful AI provenance (confidence.score === null, deterministic engine).
 *  7. Gateway endpoint POST /:id/simulate execution and database persistence.
 *  8. Gateway endpoint GET /:id/simulations retrieval with full quantitative fields.
 *  9. Simulation idempotency key caching and replay integrity.
 * 10. Multi-tenant and cross-document boundary isolation.
 */

'use strict';

require('dotenv').config();
const assert = require('assert');
const { v4: uuidv4 } = require('uuid');
const { execSync } = require('child_process');
const pool = require('../server/db');
const { calculateCalibratedDocumentRisk } = require('../server/utils/aiEngine');
const express = require('express');
const http = require('http');

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
  console.log('  DECIVA PHASE 2, TASK 4: SIMULATION RISK RECALCULATION TEST SUITE   ');
  console.log('======================================================================\n');

  // -------------------------------------------------------------------------
  // Test 1: Mechanical Cross-Runtime Parity Verification (Python vs Node)
  // -------------------------------------------------------------------------
  runTest('Test 1: Cross-runtime mechanical parity between Python and Node risk engines', () => {
    const contracts = [
      `Section 4: The Supplier shall have unlimited liability for all damages.`,
      `Section 8: Either party may terminate at will without cause immediately. Section 4: Unlimited liability.`,
      `Standard commercial contract without any prohibited hazards or unlimited exposure.`
    ];

    for (let i = 0; i < contracts.length; i++) {
      const text = contracts[i];
      const nodeResult = calculateCalibratedDocumentRisk(text);

      // Execute Python engine directly via inline command
      const pyCmd = "import sys, json; from backend.services.analysis.risk_scoring import calculate_document_risk; text = sys.stdin.read(); res = calculate_document_risk(text, [], dict(missing=[])); print(json.dumps(dict(score=res['score'], level=res['level'], factorCount=len(res['factors']), totalRiskPoints=res['totalRiskPoints'])))";
      const pyOutput = execSync(`python -c "${pyCmd}"`, {
        input: text,
        encoding: 'utf-8',
        cwd: process.cwd()
      });
      const pyResult = JSON.parse(pyOutput.trim());

      assert.strictEqual(nodeResult.score, pyResult.score, `Contract ${i + 1} score mismatch: Node ${nodeResult.score} vs Py ${pyResult.score}`);
      assert.strictEqual(nodeResult.level, pyResult.level, `Contract ${i + 1} level mismatch: Node ${nodeResult.level} vs Py ${pyResult.level}`);
      assert.strictEqual(nodeResult.factors.length, pyResult.factorCount, `Contract ${i + 1} factors length mismatch`);
      assert.strictEqual(nodeResult.totalRiskPoints, pyResult.totalRiskPoints, `Contract ${i + 1} total points mismatch`);
    }
  });

  // -------------------------------------------------------------------------
  // Test 2: In-Memory Safe Clause Substitution
  // -------------------------------------------------------------------------
  runTest('Test 2: In-memory safe clause substitution preserves contract immutability', () => {
    const originalText = `HEADER\nSection 4: The Supplier shall have unlimited liability for any damages.\nFOOTER`;
    const targetWithOddWhitespace = `The   Supplier\nshall   have   unlimited  liability   for   any   damages.`;
    const proposedClause = `The Supplier's aggregate liability shall be limited to fees paid.`;

    const targetWords = targetWithOddWhitespace.match(/\S+/g);
    const escapedWords = targetWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(escapedWords.join('\\s+'), 'i');

    const match = originalText.match(pattern);
    assert(match !== null, 'Pattern should match despite whitespace divergence');

    const modified = originalText.slice(0, match.index) + proposedClause + originalText.slice(match.index + match[0].length);

    assert(modified.includes(`The Supplier's aggregate liability shall be limited to fees paid.`));
    assert(!modified.includes(`unlimited liability`));
    assert(originalText.includes(`unlimited liability`), 'Original text must remain unchanged');
  });

  // -------------------------------------------------------------------------
  // Test 3: Quantitative Delta for Risk-Reducing Modification (-20 pts)
  // -------------------------------------------------------------------------
  runTest('Test 3: Risk-reducing clause modification computes negative delta and resolved hazard', () => {
    // Both contracts contain 'in perpetuity' (12 pts) so the score stays above the floor (5 pts)
    const baseText = `Section 1: The covenants are binding in perpetuity.\nSection 2: Payment in 30 days.\nSection 3: The Supplier shall have unlimited liability for breach.\nSection 4: Confidentiality.`;
    const modifiedText = `Section 1: The covenants are binding in perpetuity.\nSection 2: Payment in 30 days.\nSection 3: The Supplier's aggregate liability shall not exceed fees paid.\nSection 4: Confidentiality.`;

    const beforeRisk = calculateCalibratedDocumentRisk(baseText);
    const afterRisk = calculateCalibratedDocumentRisk(modifiedText);

    const delta = afterRisk.score - beforeRisk.score;
    assert.strictEqual(beforeRisk.score, 32, `Baseline score should be 32 (20 unlimited liability + 12 in perpetuity)`);
    assert.strictEqual(afterRisk.score, 12, `Modified score should be 12 (12 in perpetuity)`);
    assert.strictEqual(delta, -20, `Delta must be exactly -20 points`);

    const beforeHazards = beforeRisk.factors.filter(f => f.category === 'CONFIRMED_HAZARD').map(f => f.riskType);
    const afterHazards = afterRisk.factors.filter(f => f.category === 'CONFIRMED_HAZARD').map(f => f.riskType);

    assert(beforeHazards.includes('CONFIRMED_HAZARD_UNLIMITED_LIABILITY'), 'Before factors must have CONFIRMED_HAZARD_UNLIMITED_LIABILITY');
    assert(!afterHazards.includes('CONFIRMED_HAZARD_UNLIMITED_LIABILITY'), 'After factors must not have CONFIRMED_HAZARD_UNLIMITED_LIABILITY');
  });

  // -------------------------------------------------------------------------
  // Test 4: Quantitative Delta for Risk-Increasing Modification (+15 pts)
  // -------------------------------------------------------------------------
  runTest('Test 4: Risk-increasing clause modification computes positive delta and introduced hazard', () => {
    // Both contracts contain 'in perpetuity' (12 pts) so the baseline is above the 5-point floor
    const baseText = `Section 1: The covenants are binding in perpetuity.\nSection 2: Payment within 30 days.`;
    const modifiedText = `Section 1: The covenants are binding in perpetuity. Either party may terminate at will without cause immediately.\nSection 2: Payment within 30 days.`;

    const beforeRisk = calculateCalibratedDocumentRisk(baseText);
    const afterRisk = calculateCalibratedDocumentRisk(modifiedText);

    const delta = afterRisk.score - beforeRisk.score;
    assert.strictEqual(beforeRisk.score, 12, `Baseline score should be 12`);
    assert.strictEqual(afterRisk.score, 27, `Modified score should be 27 (12 + 15)`);
    assert.strictEqual(delta, 15, `Delta must be exactly +15 points for arbitrary termination`);

    const beforeHazards = beforeRisk.factors.filter(f => f.category === 'CONFIRMED_HAZARD').map(f => f.riskType);
    const afterHazards = afterRisk.factors.filter(f => f.category === 'CONFIRMED_HAZARD').map(f => f.riskType);

    assert(!beforeHazards.includes('CONFIRMED_HAZARD_ARBITRARY_TERMINATION'));
    assert(afterHazards.includes('CONFIRMED_HAZARD_ARBITRARY_TERMINATION'));
  });

  // -------------------------------------------------------------------------
  // Test 5: Quantitative Delta for Neutral Modification (0 pts, UNCHANGED)
  // -------------------------------------------------------------------------
  runTest('Test 5: Neutral textual modification yields 0 delta and UNCHANGED direction', () => {
    const baseText = `Section 1: The Supplier will provide software maintenance services. Section 2: Payment in 30 days.`;
    const modifiedText = `Section 1: The Vendor will provide software maintenance services. Section 2: Payment in 30 days.`;

    const beforeRisk = calculateCalibratedDocumentRisk(baseText);
    const afterRisk = calculateCalibratedDocumentRisk(modifiedText);

    const delta = afterRisk.score - beforeRisk.score;
    assert.strictEqual(delta, 0, 'Delta must be 0 for neutral wording change');
    assert.strictEqual(beforeRisk.score, afterRisk.score);
  });

  // -------------------------------------------------------------------------
  // Setup Express App & DB Test Records for Endpoints Tests
  // -------------------------------------------------------------------------
  const testUserIdA = uuidv4();
  const testUserIdB = uuidv4();
  const testDocId = uuidv4();
  const testEmailA = `sim_user_a_${Date.now()}@deciva.local`;
  const testEmailB = `sim_user_b_${Date.now()}@deciva.local`;

  await pool.query(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ($1, 'Sim Test User A', $2, 'test_hash_pw_1', 'user'),
           ($3, 'Sim Test User B', $4, 'test_hash_pw_2', 'user')
    ON CONFLICT (email) DO NOTHING;
  `, [testUserIdA, testEmailA, testUserIdB, testEmailB]);

  const jwt = require('jsonwebtoken');
  const { sha256 } = require('../server/utils/crypto');
  const { getJwtSecret } = require('../server/services/productionConfigService');
  const JWT_SECRET = getJwtSecret();
  const sessionIdA = uuidv4();
  const sessionIdB = uuidv4();
  const fp = sha256('unknown::unknown');

  await pool.query(`
    INSERT INTO sessions (id, user_id, device_fingerprint, ip, trust_score, mfa_verified, revoked)
    VALUES ($1, $2, $3, '127.0.0.1', 100, true, false),
           ($4, $5, $3, '127.0.0.1', 100, true, false);
  `, [sessionIdA, testUserIdA, fp, sessionIdB, testUserIdB]);

  const tokenA = jwt.sign({ userId: testUserIdA, sessionId: sessionIdA }, JWT_SECRET, { expiresIn: '1h' });
  const tokenB = jwt.sign({ userId: testUserIdB, sessionId: sessionIdB }, JWT_SECRET, { expiresIn: '1h' });

  const testContractText = `
THIS SERVICES AGREEMENT is made between Client and Vendor.
Section 1: Scope of Work. The obligations are binding in perpetuity.
Section 2: Fees. Invoices payable net 30 days.
Section 3: Liability. The Supplier shall have unlimited liability for all direct and indirect damages.
Section 4: Termination. Either party may terminate with 30 days written notice for material breach.
`;

  const baseRiskCalc = calculateCalibratedDocumentRisk(testContractText);

  await pool.query(`
    INSERT INTO documents (id, user_id, filename, original_name, mime_type, size, sha256, extracted_text, risk_score)
    VALUES ($1, $2, 'simulation_test_contract.txt', 'simulation_test_contract.txt', 'text/plain', 500, 'dummy_sha256', $3, $4)
    ON CONFLICT (id) DO NOTHING;
  `, [testDocId, testUserIdA, testContractText, baseRiskCalc.score]);

  // Insert a detected clause record
  const testClauseId = uuidv4();
  await pool.query(`
    INSERT INTO document_clauses (id, document_id, clause_type, confidence, extracted_snippet)
    VALUES ($1, $2, 'penalties', 0.95, 'The Supplier shall have unlimited liability for all direct and indirect damages.')
    ON CONFLICT (id) DO NOTHING;
  `, [testClauseId, testDocId]);

  const app = express();
  app.use(express.json());
  const docRoutes = require('../server/routes/documents');
  app.use('/api/documents', docRoutes);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/documents`;

  // -------------------------------------------------------------------------
  // Test 6: API Gateway POST /:id/simulate Clause Recalculation (-20 pts)
  // -------------------------------------------------------------------------
  await runAsyncTest('Test 6: POST /:id/simulate performs deterministic calculation & persists row', async () => {
    const res = await fetch(`${baseUrl}/${testDocId}/simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        clauseId: testClauseId,
        originalClause: 'The Supplier shall have unlimited liability for all direct and indirect damages.',
        proposedClause: 'The Supplier aggregate liability shall be capped at 12 months fees paid.'
      })
    });

    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();

    assert.strictEqual(data.beforeScore, baseRiskCalc.score, `Baseline score should be ${baseRiskCalc.score}`);
    assert.strictEqual(data.afterScore, baseRiskCalc.score - 20, `After score should be ${baseRiskCalc.score - 20}`);
    assert.strictEqual(data.riskDelta, -20, `Risk delta must be -20`);
    assert.strictEqual(data.riskDirection, 'REDUCED', `Direction must be REDUCED`);
    assert(data.riskFindings.resolvedHazards.includes('CONFIRMED_HAZARD_UNLIMITED_LIABILITY'), 'CONFIRMED_HAZARD_UNLIMITED_LIABILITY must be resolved');
    assert.strictEqual(data.confidence.score, null, 'Confidence score must be null (deterministic provenance)');
    assert(data.simulationId, 'Must return a simulationId');

    // Verify DB persistence in contract_simulations
    const { rows: simRows } = await pool.query(
      `SELECT id, before_score, after_score, risk_delta, risk_direction, status, clause_id
       FROM contract_simulations WHERE id = $1;`,
      [data.simulationId]
    );
    assert.strictEqual(simRows.length, 1, 'Simulation row must be persisted in database');
    assert.strictEqual(simRows[0].before_score, baseRiskCalc.score);
    assert.strictEqual(simRows[0].after_score, baseRiskCalc.score - 20);
    assert.strictEqual(simRows[0].risk_delta, -20);
    assert.strictEqual(simRows[0].risk_direction, 'REDUCED');
    assert.strictEqual(simRows[0].status, 'COMPLETED');
  });

  // -------------------------------------------------------------------------
  // Test 7: Document Immutability Verification in Database
  // -------------------------------------------------------------------------
  await runAsyncTest('Test 7: Document text and risk_score in DB remained 100% immutable', async () => {
    const { rows } = await pool.query(`SELECT extracted_text, risk_score FROM documents WHERE id = $1;`, [testDocId]);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].extracted_text, testContractText, 'Document text must not be modified');
    assert.strictEqual(rows[0].risk_score, baseRiskCalc.score, 'Document risk score must remain at baseline');
  });

  // -------------------------------------------------------------------------
  // Test 8: GET /:id/simulations Endpoint Retrieves Quantitative Fields
  // -------------------------------------------------------------------------
  await runAsyncTest('Test 8: GET /:id/simulations retrieves formatted quantitative history', async () => {
    const res = await fetch(`${baseUrl}/${testDocId}/simulations`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert(Array.isArray(data.simulations), 'Response must contain simulations array');
    assert(data.simulations.length >= 1, 'Should have at least 1 simulation record');

    const sim = data.simulations[0];
    assert.strictEqual(typeof sim.beforeScore, 'number');
    assert.strictEqual(typeof sim.afterScore, 'number');
    assert.strictEqual(typeof sim.riskDelta, 'number');
    assert.strictEqual(typeof sim.riskFindings, 'object');
    assert.strictEqual(typeof sim.provenance, 'object');
  });

  // -------------------------------------------------------------------------
  // Test 9: Idempotency Key Caching & Replay
  // -------------------------------------------------------------------------
  await runAsyncTest('Test 9: Simulation with Idempotency-Key returns cached result on replay', async () => {
    const simKey = `sim_key_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Initial Request
    const res1 = await fetch(`${baseUrl}/${testDocId}/simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`,
        'Idempotency-Key': simKey
      },
      body: JSON.stringify({
        originalClause: 'The Supplier shall have unlimited liability for all direct and indirect damages.',
        proposedClause: 'The Supplier liability shall be limited to $50,000.'
      })
    });
    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();

    // Replay Request with exact same key
    const res2 = await fetch(`${baseUrl}/${testDocId}/simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`,
        'Idempotency-Key': simKey
      },
      body: JSON.stringify({
        originalClause: 'The Supplier shall have unlimited liability for all direct and indirect damages.',
        proposedClause: 'The Supplier liability shall be limited to $50,000.'
      })
    });
    assert.strictEqual(res2.status, 200);
    const data2 = await res2.json();

    assert.strictEqual(data2.simulationId, data1.simulationId, 'Replay must return exact same simulationId');
    assert.strictEqual(data2.riskDelta, data1.riskDelta, 'Replay must return identical riskDelta');
    assert.strictEqual(data2.beforeScore, data1.beforeScore, 'Replay must return identical beforeScore');
  });

  // -------------------------------------------------------------------------
  // Test 10: Multi-Tenant Boundary Isolation
  // -------------------------------------------------------------------------
  await runAsyncTest('Test 10: User B cannot simulate or access simulations of User A document', async () => {
    // Attempt simulation on User A's document using User B's token
    const simRes = await fetch(`${baseUrl}/${testDocId}/simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      },
      body: JSON.stringify({
        originalClause: 'The Supplier shall have unlimited liability for all direct and indirect damages.',
        proposedClause: 'The Supplier liability shall be limited.'
      })
    });
    assert(simRes.status === 403 || simRes.status === 404, `User B must be rejected with 403 or 404 on simulate (got ${simRes.status})`);

    // Attempt history fetch on User A's document using User B's token
    const histRes = await fetch(`${baseUrl}/${testDocId}/simulations`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    assert(histRes.status === 403 || histRes.status === 404, `User B must be rejected with 403 or 404 on simulations list (got ${histRes.status})`);
  });

  server.close();

  // Cleanup test database rows
  await pool.query(`DELETE FROM contract_simulations WHERE document_id = $1;`, [testDocId]).catch(() => {});
  await pool.query(`DELETE FROM document_clauses WHERE document_id = $1;`, [testDocId]).catch(() => {});
  await pool.query(`DELETE FROM documents WHERE id = $1;`, [testDocId]).catch(() => {});
  await pool.query(`DELETE FROM sessions WHERE user_id IN ($1, $2);`, [testUserIdA, testUserIdB]).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id IN ($1, $2);`, [testUserIdA, testUserIdB]).catch(() => {});

  console.log('\n======================================================================');
  console.log(`  RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('======================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
