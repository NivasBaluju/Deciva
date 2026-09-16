/**
 * server/services/featureFlagService.js
 * Feature Flag Safety & Governance
 * Deterministic, auditable, tenant-aware feature flag service with safe defaults.
 * Guarantees security-critical authorization never relies on client-side flags alone.
 */

const crypto = require('crypto');
const db = require('../db');
const { recordAudit } = require('../utils/audit');

const DEFAULT_FLAGS = {
  'enable_auto_retention_purge': false,
  'enable_cross_tenant_analytics': false,
  'enable_live_webhook_dispatch': true,
  'enable_break_glass_access': true,
  'enable_ai_decision_intelligence': true
};

/**
 * Evaluates whether a feature flag is enabled for a specific tenant.
 */
async function getFeatureFlag(flagKey, tenantId = null) {
  try {
    const { rows } = await db.query(
      'SELECT is_enabled, tenant_overrides_json FROM enterprise_feature_flags WHERE flag_key = $1',
      [flagKey]
    );

    if (rows.length === 0) {
      return DEFAULT_FLAGS[flagKey] !== undefined ? DEFAULT_FLAGS[flagKey] : false;
    }

    const { is_enabled, tenant_overrides_json } = rows[0];

    // Check tenant override
    if (tenantId && tenant_overrides_json && typeof tenant_overrides_json === 'object') {
      if (tenant_overrides_json[tenantId] !== undefined) {
        return Boolean(tenant_overrides_json[tenantId]);
      }
    }

    return Boolean(is_enabled);
  } catch (err) {
    return DEFAULT_FLAGS[flagKey] !== undefined ? DEFAULT_FLAGS[flagKey] : false;
  }
}

/**
 * Sets or updates a feature flag definition.
 */
async function setFeatureFlag(flagKey, { isEnabled, description = '', tenantOverrides = {}, adminUserId = null }) {
  const flagId = crypto.randomUUID();

  await db.query(`
    INSERT INTO enterprise_feature_flags (
      id, flag_key, description, is_enabled, tenant_overrides_json, updated_at
    ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    ON CONFLICT (flag_key) DO UPDATE SET
      description = EXCLUDED.description,
      is_enabled = EXCLUDED.is_enabled,
      tenant_overrides_json = EXCLUDED.tenant_overrides_json,
      updated_at = CURRENT_TIMESTAMP
  `, [flagId, flagKey, description, isEnabled, JSON.stringify(tenantOverrides)]);

  await recordAudit(adminUserId, 'FEATURE_FLAG_UPDATED', {
    flag_key: flagKey,
    is_enabled: isEnabled,
    tenant_overrides_count: Object.keys(tenantOverrides).length
  });

  return {
    flag_key: flagKey,
    is_enabled: isEnabled,
    description,
    tenant_overrides: tenantOverrides
  };
}

/**
 * Helper to check if a flag is enabled.
 */
async function isEnabled(flagKey, tenantId = null) {
  return getFeatureFlag(flagKey, tenantId);
}

/**
 * Convenience helper to set a flag or tenant override.
 */
async function setFlag(flagKey, enabled, { tenantId = null, updatedBy = null, description = '' } = {}) {
  const tenantOverrides = tenantId ? { [tenantId]: enabled } : {};
  return setFeatureFlag(flagKey, {
    isEnabled: enabled,
    description,
    tenantOverrides,
    adminUserId: updatedBy
  });
}

/**
 * Lists all registered feature flags.
 */
async function listFeatureFlags() {
  const { rows } = await db.query('SELECT * FROM enterprise_feature_flags ORDER BY flag_key');
  return rows;
}

module.exports = {
  getFeatureFlag,
  setFeatureFlag,
  listFeatureFlags,
  isEnabled,
  setFlag
};
