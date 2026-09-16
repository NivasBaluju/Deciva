const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const {
  extractClauses, simplifyText, ragAnswer, riskScore,
  negotiationSuggestions, complianceCheck, extractDeadlines,
  detectPII, redactPII, diffDocuments
} = require('../utils/aiEngine');
const { askGeminiOrFallback } = require('../utils/gemini');
const { recordAiTelemetry, getTelemetryMetrics } = require('../utils/aiTelemetry');

const router = express.Router();

async function getOwnedDocument(id, userId) {
  const { rows } = await db.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0];
}

router.get('/telemetry', requireAuth, async (req, res) => {
  try {
    const hours = Number(req.query.hours) || 24;
    const metrics = await getTelemetryMetrics({ timeWindowHours: hours });
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve telemetry metrics' });
  }
});

router.get('/documents/:id/clauses', requireAuth, async (req, res) => {
  const doc = await getOwnedDocument(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json({ clauses: extractClauses(doc.extracted_text || '') });
});

router.get('/documents/:id/simplify', requireAuth, async (req, res) => {
  const doc = await getOwnedDocument(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json({ original: doc.extracted_text, simplified: simplifyText(doc.extracted_text || '') });
});

router.post('/documents/:id/chat', requireAuth, async (req, res) => {
  const startTime = Date.now();
  const doc = await getOwnedDocument(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'question is required' });

  const result = await askGeminiOrFallback(question, doc.extracted_text || '');
  const durationMs = Date.now() - startTime;

  recordAiTelemetry({
    correlationId: req.correlationId,
    userId: req.user.id,
    documentId: doc.id,
    operationType: 'CHAT_RAG',
    provider: result.provider || 'local',
    model: result.model || 'gemini-fallback',
    durationMs,
    status: 'SUCCESS',
    groundedStatus: result.grounded !== false && result.groundingStatus !== 'INSUFFICIENT_EVIDENCE' ? 'GROUNDED' : 'INSUFFICIENT_EVIDENCE',
    tokensUsed: result.tokensUsed || 0,
    fallbackUsed: Boolean(result.fallbackUsed)
  });

  await db.query(
    `INSERT INTO chat_messages (id, document_id, user_id, role, content) VALUES ($1, $2, $3, 'user', $4)`,
    [uuidv4(), doc.id, req.user.id, question]
  );
  const dbConfidence = typeof result.confidence === 'object' && result.confidence !== null
    ? result.confidence.score
    : (typeof result.confidence === 'number' ? result.confidence : null);

  await db.query(
    `INSERT INTO chat_messages (id, document_id, user_id, role, content, confidence, source_ref, grounded) VALUES ($1, $2, $3, 'assistant', $4, $5, $6, $7)`,
    [uuidv4(), doc.id, req.user.id, result.answer, dbConfidence, JSON.stringify(result.sources || []), result.grounded !== false]
  );

  res.json(result);
});

router.get('/documents/:id/chat', requireAuth, async (req, res) => {
  const doc = await getOwnedDocument(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const { rows: messages } = await db.query(
    'SELECT * FROM chat_messages WHERE document_id = $1 ORDER BY created_at ASC',
    [doc.id]
  );
  res.json({ messages });
});

router.get('/documents/:id/risk', requireAuth, async (req, res) => {
  const doc = await getOwnedDocument(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json(riskScore(doc.extracted_text || ''));
});

router.get('/documents/:id/negotiation', requireAuth, async (req, res) => {
  const doc = await getOwnedDocument(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json({ suggestions: negotiationSuggestions(doc.extracted_text || '') });
});

router.get('/documents/:id/compliance', requireAuth, async (req, res) => {
  const doc = await getOwnedDocument(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json({ frameworks: complianceCheck(doc.extracted_text || '') });
});

router.get('/documents/:id/deadlines', requireAuth, async (req, res) => {
  const doc = await getOwnedDocument(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json({ deadlines: extractDeadlines(doc.extracted_text || '') });
});

router.get('/deadlines', requireAuth, async (req, res) => {
  const { rows: docs } = await db.query('SELECT id, original_name, extracted_text FROM documents WHERE user_id = $1', [req.user.id]);
  const all = [];
  for (const doc of docs) {
    const deadlines = extractDeadlines(doc.extracted_text || '');
    deadlines.forEach(d => all.push({ ...d, documentId: doc.id, documentName: doc.original_name }));
  }
  res.json({ deadlines: all });
});

router.get('/documents/:id/pii', requireAuth, async (req, res) => {
  const doc = await getOwnedDocument(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json({ items: detectPII(doc.extracted_text || '') });
});

router.post('/documents/:id/redact', requireAuth, async (req, res) => {
  const doc = await getOwnedDocument(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const { customTerms = [] } = req.body;
  const result = redactPII(doc.extracted_text || '', customTerms);
  await recordAudit(req.user.id, 'PII_REDACTED', { documentId: doc.id, itemsFound: result.itemsFound });
  res.json(result);
});

router.post('/compare', requireAuth, async (req, res) => {
  const { documentIdA, documentIdB } = req.body;
  const docA = await getOwnedDocument(documentIdA, req.user.id);
  const docB = await getOwnedDocument(documentIdB, req.user.id);
  if (!docA || !docB) return res.status(404).json({ error: 'One or both documents not found' });
  const result = diffDocuments(docA.extracted_text || '', docB.extracted_text || '');
  await recordAudit(req.user.id, 'DOCUMENT_COMPARED', { documentIdA, documentIdB, totalChanges: result.totalChanges });
  res.json({ ...result, docA: docA.original_name, docB: docB.original_name });
});

module.exports = router;
