const { Pool } = require("pg");
require("dotenv").config();

// Strip parameters that are unsupported by pg on Vercel's Node runtime
// and normalize sslmode for Node.js pg client (SEC-21)
function sanitizeDbUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.delete('channel_binding');
    // SEC-21: Normalize sslmode=require to sslmode=verify-full for Node's pg client
    // to prevent pg v8/v9 deprecation alias warning while retaining strict TLS verification.
    // Does not touch shared .env or Python's psycopg2 connection.
    if (u.searchParams.get('sslmode') === 'require') {
      u.searchParams.set('sslmode', 'verify-full');
    }
    return u.toString();
  } catch {
    return url;
  }
}

const connectionString = sanitizeDbUrl(process.env.DATABASE_URL);
const isLocal = connectionString && connectionString.includes('localhost');

// Enterprise-hardened database TLS configuration
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
const allowSelfSigned = process.env.DB_SSL_ALLOW_SELF_SIGNED === 'true';

let sslConfig = false;
if (!isLocal && connectionString) {
  sslConfig = {
    rejectUnauthorized: !allowSelfSigned,
    ca: process.env.DATABASE_CA_CERT || undefined
  };
  if (allowSelfSigned) {
    console.warn('[SECURITY WARNING] PostgreSQL TLS certificate verification is disabled via DB_SSL_ALLOW_SELF_SIGNED=true.');
  }
}

// Enterprise-hardened connection pool configuration
const pool = new Pool({
  connectionString,
  ssl: sslConfig,
  max: isServerless ? 5 : (Number(process.env.DB_POOL_MAX) || 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  statement_timeout: 45000,
  query_timeout: 50000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle pg pool client:', err.message);
});

/**
 * Formal, version-tracked schema migration definitions.
 * Each migration executes within an isolated transaction and is recorded in schema_migrations.
 */
const MIGRATIONS = [
  {
    version: '20260901_001_core_schema',
    name: 'Initial core users, sessions, otp, documents, threat logs',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        totp_secret TEXT,
        mfa_enabled BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        device_fingerprint TEXT,
        ip TEXT,
        trust_score INTEGER DEFAULT 100,
        mfa_verified BOOLEAN DEFAULT FALSE,
        revoked BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS otp_codes (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        purpose TEXT NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT,
        size BIGINT,
        sha256 TEXT,
        encrypted BOOLEAN DEFAULT TRUE,
        extracted_text TEXT,
        ocr_confidence REAL,
        version_group VARCHAR(36),
        version_number INTEGER DEFAULT 1,
        risk_score INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(36) PRIMARY KEY,
        document_id VARCHAR(36) REFERENCES documents(id) ON DELETE CASCADE,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL,
        source_ref TEXT,
        grounded BOOLEAN DEFAULT TRUE,
        sources JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS generated_contracts (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        contract_type TEXT NOT NULL,
        params_json TEXT,
        content TEXT NOT NULL,
        signature TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS share_links (
        id VARCHAR(36) PRIMARY KEY,
        document_id VARCHAR(36) REFERENCES documents(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        expires_at TIMESTAMP WITH TIME ZONE,
        max_downloads INTEGER,
        download_count INTEGER DEFAULT 0,
        revoked BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS blockchain_audit (
        id VARCHAR(36) PRIMARY KEY,
        block_index INTEGER NOT NULL,
        user_id VARCHAR(36),
        action TEXT NOT NULL,
        details_json TEXT,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS threat_logs (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36),
        ip TEXT,
        severity TEXT,
        category TEXT,
        message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    version: '20260902_002_intelligence_and_workflow',
    name: 'Contract intelligence snapshots, simulations, and human workflow actions',
    sql: `
      CREATE TABLE IF NOT EXISTS contract_simulations (
        id VARCHAR(36) PRIMARY KEY,
        document_id VARCHAR(36) REFERENCES documents(id) ON DELETE CASCADE,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        scenario TEXT NOT NULL,
        grounded BOOLEAN DEFAULT TRUE,
        document_evidence JSONB,
        simulation_analysis JSONB,
        risk_level TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contract_intelligence (
        id VARCHAR(36) PRIMARY KEY,
        document_id VARCHAR(36) REFERENCES documents(id) ON DELETE CASCADE,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        health_score INTEGER,
        critical_count INTEGER DEFAULT 0,
        important_count INTEGER DEFAULT 0,
        monitoring_count INTEGER DEFAULT 0,
        healthy_count INTEGER DEFAULT 0,
        executive_summary TEXT,
        conflicts_json JSONB,
        actions_json JSONB,
        metrics_json JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contract_actions (
        id VARCHAR(36) PRIMARY KEY,
        document_id VARCHAR(36) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        intelligence_snapshot_id VARCHAR(36) REFERENCES contract_intelligence(id) ON DELETE SET NULL,
        source_action_id VARCHAR(255) NOT NULL,
        title TEXT NOT NULL,
        category VARCHAR(30) NOT NULL,
        priority_score INTEGER NOT NULL CHECK (priority_score >= 0 AND priority_score <= 100),
        status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
        decision VARCHAR(30),
        owner_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        due_date TIMESTAMP WITH TIME ZONE,
        decision_reason TEXT,
        resolution_notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP WITH TIME ZONE,
        is_escalated BOOLEAN NOT NULL DEFAULT FALSE,
        escalation_rule VARCHAR(50),
        escalation_reason TEXT,
        escalated_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT contract_actions_snapshot_source_unique UNIQUE (document_id, intelligence_snapshot_id, source_action_id)
      );

      CREATE TABLE IF NOT EXISTS contract_action_decisions (
        id VARCHAR(36) PRIMARY KEY,
        action_id VARCHAR(36) NOT NULL REFERENCES contract_actions(id) ON DELETE CASCADE,
        previous_status VARCHAR(30),
        new_status VARCHAR(30) NOT NULL,
        decision VARCHAR(30),
        reason TEXT,
        decided_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contract_action_activity (
        id VARCHAR(36) PRIMARY KEY,
        action_id VARCHAR(36) NOT NULL REFERENCES contract_actions(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        actor_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    version: '20260902_003_collaboration_and_notifications',
    name: 'Action comments, notifications, and workflow indices',
    sql: `
      CREATE TABLE IF NOT EXISTS contract_action_comments (
        id VARCHAR(36) PRIMARY KEY,
        action_id VARCHAR(36) NOT NULL REFERENCES contract_actions(id) ON DELETE CASCADE,
        parent_comment_id VARCHAR(36) REFERENCES contract_action_comments(id) ON DELETE SET NULL,
        author_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        context_references JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS contract_notifications (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        document_id VARCHAR(36) REFERENCES documents(id) ON DELETE CASCADE,
        action_id VARCHAR(36) REFERENCES contract_actions(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        deduplication_key VARCHAR(255) NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        read_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT contract_notifications_dedup_unique UNIQUE (user_id, deduplication_key)
      );

      CREATE INDEX IF NOT EXISTS idx_contract_actions_document_id ON contract_actions(document_id);
      CREATE INDEX IF NOT EXISTS idx_contract_actions_status ON contract_actions(status);
      CREATE INDEX IF NOT EXISTS idx_contract_actions_owner_id ON contract_actions(owner_id);
      CREATE INDEX IF NOT EXISTS idx_contract_actions_priority ON contract_actions(priority_score DESC);
      CREATE INDEX IF NOT EXISTS idx_contract_actions_escalated ON contract_actions(document_id, is_escalated);
      CREATE INDEX IF NOT EXISTS idx_contract_action_decisions_action_id ON contract_action_decisions(action_id);
      CREATE INDEX IF NOT EXISTS idx_contract_action_activity_action_id ON contract_action_activity(action_id);
      CREATE INDEX IF NOT EXISTS idx_contract_action_comments_action_id ON contract_action_comments(action_id);
      CREATE INDEX IF NOT EXISTS idx_contract_notifications_user_unread ON contract_notifications(user_id, is_read);
    `
  },
  {
    version: '20260903_004_controlled_operations_8_0',
    name: 'Controlled batch operations table and idempotency tracking',
    sql: `
      CREATE TABLE IF NOT EXISTS portfolio_operation_batches (
        id               VARCHAR(36)   PRIMARY KEY,
        user_id          VARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        operation_type   VARCHAR(30)   NOT NULL,
        status           VARCHAR(20)   NOT NULL DEFAULT 'PREVIEWED',
        mode             VARCHAR(20)   NOT NULL DEFAULT 'STRICT',
        requested_count  INTEGER       NOT NULL DEFAULT 0,
        eligible_count   INTEGER       NOT NULL DEFAULT 0,
        executed_count   INTEGER       NOT NULL DEFAULT 0,
        blocked_count    INTEGER       NOT NULL DEFAULT 0,
        preview_hash     VARCHAR(64)   NOT NULL,
        idempotency_key  VARCHAR(255),
        request_hash     VARCHAR(64),
        payload_json     JSONB         NOT NULL DEFAULT '{}'::jsonb,
        blocked_json     JSONB         NOT NULL DEFAULT '[]'::jsonb,
        result_json      JSONB         NOT NULL DEFAULT '{}'::jsonb,
        created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at     TIMESTAMP WITH TIME ZONE,
        CONSTRAINT portfolio_operation_batches_idempotency_unique UNIQUE (user_id, idempotency_key)
      );

      CREATE INDEX IF NOT EXISTS idx_portfolio_batches_user_id ON portfolio_operation_batches(user_id);
      CREATE INDEX IF NOT EXISTS idx_portfolio_batches_status ON portfolio_operation_batches(status);
      CREATE INDEX IF NOT EXISTS idx_portfolio_batches_created_at ON portfolio_operation_batches(user_id, created_at DESC);
    `
  },
  {
    version: '20260903_005_governed_operations_8_1',
    name: 'Governed operations approval control, policy audit, and separation of duties columns',
    sql: `
      ALTER TABLE portfolio_operation_batches ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE portfolio_operation_batches ADD COLUMN IF NOT EXISTS policy_version VARCHAR(20) NOT NULL DEFAULT '1.0';
      ALTER TABLE portfolio_operation_batches ADD COLUMN IF NOT EXISTS policy_flags JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE portfolio_operation_batches ADD COLUMN IF NOT EXISTS policy_details JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE portfolio_operation_batches ADD COLUMN IF NOT EXISTS approved_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE portfolio_operation_batches ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE portfolio_operation_batches ADD COLUMN IF NOT EXISTS approval_comments TEXT;
      ALTER TABLE portfolio_operation_batches ADD COLUMN IF NOT EXISTS rejected_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE portfolio_operation_batches ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE portfolio_operation_batches ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

      CREATE INDEX IF NOT EXISTS idx_portfolio_batches_approval_status ON portfolio_operation_batches(status, requires_approval);
      CREATE INDEX IF NOT EXISTS idx_portfolio_batches_approved_by ON portfolio_operation_batches(approved_by);
    `
  },
  {
    version: '20260903_006_enterprise_hardening_8_2',
    name: 'Enterprise hardening: activity logs, foreign key cascades, and governance indexes',
    sql: `
      CREATE TABLE IF NOT EXISTS activity_logs (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        ip_address VARCHAR(45),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
    `
  },
  {
    version: '20260904_007_phase9_enterprise_observability',
    name: 'Enterprise AI telemetry logging, operational correlation tracking, and grounding observability',
    sql: `
      CREATE TABLE IF NOT EXISTS ai_telemetry_logs (
        id VARCHAR(36) PRIMARY KEY,
        correlation_id VARCHAR(64),
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        document_id VARCHAR(36) REFERENCES documents(id) ON DELETE CASCADE,
        operation_type VARCHAR(50) NOT NULL,
        model_provider VARCHAR(50),
        model_name VARCHAR(50),
        duration_ms INTEGER,
        status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
        grounded_status VARCHAR(30) DEFAULT 'GROUNDED',
        tokens_used INTEGER DEFAULT 0,
        fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
        error_category VARCHAR(50),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_ai_telemetry_correlation ON ai_telemetry_logs(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_ai_telemetry_operation ON ai_telemetry_logs(operation_type, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_telemetry_document ON ai_telemetry_logs(document_id);
    `
  },
  {
    version: '20260904_008_phase10_decision_intelligence',
    name: 'Phase 10 contract decision intelligence, deterministic exposure snapshot, and decision tracking',
    sql: `
      ALTER TABLE contract_intelligence ADD COLUMN IF NOT EXISTS decision_intelligence_json JSONB;
      ALTER TABLE contract_intelligence ADD COLUMN IF NOT EXISTS exposure_score INTEGER;
      ALTER TABLE contract_intelligence ADD COLUMN IF NOT EXISTS primary_driver TEXT;

      CREATE INDEX IF NOT EXISTS idx_contract_intelligence_doc_created ON contract_intelligence(document_id, created_at DESC);
    `
  },
  {
    version: '20260904_009_phase11_portfolio_monitoring',
    name: 'Phase 11 contract portfolio continuous monitoring, change detection, and lifecycle control',
    sql: `
      CREATE TABLE IF NOT EXISTS contract_monitoring_events (
        id VARCHAR(36) PRIMARY KEY,
        document_id VARCHAR(36) REFERENCES documents(id) ON DELETE CASCADE,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        priority_score INTEGER NOT NULL CHECK (priority_score >= 0 AND priority_score <= 100),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        evidence_reference TEXT,
        previous_value TEXT,
        current_value TEXT,
        risk_delta INTEGER DEFAULT 0,
        affected_dimension VARCHAR(50),
        deduplication_key VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
        detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        acknowledged_at TIMESTAMP WITH TIME ZONE,
        resolved_at TIMESTAMP WITH TIME ZONE,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT contract_monitoring_events_dedup_unique UNIQUE (document_id, deduplication_key)
      );

      CREATE INDEX IF NOT EXISTS idx_monitoring_events_user_status ON contract_monitoring_events(user_id, status, priority_score DESC);
      CREATE INDEX IF NOT EXISTS idx_monitoring_events_doc_detected ON contract_monitoring_events(document_id, detected_at DESC);

      CREATE TABLE IF NOT EXISTS contract_lifecycle_states (
        document_id VARCHAR(36) PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        state VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
        renewal_date TIMESTAMP WITH TIME ZONE,
        notice_deadline TIMESTAMP WITH TIME ZONE,
        cure_deadline TIMESTAMP WITH TIME ZONE,
        expiration_date TIMESTAMP WITH TIME ZONE,
        evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_lifecycle_states_user_state ON contract_lifecycle_states(user_id, state);
      CREATE INDEX IF NOT EXISTS idx_lifecycle_states_notice_deadline ON contract_lifecycle_states(notice_deadline);
    `
  },
  {
    version: '20260904_010_phase12_collaboration_workflows',
    name: 'Phase 12 enterprise collaboration, approval policies, review assignments, and human decision workflows',
    sql: `
      CREATE TABLE IF NOT EXISTS contract_decision_workflows (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        document_id VARCHAR(36) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        action_id VARCHAR(36) REFERENCES contract_actions(id) ON DELETE SET NULL,
        decision_type VARCHAR(50) NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
        created_by VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        current_owner VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        current_approver VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
        due_at TIMESTAMP WITH TIME ZONE,
        evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        recommendation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        requires_independent_approval BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS contract_decision_reviewers (
        id VARCHAR(36) PRIMARY KEY,
        decision_id VARCHAR(36) NOT NULL REFERENCES contract_decision_workflows(id) ON DELETE CASCADE,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(30) NOT NULL DEFAULT 'REVIEWER',
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        assigned_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP WITH TIME ZONE,
        response TEXT,
        notes TEXT,
        CONSTRAINT contract_decision_reviewers_unique UNIQUE (decision_id, user_id, role)
      );

      CREATE TABLE IF NOT EXISTS contract_decision_comments (
        id VARCHAR(36) PRIMARY KEY,
        decision_id VARCHAR(36) NOT NULL REFERENCES contract_decision_workflows(id) ON DELETE CASCADE,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        parent_comment_id VARCHAR(36) REFERENCES contract_decision_comments(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        clause_reference TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
        resolved_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        resolved_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contract_decision_events (
        id VARCHAR(36) PRIMARY KEY,
        decision_id VARCHAR(36) NOT NULL REFERENCES contract_decision_workflows(id) ON DELETE CASCADE,
        actor_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        event_type VARCHAR(50) NOT NULL,
        previous_status VARCHAR(30),
        new_status VARCHAR(30) NOT NULL,
        reason TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_decision_workflows_tenant ON contract_decision_workflows(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_decision_workflows_doc ON contract_decision_workflows(document_id);
      CREATE INDEX IF NOT EXISTS idx_decision_workflows_approver ON contract_decision_workflows(current_approver, status);
      CREATE INDEX IF NOT EXISTS idx_decision_workflows_owner ON contract_decision_workflows(current_owner, status);
      CREATE INDEX IF NOT EXISTS idx_decision_reviewers_user ON contract_decision_reviewers(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_decision_comments_decision ON contract_decision_comments(decision_id);
      CREATE INDEX IF NOT EXISTS idx_decision_events_decision ON contract_decision_events(decision_id, created_at ASC);
    `
  },
  {
    version: '20260904_011_policy_compliance_governance',
    name: 'Phase 13: Enterprise Policy, Compliance & Governance Control Engine',
    sql: `
      CREATE TABLE IF NOT EXISTS contract_governance_policies (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        applicability_rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        updated_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contract_governance_controls (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        policy_id VARCHAR(36) NOT NULL REFERENCES contract_governance_policies(id) ON DELETE CASCADE,
        control_code VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
        rule_definition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        remediation_guidance TEXT,
        is_blocking BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT contract_governance_controls_code_unique UNIQUE (policy_id, control_code)
      );

      CREATE TABLE IF NOT EXISTS contract_compliance_evaluations (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        document_id VARCHAR(36) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        policy_id VARCHAR(36) NOT NULL REFERENCES contract_governance_policies(id) ON DELETE CASCADE,
        policy_version INTEGER NOT NULL DEFAULT 1,
        evaluation_status VARCHAR(30) NOT NULL,
        compliance_score INTEGER NOT NULL DEFAULT 0,
        evaluated_controls_count INTEGER NOT NULL DEFAULT 0,
        compliant_controls_count INTEGER NOT NULL DEFAULT 0,
        partially_compliant_controls_count INTEGER NOT NULL DEFAULT 0,
        non_compliant_controls_count INTEGER NOT NULL DEFAULT 0,
        not_assessed_controls_count INTEGER NOT NULL DEFAULT 0,
        insufficient_evidence_controls_count INTEGER NOT NULL DEFAULT 0,
        evaluated_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        evaluated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE TABLE IF NOT EXISTS contract_compliance_findings (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        evaluation_id VARCHAR(36) NOT NULL REFERENCES contract_compliance_evaluations(id) ON DELETE CASCADE,
        document_id VARCHAR(36) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        control_id VARCHAR(36) NOT NULL REFERENCES contract_governance_controls(id) ON DELETE CASCADE,
        finding_status VARCHAR(30) NOT NULL,
        clause_evidence_quote TEXT,
        clause_evidence_location VARCHAR(255),
        failure_reason TEXT,
        remediation_suggested TEXT,
        is_blocking BOOLEAN NOT NULL DEFAULT FALSE,
        has_active_exception BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contract_governance_exceptions (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        document_id VARCHAR(36) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        finding_id VARCHAR(36) NOT NULL REFERENCES contract_compliance_findings(id) ON DELETE CASCADE,
        control_id VARCHAR(36) NOT NULL REFERENCES contract_governance_controls(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        requested_by VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        approved_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        rejected_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        approval_notes TEXT,
        expires_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_gov_policies_tenant ON contract_governance_policies(tenant_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_gov_controls_policy ON contract_governance_controls(policy_id);
      CREATE INDEX IF NOT EXISTS idx_compliance_eval_doc ON contract_compliance_evaluations(document_id, evaluated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_compliance_eval_tenant ON contract_compliance_evaluations(tenant_id, evaluation_status);
      CREATE INDEX IF NOT EXISTS idx_compliance_findings_eval ON contract_compliance_findings(evaluation_id);
      CREATE INDEX IF NOT EXISTS idx_compliance_findings_doc ON contract_compliance_findings(document_id, finding_status);
      CREATE INDEX IF NOT EXISTS idx_gov_exceptions_tenant ON contract_governance_exceptions(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_gov_exceptions_finding ON contract_governance_exceptions(finding_id, status);
      CREATE INDEX IF NOT EXISTS idx_gov_exceptions_doc ON contract_governance_exceptions(document_id, status);
    `
  },
  {
    version: '20260904_012_enterprise_integrations',
    name: 'Phase 14: Enterprise Integrations, Interoperability & Secure System Connectors',
    sql: `
      CREATE TABLE IF NOT EXISTS enterprise_integrations (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        integration_type VARCHAR(50) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
        configuration_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        credentials_reference TEXT,
        created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_sync_at TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS integration_sync_runs (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        integration_id VARCHAR(36) NOT NULL REFERENCES enterprise_integrations(id) ON DELETE CASCADE,
        operation VARCHAR(30) NOT NULL,
        direction VARCHAR(20) NOT NULL,
        status VARCHAR(30) NOT NULL,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE,
        records_received INTEGER DEFAULT 0,
        records_created INTEGER DEFAULT 0,
        records_updated INTEGER DEFAULT 0,
        records_skipped INTEGER DEFAULT 0,
        records_failed INTEGER DEFAULT 0,
        error_summary TEXT,
        correlation_id VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS integration_idempotency_keys (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        integration_id VARCHAR(36) NOT NULL REFERENCES enterprise_integrations(id) ON DELETE CASCADE,
        idempotency_key VARCHAR(255) NOT NULL,
        operation VARCHAR(50) NOT NULL,
        source_object_id VARCHAR(255),
        result_reference JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT integration_idempotency_keys_unique UNIQUE (tenant_id, integration_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS integration_object_mappings (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        integration_id VARCHAR(36) NOT NULL REFERENCES enterprise_integrations(id) ON DELETE CASCADE,
        external_object_type VARCHAR(50) NOT NULL,
        external_object_id VARCHAR(255) NOT NULL,
        deciva_object_type VARCHAR(50) NOT NULL,
        deciva_object_id VARCHAR(36) NOT NULL,
        external_version VARCHAR(50),
        last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        mapping_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT integration_object_mappings_unique UNIQUE (tenant_id, integration_id, external_object_type, external_object_id)
      );

      CREATE TABLE IF NOT EXISTS integration_webhook_events (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        integration_id VARCHAR(36) NOT NULL REFERENCES enterprise_integrations(id) ON DELETE CASCADE,
        event_id VARCHAR(255) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
        payload_hash VARCHAR(64) NOT NULL,
        received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP WITH TIME ZONE,
        processing_status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
        error_code VARCHAR(50),
        correlation_id VARCHAR(64),
        CONSTRAINT integration_webhook_events_unique UNIQUE (tenant_id, integration_id, event_id)
      );

      CREATE TABLE IF NOT EXISTS integration_event_outbox (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        integration_id VARCHAR(36) REFERENCES enterprise_integrations(id) ON DELETE SET NULL,
        event_id VARCHAR(64) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_error TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS integration_config_versions (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        integration_id VARCHAR(36) NOT NULL REFERENCES enterprise_integrations(id) ON DELETE CASCADE,
        version INTEGER NOT NULL DEFAULT 1,
        configuration_hash VARCHAR(64) NOT NULL,
        changed_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON enterprise_integrations(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_sync_runs_integration ON integration_sync_runs(integration_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sync_runs_tenant ON integration_sync_runs(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_obj_mappings_doc ON integration_object_mappings(deciva_object_id);
      CREATE INDEX IF NOT EXISTS idx_obj_mappings_ext ON integration_object_mappings(integration_id, external_object_id);
      CREATE INDEX IF NOT EXISTS idx_outbox_pending ON integration_event_outbox(status, next_attempt_at) WHERE status = 'PENDING';
      CREATE INDEX IF NOT EXISTS idx_outbox_tenant ON integration_event_outbox(tenant_id, event_type);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_integration ON integration_webhook_events(integration_id, received_at DESC);
    `
  },
  {
    version: '20260905_013_enterprise_operations',
    name: 'Enterprise operations, backups, tenant lifecycle, legal holds, retention, jobs, break-glass, and feature flags',
    sql: `
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);

      CREATE TABLE IF NOT EXISTS enterprise_backups (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36),
        backup_type VARCHAR(30) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        size_bytes BIGINT DEFAULT 0,
        checksum VARCHAR(64),
        storage_path TEXT,
        metadata_json JSONB,
        source_database_version VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE,
        verified_at TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS tenant_lifecycle_records (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        status VARCHAR(30) NOT NULL,
        previous_status VARCHAR(30),
        reason TEXT NOT NULL,
        requested_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        confirmed_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        scheduled_deletion_at TIMESTAMP WITH TIME ZONE,
        deleted_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS legal_holds (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        name TEXT NOT NULL,
        matter_id VARCHAR(100) NOT NULL,
        description TEXT,
        scope_type VARCHAR(30) NOT NULL,
        scope_id VARCHAR(36),
        created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        released_at TIMESTAMP WITH TIME ZONE,
        released_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS retention_policies (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        name TEXT NOT NULL,
        target_asset VARCHAR(50) NOT NULL,
        retention_days INTEGER NOT NULL,
        action VARCHAR(30) NOT NULL DEFAULT 'PURGE',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS retention_execution_logs (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        policy_id VARCHAR(36) REFERENCES retention_policies(id) ON DELETE SET NULL,
        mode VARCHAR(20) NOT NULL DEFAULT 'PREVIEW',
        evaluated_count INTEGER NOT NULL DEFAULT 0,
        retained_count INTEGER NOT NULL DEFAULT 0,
        purged_count INTEGER NOT NULL DEFAULT 0,
        held_count INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS background_job_runs (
        id VARCHAR(36) PRIMARY KEY,
        job_type VARCHAR(50) NOT NULL,
        tenant_id VARCHAR(36),
        idempotency_key VARCHAR(128),
        status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        last_error TEXT,
        correlation_id VARCHAR(100),
        metadata_json JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admin_break_glass_logs (
        id VARCHAR(36) PRIMARY KEY,
        admin_user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tenant_id VARCHAR(36) NOT NULL,
        reason TEXT NOT NULL,
        scope VARCHAR(50) NOT NULL,
        correlation_id VARCHAR(100) NOT NULL,
        ip_address VARCHAR(45),
        revoked_at TIMESTAMP WITH TIME ZONE,
        revoke_reason TEXT,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS enterprise_feature_flags (
        id VARCHAR(36) PRIMARY KEY,
        flag_key VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        is_enabled BOOLEAN NOT NULL DEFAULT false,
        tenant_overrides_json JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_backups_tenant ON enterprise_backups(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_lifecycle_tenant ON tenant_lifecycle_records(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_legal_holds_tenant ON legal_holds(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_legal_holds_scope ON legal_holds(scope_type, scope_id);
      CREATE INDEX IF NOT EXISTS idx_retention_tenant ON retention_policies(tenant_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_retention_logs ON retention_execution_logs(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON background_job_runs(status, job_type);
      CREATE INDEX IF NOT EXISTS idx_jobs_idempotency ON background_job_runs(idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_break_glass_admin ON admin_break_glass_logs(admin_user_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_break_glass_tenant ON admin_break_glass_logs(tenant_id, timestamp DESC);
    `
  },
  {
    version: '20260905_014_commercial_hardening',
    name: 'Commercial Hardening: Human decision feedback telemetry and disagreement analytics',
    sql: `
      CREATE TABLE IF NOT EXISTS contract_decision_feedback (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        document_id VARCHAR(36) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        decision_id VARCHAR(36) REFERENCES contract_decision_workflows(id) ON DELETE SET NULL,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        clause_id VARCHAR(100),
        ai_recommendation VARCHAR(100) NOT NULL,
        ai_risk_score INTEGER,
        human_decision VARCHAR(100) NOT NULL,
        disagreement_type VARCHAR(50) NOT NULL,
        decision_reason TEXT NOT NULL,
        final_outcome VARCHAR(50) NOT NULL,
        metadata_json JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_feedback_tenant ON contract_decision_feedback(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_feedback_doc ON contract_decision_feedback(document_id);
      CREATE INDEX IF NOT EXISTS idx_feedback_disagreement ON contract_decision_feedback(disagreement_type);
    `
  },
  {
    version: '20260906_015_upload_idempotency',
    name: 'Phase 2 Task 2: Upload Idempotency and Dual-Write Prevention',
    sql: `
      CREATE TABLE IF NOT EXISTS upload_idempotency (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        idempotency_key VARCHAR(255) NOT NULL,
        request_hash VARCHAR(64) NOT NULL,
        document_id VARCHAR(36) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'PROCESSING',
        response_payload JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT upload_idempotency_user_key_unique UNIQUE (user_id, idempotency_key)
      );

      CREATE INDEX IF NOT EXISTS idx_upload_idempotency_user_hash ON upload_idempotency(user_id, request_hash);
      CREATE INDEX IF NOT EXISTS idx_upload_idempotency_doc ON upload_idempotency(document_id);
    `
  },
  {
    version: '20260916_016_simulation_engine_hardening',
    name: 'Phase 2 Task 4: Simulation Engine Risk Recalculation & Scenario Integrity',
    sql: `
      ALTER TABLE contract_simulations ADD COLUMN IF NOT EXISTS clause_id VARCHAR(100);
      ALTER TABLE contract_simulations ADD COLUMN IF NOT EXISTS original_clause TEXT;
      ALTER TABLE contract_simulations ADD COLUMN IF NOT EXISTS proposed_clause TEXT;
      ALTER TABLE contract_simulations ADD COLUMN IF NOT EXISTS before_score INTEGER;
      ALTER TABLE contract_simulations ADD COLUMN IF NOT EXISTS after_score INTEGER;
      ALTER TABLE contract_simulations ADD COLUMN IF NOT EXISTS risk_delta INTEGER DEFAULT 0;
      ALTER TABLE contract_simulations ADD COLUMN IF NOT EXISTS risk_direction VARCHAR(20) DEFAULT 'UNCHANGED';
      ALTER TABLE contract_simulations ADD COLUMN IF NOT EXISTS risk_findings JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE contract_simulations ADD COLUMN IF NOT EXISTS provenance JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE contract_simulations ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
      ALTER TABLE contract_simulations ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'COMPLETED';

      CREATE INDEX IF NOT EXISTS idx_simulations_doc_created ON contract_simulations(document_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_simulations_user_idemp ON contract_simulations(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
    `
  },
  {
    version: '20260916_017_negotiation_risk_recalculation',
    name: 'Phase 2 Task 5: Negotiation Engine Post-Redline Risk Recalculation & Audit Persistence',
    sql: `
      CREATE TABLE IF NOT EXISTS contract_negotiations (
        id VARCHAR(36) PRIMARY KEY,
        document_id VARCHAR(36) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        clause_id VARCHAR(100),
        clause_type VARCHAR(100),
        mode VARCHAR(30) NOT NULL DEFAULT 'balanced',
        original_clause TEXT NOT NULL,
        proposed_clause TEXT NOT NULL,
        before_score INTEGER NOT NULL,
        after_score INTEGER NOT NULL,
        risk_delta INTEGER NOT NULL DEFAULT 0,
        risk_direction VARCHAR(20) NOT NULL DEFAULT 'UNCHANGED',
        risk_findings JSONB DEFAULT '{}'::jsonb,
        redline JSONB DEFAULT '{}'::jsonb,
        strategy TEXT,
        identified_imbalance TEXT,
        provenance JSONB DEFAULT '{}'::jsonb,
        idempotency_key VARCHAR(255),
        status VARCHAR(30) DEFAULT 'ACTIVE',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_negotiations_doc_created ON contract_negotiations(document_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_negotiations_user_idemp ON contract_negotiations(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
    `
  },
  {
    version: '20260916_018_admin_role_governance',
    name: 'Phase 2 Task 6: Controlled Admin Role Governance & Invariant Enforcement',
    sql: `
      -- Normalize any legacy/unrecognized roles to 'user' before adding CHECK constraint
      UPDATE users SET role = 'user' WHERE role IS NULL OR role NOT IN ('admin', 'legal_counsel', 'compliance_officer', 'auditor', 'user');

      -- Enforce valid roles at schema level
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_valid_role'
        ) THEN
          ALTER TABLE users ADD CONSTRAINT chk_users_valid_role 
            CHECK (role IN ('admin', 'legal_counsel', 'compliance_officer', 'auditor', 'user'));
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    `
  },
  {
    version: '20260916_019_cryptographic_audit_ledger_view',
    name: 'Create cryptographic_audit_ledger view for truthful terminology parity',
    sql: `
      CREATE OR REPLACE VIEW cryptographic_audit_ledger AS
      SELECT
        id,
        block_index,
        user_id,
        action,
        details_json,
        prev_hash,
        hash,
        created_at
      FROM blockchain_audit;
    `
  },
  {
    version: '20260918_020_password_auth_governance',
    name: 'Phase 2: Enterprise Password Authentication & Legacy Account Governance',
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_initialized BOOLEAN NOT NULL DEFAULT FALSE;

      CREATE TABLE IF NOT EXISTS legacy_setup_tokens (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_legacy_setup_token_hash ON legacy_setup_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_legacy_setup_user_id ON legacy_setup_tokens(user_id);
    `
  }
];

/**
 * Executes pending database migrations sequentially and records them in schema_migrations.
 */
async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(50) PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const { rows: appliedRows } = await client.query('SELECT version FROM schema_migrations');
    const applied = new Set(appliedRows.map(r => r.version));

    let count = 0;
    for (const m of MIGRATIONS) {
      if (!applied.has(m.version)) {
        await client.query('BEGIN');
        await client.query(m.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [m.version, m.name]
        );
        await client.query('COMMIT');
        console.log(`[MIGRATION] Applied: ${m.version} (${m.name})`);
        count++;
      }
    }
    if (count > 0) {
      console.log(`✅ Applied ${count} new schema migrations.`);
    } else {
      console.log(`✅ Schema migrations up-to-date (${MIGRATIONS.length} migrations recorded).`);
    }
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('❌ Schema Migration Error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function initDb() {
  try {
    await runMigrations();
    console.log("✅ PostgreSQL schema initialized and migrations verified successfully");
  } catch (err) {
    console.error("❌ CRITICAL: PostgreSQL Schema Migration Failed:", err.message);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    throw err;
  }
}

pool.connect()
  .then(async (client) => {
    console.log("✅ Connected to PostgreSQL");
    client.release();
    await initDb();
  })
  .catch(err => console.error("❌ PostgreSQL Connection Error:", err));

pool.initDb = initDb;
pool.sanitizeDbUrl = sanitizeDbUrl;

module.exports = pool;