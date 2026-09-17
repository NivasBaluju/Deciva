# DECIVA AI — PHASE 1: AUTHENTICATION FORENSIC AUDIT & MIGRATION ARCHITECTURE PLAN
**DOCUMENT ID**: `DOC-AUTH-MIG-PHASE1-001`  
**STATUS**: `PHASE 1 COMPLETE — AUDIT ONLY (STRICTLY READ-ONLY)`  
**DATE**: September 2026  
**AUTHORS**: Authentication Security Auditor & Migration Architect  
**TARGET RELEASE**: Phase 2 Password Authentication Migration  

---

## 1. Executive Summary

This forensic audit evaluates the authentication subsystem of the Deciva AI enterprise legal copilot. The system is transitioning from its current **Email OTP (One-Time Passcode) authentication model** to an **Enterprise Password-Based Authentication architecture**, while strictly preserving the existing Tasks 1–16 certified baseline (175/175 automated test integrity, zero-trust session evaluation, httpOnly cookie governance, RFC-6238 TOTP Multi-Factor Authentication, and tenant isolation).

### Absolute Rule Compliance
This Phase 1 investigation was conducted under a **strict read-only mandate**:
* **0** production source files modified.
* **0** database schema alterations or migrations executed.
* **0** lines of OTP or Resend code deleted.
* **0** environment configuration files altered.
* **0** tests modified or weakened.

### Core Audit Discoveries
1. **Password Hash Column Already Exists in Database**: The PostgreSQL `users` table already defines `password_hash TEXT NOT NULL` (created in migration `20260901_001_core_schema`). Currently, during OTP registration/login auto-provisioning, the system generates a placeholder hash using `await bcrypt.hash(uuidv4(), 10)`. Real user password authentication is **NOT CURRENTLY IMPLEMENTED**.
2. **TOTP MFA is Fully Independent of Email OTP**: TOTP enrollment, secret generation, AES-256-GCM seed encryption, and RFC-6238 verification (`otplib`) operate independently. Removing email OTP will **NOT** break TOTP MFA.
3. **Resend is NOT Only Used for OTP**: The Resend HTTP API and SMTP transport also power `sendWelcomeEmail()` and `sendSecurityAlertEmail()` (which dispatches high-priority notifications when security threats are detected by the audit engine). Removing the Resend integration completely would break non-auth transactional notifications.
4. **Existing User Migration Warning**: Because existing users currently store dummy placeholder bcrypt hashes of random UUIDs, transitioning to password authentication without an onboarding/reset bridge will lock out existing users. A backward-compatible password initialization strategy is required for Phase 2.
5. **Session Architecture Decoupled from Credentials**: Session issuance (`sessions` table), JWT signing (`sessionId`, `userId`), zero-trust trust scoring (0–100 based on IP, fingerprint, and age), and cookie transmission (`httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`) are completely decoupled from credential verification. They can be preserved without structural alteration.

---

## 2. Current Authentication Architecture

The current Deciva AI authentication architecture operates as a passwordless email verification system:

```text
+-----------------------------------------------------------------------------------+
|                           CURRENT OTP AUTHENTICATION FLOW                         |
+-----------------------------------------------------------------------------------+

     [User Enters Email] (Login.jsx or Register.jsx)
              |
              v
     POST /api/auth/login or POST /api/auth/register
              |
              +---> Sanitizes email; finds or creates user in PostgreSQL
              |     (Sets password_hash = bcrypt.hash(uuidv4(), 10))
              |
              +---> Generates CSPRNG 6-digit numeric OTP (crypto.randomInt)
              |
              +---> Inserts into `otp_codes` table (15-minute expiration)
              |
              +---> Dispatches email via Resend API (fallback to SMTP)
              |
              +---> Issues ephemeral pre-auth JWT (`preToken`, 10-minute expiry)
              |
              v
     [Client Receives preToken & Redirects to /mfa]
              |
              v
     [User Submits 6-Digit OTP] (Mfa.jsx)
              |
              v
     POST /api/auth/mfa/otp/verify
              |
              +---> Validates preToken signature & preauth claim
              |
              +---> Verifies code against `otp_codes` (used = false, expires_at > NOW())
              |
              +---> Marks OTP as used (anti-replay enforcement)
              |
              +---> Creates session row in PostgreSQL `sessions` table
              |
              +---> Issues 7-day session JWT ({ sessionId, userId })
              |
              +---> Sets httpOnly Secure Cookie (`token=<jwt>`)
              |
              v
     [Authenticated Deciva Session Initialized & Redirects to /dashboard]
```

---

## 3. Registration Flow

### Source Trace
* **Frontend UI Component**: [`src/pages/Register.jsx`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/src/pages/Register.jsx)
* **Client Service Call**: `Api.post('/api/auth/register', { name, email })` in [`src/services/api.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/src/services/api.js)
* **Backend Endpoint**: `POST /api/auth/register` in [`server/routes/auth.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/server/routes/auth.js)
* **Database Tables**: `users`, `otp_codes`, `blockchain_audit`

### Step-by-Step Executable Flow
1. **UI Submission**: The user enters `name` (e.g., "Jane Doe, Legal Counsel") and `email` (e.g., "jane@enterprise.com").
2. **Client Request**: Form submission calls `POST /api/auth/register` with `{ name, email }`.
3. **Rate Limiting**: Request passes through `authLimiter` (15-minute window, max 20 requests in production; 5s/5 in dev).
4. **Email Sanitization**: Email is lowercased and trimmed. Display name is stripped of HTML tags to prevent stored XSS.
5. **User Provisioning**:
   * Queries `SELECT * FROM users WHERE email = $1`.
   * If user does not exist, generates a new UUID `id`, hashes a random UUID with bcrypt `bcrypt.hash(uuidv4(), 10)`, and inserts a record:
     ```sql
     INSERT INTO users (id, name, email, password_hash, role, mfa_enabled)
     VALUES ($1, $2, $3, $4, 'user', true)
     ```
   * Appends an immutable audit block to `blockchain_audit` (`USER_REGISTERED`).
   * Triggers asynchronous background dispatch of `sendWelcomeEmail(cleanEmail, displayName)`.
6. **OTP Invalidation**: Invalidates any prior unconsumed OTPs for this user (`UPDATE otp_codes SET used = true WHERE user_id = $1 AND purpose = 'login'`).
7. **CSPRNG OTP Generation**: Generates 6-digit numeric OTP via Node.js `crypto.randomInt(100000, 1000000)`.
8. **OTP Persistence**: Inserts code into `otp_codes` with a 15-minute expiration:
   ```sql
   INSERT INTO otp_codes (id, user_id, code, purpose, expires_at)
   VALUES ($1, $2, $3, 'login', NOW() + INTERVAL '15 minutes')
   ```
9. **Outbound Email Dispatch**:
   * Calls `sendOtpEmail(user.email, code)`.
   * Evaluates `process.env.RESEND_API_KEY`; if set, dispatches via HTTP POST to `https://api.resend.com/emails`.
   * If Resend is not configured, attempts SMTP transport via `nodemailer`.
   * In production (`NODE_ENV === 'production'`), if email delivery fails, returns HTTP 503 `Verification code could not be delivered. Please try again.` without leaking the OTP.
10. **Pre-Token Issuance**: Generates a pre-auth JWT signed with `JWT_SECRET`:
    ```javascript
    jwt.sign({ preauth: true, userId: user.id }, JWT_SECRET, { expiresIn: '10m' });
    ```
11. **Client Storage & Navigation**:
    * Client stores `preToken` in browser `sessionStorage`.
    * Client displays toast: *"Verification pass dispatched to your email"*.
    * Navigates to `/mfa`.
12. **Verification & Session Completion**:
    * User enters OTP on `/mfa` and submits to `POST /api/auth/mfa/otp/verify`.
    * Server verifies OTP, creates session in PostgreSQL, records `LOGIN_SUCCESS`, sets `httpOnly` cookie, and returns `{ token, user }`.

---

## 4. Login Flow

### Source Trace
* **Frontend UI Component**: [`src/pages/Login.jsx`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/src/pages/Login.jsx)
* **Backend Endpoint**: `POST /api/auth/login` in [`server/routes/auth.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/server/routes/auth.js)

### Findings on Existing Login Flow
* **OTP Requirement**: Login currently requires an email OTP for **every** authentication attempt.
* **Auto-Provisioning on Login**: If an unknown email is submitted to `POST /api/auth/login`, the system automatically provisions a new account (`passwordless auto-provisioning`) with a placeholder bcrypt hash.
* **Credential Validation**: No password is validated during login.
* **MFA State**: The user is immediately assigned a `preToken` and redirected to `/mfa`.
* **Session Creation**: Occurs strictly upon successful verification of the OTP or TOTP code via `/mfa/otp/verify` or `/mfa/totp/verify`.

---

## 5. OTP Forensic Dependency Map

Every reference to OTP across the codebase was located and categorized:

| # | File Path | Component / Function | Classification | OTP Dependency Description |
|---|---|---|---|---|
| 1 | `server/routes/auth.js:101-140` | `POST /register` | **ACTIVE PRODUCTION** | Generates CSPRNG OTP, persists to `otp_codes`, sends email. |
| 2 | `server/routes/auth.js:178-214` | `POST /login` | **ACTIVE PRODUCTION** | Generates CSPRNG OTP, persists to `otp_codes`, sends email. |
| 3 | `server/routes/auth.js:298-315` | `verifyOtpCode(userId, inputCode)` | **ACTIVE PRODUCTION** | Queries `otp_codes`, matches code, marks `used = true`. |
| 4 | `server/routes/auth.js:317-364` | `POST /mfa/totp/verify` | **ACTIVE PRODUCTION** | Contains fallback to `verifyOtpCode` if TOTP check fails. |
| 5 | `server/routes/auth.js:366-416` | `POST /mfa/otp/request` | **ACTIVE PRODUCTION** | Re-sends new OTP code to user email during MFA screen. |
| 6 | `server/routes/auth.js:418-462` | `POST /mfa/otp/verify` | **ACTIVE PRODUCTION** | Validates `preToken` and OTP code; issues session cookie. |
| 7 | `server/routes/auth.js:49-54` | `isDevOtpFallbackAllowed()` | **ACTIVE PRODUCTION** | Gates `backupPass` injection in dev/test mode. |
| 8 | `server/middleware/rateLimiter.js:21-30` | `otpVerifyLimiter` | **ACTIVE PRODUCTION** | Rate limits OTP verification (10/15m prod, 30/15m dev). |
| 9 | `server/utils/email.js:76-124` | `sendOtpEmail(toEmail, code)` | **ACTIVE PRODUCTION** | Formats and sends HTML email with OTP code. |
| 10 | `server/db.js:88-96` | Migration 001 `otp_codes` table | **ACTIVE PRODUCTION** | Stores `user_id`, `code`, `purpose`, `used`, `expires_at`. |
| 11 | `src/pages/Login.jsx:42-56` | `handleSubmit()` | **ACTIVE PRODUCTION** | Dispatches OTP to user email and redirects to `/mfa`. |
| 12 | `src/pages/Register.jsx:54-68` | `handleSubmit()` | **ACTIVE PRODUCTION** | Dispatches OTP to user email and redirects to `/mfa`. |
| 13 | `src/pages/Mfa.jsx:1-233` | Entire component | **ACTIVE PRODUCTION** | 6-digit OTP passcode input, resend button, verification. |
| 14 | `src/components/security/ObservatoryDetailPanel.jsx` | MFA metric panel | **ACTIVE PRODUCTION** | Displays MFA security metrics (OTP/TOTP). |
| 15 | `src/components/security/SecurityGauge.jsx` | Security gauge | **ACTIVE PRODUCTION** | Mentions multi-factor authentication compliance. |
| 16 | `tests/test_otp_production_security.js` | Full test suite (8 tests) | **TEST** | Verifies OTP non-exposure in production responses. |
| 17 | `tests/v3/v3_full.js:82-168` | V3-AUTH03, 04, 05, 06, 07, 14, 15 | **TEST** | Tests OTP storage, verify, replay prevention, log safety. |
| 18 | `tests/test_p2_cookie_auth.js` | Cookie auth test helper | **TEST** | Fetches OTP from database to authenticate test sessions. |
| 19 | `tests/test_p3_live_full_stack.js` | Live full-stack helper | **TEST** | Queries `otp_codes` during live test sequence. |
| 20 | `tests/test_p4_browser_e2e.js` | Playwright E2E helper | **TEST** | Enters OTP into `#otpCode` input during browser test. |
| 21 | `tests/test_p5_production_deployment.js` | T17-14 Smoke test | **TEST** | Verifies end-to-end authentication via OTP. |
| 22 | `tests/test_cloud_e2e_live.js` | Cloud smoke test | **TEST** | Verifies cloud deployment authentication with OTP. |

---

## 6. Email / Resend Forensic Search

### Source Trace
* [`server/utils/email.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/server/utils/email.js)
* [`server/utils/audit.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/server/utils/audit.js)
* [`server/routes/auth.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/server/routes/auth.js)

### Resend Integration Analysis
* **Initialization**: In `server/utils/email.js`, `sendViaResend(toEmail, subject, text, html)` makes an HTTP POST request to `https://api.resend.com/emails` with `Authorization: Bearer ${apiKey}`.
* **Environment Variable**: `RESEND_API_KEY` (with fallback to `RESEND_FROM` or `SMTP_FROM` or default `Deciva <onboarding@resend.dev>`).
* **Non-OTP Email Usages**:
  1. **`sendWelcomeEmail(toEmail, name)`**: Dispatched upon user registration. Contains links to Security Center and getting-started guidance.
  2. **`sendSecurityAlertEmail(toEmail, alertType, details)`**: Called by `server/utils/audit.js` in `logThreat()` whenever a `high` or `critical` security event occurs on an account (such as suspicious IP shifts, excessive failed logins, or low zero-trust scores).
* **Finding**: **Removing Resend completely would break welcome emails and automated security alert dispatches.** Resend (or SMTP) must be preserved as the general email dispatch mechanism, with only `sendOtpEmail()` slated for retirement.

---

## 7. Database Authentication Schema Audit

### Core Authentication Tables

#### 1. `users` Table
| Column | Type | Nullable | Default | Constraints | Purpose |
|---|---|---|---|---|---|
| `id` | `VARCHAR(36)` | **NO** | None | `PRIMARY KEY` | Unique User UUID |
| `name` | `TEXT` | **NO** | None | None | User's full name & title |
| `email` | `TEXT` | **NO** | None | `UNIQUE` | Normalized email address |
| `password_hash` | `TEXT` | **NO** | None | None | **Bcrypt password hash** (currently holds dummy hash) |
| `role` | `TEXT` | YES | `'user'` | `chk_users_valid_role` | RBAC role: admin, legal_counsel, etc. |
| `totp_secret` | `TEXT` | YES | `NULL` | None | AES-256-GCM encrypted TOTP secret |
| `mfa_enabled` | `BOOLEAN` | YES | `FALSE` | None | Flag for TOTP Multi-Factor Authentication |
| `created_at` | `TIMESTAMPTZ`| YES | `CURRENT_TIMESTAMP` | None | Account creation timestamp |

#### 2. `sessions` Table
| Column | Type | Nullable | Default | Constraints | Purpose |
|---|---|---|---|---|---|
| `id` | `VARCHAR(36)` | **NO** | None | `PRIMARY KEY` | Session UUID |
| `user_id` | `VARCHAR(36)` | YES | None | `REFERENCES users(id) ON DELETE CASCADE` | Associated user |
| `device_fingerprint` | `TEXT` | YES | None | None | SHA-256 of User-Agent + IP |
| `ip` | `TEXT` | YES | None | None | Client IP address |
| `trust_score` | `INTEGER` | YES | `100` | None | Zero-trust score (0–100) |
| `mfa_verified` | `BOOLEAN` | YES | `FALSE` | None | Whether MFA was completed this session |
| `revoked` | `BOOLEAN` | YES | `FALSE` | None | Revocation flag for logout/governance |
| `created_at` | `TIMESTAMPTZ`| YES | `CURRENT_TIMESTAMP` | None | Session creation timestamp |
| `last_seen` | `TIMESTAMPTZ`| YES | `CURRENT_TIMESTAMP` | None | Last request timestamp |

#### 3. `otp_codes` Table
| Column | Type | Nullable | Default | Constraints | Purpose |
|---|---|---|---|---|---|
| `id` | `VARCHAR(36)` | **NO** | None | `PRIMARY KEY` | Code record UUID |
| `user_id` | `VARCHAR(36)` | YES | None | `REFERENCES users(id) ON DELETE CASCADE` | Target user |
| `code` | `TEXT` | **NO** | None | None | 6-digit numeric OTP code |
| `purpose` | `TEXT` | **NO** | None | None | Purpose (e.g. `'login'`) |
| `used` | `BOOLEAN` | YES | `FALSE` | None | Anti-replay consumption flag |
| `created_at` | `TIMESTAMPTZ`| YES | `CURRENT_TIMESTAMP` | None | Record generation timestamp |
| `expires_at` | `TIMESTAMPTZ`| **NO** | None | None | Expiry timestamp (NOW + 15 min) |

---

## 8. Password Infrastructure Audit

### Package & Library Status
* `bcryptjs`: **INSTALLED** (`^2.4.3` in [`package.json`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/package.json)).

### Existing Implementations
1. **Document Share Links** ([`server/routes/share.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/server/routes/share.js)):
   * `bcrypt.hash(password, 10)` generates salt-hardened hashes for password-protected document download links.
   * `bcrypt.compare(req.body.password, link.password_hash)` verifies access passwords.
2. **User Creation Placeholder** ([`server/routes/auth.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/server/routes/auth.js)):
   * `const placeholderHash = await bcrypt.hash(uuidv4(), 10)` generates a random hash to satisfy the `password_hash TEXT NOT NULL` column constraint on `users`.

### Audit Status
```text
PASSWORD HASHING: NOT CURRENTLY IMPLEMENTED FOR USER AUTHENTICATION
```
No user password verification, complexity enforcement, or password change endpoints exist for user accounts.

---

## 9. JWT and Session Architecture

### Session Generation & Verification
1. **Session Creation**: Created in `sessions` table via `INSERT INTO sessions (id, user_id, device_fingerprint, ip, mfa_verified)`.
2. **JWT Payload**:
   ```javascript
   {
     sessionId: "<uuid>",
     userId: "<uuid>"
   }
   ```
3. **JWT Expiry & Signing**: Signed with `JWT_SECRET` using `HS256`, expiring in `7d`.
4. **Token Verification**: Executed by `requireAuth` in [`server/middleware/auth.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/server/middleware/auth.js).
5. **Database Validation**: Verifies `sessions` table record exists and `revoked === false`.
6. **Zero-Trust Trust Score Evaluation**:
   * Initial score: 100.
   * Fingerprint mismatch: -40.
   * MFA unverified: -20.
   * Session older than 12 hours: -15.
   * Revoked session: Score forced to 0.
   * If `score < 30`: Returns HTTP 403 `Zero-trust evaluation failed` and logs threat to `threat_logs`.
7. **Session Hydration**: `GET /api/auth/me` returns `{ user, trust, session }`.
8. **Session Revocation**: `POST /api/auth/logout` sets `revoked = true` in PostgreSQL and clears the cookie.

---

## 10. Cookie Authentication Audit

### Cookie Configuration
Defined in `server/routes/auth.js`:
```javascript
function getAuthCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? (process.env.COOKIE_SAMESITE || 'lax') : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  };
}
```

### Client Cookie Handling
* All client requests in [`src/services/api.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/src/services/api.js) use `credentials: 'include'`.
* **Zero Web Storage Persistence**: `AuthContext.jsx` explicitly removes any `deciva_token` or `token` from `localStorage` and `sessionStorage`.
* In-memory token fallback exists in `Api` service solely for programmatic test harnesses and CLI tools that do not use cookies.

---

## 11. MFA / TOTP Dependency Analysis

### Critical Separation Finding
> **Verdict: Email OTP can be completely removed without breaking TOTP MFA.**

### Architectural Evidence
1. **Enrollment**: `POST /api/auth/mfa/totp/setup` uses `otplib.authenticator.generateSecret()` and returns a QR data URL generated via `qrcode`.
2. **Secret Storage**: Secret is encrypted with AES-256-GCM via `encryptSecret(secret)` in `server/utils/crypto.js` and stored in `users.totp_secret`.
3. **Activation**: `POST /api/auth/mfa/totp/enable` decrypts the secret and validates the 6-digit TOTP code using `otplib.authenticator.check(code, resolvedSecret)`.
4. **Login Challenge**: If `user.mfa_enabled` is true, after verifying credentials (currently OTP, target: password), the server will issue a `preToken` requiring `POST /api/auth/mfa/totp/verify`.
5. **Coupling to Remove**: Currently, `POST /mfa/totp/verify` has a fallback: `if (!valid) valid = await verifyOtpCode(...)`. In Phase 2, this fallback must be severed so TOTP verification relies strictly on RFC-6238 authenticator tokens.

---

## 12. Admin Authentication & Governance

### Governance Invariants (Task 6 Certified)
1. **Database Authoritative**: Administrator status is governed **exclusively** by `users.role = 'admin'`.
2. **`ADMIN_EMAILS` Role**: `ADMIN_EMAILS` environment variable is used **only** during cold-start bootstrapping if exactly 0 administrators exist in PostgreSQL. It never auto-elevates an account upon login.
3. **Login Integration**: Administrators log in through the exact same authentication pipeline as standard users.
4. **Admin MFA Invariant**: In `server/middleware/auth.js` (`requireAdmin`), if an administrator has `mfa_enabled = true`, administrative actions are denied (HTTP 403) unless `req.session.mfa_verified === true`.
5. **Last-Admin & Self-Demotion Protection**: Implemented in `server/services/adminProvisioningService.js`. An admin cannot demote their own account or demote the last remaining administrator.

---

## 13. Rate Limiting Audit

Implemented in [`server/middleware/rateLimiter.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/server/middleware/rateLimiter.js):

| Rate Limiter | Target Endpoints | Production Policy | Dev/Test Policy | Action on Threshold |
|---|---|---|---|---|
| `authLimiter` | `POST /register`, `POST /login`, `POST /mfa/otp/request` | 20 requests per 15 min per IP | 5 requests per 5s per IP | HTTP 429 (`Too many authentication requests...`) |
| `otpVerifyLimiter` | `POST /mfa/totp/verify`, `POST /mfa/otp/verify` | 10 attempts per 15 min per IP | 30 attempts per 15 min per IP | HTTP 429 (`Too many failed code verification attempts...`) |

### Phase 2 Rate Limiting Recommendations
1. `authLimiter` must remain attached to `POST /register` and `POST /login`.
2. `loginLimiter` should be created or tuned specifically for password brute-force prevention (e.g. 5 failed password attempts per email/IP window before temporary backoff).
3. `otpVerifyLimiter` will be renamed or repurposed as `mfaVerifyLimiter` for TOTP verification.

---

## 14. Account Recovery Analysis

```text
PASSWORD RESET: NOT CURRENTLY IMPLEMENTED
```
* There are **no** password reset endpoints, tokens, database tables, or UI components in the repository.
* When passwords are introduced in Phase 2, an enterprise account recovery mechanism (e.g., cryptographic signed password reset tokens sent via email, or administrator-initiated password resets) will be required.

---

## 15. API Inventory (Authentication Routes)

| Method | Path | Current Purpose | Auth Required | OTP Req | MFA Req | Target Phase 2 Status |
|---|---|---|---|---|---|---|
| `POST` | `/api/auth/register` | User registration | No | Yes | No | **MODIFY**: Accept `{ name, email, password }`; create user with hashed password; return session or require MFA. |
| `POST` | `/api/auth/login` | User authentication | No | Yes | No | **MODIFY**: Accept `{ email, password }`; verify bcrypt hash; return session or require TOTP. |
| `POST` | `/api/auth/mfa/otp/request` | Re-request email OTP | Pre-auth token | Yes | Yes | **DEPRECATE / REMOVE**: Email OTP will no longer exist. |
| `POST` | `/api/auth/mfa/otp/verify` | Verify email OTP | Pre-auth token | Yes | Yes | **DEPRECATE / REMOVE**: Subsumed by direct password login. |
| `POST` | `/api/auth/mfa/totp/setup` | Generate TOTP QR seed | Bearer/Cookie/PreToken | No | No | **RETAIN**: Unchanged. |
| `POST` | `/api/auth/mfa/totp/enable`| Activate TOTP MFA | Bearer/Cookie/PreToken | No | Yes | **RETAIN**: Unchanged. |
| `POST` | `/api/auth/mfa/totp/verify`| Complete TOTP login | Pre-auth token | No | Yes | **RETAIN**: Remove fallback to `verifyOtpCode`. |
| `GET` | `/api/auth/me` | Hydrate session profile | Bearer or Cookie | No | No | **RETAIN**: Unchanged. |
| `POST` | `/api/auth/logout` | Revoke session & clear cookie | Bearer or Cookie | No | No | **RETAIN**: Unchanged. |

---

## 16. Frontend Authentication Inventory

### 1. `src/pages/Register.jsx`
* **Current Fields**: `name`, `email`.
* **Current Action**: Calls `Api.post('/api/auth/register', { name, email })`, sets `preToken` in `sessionStorage`, navigates to `/mfa`.
* **Future Changes**: Add `password` and `confirmPassword` inputs with complexity indicators. Submit `{ name, email, password }`.

### 2. `src/pages/Login.jsx`
* **Current Fields**: `email`.
* **Current Action**: Calls `Api.post('/api/auth/login', { email })`, sets `preToken` in `sessionStorage`, navigates to `/mfa`.
* **Future Changes**: Add `password` input. Submit `{ email, password }`. If MFA not required, immediately hydrate session and navigate to `/dashboard`. If MFA required, navigate to `/mfa`.

### 3. `src/pages/Mfa.jsx`
* **Current Components**: 6-digit numeric OTP entry, emergency `backupPass` banner, "Resend Passcode" button, `AuthThresholdModal`.
* **Future Changes**: Repurpose strictly for TOTP MFA (Authenticator app code). Remove email OTP resend logic and email-specific wording.

### 4. `src/pages/MfaSetup.jsx`
* **Current Components**: QR code rendering, manual secret key copy, 6-digit confirmation code input.
* **Future Changes**: **0 changes required**. Works completely with RFC-6238 TOTP.

---

## 17. Test Suite Audit

The current certified baseline consists of **175/175 tests**. The following test suites have active dependencies on the OTP flow and will require migration in Phase 2:

| Test File | Test Cases Affected | Current OTP Dependency | Phase 2 Migration Requirement |
|---|---|---|---|
| `tests/test_otp_production_security.js` | 8 tests | Production OTP non-exposure, SMTP failure handling | Replace with `test_password_production_security.js` (testing hash salting, timing safety, password rejection). |
| `tests/v3/v3_full.js` | 7 tests (V3-AUTH03, 04, 05, 06, 07, 14, 15) | Tests `otp_codes` persistence, replay rejection, OTP response exclusion | Update test assertions to verify password hashing, duplicate email rejection, invalid password rejection. |
| `tests/test_p2_cookie_auth.js` | Cookie auth test harness | Directly reads OTP from `otp_codes` table to log in | Update test harness to log in using user password. |
| `tests/test_p3_live_full_stack.js` | Live registration/login journeys | Reads OTP from database to complete authentication | Update payload to pass `{ email, password }`. |
| `tests/test_p4_browser_e2e.js` | T14-02, T14-03, T14-04 | Browser fills `#email`, then enters OTP on `/mfa` | Browser fills `#email` and `#password` on `/login`, testing direct session establishment. |
| `tests/test_p5_production_deployment.js` | T17-14 Smoke journey | Reads OTP from `otp_codes` table | Update to smoke test password authentication. |
| `tests/test_cloud_e2e_live.js` | Live cloud auth journey | Reads OTP from database | Update to password auth. |

---

## 18. Documentation Inventory

| Document | Classification | Relevant Content | Future Action |
|---|---|---|---|
| `USER_GUIDE.md` | **MIXED** (Lines 96 & 110 describe passwords, while Sections 4 describe OTP) | Mentions password hashing alongside OTP verification passes | Harmonize to reflect pure password authentication + TOTP MFA. |
| `README.md` | **CURRENT** | Mentions bcrypt cost factor 10 and MFA | Update authentication description to reflect password flow. |
| `docs/TASK_17_FINAL_PRODUCTION_CERTIFICATION.md` | **HISTORICAL** | Documents certified OTP baseline | Retain as Task 17 historical certification record. |
| `DECIVA_FULL_AUDIT.md` | **HISTORICAL** | Documents prior audit phases | Retain as historical audit. |

---

## 19. Security Impact Analysis

### Security Controls Removed
* **Email Inbox Dependency**: Authentication no longer depends on external email provider uptime (Resend or SMTP), eliminating mail latency and delivery failure bottlenecks.

### Security Controls Introduced
* **Password Hashing**: User authentication anchored on cryptographic password hashing with bcrypt (cost factor 10) and per-user unique salt.
* **Timing-Attack Resistance**: Verification uses constant-time comparison in `bcrypt.compare()`.
* **Credential Stuffing Defenses**: Strong password complexity policy and strict rate limiting on failed attempts.

### Preserved Security Controls
* **Zero-Trust Session Scoring**: 0–100 score tracking IP, device fingerprint, and session lifetime.
* **httpOnly Cookies**: Fully inaccessible to JavaScript (mitigating XSS session theft).
* **MFA Defense**: RFC-6238 TOTP provides second-factor defense against compromised passwords.
* **Session Revocation**: Real-time database revocation on logout or governance actions.

---

## 20. Migration Risks & Mitigations

| Risk | Severity | Impact | Mitigation Strategy |
|---|---|---|---|
| **Existing User Lockout** | **CRITICAL** | Existing database users have dummy random hashes and cannot log in with a password. | Provide a password setup / claim flow or administrative reset mechanism for legacy accounts. |
| **Account Enumeration** | **MEDIUM** | Password login error messages might reveal whether an email is registered. | Return identical error for wrong password and unknown user: `"Invalid email or password"`. |
| **Brute-Force Stuffing** | **HIGH** | Attackers attempt automated password guessing. | Enforce `authLimiter` (IP-based) and add per-account failed attempt backoff with audit threat logging. |
| **Non-Auth Resend Breakage** | **MEDIUM** | Deleting Resend would break welcome and security alert emails. | Preserve `sendViaResend` in `server/utils/email.js` for transactional alerts. |
| **Test Suite Regressions** | **HIGH** | Modifying auth flow could fail the 175/175 certified baseline. | Migrate tests symmetrically so password authentication tests directly replace OTP tests with 100% assertion parity. |

---

## 21. File-Level Migration Map

### CATEGORY A: MUST CHANGE (Core Migration Targets)
1. [`server/routes/auth.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/server/routes/auth.js): Implement password validation in `/register` and `/login`; retire `/mfa/otp/*` endpoints.
2. [`src/pages/Login.jsx`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/src/pages/Login.jsx): Add password input field and submit credentials directly.
3. [`src/pages/Register.jsx`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/src/pages/Register.jsx): Add password and confirm-password fields.
4. [`src/pages/Mfa.jsx`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/src/pages/Mfa.jsx): Remove email OTP input and emergency passcodes; focus strictly on TOTP MFA.
5. [`server/middleware/rateLimiter.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/server/middleware/rateLimiter.js): Repurpose OTP limiter for password/MFA rate limiting.
6. [`server/utils/email.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/server/utils/email.js): Deprecate `sendOtpEmail()`.

### CATEGORY B: MAY CHANGE (Dependent Upon Final Design)
1. `server/db.js`: Add migration to drop `otp_codes` table (optional, can also be retained for legacy audit).
2. `server/utils/audit.js`: Update audit action types (`PASSWORD_CHANGED`, `LOGIN_FAILED`).
3. `tests/test_otp_production_security.js`: Rewrite to validate password security.
4. `tests/v3/v3_full.js`: Update V3 auth assertions.
5. `tests/test_p2_cookie_auth.js`: Update test session login helper.
6. `tests/test_p3_live_full_stack.js`: Update live auth helper.
7. `tests/test_p4_browser_e2e.js`: Update Playwright login form automation.
8. `tests/test_p5_production_deployment.js`: Update smoke test.

### CATEGORY C: MUST NOT CHANGE (Protected Components)
1. [`server/middleware/auth.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/server/middleware/auth.js): `requireAuth`, `requireAdmin`, `requireRole`, `fingerprint`, and `trustScore`.
2. [`server/services/adminProvisioningService.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/server/services/adminProvisioningService.js): Admin governance and cold-start bootstrap.
3. [`server/services/productionConfigService.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/server/services/productionConfigService.js): Secret inspection and configuration fingerprinting.
4. [`server/utils/crypto.js`](file:///c:/Users/DELL/Downloads/Deciva/Deciva/server/utils/crypto.js): AES-256-GCM encryption and RSA signing keys.
5. `server/routes/documents.js`, `server/routes/intelligence.js`, `server/routes/negotiation.js`, `server/routes/simulation.js`: Core contract intelligence engines.
6. `server/routes/complianceAudit.js`, `server/routes/auditExport.js`: Cryptographic audit ledger and export.
7. `backend/*`: Python Flask AI microservice, RAG pipelines, and deterministic risk engines.

---

## 22. Database Migration Plan

### Schema Assessment
The `users` table already has:
```sql
password_hash TEXT NOT NULL
```
Therefore, **NO mandatory schema alteration is required** to store password hashes.

### Optional Phase 2 Cleanup Migration
* **Migration Name**: `20260918_020_retire_otp_codes`
* **Tables Affected**: `otp_codes`
* **SQL**:
  ```sql
  -- Optional: drop or archive legacy OTP codes table
  DROP TABLE IF EXISTS otp_codes CASCADE;
  ```
* **Rollback Strategy**: Re-run migration 001 definition for `otp_codes`.

---

## 23. Target API Contract

### 1. `POST /api/auth/register`
* **Request**:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@enterprise.com",
    "password": "SecurePassword123!"
  }
  ```
* **Validation**:
  * `email`: Valid email syntax.
  * `password`: Minimum 8 characters, maximum 128 characters, at least 1 uppercase, 1 lowercase, 1 number.
* **Success Response (200 OK)**:
  ```json
  {
    "ok": true,
    "user": { "id": "uuid", "name": "Jane Doe", "email": "jane@enterprise.com", "role": "user" }
  }
  ```
* **Cookie**: Sets `token=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`.

### 2. `POST /api/auth/login`
* **Request**:
  ```json
  {
    "email": "jane@enterprise.com",
    "password": "SecurePassword123!"
  }
  ```
* **Success Response (MFA Disabled) (200 OK)**:
  ```json
  {
    "ok": true,
    "token": "jwt_token_for_testing",
    "user": { "id": "uuid", "name": "Jane Doe", "email": "jane@enterprise.com", "role": "user", "mfaEnabled": false }
  }
  ```
  * Sets `httpOnly` cookie.
* **Success Response (MFA Enabled) (200 OK)**:
  ```json
  {
    "ok": true,
    "mfaRequired": true,
    "method": "totp",
    "preToken": "pre_auth_jwt"
  }
  ```
* **Failure Response (401 Unauthorized)**:
  ```json
  {
    "error": "Invalid email or password"
  }
  ```

---

## 24. Target Authentication State Machine

```text
               +----------------------------------+
               | User Submits Email & Password    |
               +----------------------------------+
                                |
                                v
               +----------------------------------+
               | Validate Syntax & Rate Limits    |
               +----------------------------------+
                                |
                                v
               +----------------------------------+
               | Query User & Verify bcrypt Hash  |
               +----------------------------------+
                     |                      |
             [Invalid Password]      [Hash Valid]
                     |                      |
                     v                      v
             +---------------+    +-------------------+
             | Return 401    |    | Check mfa_enabled |
             | Log Threat    |    +-------------------+
             +---------------+       /             \
                               [MFA Enabled]   [MFA Disabled]
                                    /                 \
                                   v                   v
                     +--------------------+     +-------------------+
                     | Issue preToken     |     | Create Session    |
                     | Redirect to /mfa   |     | Issue Cookie      |
                     +--------------------+     | Return 200 OK     |
                                |               +-------------------+
                                v
                     +--------------------+
                     | User Enters TOTP   |
                     +--------------------+
                                |
                                v
                     +--------------------+
                     | POST /totp/verify  |
                     +--------------------+
                                |
                                v
                     +--------------------+
                     | Create Session     |
                     | Issue Cookie       |
                     | Return 200 OK      |
                     +--------------------+
```

---

## 25. Resend Removal Plan

1. **Retire `sendOtpEmail()`**: Remove function from `server/utils/email.js`.
2. **Preserve `sendViaResend()`**: Retain for `sendWelcomeEmail()` and `sendSecurityAlertEmail()`.
3. **Preserve Environment Variables**: Retain `RESEND_API_KEY` and `RESEND_FROM` as optional email delivery configurations.

---

## 26. Test Migration Plan

In Phase 2, the test suite will be systematically upgraded:
1. Replace `tests/test_otp_production_security.js` with `tests/test_password_production_security.js`:
   * Test registration with strong password.
   * Test registration rejection with weak password (< 8 chars).
   * Test login success with valid password.
   * Test login failure with incorrect password (constant-time verification).
   * Test account enumeration resistance (uniform error messages).
   * Test rate limiter lockouts after repeated failures.
2. Update existing integration test harnesses (`test_p2_cookie_auth.js`, `test_p3_live_full_stack.js`, `test_p4_browser_e2e.js`, `test_p5_production_deployment.js`) to provide credentials directly.
3. Verify the cumulative suite maintains **100% pass rate**.

---

## 27. Backward Compatibility Assessment

| Dimension | Question | Verdict | Analysis |
|---|---|---|---|
| **Existing Sessions** | Can active sessions continue? | **YES** | Active sessions depend strictly on the `sessions` table and JWT cookie, unaffected by credential changes. |
| **Admins** | Can admins continue logging in? | **YES** | Admins use the standard login route; role authorization in `users.role` remains untouched. |
| **MFA** | Can TOTP MFA continue? | **YES** | RFC-6238 TOTP secrets stored in `users.totp_secret` remain valid. |
| **Existing Users** | Can existing users log in? | **REQUIRES BRIDGE** | Existing users have placeholder UUID hashes. They must be provisioned with a password or prompted to set one upon first login. |
| **Tenant Isolation**| Is multi-tenancy preserved? | **YES** | Tenant filtering operates on `user_id` / `tenant_id` and is completely decoupled from auth. |

---

## 28. Recommended Phase 2 Implementation Order

1. **Step 1: Password Infrastructure & Validation Helpers**:
   * Implement password strength validator (`server/utils/passwordPolicy.js`).
2. **Step 2: Backend Route Upgrades**:
   * Update `POST /register` to hash real passwords.
   * Update `POST /login` to verify passwords with `bcrypt.compare()`.
   * Update `POST /mfa/totp/verify` to sever OTP fallback.
   * Deprecate `/mfa/otp/request` and `/mfa/otp/verify`.
3. **Step 3: Frontend UI Upgrades**:
   * Add password inputs to `Register.jsx` and `Login.jsx`.
   * Streamline `Mfa.jsx` for TOTP only.
4. **Step 4: Test Suite Synchronization**:
   * Update test harnesses to authenticate with passwords.
   * Run full test suite and verify 100% pass rate.
5. **Step 5: Cleanup & Deprecation**:
   * Deprecate `sendOtpEmail()` in `server/utils/email.js`.
   * Run database migration to retire `otp_codes` table.

---

## 29. Files That Must Not Be Modified

The following components must remain untouched during migration:
* `server/middleware/auth.js`
* `server/services/adminProvisioningService.js`
* `server/services/productionConfigService.js`
* `server/utils/crypto.js`
* `server/routes/admin.js`
* `server/routes/documents.js`
* `server/routes/intelligence.js`
* `server/routes/negotiation.js`
* `server/routes/simulation.js`
* `server/routes/complianceAudit.js`
* `server/routes/auditExport.js`
* `backend/*` (all Python microservice files)

---

## 30. Final Audit Verdict

### VERDICT: `READY WITH WARNINGS`

**Justification**:
1. The authentication architecture is thoroughly mapped and understood.
2. The `password_hash` column already exists in the database schema.
3. TOTP MFA is fully independent and will not be impacted by email OTP removal.
4. **Warning 1**: Existing users in the database currently hold placeholder UUID hashes and will require a password initialization bridge.
5. **Warning 2**: Resend must not be completely deleted as it powers transactional security alert emails.
6. **Warning 3**: Test suites referencing `otp_codes` must be updated concurrently to maintain certified test baseline integrity.

---
*End of Phase 1 Forensic Audit Report.*
