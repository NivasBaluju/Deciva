const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { verifyChain, verifyLedger, recordAudit } = require('../utils/audit');
const { verifySignature, publicSigningKey } = require('../utils/crypto');

const router = express.Router();

router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const docRes = await db.query('SELECT COUNT(*) AS c FROM documents WHERE user_id = $1', [req.user.id]);
    const docCount = Number(docRes.rows[0].c);

    const avgRes = await db.query('SELECT AVG(risk_score) AS a FROM documents WHERE user_id = $1 AND risk_score IS NOT NULL', [req.user.id]);
    const avgRisk = avgRes.rows[0].a ? Number(avgRes.rows[0].a) : null;

    const threatRes = await db.query('SELECT COUNT(*) AS c FROM threat_logs WHERE user_id = $1', [req.user.id]);
    const threatCount = Number(threatRes.rows[0].c);

    const chatRes = await db.query('SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = $1', [req.user.id]);
    const chatCount = Number(chatRes.rows[0].c);

    const contractRes = await db.query('SELECT COUNT(*) AS c FROM generated_contracts WHERE user_id = $1', [req.user.id]);
    const contractCount = Number(contractRes.rows[0].c);

    const activeRes = await db.query('SELECT COUNT(*) AS c FROM sessions WHERE user_id = $1 AND revoked = false', [req.user.id]);
    const activeSessions = Number(activeRes.rows[0].c);

    const chain = await verifyChain();

    res.json({
      documentsUploaded: docCount,
      avgRiskScore: avgRisk ? Math.round(avgRisk) : 0,
      threatAlerts: threatCount,
      chatInteractions: chatCount,
      contractsGenerated: contractCount,
      activeSessions,
      trustScore: req.trust.score,
      auditLedger: { totalBlocks: chain.totalBlocks, valid: chain.valid },
      complianceGauge: 82
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/sessions', requireAuth, async (req, res) => {
  const { rows: sessions } = await db.query(`
    SELECT id, device_fingerprint, ip, trust_score, mfa_verified, created_at, last_seen, revoked
    FROM sessions WHERE user_id = $1 ORDER BY last_seen DESC
  `, [req.user.id]);
  res.json({ sessions, currentSessionId: req.session.id });
});

router.post('/sessions/:id/revoke', requireAuth, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM sessions WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  const session = rows[0];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  await db.query('UPDATE sessions SET revoked = true WHERE id = $1', [session.id]);
  await recordAudit(req.user.id, 'SESSION_REVOKED', { sessionId: session.id });
  res.json({ ok: true });
});

router.get('/audit', requireAuth, async (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const { rows: blocks } = await db.query(`
    SELECT * FROM blockchain_audit WHERE user_id = $1
    ORDER BY block_index DESC LIMIT $2
  `, [req.user.id, limit]);
  res.json({ blocks });
});

router.get(['/audit/verify', '/chain-verify', '/ledger/verify'], requireAuth, async (req, res) => {
  const result = await verifyLedger();
  res.json({
    ...result,
    cryptographicAudit: { totalBlocks: result.totalBlocks, valid: result.valid },
    blockchainAudit: { totalBlocks: result.totalBlocks, valid: result.valid } // backward-compatible deprecated alias
  });
});

router.get('/threats', requireAuth, async (req, res) => {
  const { rows: threats } = await db.query(
    'SELECT * FROM threat_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
    [req.user.id]
  );
  res.json({ threats });
});

router.get('/signing-key', requireAuth, (req, res) => {
  res.json({ publicKey: publicSigningKey });
});

router.post('/verify-signature', requireAuth, (req, res) => {
  const { data, signature } = req.body;
  if (!data || !signature) return res.status(400).json({ error: 'data and signature are required' });
  const { sha256 } = require('../utils/crypto');
  const valid = verifySignature(sha256(data), signature);
  res.json({ valid });
});

router.get('/zero-trust', requireAuth, (req, res) => {
  res.json({ score: req.trust.score, reasons: req.trust.reasons, mfaEnabled: !!req.user.mfa_enabled });
});

module.exports = router;
