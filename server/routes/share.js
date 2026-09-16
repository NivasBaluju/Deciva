const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { decryptBuffer, randomToken } = require('../utils/crypto');
const { recordAudit, logThreat } = require('../utils/audit');

const router = express.Router();
const uploadsDir = path.join(__dirname, '..', '..', 'data', 'uploads');

router.post('/', requireAuth, async (req, res) => {
  const { documentId, password, expiresInHours, maxDownloads } = req.body;
  const { rows } = await db.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [documentId, req.user.id]);
  const doc = rows[0];
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const id = uuidv4();
  const token = randomToken(16);
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const expiresAt = expiresInHours ? new Date(Date.now() + Number(expiresInHours) * 3600 * 1000).toISOString() : null;

  await db.query(`
    INSERT INTO share_links (id, document_id, token, password_hash, expires_at, max_downloads)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [id, doc.id, token, passwordHash, expiresAt, maxDownloads || null]);

  await recordAudit(req.user.id, 'SHARE_LINK_CREATED', { documentId: doc.id, expiresAt, maxDownloads: maxDownloads || null });
  res.json({ id, token, url: `/api/share/${token}`, expiresAt, passwordProtected: !!password, maxDownloads: maxDownloads || null });
});

router.get('/', requireAuth, async (req, res) => {
  const { rows: links } = await db.query(`
    SELECT sl.id, sl.token, sl.expires_at, sl.max_downloads, sl.download_count, sl.revoked, sl.created_at, d.original_name
    FROM share_links sl JOIN documents d ON d.id = sl.document_id
    WHERE d.user_id = $1 ORDER BY sl.created_at DESC
  `, [req.user.id]);
  res.json({ links });
});

router.post('/:id/revoke', requireAuth, async (req, res) => {
  const { rows } = await db.query(`
    SELECT sl.* FROM share_links sl JOIN documents d ON d.id = sl.document_id
    WHERE sl.id = $1 AND d.user_id = $2
  `, [req.params.id, req.user.id]);
  const link = rows[0];
  if (!link) return res.status(404).json({ error: 'Share link not found' });
  await db.query('UPDATE share_links SET revoked = true WHERE id = $1', [link.id]);
  await recordAudit(req.user.id, 'SHARE_LINK_REVOKED', { linkId: link.id });
  res.json({ ok: true });
});

router.post('/:token/access', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM share_links WHERE token = $1', [req.params.token]);
  const link = rows[0];
  if (!link || link.revoked) return res.status(404).json({ error: 'Link not found or revoked' });
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Link has expired' });
  }
  if (link.max_downloads && link.download_count >= link.max_downloads) {
    return res.status(410).json({ error: 'Download limit reached' });
  }
  if (link.password_hash) {
    const ok = await bcrypt.compare(req.body.password || '', link.password_hash);
    if (!ok) {
      await logThreat(null, req.ip, 'medium', 'share_link', `Failed password attempt on share link ${link.token}`);
      return res.status(401).json({ error: 'Incorrect password' });
    }
  }

  const { rows: docRows } = await db.query('SELECT * FROM documents WHERE id = $1', [link.document_id]);
  const doc = docRows[0];
  if (!doc) return res.status(410).json({ error: 'File no longer available' });
  const resolvedPath = path.resolve(uploadsDir, doc.filename);
  if (!resolvedPath.startsWith(path.resolve(uploadsDir) + path.sep)) {
    return res.status(403).json({ error: 'Access denied: Invalid file storage path' });
  }
  if (!fs.existsSync(resolvedPath)) return res.status(410).json({ error: 'File no longer available' });

  const decrypted = decryptBuffer(fs.readFileSync(resolvedPath));
  await db.query('UPDATE share_links SET download_count = download_count + 1 WHERE id = $1', [link.id]);
  await recordAudit(null, 'SHARED_DOCUMENT_ACCESSED', { linkId: link.id, documentId: doc.id });

  // Sanitize filename against CRLF (\r\n), quotes, and header splitting injection
  const safeFilename = (doc.original_name || 'shared_document.pdf')
    .replace(/[\r\n"';]/g, '_')
    .replace(/[^\w.-]/g, '_');

  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.send(decrypted);
});

module.exports = router;
