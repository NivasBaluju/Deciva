# Deciva — Production Deployment Runbook

---

## 1. Prerequisites & System Requirements

* **Node.js:** v18.0.0+ LTS (Tested on v22.13.0)
* **Python:** 3.10+ (Tested on Python 3.12 with scikit-learn / PyMuPDF)
* **PostgreSQL:** 15.0+ (Neon DB or standard enterprise PostgreSQL)
* **Storage:** 50GB+ persistent block storage for `storage/backups` and `storage/exports`
* **Network:** TCP 5000 (Node API Server), TCP 5001 (Flask AI Microservice)

---

## 2. Environment Variables & Secret Configuration

Production environments require explicit values. The platform fails closed upon startup if any required secret is missing.

| Variable | Classification | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | REQUIRED (Sensitive) | PostgreSQL connection URI with SSL (`sslmode=require` or `verify-full`) |
| `JWT_SECRET` | REQUIRED (Sensitive) | High-entropy secret (>=32 chars) for signing session tokens |
| `ENCRYPTION_KEY` | REQUIRED (Sensitive) | 64-character hex key (256 bits) for AES-256-GCM Credential Vault |
| `PORT` | OPTIONAL | Default: 5000 |
| `NODE_ENV` | REQUIRED | Must be `production` |
| `RPO_TARGET_MINUTES` | OPTIONAL | Maximum allowable backup gap (Default: 60) |
| `RTO_TARGET_MINUTES` | OPTIONAL | Target recovery time limit (Default: 30) |
| `BACKUP_RETENTION_DAYS` | OPTIONAL | Days before automated backup artifact pruning (Default: 30) |

---

## 3. Database Migration Sequence

Database migrations are recorded in the `schema_migrations` table. Migrations run sequentially and atomically.

```bash
# Verify database connection and apply migrations
node -e "require('./server/db').initializeDatabase().then(() => console.log('Database Migrations Complete'))"
```

Verified Schema Migration Count: **13 applied migrations** (through `20260905_013_enterprise_operations.sql`).

---

## 4. Subsystem Startup Sequence

### Step 1: Start Flask AI Microservice
```bash
# Terminal 1: Background or Systemd Service
python backend/app.py
# Listens on http://127.0.0.1:5001
# Health probe available at http://127.0.0.1:5001/api/health
```

### Step 2: Start Node.js Enterprise API Server
```bash
# Terminal 2: Process Manager (PM2 / Systemd / Container)
node server/index.js
# Listens on http://localhost:5000
```

### Step 3: Verify Startup Health & Dependency Readiness
```bash
curl -s http://localhost:5000/api/health/dependencies | jq .
```
Expected response:
```json
{
  "status": "READY",
  "dependencies": {
    "postgresql": { "status": "READY" },
    "ai_microservice": { "status": "READY" },
    "credential_vault": { "status": "READY" },
    "integration_outbox": { "status": "READY" },
    "background_jobs": { "status": "READY" },
    "audit_ledger": { "status": "READY" }
  }
}
```

---

## 5. Frontend Production Bundle

```bash
npm run build
```
Verify that `dist/index.html` and `dist/assets/` contain optimized, hashed assets.
