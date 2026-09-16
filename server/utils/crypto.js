const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { getEncryptionKey } = require('../services/productionConfigService');

const rawKey = getEncryptionKey();
const MASTER_KEY = crypto.createHash('sha256').update(rawKey).digest();

/** Encrypt a buffer with AES-256-GCM. Returns: [iv(12)][ciphertext][authTag(16)]. */
function encryptBuffer(buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]);
}

/** Decrypt a buffer produced by encryptBuffer or Python AESGCM. */
function decryptBuffer(payload) {
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(payload.length - 16);
  const ciphertext = payload.subarray(12, payload.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Encrypt a sensitive string secret (such as TOTP seed) returning base64 string */
function encryptSecret(plaintext) {
  if (!plaintext) return plaintext;
  const buf = Buffer.from(String(plaintext), 'utf8');
  return encryptBuffer(buf).toString('base64');
}

/** Decrypt a sensitive string secret from base64 string, falling back to plaintext for legacy rows */
function decryptSecret(payloadStr) {
  if (!payloadStr) return payloadStr;
  try {
    const buf = Buffer.from(payloadStr, 'base64');
    // Minimal GCM payload: 12 bytes IV + 16 bytes AuthTag = 28 bytes
    if (buf.length < 28) return payloadStr;
    const decrypted = decryptBuffer(buf);
    return decrypted.toString('utf8');
  } catch {
    return payloadStr;
  }
}

function sha256(bufferOrString) {
  return crypto.createHash('sha256').update(bufferOrString).digest('hex');
}

// On Vercel, use RSA_PRIVATE_KEY / RSA_PUBLIC_KEY env vars (PEM strings).
// Locally, falls back to files in data/db/.

function loadOrCreateSigningKeys() {
  if (process.env.RSA_PRIVATE_KEY && process.env.RSA_PUBLIC_KEY) {
    return {
      privateKey: process.env.RSA_PRIVATE_KEY.replace(/\\n/g, '\n').trim(),
      publicKey: process.env.RSA_PUBLIC_KEY.replace(/\\n/g, '\n').trim(),
      source: 'env',
      ephemeral: false
    };
  }

  const rsaKeyDir = path.join(__dirname, '..', '..', 'data', 'db');
  const privKeyPath = path.join(rsaKeyDir, 'signing_private.pem');
  const pubKeyPath = path.join(rsaKeyDir, 'signing_public.pem');

  try {
    if (fs.existsSync(privKeyPath) && fs.existsSync(pubKeyPath)) {
      return {
        privateKey: fs.readFileSync(privKeyPath, 'utf8'),
        publicKey: fs.readFileSync(pubKeyPath, 'utf8'),
        source: 'filesystem',
        ephemeral: false
      };
    }
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    fs.mkdirSync(rsaKeyDir, { recursive: true });
    fs.writeFileSync(privKeyPath, privateKey);
    fs.writeFileSync(pubKeyPath, publicKey);
    return { publicKey, privateKey, source: 'filesystem', ephemeral: false };
  } catch (err) {
    // SEC-05: Ephemeral key generation telemetry event (zero secret/key material logged)
    const telemetryEvent = {
      event: 'SECURITY_RSA_FALLBACK_ACTIVATED',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      reason: 'filesystem_read_only_or_missing_keys',
      ephemeral: true
    };
    console.warn('[SECURITY TELEMETRY]', JSON.stringify(telemetryEvent));
    console.warn('[crypto] Filesystem read-only — generating ephemeral RSA keys. Set RSA_PRIVATE_KEY and RSA_PUBLIC_KEY in Vercel env vars for persistence.');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    return { publicKey, privateKey, source: 'ephemeral', ephemeral: true };
  }
}

const SIGNING_KEYS = loadOrCreateSigningKeys();

function signData(data) {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  return signer.sign(SIGNING_KEYS.privateKey, 'base64');
}

function verifySignature(data, signature) {
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(data);
  verifier.end();
  try {
    return verifier.verify(SIGNING_KEYS.publicKey, signature, 'base64');
  } catch (e) {
    return false;
  }
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function getSigningKeyMetadata() {
  return {
    source: SIGNING_KEYS.source || (process.env.RSA_PRIVATE_KEY ? 'env' : 'filesystem'),
    algorithm: 'RSA-SHA256',
    modulusLength: 2048,
    ephemeral: Boolean(SIGNING_KEYS.ephemeral),
    hasPublicKey: Boolean(SIGNING_KEYS.publicKey),
    hasPrivateKey: Boolean(SIGNING_KEYS.privateKey)
  };
}

module.exports = {
  MASTER_KEY,
  encryptBuffer,
  decryptBuffer,
  encryptSecret,
  decryptSecret,
  sha256,
  signData,
  verifySignature,
  randomToken,
  publicSigningKey: SIGNING_KEYS.publicKey,
  getSigningKeyMetadata
};
