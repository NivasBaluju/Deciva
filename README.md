# Deciva — Enterprise AI Contract Intelligence & Governance Platform

[![Platform Status](https://img.shields.io/badge/System_Status-Verified_with_Findings-emerald.svg)](docs/TASK_15_FINAL_MASTER_AUDIT.md)
[![Automated Tests](https://img.shields.io/badge/Automated_Tests-165%2F165_PASS-success.svg)](tests/)
[![Browser E2E](https://img.shields.io/badge/Playwright_E2E-13%2F13_Certified-blue.svg)](tests/test_p4_browser_e2e.js)
[![Vite Build](https://img.shields.io/badge/Frontend_Build-React_19_%2B_Vite_8-informational.svg)](dist/)
[![Node Version](https://img.shields.io/badge/Node.js-18%2B_LTS-green.svg)](package.json)
[![Python Version](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](requirements.txt)
[![Database](https://img.shields.io/badge/Database-PostgreSQL_16-blue.svg)](server/db.js)
[![Security Architecture](https://img.shields.io/badge/Security-SOC--Grade_%2F_Zero--Trust-purple.svg)](docs/SECURITY_CONFIGURATION.md)
[![License](https://img.shields.io/badge/License-MIT-gray.svg)](LICENSE)

> **Deciva** is an institutional-grade, security-first legal intelligence and contract lifecycle platform designed for legal counsel, compliance officers, and enterprise executive teams. Built upon an append-only cryptographic ledger and a calibrated deterministic risk engine, Deciva guarantees mathematical reproducibility, strict multi-tenancy, and verifiable provenance across all document interactions.

---

## 🏛️ Core Architectural Tenets: *Understand → Detect → Predict → Negotiate → Decide*

Unlike consumer AI wrappers that hallucinate legal liability, Deciva separates **deterministic mathematical authority** from **generative linguistic synthesis**:

1. **Understand (Grounded Ingestion & Extraction)**: Multi-format parsing (PDF, DOCX, TXT) with magic-byte validation, Tesseract OCR fallback, and structured clause segmentation across 9 institutional categories.
2. **Detect (Calibrated Deterministic Risk Engine)**: Zero-black-box risk calculation. Confirmed hazards (unlimited liability, perpetual renewal, unilateral discretion, rights waivers, arbitrary termination, uncapped indemnity) and clause omissions are scored via strictly calibrated rules (0–100 scale).
3. **Predict (What-If Risk Simulation)**: Interactive scenario modeling allowing counsel to modify clause terms and immediately recompute document risk deltas while preserving complete immutability of the original document baseline.
4. **Negotiate (Multi-Stance Redline Generation)**: Strategic redline drafting across 4 institutional postures (**Balanced**, **Protective**, **Aggressive**, **Collaborative**) with character- and word-level diff visualizations and instantaneous post-revision risk scores.
5. **Decide (Executive Governance & Cryptographic Ledger)**: Tamper-evident SHA-256 hash-chained audit ledger serialized across distributed instances using PostgreSQL transactional advisory locks (`pg_advisory_xact_lock`), coupled with dual-signoff batch operational workflows.

---

## 📐 System Architecture

```mermaid
graph TD
    subgraph Client ["Client Presentation Layer (:3000)"]
        UI[React 19 SPA + Vite 8<br/>TailwindCSS + Framer Motion]
        Console[Executive Governance Cockpit<br/>Redline Viewer & Simulation Studio]
    end

    subgraph Gateway ["API Gateway & Core Logic (:5000)"]
        Node[Express.js Gateway Engine]
        Auth[Zero-Trust Middleware & Session Scorer]
        Vault[Credential Vault & File Cryptor<br/>AES-256-GCM]
        Ledger[Cryptographic Audit Engine<br/>SHA-256 Hash Chain]
        Config[Production Config Validator<br/>Fail-Fast Secret Checks]
    end

    subgraph Microservice ["AI & NLP Microservice (:5001)"]
        Flask[Python 3.11 / Flask Service]
        RiskEngine[Deterministic Risk Scoring Engine<br/>Calibrated Pattern Matching]
        MLClassifier[Secondary Clause Classifier<br/>scikit-learn TF-IDF + Logistic Regression]
        RAG[Grounded Retrieval Engine<br/>Cosine Similarity + Grounding Guard]
        NegEngine[Strategic Redline Generator<br/>4 Stance Models]
    end

    subgraph Persistence ["Institutional Data Layer"]
        PG[(PostgreSQL 16 Relational Store<br/>28 Tables / 14 Migrations)]
        Storage[(Local Encrypted Blob Storage<br/>data/uploads/*.enc)]
        LLM[Google Gemini REST API<br/>gemini-2.5-flash / gemini-1.5-flash]
    end

    UI -->|HTTP + httpOnly Cookies / Bearer| Node
    Node -->|HMAC Internal Headers| Flask
    Node -->|pg Pool + Advisory Locks| PG
    Flask -->|psycopg2 / DictCursor| PG
    Node -->|AES-256-GCM| Storage
    Flask -->|AES-256-GCM| Storage
    Node -.->|Optional Online LLM| LLM
    Flask -.->|Optional Online LLM| LLM
```

---

## ⚡ Key Capabilities

### 🛡️ Calibrated Deterministic Risk Engine
- **Mathematical Precision**: Scored strictly between 5 and 100 based on confirmed textual hazards (+10 to +20 points) and unverified omissions (moderated ceiling of 35 points).
- **Non-Overridability**: External LLMs cannot alter or fabricate risk scores. All numbers presented in the executive cockpit derive directly from compiled deterministic algorithms.
- **Secondary ML Signal**: Lightweight in-memory scikit-learn classifier providing secondary categorization across 9 legal clause types.

### ⚖️ Multi-Stance Negotiation & Redlining
- **Four Institutional Modes**:
  - `Balanced`: Standard market-rate risk distribution between parties.
  - `Protective`: Maximum indemnification caps and strict confidentiality covenants.
  - `Aggressive`: Unilateral favorable terms, abbreviated notice windows, and penalty enforcement.
  - `Collaborative`: Mutual remedy periods, informal dispute escalation, and shared liability.
- **Real-Time Diffing**: Generates word-level unified diffs with exact before/after risk scores and direction indicators (`RISK_REDUCED`, `RISK_INCREASED`, `RISK_NEUTRAL`).

### 🔍 Grounded AI RAG Pipeline
- **Truthful Provenance**: Distinguishes retrieval similarity from model confidence.
- **Grounding Guard**: Automatically rejects out-of-context or ungrounded questions with an explicit uncertainty notice (`"I could not find sufficient information in this document to answer that question."`) rather than fabricating document clauses.
- **Prompt Injection Defense**: Context blocks are isolated within numbered XML/bracketed delimiters, strictly preventing adversarial prompts from extracting internal service keys or bypass directives.

### ⛓️ Cryptographic Audit Ledger
- **Append-Only Integrity**: Every document access, user elevation, clause modification, and batch approval creates an immutable SHA-256 hash-chained block.
- **Distributed Concurrency**: Serialized via PostgreSQL transaction-scoped advisory locks (`pg_advisory_xact_lock`), preventing chain forks, collisions, or race conditions.
- **Live Chain Verification**: Cryptographically recalculates every block hash from genesis (`0000...`) to verify ledger integrity on demand.

### 🔐 Zero-Trust Security & MFA
- **RFC 6238 TOTP**: Compatible with Google Authenticator and Authy; secret seeds are encrypted at rest with AES-256-GCM.
- **Session Scorer**: Computes a dynamic 0–100 zero-trust score considering network/user-agent fingerprint shifts, MFA completion, and session duration.
- **At-Rest Vault**: Uploaded documents are encrypted on disk with randomized initialization vectors and authentication tags.

---

## 🛠️ Technology Stack

| Layer | Technologies & Frameworks | Key Responsibilities |
| :--- | :--- | :--- |
| **Frontend SPA** | React 19, Vite 8, React Router 7, TailwindCSS 3.4, Motion 13 | Responsive executive cockpit, side-by-side redlines, real-time gauges |
| **API Gateway** | Node.js 18+ LTS, Express 4.19, `pg` 8.12, `jsonwebtoken`, `otplib` | Ingestion routing, auth middleware, advisory locking, rate limiting |
| **AI Microservice** | Python 3.11+, Flask 3.1, `psycopg2-binary`, `scikit-learn`, `PyMuPDF` | Heuristic extraction, deterministic risk scoring, Gemini RAG, redlining |
| **Database** | PostgreSQL 16 (28 tables, 14 sequential migrations) | Relational persistence, transactional outbox, audit hash chain |
| **Security & Crypto** | AES-256-GCM, SHA-256, RSA-2048 signing, bcrypt (cost factor 10) | Data protection at rest/in-transit, tamper-evident logging |
| **Testing & QA** | Playwright Chromium, Node.js Native Test Runner, assert | End-to-end browser automation, isolated dead-port regression suites |

---

## 🧪 Automated Testing & Certification Baseline

Deciva maintains an exhaustive, **100% passing automated test suite** consisting of 14 dedicated test harnesses:

| Phase | Test Suite | Focus Domain | Tests | Result |
| :---: | :--- | :--- | :---: | :---: |
| **P0** | `tests/test_p0_secret_validation.js` | Fail-Fast Configuration & Secret Checks | 10 | **PASS** |
| **P0** | `tests/test_p0_upload_idempotency.js` | Ingestion Concurrency & Single-Write Authority | 10 | **PASS** |
| **P1** | `tests/test_p1_gemini_harmonization.js` | Cross-Runtime Google Gemini Unification | 10 | **PASS** |
| **P1** | `tests/test_p1_ai_provenance.js` | AI Citation & Provenance Integrity | 10 | **PASS** |
| **P1** | `tests/test_p1_negotiation_risk_recalculation.js` | Negotiation Redline Risk Recalculation | 10 | **PASS** |
| **P1** | `tests/test_p1_simulation_risk_recalculation.js` | Simulation Buffer Math & Baseline Immutability | 10 | **PASS** |
| **P1** | `tests/test_p1_admin_provisioning.js` | Controlled Admin Role Governance & Advisory Locks | 10 | **PASS** |
| **P2** | `tests/test_p2_cookie_auth.js` | Server-Side `httpOnly` Cookie Delivery | 10 | **PASS** |
| **P2** | `tests/test_p2_cryptographic_audit_ledger.js` | SHA-256 Hash Chaining & Advisory Serialization | 10 | **PASS** |
| **P2** | `tests/test_p2_deterministic_risk_engine.js` | Calibrated Hazard Weighting & Scoring | 10 | **PASS** |
| **P2** | `tests/test_p2_secondary_security_hardening.js` | RSA Lifecycle, TLS Normalization, XSS Sink Audits | 30 | **PASS** |
| **P3** | `tests/test_p3_live_full_stack.js` | Live Node + Flask + DB End-to-End Integration | 12 | **PASS** |
| **P3** | `tests/test_p3_clause_fallback_remediation.js` | Dead-Port Isolated Fallback Clause Extraction | 10 | **PASS** |
| **P4** | `tests/test_p4_browser_e2e.js` | Playwright Chromium Browser Runtime Certification | 13 | **PASS** |
| **TOTAL** | **Comprehensive Regression Matrix** | **Full Stack Platform Certification** | **165** | **100% PASS** |

---

## 🚀 Quickstart & Installation

### 1. Prerequisites
- **Node.js**: `v18.0.0` or higher (tested on Node v20/v22)
- **Python**: `3.11` or higher
- **PostgreSQL**: `14+` (PostgreSQL 16 recommended)
- **Git**

### 2. Clone & Environment Configuration
```bash
git clone https://github.com/NivasBaluju/Deciva.git
cd Deciva

# Create your local environment configuration
cp .env.example .env
```

Open `.env` and configure your credentials:
```ini
PORT=5000
AI_MICROSERVICE_URL=http://127.0.0.1:5001
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/deciva_db
JWT_SECRET=your-at-least-32-char-random-jwt-secret-key-here
INTERNAL_SERVICE_KEY=your-at-least-32-char-internal-secret-key
ENCRYPTION_KEY=your-exact-64-character-hex-encoded-aes-256-key
GEMINI_API_KEY=your-google-gemini-api-key-optional
```

### 3. Install Dependencies
```bash
# Install Node.js Gateway & Frontend dependencies
npm install

# Install Python AI Microservice dependencies
pip install -r requirements.txt
```

### 4. Run the Development Services
In separate terminal sessions:

```bash
# Terminal 1: Start PostgreSQL Schema & Node.js API Gateway (:5000)
npm run server

# Terminal 2: Start Python AI & NLP Microservice (:5001)
python backend/app.py

# Terminal 3: Start React / Vite Frontend Dev Server (:3000)
npm run dev:client
```

Navigate to **`http://localhost:3000`** in your browser.

---

## 📁 Repository Structure

```text
Deciva/
├── backend/                      # Python 3.11 Flask AI Microservice (:5001)
│   ├── app.py                    # Microservice entrypoint & routing
│   └── services/                 # NLP analysis, RAG, redlining, simulation
│       ├── ai_provenance.py      # Metadata & confidence normalization
│       ├── negotiation_service.py# 4-stance strategic redlining
│       ├── rag_service.py        # Grounded context retrieval & prompt defense
│       ├── simulation_service.py # What-if contract modification
│       └── analysis/             # Deterministic risk engine & ML classifier
├── server/                       # Node.js Express API Gateway (:5000)
│   ├── index.js                  # Gateway bootstrap & middleware mount
│   ├── db.js                     # pg connection pool & 14 schema migrations
│   ├── middleware/               # Auth, zero-trust scoring, correlation, rate limits
│   ├── routes/                   # 17 REST endpoints (documents, auth, security, etc.)
│   ├── services/                 # 39 domain services (admin governance, vault, sync)
│   └── utils/                    # Cryptographic ledger, AI fallback engine, audit
├── src/                          # React 19 Frontend Single Page Application (:3000)
│   ├── components/               # 50+ modular UI widgets, redlines, and charts
│   ├── context/                  # AuthContext, ToastContext
│   ├── pages/                    # 18 page components (Dashboard, Upload, Documents, etc.)
│   └── services/                 # API client adapters & integration handlers
├── tests/                        # 14 automated test suites (165 automated tests)
│   ├── test_p0_*                 # Fail-fast security & upload idempotency
│   ├── test_p1_*                 # AI provenance, risk recalculation, admin governance
│   ├── test_p2_*                 # Cookie auth, cryptographic ledger, risk engine
│   ├── test_p3_*                 # Live multi-service E2E & offline fallback remediation
│   └── test_p4_browser_e2e.js    # Playwright Chromium browser runtime certification
├── docs/                         # Architecture, runbooks, and audit specifications
│   ├── TASK_15_FINAL_MASTER_AUDIT.md # Definitive forensic master audit report
│   ├── ARCHITECTURE.md           # Deep-dive system specification
│   └── SECURITY_CONFIGURATION.md # Production cryptographic & key runbook
├── DECIVA_FULL_AUDIT.md          # Chronological master forensic audit ledger
└── package.json                  # Dependencies, scripts, and build manifest
```

---

## 🔒 Security & Governance Posture

- **Cold-Start Admin Bootstrap**: Admin privileges are managed strictly via database roles and the administrative console. Configured `ADMIN_EMAILS` only elevate on a cold-start zero-admin state under PostgreSQL advisory lock `763018`.
- **Last-Admin Protection**: The platform mathematically prevents administrators from demoting the last remaining active administrator or demoting their own active credentials.
- **Automatic Session Revocation**: Demoting or modifying an administrator immediately revokes all associated active sessions across the cluster.
- **Fail-Fast Configuration**: If `JWT_SECRET`, `INTERNAL_SERVICE_KEY`, or `ENCRYPTION_KEY` are missing or below entropy standards, the server terminates immediately on startup rather than running in an insecure state.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
