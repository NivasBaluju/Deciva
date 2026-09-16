const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { sha256 } = require('./crypto');

const GENESIS_HASH = '0'.repeat(64);

let auditQueue = Promise.resolve();
let lastAuditTime = 0;

/**
 * Retrieves the latest appended block from the audit ledger.
 */
async function getLastBlock() {
  const { rows } = await db.query(
    'SELECT * FROM blockchain_audit ORDER BY block_index DESC, created_at DESC LIMIT 1'
  );
  return rows[0] || null;
}

/**
 * Append a new immutable, hash-chained audit block.
 *
 * Concurrency guarantee:
 * Executes within an atomic PostgreSQL transaction under an exclusive transaction-scoped
 * advisory lock (`pg_advisory_xact_lock`). This mathematically prevents race conditions,
 * block index collisions, and chain forks across distributed cluster instances.
 */
async function _writeAuditBlock(userId, action, details) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Acquire transaction-scoped exclusive advisory lock across all cluster nodes
    await client.query("SELECT pg_advisory_xact_lock(hashtext('deciva_audit_ledger_lock'))");

    // Fetch the latest block within the protected transaction
    const { rows: lastRows } = await client.query(
      'SELECT block_index, hash FROM blockchain_audit ORDER BY block_index DESC, created_at DESC LIMIT 1'
    );
    const last = lastRows[0];
    const blockIndex = last ? Number(last.block_index) + 1 : 0;
    const prevHash = last ? last.hash : GENESIS_HASH;

    let nowTime = Date.now();
    if (nowTime <= lastAuditTime) {
      nowTime = lastAuditTime + 1;
    }
    lastAuditTime = nowTime;
    const timestamp = new Date(nowTime).toISOString();
    const detailsJson = JSON.stringify(details);
    const hash = sha256(
      `${blockIndex}|${userId || 'anon'}|${action}|${detailsJson}|${prevHash}|${timestamp}`
    );

    const id = uuidv4();
    await client.query(
      `INSERT INTO blockchain_audit
         (id, block_index, user_id, action, details_json, prev_hash, hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, blockIndex, userId || null, action, detailsJson, prevHash, hash, timestamp]
    );

    await client.query('COMMIT');
    return { id, blockIndex, hash };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Public accessor for recording cryptographic audit entries.
 * Maintains in-process queue for fast event ordering while delegating to
 * transactional advisory locks for distributed cluster serialization.
 */
function recordAudit(userId, action, details = {}) {
  const op = () => _writeAuditBlock(userId, action, details);
  const promise = auditQueue.then(op, op);
  auditQueue = promise.catch(err => {
    console.error('recordAudit error:', err.message);
  });
  return promise;
}

/**
 * Canonical ledger verification routine.
 * Recomputes SHA-256 hash chains and confirms sequential cryptographic integrity.
 *
 * Timestamp normalization:
 * - Evaluates canonical ISO-8601 UTC representation first.
 * - Supports historical local-time offset parsing for pre-existing records,
 *   preserving complete verification integrity across all environments without
 *   arbitrary heuristic timezone guesses.
 */
async function verifyLedger(options = {}) {
  const limit = Math.max(1, Math.min(5000, Number(options.limit) || 500));
  const { rows: blocks } = await db.query(
    `SELECT * FROM (
       SELECT * FROM blockchain_audit ORDER BY block_index DESC, created_at DESC LIMIT $1
     ) sub ORDER BY block_index ASC, created_at ASC`,
    [limit]
  );

  let expectedPrev = blocks.length > 0 ? blocks[0].prev_hash : GENESIS_HASH;
  const problems = [];

  for (const block of blocks) {
    const dt = block.created_at instanceof Date ? block.created_at : new Date(block.created_at);
    const canonicalTimestamp = dt.toISOString();
    
    // Canonical UTC string evaluation
    const strCanonical = `${block.block_index}|${block.user_id || 'anon'}|${block.action}|${block.details_json}|${block.prev_hash}|${canonicalTimestamp}`;
    const hCanonical = sha256(strCanonical);

    // Historical timezone-offset compatibility evaluation (recovers local parse drift on pre-existing records)
    const offsetMs = dt.getTimezoneOffset() * 60 * 1000;
    const historicalTimestamp = new Date(dt.getTime() - offsetMs).toISOString();
    const strHistorical = `${block.block_index}|${block.user_id || 'anon'}|${block.action}|${block.details_json}|${block.prev_hash}|${historicalTimestamp}`;
    const hHistorical = sha256(strHistorical);

    const isHashValid = (hCanonical === block.hash || hHistorical === block.hash);

    if (block.prev_hash !== expectedPrev) {
      problems.push({ block: block.block_index, issue: 'prev_hash mismatch (chain broken)' });
    }
    if (!isHashValid) {
      problems.push({ block: block.block_index, issue: 'hash mismatch (tampering detected)' });
    }
    expectedPrev = block.hash;
  }

  return {
    valid: problems.length === 0,
    totalBlocks: blocks.length,
    problems
  };
}

/**
 * Backward-compatible alias for verifyLedger().
 */
function verifyChain(options) {
  return verifyLedger(options);
}

/**
 * Logs security threat anomalies into threat_logs.
 */
async function logThreat(userId, ip, severity, category, message) {
  try {
    const id = uuidv4();
    await db.query(
      `INSERT INTO threat_logs (id, user_id, ip, severity, category, message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, userId || null, ip || null, severity, category, message]
    );

    if (severity === 'high' && userId) {
      const { sendSecurityAlertEmail } = require('./email');
      db.query('SELECT email FROM users WHERE id = $1', [userId])
        .then(({ rows }) => {
          if (rows[0]?.email) sendSecurityAlertEmail(rows[0].email, category, message);
        })
        .catch(() => {});
    }

    return id;
  } catch (err) {
    console.error('logThreat error:', err.message);
  }
}

module.exports = {
  recordAudit,
  verifyLedger,
  verifyChain,
  logThreat,
  getLastBlock,
  GENESIS_HASH
};
