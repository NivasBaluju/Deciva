/**
 * Deciva — Canonical Integration Normalization Service
 * ---------------------------------------------------------------------------
 * Normalizes external provider payloads into canonical Deciva representations.
 * Enforces zero-fabrication guarantees: missing fields remain null/NOT_PROVIDED.
 * Preserves contract text verbatim as legal evidence.
 */

const IntegrationNormalizationService = {
  /**
   * Normalizes an external document payload into canonical format.
   */
  normalizeDocument: (sourceSystem, rawPayload = {}) => {
    if (!rawPayload || typeof rawPayload !== 'object') {
      throw new Error('Document payload must be an object');
    }

    const source = sourceSystem || rawPayload.source_system || 'external_system';
    const externalId = String(
      rawPayload.external_object_id ||
      rawPayload.id ||
      rawPayload.document_id ||
      rawPayload.external_id ||
      ''
    ).trim();

    if (!externalId) {
      throw new Error('External document payload missing required external_object_id or id');
    }

    const docName = String(
      rawPayload.document_name ||
      rawPayload.name ||
      rawPayload.filename ||
      rawPayload.title ||
      `Imported Document (${externalId})`
    ).trim();

    // Preserve raw content verbatim (crucial for legal grounding & audit)
    const contentText = typeof rawPayload.content_text === 'string'
      ? rawPayload.content_text
      : (typeof rawPayload.text === 'string' ? rawPayload.text : (rawPayload.body || ''));

    const externalVersion = rawPayload.external_version !== undefined && rawPayload.external_version !== null
      ? String(rawPayload.external_version)
      : (rawPayload.version ? String(rawPayload.version) : '1');

    let effectiveDate = null;
    if (rawPayload.effective_date) {
      const d = new Date(rawPayload.effective_date);
      if (!isNaN(d.getTime())) effectiveDate = d.toISOString();
    }

    let expirationDate = null;
    if (rawPayload.expiration_date) {
      const d = new Date(rawPayload.expiration_date);
      if (!isNaN(d.getTime())) expirationDate = d.toISOString();
    }

    return {
      source_system: source,
      external_object_id: externalId,
      external_version: externalVersion,
      document_name: docName,
      document_type: rawPayload.document_type || 'contract',
      content_text: contentText,
      effective_date: effectiveDate,
      expiration_date: expirationDate,
      metadata: typeof rawPayload.metadata === 'object' && rawPayload.metadata !== null
        ? rawPayload.metadata
        : {}
    };
  },

  /**
   * Normalizes an external event payload into canonical format.
   */
  normalizeEvent: (sourceSystem, rawPayload = {}) => {
    if (!rawPayload || typeof rawPayload !== 'object') {
      throw new Error('Event payload must be an object');
    }

    const eventId = String(
      rawPayload.event_id ||
      rawPayload.id ||
      rawPayload.eventId ||
      ''
    ).trim();

    if (!eventId) {
      throw new Error('External event payload missing required event_id');
    }

    const eventType = String(
      rawPayload.event_type ||
      rawPayload.type ||
      rawPayload.eventType ||
      'UNKNOWN_EVENT'
    ).trim().toUpperCase();

    const externalId = String(
      rawPayload.external_object_id ||
      rawPayload.object_id ||
      rawPayload.document_id ||
      ''
    ).trim();

    let occurredAt = new Date().toISOString();
    if (rawPayload.occurred_at || rawPayload.timestamp) {
      const d = new Date(rawPayload.occurred_at || rawPayload.timestamp);
      if (!isNaN(d.getTime())) occurredAt = d.toISOString();
    }

    return {
      event_id: eventId,
      event_type: eventType,
      source_system: sourceSystem || rawPayload.source_system || 'external_system',
      external_object_id: externalId || null,
      external_version: rawPayload.external_version ? String(rawPayload.external_version) : null,
      occurred_at: occurredAt,
      metadata: typeof rawPayload.metadata === 'object' && rawPayload.metadata !== null
        ? rawPayload.metadata
        : {}
    };
  }
};

module.exports = IntegrationNormalizationService;
