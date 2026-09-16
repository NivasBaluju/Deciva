const jwt = require('jsonwebtoken');
const db = require('../db');
const { sha256 } = require('../utils/crypto');
const { logThreat } = require('../utils/audit');
const { getJwtSecret } = require('../services/productionConfigService');

const JWT_SECRET = getJwtSecret();

function fingerprint(req) {
  const ua = req.headers['user-agent'] || 'unknown';
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  return sha256(`${ua}::${ip}`);
}

/** Computes a 0-100 zero-trust score for the current request/session. */
function trustScore(session, req) {
  let score = 100;
  const reasons = [];

  if (!session) return { score: 0, reasons: ['no active session'] };

  const currentFp = fingerprint(req);
  if (session.device_fingerprint !== currentFp) {
    score -= 40;
    reasons.push('device/network fingerprint changed');
  }
  if (!session.mfa_verified) {
    score -= 20;
    reasons.push('MFA not completed this session');
  }
  const createdAtTime = new Date(session.created_at).getTime();
  const ageMs = Date.now() - createdAtTime;
  const hours = ageMs / 36e5;
  if (hours > 12) {
    score -= 15;
    reasons.push('session older than 12 hours');
  }
  if (session.revoked) {
    score = 0;
    reasons.push('session revoked');
  }
  return { score: Math.max(0, score), reasons };
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    if (req.cookies?.token) {
      res.clearCookie('token', { path: '/', httpOnly: true });
    }
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const { rows: sessionRows } = await db.query('SELECT * FROM sessions WHERE id = $1', [payload.sessionId]);
    const session = sessionRows[0];
    if (!session || session.revoked) {
      if (req.cookies?.token) {
        res.clearCookie('token', { path: '/', httpOnly: true });
      }
      return res.status(401).json({ error: 'Session invalid or revoked' });
    }

    const { score, reasons } = trustScore(session, req);
    await db.query('UPDATE sessions SET trust_score = $1, last_seen = NOW() WHERE id = $2', [score, session.id]);

    if (score < 30) {
      await logThreat(payload.userId, req.ip, 'high', 'zero_trust', `Blocked low-trust request (score ${score}): ${reasons.join(', ')}`);
      return res.status(403).json({ error: 'Zero-trust evaluation failed', score, reasons });
    }

    const { rows: userRows } = await db.query('SELECT id, name, email, role, mfa_enabled FROM users WHERE id = $1', [payload.userId]);
    const user = userRows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });

    req.user = user;
    req.session = session;
    req.trust = { score, reasons };
    next();
  } catch (err) {
    console.error('requireAuth error:', err);
    return res.status(500).json({ error: 'Authentication processing error' });
  }
}

async function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Administrator privileges required.' });
    }
    // If administrator has MFA enabled, require MFA completion for administrative actions
    if (req.user.mfa_enabled && !req.session?.mfa_verified) {
      return res.status(403).json({
        error: 'Access denied: Multi-factor authentication verification required for administrative operations.'
      });
    }
    return next();
  });
}

/**
 * Enforces role-based access control (RBAC) across specified roles.
 * Administrators are automatically granted access.
 */
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      const userRole = req.user?.role || 'user';
      if (!allowedRoles.includes(userRole) && userRole !== 'admin') {
        return res.status(403).json({
          error: `Access denied: Role '${userRole}' lacks required permissions. Allowed: ${allowedRoles.join(', ')}`
        });
      }
      return next();
    });
  };
}

module.exports = { requireAuth, requireAdmin, requireRole, fingerprint, trustScore, JWT_SECRET };
