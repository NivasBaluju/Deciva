# Contributing to Deciva

Thank you for your interest in contributing to Deciva!

Deciva is an institutional legal intelligence and contract governance platform. To preserve mathematical predictability and enterprise security, all contributions must strictly adhere to the following architectural invariants and guidelines.

---

## 🏛️ Core Architectural Invariants

1. **Deterministic Risk Authority**:
   - Contract risk calculations must remain 100% deterministic and mathematically reproducible.
   - LLMs or generative models must **never** compute, alter, or override risk scores.
2. **Cryptographic Audit Integrity**:
   - All critical actions (uploads, role modifications, negotiations, simulations, batch executions) must append to the SHA-256 hash-chained ledger.
   - Concurrent ledger writes must be serialized via PostgreSQL transaction advisory locks (`pg_advisory_xact_lock`).
3. **Multi-Tenancy & Zero-Trust**:
   - All document and session access must be strictly verified against `user_id` and `tenant_id`.
   - Never write queries in the form `SELECT * FROM documents WHERE id = ?` without tenant ownership checks.
4. **AI Grounding & Provenance**:
   - All RAG responses must be bounded to document context blocks with truthful citations.
   - If retrieval similarity falls below the grounding threshold, return the canonical uncertainty response rather than hallucinating facts.

---

## 🛠️ Development Workflow

1. **Fork and clone** the repository.
2. Create a topic branch: `git checkout -b feat/your-feature-name`.
3. Verify your local environment:
   - Node.js 18+ LTS
   - Python 3.11+
   - PostgreSQL 16
4. Run the automated test suites:
   ```bash
   node tests/test_p0_secret_validation.js
   node tests/test_p0_upload_idempotency.js
   node tests/test_p1_gemini_harmonization.js
   node tests/test_p2_cookie_auth.js
   node tests/test_p2_cryptographic_audit_ledger.js
   node tests/test_p2_deterministic_risk_engine.js
   node tests/test_p3_live_full_stack.js
   node tests/test_p3_clause_fallback_remediation.js
   node tests/test_p4_browser_e2e.js
   ```
5. Build the client bundle to verify no build errors:
   ```bash
   npm run build
   ```
6. Submit a pull request using the provided [Pull Request Template](.github/pull_request_template.md).

---

## 🔒 Reporting Security Vulnerabilities

If you discover a security vulnerability, please do not open a public issue. Email security concerns directly to `security@deciva.com` or contact the core maintainers.
