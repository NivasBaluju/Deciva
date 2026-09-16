/**
 * Deciva — Enterprise Integration Synchronization Service
 * ---------------------------------------------------------------------------
 * Coordinates inbound synchronization, version conflict detection, idempotency,
 * and seamless integration bridges into Phase 10 Decision Intelligence,
 * Monitoring, Phase 12 Workflows, Phase 13 Governance, and Action Center.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { sha256 } = require('../utils/crypto');
const { recordAudit } = require('../utils/audit');
const { recordAiTelemetry } = require('../utils/aiTelemetry');
const { riskScore } = require('../utils/aiEngine');
const { getProvider } = require('./integrations/providerRegistry');
const CredentialVaultService = require('./credentialVaultService');
const IntegrationSecurityService = require('./integrationSecurityService');
const IntegrationNormalizationService = require('./integrationNormalizationService');
const IntegrationEventService = require('./integrationEventService');

// Optional dynamic loaders for core stack engines (ensures resilient runtime)
let contractDecisionService;
try { contractDecisionService = require('./contractDecisionService'); } catch {}
let contractMonitoringService;
try { contractMonitoringService = require('./contractMonitoringService'); } catch {}
let policyComplianceService;
try { policyComplianceService = require('./policyComplianceService'); } catch {}

const IntegrationSyncService = {
  /**
   * Executes an end-to-end synchronization run for an integration.
   */
  executeSyncRun: async (tenantId, integrationId, options = {}) => {
    const { rows: intgRows } = await db.query(
      `SELECT * FROM enterprise_integrations WHERE id = $1 AND tenant_id = $2`,
      [integrationId, tenantId]
    );

    if (intgRows.length === 0) {
      throw new Error('Integration not found or unauthorized');
    }

    const integration = intgRows[0];
    if (integration.status !== 'ACTIVE' && integration.status !== 'TESTING') {
      throw new Error(`Cannot run synchronization on integration in '${integration.status}' status`);
    }

    const correlationId = options.correlationId || IntegrationSecurityService.generateIntegrationCorrelationId();
    const runId = uuidv4();

    await db.query(
      `INSERT INTO integration_sync_runs (
        id, tenant_id, integration_id, operation, direction, status,
        records_received, records_created, records_updated, records_skipped, records_failed,
        correlation_id, started_at, created_at
      ) VALUES ($1, $2, $3, 'SYNC', 'INBOUND', 'RUNNING', 0, 0, 0, 0, 0, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [runId, tenantId, integrationId, correlationId]
    );

    let received = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let errorSummary = null;

    try {
      const provider = getProvider(integration.provider);
      const config = typeof integration.configuration_json === 'string'
        ? JSON.parse(integration.configuration_json)
        : (integration.configuration_json || {});

      // Inject any runtime options into config (e.g. mock docs)
      if (options.mock_documents) config.mock_documents = options.mock_documents;
      if (options.mock !== undefined) config.mock = options.mock;

      const creds = integration.credentials_reference
        ? { apiKey: CredentialVaultService.retrieveSecret(integration.credentials_reference) }
        : {};

      const remoteResult = await provider.listDocuments(config, creds, options.query_params || {});
      const rawDocs = remoteResult.documents || [];
      received = rawDocs.length;

      for (const rawDoc of rawDocs) {
        try {
          const canonical = IntegrationNormalizationService.normalizeDocument(integration.provider, rawDoc);

          // Check idempotency mapping
          const { rows: mappingRows } = await db.query(
            `SELECT * FROM integration_object_mappings
             WHERE tenant_id = $1 AND integration_id = $2
               AND external_object_type = 'document' AND external_object_id = $3`,
            [tenantId, integrationId, canonical.external_object_id]
          );

          if (mappingRows.length > 0) {
            // Already imported: check versioning
            const mapping = mappingRows[0];
            const currentExtVersion = Number(mapping.external_version) || 1;
            const newExtVersion = Number(canonical.external_version) || 1;

            if (newExtVersion <= currentExtVersion) {
              // Up to date or older version received: skip safely without mutation
              skipped++;
              continue;
            }

            // External version is newer: process controlled document update
            const docId = mapping.deciva_object_id;
            const textContent = canonical.content_text || '';
            const calculatedRisk = textContent ? riskScore(textContent).overall : 10;
            const contentHash = sha256(textContent);

            await db.query(
              `UPDATE documents
               SET extracted_text = $1,
                   risk_score = $2,
                   sha256 = $3,
                   version_number = version_number + 1
               WHERE id = $4 AND user_id = $5`,
              [textContent, calculatedRisk, contentHash, docId, tenantId]
            );

            // Update mapping
            await db.query(
              `UPDATE integration_object_mappings
               SET external_version = $1, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [String(newExtVersion), mapping.id]
            );

            if (contractMonitoringService && contractMonitoringService.evaluateContractMonitoring) {
              await contractMonitoringService.evaluateContractMonitoring(docId, tenantId, {
                changeType: 'EXTERNAL_DOCUMENT_UPDATED',
                previousVersion: currentExtVersion,
                newVersion: newExtVersion
              }).catch(e => console.warn('[Sync] Monitoring bridge warning:', e.message));
            }

            if (contractDecisionService && contractDecisionService.getDocumentDecisionIntelligence) {
              await contractDecisionService.getDocumentDecisionIntelligence(docId, tenantId)
                .catch(e => console.warn('[Sync] Intelligence bridge warning:', e.message));
            }

            if (policyComplianceService && policyComplianceService.evaluateDocumentCompliance) {
              await policyComplianceService.evaluateDocumentCompliance(tenantId, docId)
                .catch(e => console.warn('[Sync] Compliance bridge warning:', e.message));
            }

            // Outbound event
            await IntegrationEventService.emitEvent({
              tenantId,
              integrationId,
              eventType: 'DOCUMENT_UPDATED',
              sourceObject: 'document',
              sourceObjectId: docId,
              version: String(newExtVersion),
              correlationId,
              summary: `Document ${canonical.document_name} updated to external version ${newExtVersion}`
            });

            updated++;
          } else {
            // First-time import: insert document into Deciva core
            const docId = uuidv4();
            const textContent = canonical.content_text || '';
            const calculatedRisk = textContent ? riskScore(textContent).overall : 10;
            const contentHash = sha256(textContent);
            const storedName = `${docId}.enc`;

            await db.query(
              `INSERT INTO documents (
                id, user_id, filename, original_name, mime_type, size,
                sha256, encrypted, extracted_text, ocr_confidence,
                version_group, version_number, risk_score, created_at
              ) VALUES ($1, $2, $3, $4, 'text/plain', $5, $6, true, $7, 1.0, $8, 1, $9, CURRENT_TIMESTAMP)`,
              [
                docId,
                tenantId,
                storedName,
                canonical.document_name,
                Buffer.byteLength(textContent, 'utf8'),
                contentHash,
                textContent,
                docId,
                calculatedRisk
              ]
            );

            // Create object mapping
            const mappingId = uuidv4();
            await db.query(
              `INSERT INTO integration_object_mappings (
                id, tenant_id, integration_id, external_object_type, external_object_id,
                deciva_object_type, deciva_object_id, external_version,
                last_synced_at, mapping_status, metadata_json, created_at, updated_at
              ) VALUES ($1, $2, $3, 'document', $4, 'document', $5, $6, CURRENT_TIMESTAMP, 'ACTIVE', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
              [
                mappingId,
                tenantId,
                integrationId,
                canonical.external_object_id,
                docId,
                canonical.external_version || '1',
                JSON.stringify(canonical.metadata || {})
              ]
            );

            if (contractDecisionService && contractDecisionService.getDocumentDecisionIntelligence) {
              await contractDecisionService.getDocumentDecisionIntelligence(docId, tenantId)
                .catch(e => console.warn('[Sync] Intelligence bridge warning:', e.message));
            }

            if (policyComplianceService && policyComplianceService.evaluateDocumentCompliance) {
              await policyComplianceService.evaluateDocumentCompliance(tenantId, docId)
                .catch(e => console.warn('[Sync] Compliance bridge warning:', e.message));
            }

            // Cryptographic audit
            await recordAudit(tenantId, 'DOCUMENT_IMPORTED', {
              integrationId,
              documentId: docId,
              externalId: canonical.external_object_id,
              name: canonical.document_name,
              correlationId
            });

            // Outbound event
            await IntegrationEventService.emitEvent({
              tenantId,
              integrationId,
              eventType: 'DOCUMENT_IMPORTED',
              sourceObject: 'document',
              sourceObjectId: docId,
              version: canonical.external_version || '1',
              correlationId,
              summary: `Document ${canonical.document_name} imported via ${integration.provider}`
            });

            created++;
          }
        } catch (itemErr) {
          console.error('[Sync] Error processing document item:', itemErr.message);
          failed++;
        }
      }

      await db.query(
        `UPDATE enterprise_integrations SET last_sync_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [integrationId]
      );
    } catch (syncErr) {
      console.error('[Sync] Fatal sync run error:', syncErr.message);
      errorSummary = syncErr.message;
    }

    const finalStatus = errorSummary ? (created + updated > 0 ? 'PARTIAL' : 'FAILED') : 'COMPLETED';

    await db.query(
      `UPDATE integration_sync_runs
       SET status = $1, completed_at = CURRENT_TIMESTAMP,
           records_received = $2, records_created = $3, records_updated = $4,
           records_skipped = $5, records_failed = $6, error_summary = $7
       WHERE id = $8`,
      [finalStatus, received, created, updated, skipped, failed, errorSummary, runId]
    );

    // AI Telemetry
    recordAiTelemetry({
      correlationId,
      userId: tenantId,
      operationType: 'INTEGRATION_SYNC',
      provider: integration.provider,
      status: finalStatus === 'COMPLETED' ? 'SUCCESS' : 'FAILED',
      metadata: {
        integrationId,
        received,
        created,
        updated,
        skipped,
        failed
      }
    });

    return {
      runId,
      status: finalStatus,
      correlationId,
      records: {
        received,
        created,
        updated,
        skipped,
        failed
      },
      error: errorSummary
    };
  },

  /**
   * Processes incoming webhook payloads with signature validation and replay idempotency.
   */
  processWebhookEvent: async (tenantId, integrationId, { rawBody, signatureHeader, timestampHeader, payload }) => {
    const { rows: intgRows } = await db.query(
      `SELECT * FROM enterprise_integrations WHERE id = $1 AND tenant_id = $2`,
      [integrationId, tenantId]
    );

    if (intgRows.length === 0) {
      throw new Error('Integration not found');
    }

    const integration = intgRows[0];
    if (integration.status !== 'ACTIVE' && integration.status !== 'TESTING') {
      throw new Error(`Integration is currently ${integration.status}`);
    }

    const secret = integration.credentials_reference
      ? CredentialVaultService.retrieveSecret(integration.credentials_reference)
      : null;

    if (secret) {
      const sigResult = IntegrationSecurityService.validateWebhookSignature({
        rawBody,
        signatureHeader,
        secret,
        timestampHeader
      });

      if (!sigResult.valid) {
        // Record failed attempt in audit
        await recordAudit(tenantId, 'WEBHOOK_REJECTED', {
          integrationId,
          reason: sigResult.error
        });
        const err = new Error(`Invalid webhook signature: ${sigResult.error}`);
        err.statusCode = 401;
        throw err;
      }
    }

    const canonicalEvent = IntegrationNormalizationService.normalizeEvent(integration.provider, payload);
    const payloadHash = sha256(JSON.stringify(payload));

    const { rows: existingEvt } = await db.query(
      `SELECT * FROM integration_webhook_events
       WHERE tenant_id = $1 AND integration_id = $2 AND event_id = $3`,
      [tenantId, integrationId, canonicalEvent.event_id]
    );

    if (existingEvt.length > 0) {
      // Replayed webhook: return cached original result safely without duplicate processing
      return {
        idempotent: true,
        status: 'DUPLICATE_IGNORED',
        event_id: canonicalEvent.event_id,
        processed_at: existingEvt[0].processed_at
      };
    }

    const webhookEventId = uuidv4();
    await db.query(
      `INSERT INTO integration_webhook_events (
        id, tenant_id, integration_id, event_id, event_type, signature_valid, payload_hash,
        processing_status, correlation_id, received_at, processed_at
      ) VALUES ($1, $2, $3, $4, $5, true, $6, 'COMPLETED', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        webhookEventId,
        tenantId,
        integrationId,
        canonicalEvent.event_id,
        canonicalEvent.event_type,
        payloadHash,
        `wh-${canonicalEvent.event_id}`
      ]
    );

    await recordAudit(tenantId, 'WEBHOOK_ACCEPTED', {
      integrationId,
      eventId: canonicalEvent.event_id,
      eventType: canonicalEvent.event_type
    });

    return {
      success: true,
      idempotent: false,
      event_id: canonicalEvent.event_id,
      event_type: canonicalEvent.event_type
    };
  }
};

module.exports = IntegrationSyncService;
