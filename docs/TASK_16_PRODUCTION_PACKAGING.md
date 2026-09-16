# Deciva AI — Task 16: Production Packaging & Deployment Specification

## 1. System Architecture & Topology

Deciva AI is architected as an enterprise multi-tier legal copilot with strict separation of concerns, transactional isolation, and hardware-level cryptographic controls.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Client Browser Layer                              │
│         React 19 / Vite SPA (Accessible Monochrome WCAG AAA Interface)      │
│         - Pure httpOnly Cookie Session Transport (credentials: 'include')   │
│         - Zero Auth JWT Persistence in Web Storage (GAP-01 Resolved)       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTPS / WSS
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Tier 2: API Gateway                               │
│                    Node.js 20 / Express (Port 5000)                         │
│  - Session Hydration & Zero-Trust Scoring (req.cookies.token / Bearer)      │
│  - AES-256-GCM Vault & Cryptographic Ledger Anchoring                      │
│  - Deterministic Policy Governance & Threat Mitigation                      │
│  - Structured JSON Observability with Correlation IDs                       │
└───────────────────┬─────────────────────────────────────┬───────────────────┘
                    │ REST (Shared Secret Auth)           │ PostgreSQL / SSL
                    ▼                                     ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│     Tier 4: AI Microservice          │  │       Tier 3: Database Engine     │
│   Python 3.11 / Flask (Port 5001)    │  │       PostgreSQL 16 (Relational)  │
│  - Production Gunicorn WSGI Server   │  │  - Row-Level Tenant Isolation     │
│  - PyMuPDF Vector Text Extraction    │  │  - Append-Only SHA-256 Chain      │
│  - Deterministic Scikit-Learn Engine │  │  - Transactional Advisory Locks   │
│  - Google Gemini Enterprise API      │  │  - 19 Production Migrations       │
└──────────────────────────────────────┘  └───────────────────────────────────┘
```

---

## 2. Deployment Architecture: Cloud vs. Local/Self-Hosted

Deciva explicitly supports two distinct deployment models. A bundled PostgreSQL container must **never** be conflated with managed cloud persistence:

| Dimension | Local / Self-Hosted Enclave | Cloud Production Target |
| :--- | :--- | :--- |
| **Frontend Delivery** | Static bundle served via Node Gateway or local web server | Vercel Edge Network (`vercel.json`) |
| **API Gateway** | Containerized Node (`Dockerfile.gateway`) via Docker Compose | Render Web Service (`render.yaml`) / Node.js Managed Runtime |
| **AI Microservice** | Containerized Flask (`Dockerfile.ai`) via Docker Compose | Render Web Service (`render.yaml`) / Python Managed Runtime |
| **Database Engine** | Isolated containerized PostgreSQL 16 (`deciva-postgres`) | Managed Neon Serverless PostgreSQL (`DATABASE_URL` with SSL) |
| **Inter-Service Host** | `http://ai-microservice:5001` | Dedicated secure private cloud URL or `https://...onrender.com` |
| **Disaster Recovery** | Point-in-time container volume snapshots | Automated WAL archiving and multi-AZ continuous failover |

---

## 3. Containerized Local / Self-Hosted Packaging

Deciva provides reproducible container configurations:

- `Dockerfile.gateway`: Node.js 20 Alpine production image with `dumb-init` signal handling, non-root user (`node`), production dependencies, and healthcheck `/api/health`.
- `Dockerfile.ai`: Python 3.11 slim image with Tesseract OCR, PyMuPDF, production Gunicorn WSGI server (2 workers, 120s timeout), non-root user (`appuser`), and healthcheck `/health`.
- `docker-compose.yml`: Multi-service orchestration binding `postgres`, `ai-microservice`, and `api-gateway` with inter-service networking, persistent volumes, and healthcheck dependencies.

### Local Container Startup
```bash
# 1. Copy and configure environment variables
cp .env.example .env

# 2. Validate docker compose configuration
docker compose config

# 3. Build images and start all services in detached mode
docker compose up -d --build

# 4. Inspect container health status
docker compose ps

# 5. Tail structured application logs
docker compose logs -f api-gateway
```

---

## 4. Production Environment Configuration

All required production environment variables must be securely injected via deployment secrets (never committed to Git):

| Variable Name | Required By | Description | Example / Format |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Gateway | Application environment mode | `production` |
| `PORT` | Gateway | HTTP listening port for Gateway | `5000` |
| `DATABASE_URL` | Gateway, AI | PostgreSQL connection string with SSL | `postgresql://user:pass@host:5432/deciva?sslmode=require` |
| `JWT_SECRET` | Gateway | Cryptographic secret for signing auth tokens | 64+ char high-entropy random string |
| `ENCRYPTION_KEY` | Gateway | 32-byte (64 hex char) key for AES-256-GCM vault | `0123456789abcdef...` (64 hex) |
| `INTERNAL_SERVICE_KEY` | Gateway, AI | Mutual authentication secret between Node & Python | 32+ char high-entropy shared secret |
| `AI_MICROSERVICE_URL` | Gateway | Internal HTTP URL for Python AI service | `http://ai-microservice:5001` or cloud host |
| `GEMINI_API_KEY` | AI Microservice | Google Cloud Gemini API key for external LLM | High-entropy Google AI Studio / GCP key |
| `CLIENT_URL` | Gateway | Authorized frontend origin for CORS & Cookies | `https://deciva-ai.vercel.app` |
| `COOKIE_SECURE` | Gateway | Enforce HTTPS-only cookie transmission | `true` in production |
| `COOKIE_DOMAIN` | Gateway | Domain attribute for auth cookie | `.yourdomain.com` (or blank for host-only) |
| `RSA_PRIVATE_KEY` | Gateway | RSA-2048 private key for non-repudiation signing | PEM string (`\n` escaped) |
| `RSA_PUBLIC_KEY` | Gateway | RSA-2048 public key certificate | PEM string (`\n` escaped) |

---

## 5. Health Checks & Probes

Both services expose standardized HTTP endpoints for Kubernetes, Render, AWS ALB, and Docker health monitoring:

### Gateway Health (`GET /api/health`)
- **Status Code**: `200 OK` (healthy), `503 Service Unavailable` (degraded/unhealthy)
- **Checks Executed**:
  - PostgreSQL database connectivity and query ping (`SELECT 1`)
  - AI microservice connectivity (`GET ${AI_MICROSERVICE_URL}/health`)
  - Encryption vault key initialization
- **Response Structure**:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-09-16T13:45:00.000Z",
    "services": {
      "database": "connected",
      "ai_microservice": "connected",
      "vault": "active"
    }
  }
  ```

### AI Microservice Health (`GET /health`)
- **Status Code**: `200 OK`
- **Checks Executed**:
  - Microservice process status, PyMuPDF engine, Scikit-learn models
- **Response Structure**:
  ```json
  {
    "status": "healthy",
    "service": "deciva-ai-microservice",
    "version": "1.0.0"
  }
  ```

---

## 6. Database Migrations & Safety Policy

1. **Transactional Invariant**: All schema changes are registered in `server/db.js` under `MIGRATIONS`.
2. **Sequential Versioning**: Each migration has a unique timestamp prefix (e.g., `20260904_014_...`).
3. **Automatic Idempotent Execution**: Upon gateway startup, `runMigrations()` executes unapplied migrations within ACID transactions and records them in `schema_migrations`.
4. **Historical Record Preservation**:
   - `blockchain_audit` (SHA-256 cryptographic ledger) is strictly append-only. No `UPDATE` or `DELETE` operations are ever executed against ledger blocks.
   - Tenant lifecycle records, document version groups, and negotiation histories are retained with soft deletion flags.

---

## 7. Operational Runbook & Observability

### Logging & Diagnostics
- **Format**: Single-line structured JSON output written to `stdout` (`INFO`, `WARN`) and `stderr` (`ERROR`, `SECURITY`).
- **Traceability**: All log entries include `correlationId` (derived from `X-Correlation-Id` header or generated UUID), `userId`, `timestamp`, and `durationMs`.
- **Sensitive Data Redaction**: Automatic recursion scrubs passwords, tokens, hashes, prompts, and raw document contents.

### Graceful Shutdown
- Both Node and Python processes trap `SIGTERM` and `SIGINT`.
- Active HTTP connections are allowed up to 30 seconds to drain before socket closure.
- Database pools and advisory locks are cleanly closed.
