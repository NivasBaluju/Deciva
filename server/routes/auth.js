const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

const db = require('../db');
const { fingerprint, JWT_SECRET, requireAuth } = require('../middleware/auth');
const { authLimiter, otpVerifyLimiter } = require('../middleware/rateLimiter');
const { encryptSecret, decryptSecret } = require('../utils/crypto');
const { recordAudit, logThreat } = require('../utils/audit');
const { sendWelcomeEmail } = require('../utils/email');
const {
  validatePassword,
  hashPassword,
  verifyPassword,
  verifyDummyPassword
} = require('../utils/passwordPolicy');

const router = express.Router();

function issueToken(sessionId, userId) {
  return jwt.sign({ sessionId, userId }, JWT_SECRET, { expiresIn: '7d' });
}

function getAuthCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? (process.env.COOKIE_SAMESITE || 'lax') : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (matches jwt expiresIn: '7d')
    path: '/'
  };
}

function getClearCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? (process.env.COOKIE_SAMESITE || 'lax') : 'lax',
    path: '/'
  };
}

/**
 * POST /api/auth/register
 * Enterprise Password-Based Registration.
 * No email OTP dependency. Issues session and httpOnly cookie upon creation.
 */
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body || {};

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Valid email address is required', field: 'email' });
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.length > 255) {
      return res.status(400).json({ error: 'Valid email address is required', field: 'email' });
    }

    if (name !== undefined && typeof name !== 'string') {
      return res.status(400).json({ error: 'Full name must be a string', field: 'name' });
    }
    // Sanitize displayName to prevent stored XSS attacks
    const rawName = (name && typeof name === 'string') ? name.replace(/<[^>]*>?/gm, '').trim() : '';
    const displayName = rawName || cleanEmail.split('@')[0];
    if (!displayName) {
      return res.status(400).json({ error: 'Full name is required', field: 'name' });
    }

    // Authoritative password policy validation
    const pwCheck = validatePassword(password, confirmPassword !== undefined ? confirmPassword : null);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.reason, field: 'password' });
    }

    // Prevent duplicate account registration
    const { rows: existingRows } = await db.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (existingRows.length > 0) {
      return res.status(400).json({ error: 'An account with this email address already exists', field: 'email' });
    }

    const hashedPassword = await hashPassword(password);
    const id = uuidv4();

    const { rows: newRows } = await db.query(
      `INSERT INTO users (id, name, email, password_hash, role, mfa_enabled, password_initialized)
       VALUES ($1, $2, $3, $4, 'user', false, true)
       RETURNING *`,
      [id, displayName, cleanEmail, hashedPassword]
    );
    const user = newRows[0];

    await recordAudit(id, 'USER_REGISTERED', { email: cleanEmail, role: 'user', method: 'password' });

    // Background welcome email (non-blocking, non-OTP)
    setImmediate(() => {
      sendWelcomeEmail(cleanEmail, displayName).catch(err => console.warn('Welcome email dispatch error:', err.message));
    });

    // Create session and issue httpOnly cookie immediately
    const sessionId = uuidv4();
    await db.query(
      'INSERT INTO sessions (id, user_id, device_fingerprint, ip, mfa_verified) VALUES ($1, $2, $3, $4, false)',
      [sessionId, user.id, fingerprint(req), req.ip]
    );
    const token = issueToken(sessionId, user.id);
    await recordAudit(user.id, 'LOGIN_SUCCESS', { method: 'password_registration' });

    res.cookie('token', token, getAuthCookieOptions());
    return res.status(201).json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        mfaEnabled: false
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * Enterprise Password-Based Authentication.
 * Timing-safe against account enumeration. Enforces TOTP MFA if enabled.
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || cleanEmail.length > 255) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
    const user = rows[0];

    if (!user) {
      // Equalize verification timing to resist account enumeration
      await verifyDummyPassword(password);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check for legacy accounts with uninitialized passwords
    if (user.password_initialized === false) {
      return res.status(403).json({
        error: 'Account requires password initialization. Please use your setup token or contact your administrator.',
        legacyInitRequired: true,
        userId: user.id
      });
    }

    // Verify password hash
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      await logThreat(user.id, req.ip, 'medium', 'auth', 'Failed login attempt: incorrect password');
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // If TOTP MFA is enabled on this account, challenge for second factor
    if (user.mfa_enabled) {
      const preToken = jwt.sign({ preauth: true, userId: user.id }, JWT_SECRET, { expiresIn: '10m' });
      return res.json({
        ok: true,
        mfaRequired: true,
        method: 'totp',
        preToken
      });
    }

    // Standard password authentication success: establish session & issue cookie
    const sessionId = uuidv4();
    await db.query(
      'INSERT INTO sessions (id, user_id, device_fingerprint, ip, mfa_verified) VALUES ($1, $2, $3, $4, false)',
      [sessionId, user.id, fingerprint(req), req.ip]
    );
    const token = issueToken(sessionId, user.id);
    await recordAudit(user.id, 'LOGIN_SUCCESS', { method: 'password' });

    res.cookie('token', token, getAuthCookieOptions());
    return res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        mfaEnabled: false
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/legacy/setup-password
 * Secure password initialization for legacy accounts using single-use setup tokens.
 * Completely non-email-dependent.
 * Enforces atomic single-use redemption (race-condition proof) and prevents re-initialization of already initialized accounts.
 */
router.post('/legacy/setup-password', authLimiter, async (req, res) => {
  try {
    const { email, setupToken, newPassword, confirmPassword } = req.body || {};

    if (!email || typeof email !== 'string' || !setupToken || typeof setupToken !== 'string' || !newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'Email, setup token, and new password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = setupToken.trim();

    if (cleanToken.length < 16 || cleanToken.length > 128) {
      return res.status(400).json({ error: 'Invalid setup token format' });
    }

    const pwCheck = validatePassword(newPassword, confirmPassword !== undefined ? confirmPassword : null);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.reason, field: 'password' });
    }

    const { rows: userRows } = await db.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
    const user = userRows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid setup request' });
    }

    // Section 14: Prevent legacy token from being abused as a general password-reset mechanism
    if (user.password_initialized === true) {
      return res.status(400).json({
        error: 'Account password has already been initialized. Legacy setup tokens cannot overwrite active passwords.'
      });
    }

    // Section 8: Atomically claim setup token in a single conditional update
    // Guarantees strict single-use and prevents concurrent race condition redemption
    const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
    const { rows: claimedTokens } = await db.query(
      `UPDATE legacy_setup_tokens
       SET used = true
       WHERE user_id = $1
         AND token_hash = $2
         AND used = false
         AND expires_at > NOW()
       RETURNING id, user_id, expires_at, created_at`,
      [user.id, tokenHash]
    );

    if (claimedTokens.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired setup token' });
    }

    // Hash and establish new password
    const hashedPassword = await hashPassword(newPassword);
    await db.query(
      'UPDATE users SET password_hash = $1, password_initialized = true WHERE id = $2',
      [hashedPassword, user.id]
    );

    // Invalidate prior sessions
    await db.query('UPDATE sessions SET revoked = true WHERE user_id = $1', [user.id]);

    await recordAudit(user.id, 'LEGACY_PASSWORD_INITIALIZED', {
      email: user.email,
      method: 'setup_token'
    });

    // Establish clean authenticated session
    const sessionId = uuidv4();
    await db.query(
      'INSERT INTO sessions (id, user_id, device_fingerprint, ip, mfa_verified) VALUES ($1, $2, $3, $4, false)',
      [sessionId, user.id, fingerprint(req), req.ip]
    );
    const token = issueToken(sessionId, user.id);
    res.cookie('token', token, getAuthCookieOptions());

    return res.json({
      ok: true,
      message: 'Password established successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        mfaEnabled: !!user.mfa_enabled
      }
    });
  } catch (err) {
    console.error('Legacy setup password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/mfa/totp/setup
 * Generates an RFC-6238 TOTP secret and QR code for an authenticated or pre-authenticated user.
 */
router.post('/mfa/totp/setup', async (req, res) => {
  try {
    let userId;
    const { preToken } = req.body || {};
    if (preToken) {
      try {
        const payload = jwt.verify(preToken, JWT_SECRET);
        if (payload.preauth) userId = payload.userId;
      } catch (e) { }
    }
    if (!userId) {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.cookies?.token;
      if (token) {
        try {
          const payload = jwt.verify(token, JWT_SECRET);
          userId = payload.userId;
        } catch (e) { }
      }
    }
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const secret = authenticator.generateSecret();
    const encryptedSecret = encryptSecret(secret);
    await db.query('UPDATE users SET totp_secret = $1 WHERE id = $2', [encryptedSecret, user.id]);
    const otpauth = authenticator.keyuri(user.email, 'Deciva', secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth);
    res.json({ secret, qrDataUrl });
  } catch (err) {
    console.error('TOTP setup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/mfa/totp/enable
 * Verifies the 6-digit TOTP code and activates TOTP MFA on the user account.
 */
router.post('/mfa/totp/enable', async (req, res) => {
  try {
    let userId;
    const { code, preToken } = req.body || {};
    if (preToken) {
      try {
        const payload = jwt.verify(preToken, JWT_SECRET);
        if (payload.preauth) userId = payload.userId;
      } catch (e) { }
    }
    if (!userId) {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.cookies?.token;
      if (token) {
        try {
          const payload = jwt.verify(token, JWT_SECRET);
          userId = payload.userId;
        } catch (e) { }
      }
    }
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.totp_secret) return res.status(400).json({ error: 'Run setup first' });

    const resolvedSecret = decryptSecret(user.totp_secret);
    const valid = authenticator.check(code || '', resolvedSecret);
    if (!valid) return res.status(400).json({ error: 'Invalid code' });
    await db.query('UPDATE users SET mfa_enabled = true WHERE id = $1', [user.id]);
    await recordAudit(user.id, 'MFA_ENABLED', { method: 'totp' });
    res.json({ ok: true });
  } catch (err) {
    console.error('TOTP enable error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/mfa/totp/verify
 * Verifies the 6-digit TOTP code during MFA login challenge and issues authenticated session cookie.
 * No email OTP fallback.
 */
router.post('/mfa/totp/verify', otpVerifyLimiter, async (req, res) => {
  try {
    const { preToken, code } = req.body || {};
    let payload;
    try {
      payload = jwt.verify(preToken, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Login session expired, please log in again' });
    }
    if (!payload.preauth) return res.status(400).json({ error: 'Invalid pre-auth token' });

    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [payload.userId]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const cleanCode = String(code || '').trim();
    let valid = false;

    if (user.totp_secret) {
      try {
        const resolvedSecret = decryptSecret(user.totp_secret);
        valid = authenticator.check(cleanCode, resolvedSecret);
      } catch (e) { }
    }

    if (!valid) {
      await logThreat(user.id, req.ip, 'high', 'mfa', 'Failed TOTP verification attempt');
      return res.status(401).json({ error: 'Invalid authentication code' });
    }

    const sessionId = uuidv4();
    await db.query(
      'INSERT INTO sessions (id, user_id, device_fingerprint, ip, mfa_verified) VALUES ($1, $2, $3, $4, true)',
      [sessionId, user.id, fingerprint(req), req.ip]
    );
    const token = issueToken(sessionId, user.id);
    await recordAudit(user.id, 'LOGIN_SUCCESS', { mfa: 'totp' });
    res.cookie('token', token, getAuthCookieOptions());
    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        mfaEnabled: true
      }
    });
  } catch (err) {
    console.error('TOTP verify error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * RETIRED OTP ENDPOINTS
 * Email OTP authentication routes return HTTP 410 Gone.
 */
router.all(['/mfa/otp/request', '/mfa/otp/verify'], (req, res) => {
  return res.status(410).json({
    error: 'Email OTP authentication has been deprecated and retired. Please authenticate using your password or TOTP authenticator.',
    code: 'OTP_AUTH_RETIRED'
  });
});

/**
 * GET /api/auth/me
 * Hydrates active authenticated session and trust score.
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: req.user,
    trust: req.trust,
    session: { id: req.session.id, createdAt: req.session.created_at }
  });
});

/**
 * POST /api/auth/logout
 * Revokes session in database and clears httpOnly authentication cookie.
 */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await db.query('UPDATE sessions SET revoked = true WHERE id = $1', [req.session.id]);
    await recordAudit(req.user.id, 'LOGOUT', {});
    res.clearCookie('token', getClearCookieOptions());
    res.json({ ok: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
