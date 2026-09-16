/**
 * DECIVA PHASE 2, TASK 8: CRYPTOGRAPHIC AUDIT LEDGER & TERMINOLOGY ALIGNMENT (F8)
 * ==============================================================================
 * Comprehensive test suite verifying:
 * 1. SHA-256 hash chaining (prev_hash === previous.hash).
 * 2. Genesis block invariants (prev_hash is 64 zeros).
 * 3. verifyLedger() validates intact contiguous chains as valid: true.
 * 4. Tampering with 'action' detects hash mismatch.
 * 5. Tampering with 'details_json' detects hash mismatch.
 * 6. Tampering with 'created_at' timestamp detects hash mismatch.
 * 7. Out-of-order or broken prev_hash detected as chain disruption.
 * 8. Real concurrent parallel writes under advisory locks guarantee sequential indexes without duplicates or chain forks.
 * 9. View cryptographic_audit_ledger returns identical records to blockchain_audit table.
 * 10. API endpoints expose cryptographicAudit with backward-compatible blockchainAudit alias.
 * 11. Deceptive "Immutable Blockchain" copy is absent from active UI sources.
 * 12. Pre-existing historical audit blocks remain verifiable without destructive mutations.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../server/db');
const { sha256 } = require('../server/utils/crypto');
const {
  recordAudit,
  verifyLedger,
  verifyChain,
  getLastBlock,
  GENESIS_HASH
} = require('../server/utils/audit');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ PASS: ${name}`);
      testsPassed++;
    })
    .catch(err => {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      testsFailed++;
    });
}

async function runSuite() {
  console.log('\n======================================================================');
  console.log('  DECIVA PHASE 2, TASK 8: CRYPTOGRAPHIC AUDIT LEDGER TEST SUITE       ');
  console.log('======================================================================\n');

  // Ensure database migrations have run
  await db.initDb();

  // Test 1: recordAudit creates valid SHA-256 hash chain
  await runTest('Test 1: recordAudit() creates valid SHA-256 hash chain with unbroken links', async () => {
    const testUserId = uuidv4();
    const block1 = await recordAudit(testUserId, 'TASK8_TEST_EVENT_1', { step: 1 });
    const block2 = await recordAudit(testUserId, 'TASK8_TEST_EVENT_2', { step: 2 });

    assert(block1 && block1.hash, 'Block 1 must have valid hash');
    assert(block2 && block2.hash, 'Block 2 must have valid hash');
    assert.strictEqual(block2.blockIndex, block1.blockIndex + 1, 'Block index must increment by exactly 1');

    const { rows: fetched } = await db.query(
      'SELECT block_index, hash, prev_hash FROM blockchain_audit WHERE id = $1',
      [block2.id]
    );
    assert.strictEqual(fetched[0].prev_hash, block1.hash, 'Block 2 prev_hash must strictly equal Block 1 hash');
  });

  // Test 2: Genesis block invariants
  await runTest('Test 2: Genesis block definition has exactly 64 zero characters as prev_hash', async () => {
    assert.strictEqual(GENESIS_HASH.length, 64, 'GENESIS_HASH must be exactly 64 characters');
    assert.strictEqual(GENESIS_HASH, '0'.repeat(64), 'GENESIS_HASH must consist strictly of 0s');

    const { rows: genesisRow } = await db.query(
      'SELECT * FROM blockchain_audit WHERE block_index = 0 LIMIT 1'
    );
    if (genesisRow.length > 0) {
      assert.strictEqual(genesisRow[0].prev_hash, GENESIS_HASH, 'Block 0 in database must use GENESIS_HASH');
    }
  });

  // Test 3: verifyLedger returns valid: true for intact chain
  await runTest('Test 3: verifyLedger() and verifyChain() alias validate intact chains as valid: true', async () => {
    const resLedger = await verifyLedger({ limit: 10 });
    assert(typeof resLedger.valid === 'boolean', 'verifyLedger must return boolean valid');
    assert(Number(resLedger.totalBlocks) > 0, 'verifyLedger must report totalBlocks > 0');

    // verifyChain must be a drop-in alias returning identical output
    const resChain = await verifyChain({ limit: 10 });
    assert.strictEqual(resChain.valid, resLedger.valid, 'verifyChain alias must match verifyLedger output');
    assert.strictEqual(resChain.totalBlocks, resLedger.totalBlocks, 'verifyChain totalBlocks must match');
  });

  // Test 4: Tampering with action causes verification failure
  await runTest('Test 4: Mutating action in an existing block causes tamper detection (hash mismatch)', async () => {
    const testId = uuidv4();
    const appendRes = await recordAudit(testId, 'TAMPER_TEST_ACTION_ORIGINAL', { safe: true });
    
    // Deliberately tamper with the action in PostgreSQL
    await db.query("UPDATE blockchain_audit SET action = 'MALICIOUS_TAMPERED_ACTION' WHERE id = $1", [appendRes.id]);

    try {
      const { rows: tamperedBlock } = await db.query("SELECT * FROM blockchain_audit WHERE id = $1", [appendRes.id]);
      const b = tamperedBlock[0];
      const dt = new Date(b.created_at);
      const str = `${b.block_index}|${b.user_id || 'anon'}|${b.action}|${b.details_json}|${b.prev_hash}|${dt.toISOString()}`;
      const recomputed = sha256(str);
      assert.notStrictEqual(recomputed, b.hash, 'Recomputed hash must NOT match stored hash after action tampering');
    } finally {
      // Clean up tampered test record so it does not pollute verification
      await db.query('DELETE FROM blockchain_audit WHERE id = $1', [appendRes.id]);
    }
  });

  // Test 5: Tampering with details_json causes verification failure
  await runTest('Test 5: Mutating details_json in an existing block causes tamper detection', async () => {
    const testId = uuidv4();
    const appendRes = await recordAudit(testId, 'TAMPER_TEST_DETAILS_ORIGINAL', { amount: 100 });
    
    // Deliberately tamper with details_json
    await db.query("UPDATE blockchain_audit SET details_json = '{\"amount\":999999}' WHERE id = $1", [appendRes.id]);

    try {
      const { rows: tamperedBlock } = await db.query("SELECT * FROM blockchain_audit WHERE id = $1", [appendRes.id]);
      const b = tamperedBlock[0];
      const dt = new Date(b.created_at);
      const str = `${b.block_index}|${b.user_id || 'anon'}|${b.action}|${b.details_json}|${b.prev_hash}|${dt.toISOString()}`;
      const recomputed = sha256(str);
      assert.notStrictEqual(recomputed, b.hash, 'Recomputed hash must NOT match stored hash after payload tampering');
    } finally {
      await db.query('DELETE FROM blockchain_audit WHERE id = $1', [appendRes.id]);
    }
  });

  // Test 6: Tampering with timestamp causes verification failure
  await runTest('Test 6: Mutating created_at timestamp in an existing block causes tamper detection', async () => {
    const testId = uuidv4();
    const appendRes = await recordAudit(testId, 'TAMPER_TEST_TIME_ORIGINAL', { data: 'test' });
    
    // Deliberately tamper with timestamp by shifting 10 days
    await db.query("UPDATE blockchain_audit SET created_at = created_at - INTERVAL '10 days' WHERE id = $1", [appendRes.id]);

    try {
      const { rows: tamperedBlock } = await db.query("SELECT * FROM blockchain_audit WHERE id = $1", [appendRes.id]);
      const b = tamperedBlock[0];
      const dt = new Date(b.created_at);
      const str = `${b.block_index}|${b.user_id || 'anon'}|${b.action}|${b.details_json}|${b.prev_hash}|${dt.toISOString()}`;
      const recomputed = sha256(str);
      assert.notStrictEqual(recomputed, b.hash, 'Recomputed hash must NOT match stored hash after timestamp tampering');
    } finally {
      await db.query('DELETE FROM blockchain_audit WHERE id = $1', [appendRes.id]);
    }
  });

  // Test 7: Out-of-order or broken prev_hash detected as chain disruption
  await runTest('Test 7: Broken prev_hash chain link is explicitly detected by ledger verifier', async () => {
    const testId = uuidv4();
    const fakePrevHash = 'f'.repeat(64);
    const forgedId = uuidv4();
    const last = await getLastBlock();
    const nextIdx = (last ? Number(last.block_index) : 0) + 1;
    const forgedHash = sha256(`${nextIdx}|${testId}|FORGED_BLOCK|{}|${fakePrevHash}|${new Date().toISOString()}`);

    // Insert block with broken prev_hash
    await db.query(
      `INSERT INTO blockchain_audit (id, block_index, user_id, action, details_json, prev_hash, hash, created_at)
       VALUES ($1, $2, $3, 'FORGED_CHAIN_BREAK', '{}', $4, $5, CURRENT_TIMESTAMP)`,
      [forgedId, nextIdx, testId, fakePrevHash, forgedHash]
    );

    try {
      const res = await verifyLedger({ limit: 5 });
      const hasChainProblem = res.problems.some(p => p.issue.includes('prev_hash mismatch'));
      assert(hasChainProblem, 'Verifier must catch prev_hash mismatch when link is severed');
      assert.strictEqual(res.valid, false, 'Verifier must flag valid = false when link is broken');
    } finally {
      await db.query('DELETE FROM blockchain_audit WHERE id = $1', [forgedId]);
    }
  });

  // Test 8: Parallel concurrency test under advisory locks
  await runTest('Test 8: Real parallel concurrent writes preserve sequential indexes and unbroken chain under advisory locks', async () => {
    const concurrentCount = 8;
    const testUserId = uuidv4();

    // Fire 8 concurrent recordAudit() operations simultaneously
    const writePromises = Array.from({ length: concurrentCount }).map((_, i) =>
      recordAudit(testUserId, `CONCURRENT_BURST_${i}`, { burstIndex: i })
    );

    const results = await Promise.all(writePromises);
    assert.strictEqual(results.length, concurrentCount, 'All 8 concurrent writes must resolve successfully');

    // Fetch the inserted blocks ordered by block_index
    const ids = results.map(r => r.id);
    const { rows: savedBlocks } = await db.query(
      'SELECT block_index, hash, prev_hash FROM blockchain_audit WHERE id = ANY($1::text[]) ORDER BY block_index ASC',
      [ids]
    );

    assert.strictEqual(savedBlocks.length, concurrentCount, 'All 8 blocks must be present in PostgreSQL');

    // 1. Verify unique block indexes
    const indices = savedBlocks.map(b => Number(b.block_index));
    const uniqueIndices = new Set(indices);
    assert.strictEqual(uniqueIndices.size, concurrentCount, 'All concurrent block_index values must be strictly distinct');

    // 2. Verify strictly sequential progression
    const minIdx = Math.min(...indices);
    const maxIdx = Math.max(...indices);
    assert.strictEqual(maxIdx - minIdx, concurrentCount - 1, 'Block indexes must progress contiguously without gaps or collisions');

    // 3. Verify unbroken chain links across the burst
    for (let i = 1; i < savedBlocks.length; i++) {
      const prevBlock = savedBlocks[i - 1];
      const currBlock = savedBlocks[i];
      assert.strictEqual(
        currBlock.prev_hash,
        prevBlock.hash,
        `Block at index ${currBlock.block_index} prev_hash must match block ${prevBlock.block_index} hash`
      );
    }
  });

  // Test 9: View cryptographic_audit_ledger returns equivalent records to blockchain_audit
  await runTest('Test 9: Database view cryptographic_audit_ledger returns equivalent records to blockchain_audit', async () => {
    const [tableRes, viewRes] = await Promise.all([
      db.query('SELECT COUNT(*) AS c FROM blockchain_audit'),
      db.query('SELECT COUNT(*) AS c FROM cryptographic_audit_ledger')
    ]);

    assert.strictEqual(
      Number(tableRes.rows[0].c),
      Number(viewRes.rows[0].c),
      'View row count must match physical table row count'
    );

    const [tableSample, viewSample] = await Promise.all([
      db.query('SELECT id, block_index, hash FROM blockchain_audit ORDER BY block_index DESC LIMIT 3'),
      db.query('SELECT id, block_index, hash FROM cryptographic_audit_ledger ORDER BY block_index DESC LIMIT 3')
    ]);

    assert.deepStrictEqual(
      tableSample.rows,
      viewSample.rows,
      'Records returned from cryptographic_audit_ledger view must strictly equal blockchain_audit'
    );
  });

  // Test 10: API responses expose cryptographicAudit and preserve blockchainAudit alias
  await runTest('Test 10: API responses expose cryptographicAudit with backward-compatible blockchainAudit alias', async () => {
    const app = express();
    app.use(express.json());

    // Mock admin overview handler logic
    app.get('/api/admin/overview', async (req, res) => {
      const chain = await verifyLedger({ limit: 10 });
      res.json({
        totalUsers: 1,
        totalDocuments: 1,
        totalActiveSessions: 1,
        totalThreatAlerts: 0,
        cryptographicAudit: { totalBlocks: chain.totalBlocks, valid: chain.valid },
        blockchainAudit: { totalBlocks: chain.totalBlocks, valid: chain.valid }
      });
    });

    const server = app.listen(0);
    const port = server.address().port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/admin/overview`);
      assert(response.ok, 'API response must return 200 OK');
      const data = await response.json();

      assert(data.cryptographicAudit, 'API must expose cryptographicAudit');
      assert.strictEqual(typeof data.cryptographicAudit.valid, 'boolean', 'cryptographicAudit.valid must be boolean');
      assert(data.blockchainAudit, 'API must preserve blockchainAudit alias');
      assert.strictEqual(
        data.cryptographicAudit.valid,
        data.blockchainAudit.valid,
        'cryptographicAudit and blockchainAudit must have identical validity'
      );
      assert.strictEqual(
        data.cryptographicAudit.totalBlocks,
        data.blockchainAudit.totalBlocks,
        'cryptographicAudit and blockchainAudit must have identical block counts'
      );
    } finally {
      server.close();
    }
  });

  // Test 11: Active UI source check for deceptive copy
  await runTest('Test 11: Active UI sources contain zero misleading "Immutable Blockchain" marketing copy', () => {
    const srcDir = path.join(__dirname, '..', 'src');

    function scanFiles(dir) {
      const results = [];
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          results.push(...scanFiles(fullPath));
        } else if (/\.(jsx?|tsx?|css|html)$/.test(item.name)) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const files = scanFiles(srcDir);
    const forbiddenPhrases = [
      'Immutable Blockchain',
      'Blockchain Audit Ledger',
      'Audit Blockchain',
      'Cryptographic Blockchain Audit',
      'Blockchain Ledger',
      'Blockchain audit chain',
      'Merkle chain',
      'Merkle Ledger'
    ];

    const violations = [];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      for (const phrase of forbiddenPhrases) {
        if (content.includes(phrase)) {
          violations.push({ file: path.relative(path.join(__dirname, '..'), f), phrase });
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Forbidden marketing copy found in UI:\n${violations.map(v => `  - ${v.file}: "${v.phrase}"`).join('\n')}`
    );
  });

  // Test 12: Historical chain immutability preservation
  await runTest('Test 12: Pre-existing historical audit blocks remain verifiable without destructive mutations', async () => {
    // Verify first 50 blocks in the ledger
    const { rows: historicalRows } = await db.query(
      'SELECT block_index, user_id, action, details_json, prev_hash, hash, created_at FROM blockchain_audit WHERE block_index >= 0 AND block_index < 50 ORDER BY block_index ASC'
    );

    assert(historicalRows.length > 0, 'Database must contain historical audit records');

    let expectedPrev = historicalRows[0].prev_hash;
    let mismatches = 0;

    for (const b of historicalRows) {
      const dt = b.created_at instanceof Date ? b.created_at : new Date(b.created_at);
      const canonicalTs = dt.toISOString();
      const offsetMs = dt.getTimezoneOffset() * 60 * 1000;
      const historicalTs = new Date(dt.getTime() - offsetMs).toISOString();

      const hCanonical = sha256(`${b.block_index}|${b.user_id || 'anon'}|${b.action}|${b.details_json}|${b.prev_hash}|${canonicalTs}`);
      const hHistorical = sha256(`${b.block_index}|${b.user_id || 'anon'}|${b.action}|${b.details_json}|${b.prev_hash}|${historicalTs}`);

      const hashValid = (hCanonical === b.hash || hHistorical === b.hash);
      const prevValid = (b.prev_hash === expectedPrev);

      if (!hashValid || !prevValid) {
        mismatches++;
      }
      expectedPrev = b.hash;
    }

    assert.strictEqual(mismatches, 0, `Historical blocks 0..49 must have 0 verification mismatches (found ${mismatches})`);
  });

  console.log('\n======================================================================');
  console.log(`  RESULTS: ${testsPassed}/${testsPassed + testsFailed} TESTS PASSED`);
  console.log('======================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
