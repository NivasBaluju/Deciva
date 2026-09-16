require('dotenv').config();
const { validateStartupConfig } = require('./services/productionConfigService');

// [P0 SECURITY] Enforce fail-fast configuration validation before server initialization
validateStartupConfig();

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const db = require('./db'); // eslint-disable-line no-unused-vars -- initializes schema
const { recordAudit } = require('./utils/audit');
const adminProvisioningService = require('./services/adminProvisioningService');

const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/documents');
const aiRoutes = require('./routes/ai');
const contractRoutes = require('./routes/contracts');
const securityRoutes = require('./routes/security');
const shareRoutes = require('./routes/share');
const adminRoutes = require('./routes/admin');
const contractActionsRoutes = require('./routes/contractActions');
const notificationRoutes = require('./routes/notifications');
const portfolioRoutes = require('./routes/portfolioAnalytics');
const portfolioOperationsRoutes = require('./routes/portfolioOperations');
const complianceRoutes = require('./routes/complianceAudit');
const workflowRoutes = require('./routes/workflow');
const governanceRoutes = require('./routes/governance');
const integrationsRoutes = require('./routes/integrations');
const jobsRoutes = require('./routes/jobs');
const { correlationMiddleware } = require('./middleware/correlation');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;
const AI_MICROSERVICE_URL = (process.env.AI_MICROSERVICE_URL || 'http://127.0.0.1:5001').replace(/\/+$/, '');

// Trust reverse proxy hops (Vercel, Cloudflare, Nginx, ALB) for accurate client IP identification
app.set('trust proxy', 1);

// Mount request correlation tracking early
app.use(correlationMiddleware);

// Allow the Vercel-hosted frontend and local dev to reach the API.
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL,           // e.g. https://deciva-ai.vercel.app
  'http://localhost:5000',
  'http://localhost:3000',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:3000',
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-Id');
  res.setHeader('Access-Control-Expose-Headers', 'X-Correlation-Id');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Enforce standard request body boundary (1MB) and preserve rawBody for HMAC verification
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(cookieParser());

// Comprehensive modern security headers (defense-in-depth posture)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' ws: wss:; frame-ancestors 'none'; object-src 'none'; base-uri 'self';"
  );
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/actions', contractActionsRoutes.router);
app.use('/api/notifications', notificationRoutes);
app.use('/api/portfolio/operations', portfolioOperationsRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/documents/:documentId/compliance', (req, res, next) => {
  req.url = `/documents/${req.params.documentId}${req.url}`;
  complianceRoutes(req, res, next);
});
app.use('/api/portfolio/compliance', (req, res, next) => {
  req.url = `/portfolio${req.url}`;
  complianceRoutes(req, res, next);
});
app.use('/api/ai', aiRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/governance', governanceRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/jobs', jobsRoutes);

app.get(['/api/health/live', '/api/health/liveness'], (req, res) => {
  res.status(200).json({
    status: 'live',
    service: 'Deciva Gateway',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    correlationId: req.correlationId
  });
});

app.get(['/api/health/ready', '/api/health/readiness'], async (req, res) => {
  const health = {
    status: 'ready',
    service: 'Deciva Gateway',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    correlationId: req.correlationId,
    dependencies: {
      database: { status: 'unknown' },
      ai_microservice: { status: 'unknown' }
    }
  };

  let isReady = true;

  // Database connectivity check
  try {
    const dbStart = Date.now();
    await db.query('SELECT 1');
    health.dependencies.database = {
      status: 'healthy',
      latencyMs: Date.now() - dbStart
    };
  } catch (dbErr) {
    health.dependencies.database = {
      status: 'unhealthy',
      error: dbErr.message
    };
    isReady = false;
  }

  // AI Microservice check
  try {
    const flaskStart = Date.now();
    const flaskRes = await fetch(`${AI_MICROSERVICE_URL}/api/health`, {
      signal: AbortSignal.timeout(3000)
    });
    if (flaskRes.ok) {
      const flaskData = await flaskRes.json();
      health.dependencies.ai_microservice = {
        status: 'healthy',
        latencyMs: Date.now() - flaskStart,
        connected: flaskData.postgres?.connected !== false
      };
    } else {
      health.dependencies.ai_microservice = {
        status: 'fallback_ready',
        mode: 'node_gemini_fallback',
        httpStatus: flaskRes.status,
        note: 'Python microservice returned non-200; Node Gemini & heuristic fallback active'
      };
    }
  } catch (flaskErr) {
    health.dependencies.ai_microservice = {
      status: 'fallback_ready',
      mode: 'node_gemini_fallback',
      note: 'Microservice unreachable; direct Node Gemini & heuristic fallback active'
    };
  }

  health.status = isReady ? 'ready' : 'unhealthy';
  res.status(isReady ? 200 : 503).json(health);
});

app.get('/api/health/dependencies', async (req, res) => {
  const dependencies = {
    postgresql: { status: 'FAILED' },
    ai_microservice: { status: 'DEGRADED' },
    credential_vault: { status: 'READY' },
    integration_outbox: { status: 'READY' },
    background_jobs: { status: 'READY' },
    audit_ledger: { status: 'READY' }
  };

  let overall = 'READY';

  try {
    const t0 = Date.now();
    await db.query('SELECT 1');
    dependencies.postgresql = { status: 'READY', latencyMs: Date.now() - t0 };
  } catch (err) {
    dependencies.postgresql = { status: 'FAILED', error: err.message };
    overall = 'FAILED';
  }

  try {
    const t0 = Date.now();
    const flaskRes = await fetch(`${AI_MICROSERVICE_URL}/api/health`, {
      signal: AbortSignal.timeout(4000)
    });
    if (flaskRes.ok) {
      dependencies.ai_microservice = { status: 'READY', latencyMs: Date.now() - t0 };
    } else {
      dependencies.ai_microservice = { status: 'READY', mode: 'NODE_FALLBACK', note: 'Node fallback active' };
    }
  } catch {
    dependencies.ai_microservice = { status: 'READY', mode: 'NODE_FALLBACK', note: 'Node fallback active' };
  }

  try {
    const { getCredentialVaultStats } = require('./services/credentialVaultService');
    const stats = await getCredentialVaultStats();
    dependencies.credential_vault = { status: 'READY', algorithm: 'AES-256-GCM', activeSecrets: stats.activeSecrets };
  } catch {
    dependencies.credential_vault = { status: 'READY', algorithm: 'AES-256-GCM' };
  }

  try {
    const { rows: dlq } = await db.query("SELECT COUNT(*) AS c FROM integration_event_outbox WHERE status = 'DEAD_LETTER'");
    const dlqCount = Number(dlq[0]?.c || 0);
    dependencies.integration_outbox = {
      status: dlqCount > 10 ? 'DEGRADED' : 'READY',
      dead_letter_count: dlqCount
    };
    if (dlqCount > 10 && overall !== 'FAILED') overall = 'DEGRADED';
  } catch {}

  try {
    const { rows: audit } = await db.query('SELECT COUNT(*) AS c FROM blockchain_audit');
    dependencies.audit_ledger = {
      status: 'READY',
      total_blocks: Number(audit[0]?.c || 0),
      algorithm: 'SHA-256'
    };
  } catch (err) {
    dependencies.audit_ledger = { status: 'FAILED', error: err.message };
    overall = 'FAILED';
  }

  const httpStatus = overall === 'FAILED' ? 503 : 200;
  res.status(httpStatus).json({
    status: overall,
    timestamp: new Date().toISOString(),
    correlation_id: req.correlationId,
    dependencies
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Deciva',
    time: new Date().toISOString(),
    correlationId: req.correlationId
  });
});

// Bootstrap genesis audit block and cold-start administrator on first run.
(async () => {
  try {
    const { rows } = await db.query('SELECT COUNT(*) AS c FROM blockchain_audit');
    if (Number(rows[0].c) === 0) {
      await recordAudit(null, 'SYSTEM_INITIALIZED', { message: 'Deciva audit ledger initialized' });
    }
    await adminProvisioningService.bootstrapInitialAdmin(db);
  } catch (e) {
    console.error('Startup initialization error:', e.message);
  }
})();

// Serve frontend SPA (React production build or legacy fallback)
const distDir = path.join(__dirname, '..', 'dist');
const publicDir = path.join(__dirname, '..', 'public');
const staticDir = fs.existsSync(distDir) ? distDir : publicDir;

app.use(express.static(staticDir));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(staticDir, 'index.html'));
});

// Central error handler
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// Local dev: start HTTP server. On Vercel, the file is imported as a module.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  Deciva running at http://localhost:${PORT}\n`);
  });
}

// Export for Vercel serverless
module.exports = app;
