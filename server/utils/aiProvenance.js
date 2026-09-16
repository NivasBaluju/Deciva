/**
 * Deciva — Standard AI Provenance Normalizer (Node.js)
 * ---------------------------------------------------------------------------
 * Enforces truthful, auditable AI metadata across all services and endpoints.
 * 
 * CORE RULES:
 * 1. A number is NOT confidence merely because we call it confidence.
 * 2. LLM confidence is only populated if genuinely calibrated and emitted by the provider;
 *    otherwise { score: null, methodology: "not_available" }.
 * 3. Retrieval similarity is represented as retrieval_score / retrieval_methodology,
 *    NEVER relabeled as confidence.score.
 * 4. Deterministic fallbacks must identify engine = "deterministic", provider = null, model = null.
 * 5. Secret keys/credentials must NEVER appear in provenance metadata.
 */

const { getActiveGeminiModel } = require('../services/productionConfigService');

/**
 * Creates a normalized AI provenance record.
 */
function createProvenance({
  engine = 'deterministic',
  provider = null,
  model = null,
  grounded = false,
  confidenceScore = null,
  confidenceMethodology = 'not_available',
  retrievalScore = null,
  retrievalMethodology = null,
  evidence = [],
  fallback = false
} = {}) {
  // Normalize engine: 'llm', 'deterministic', 'hybrid'
  const validEngines = ['llm', 'deterministic', 'hybrid'];
  const normalizedEngine = validEngines.includes(engine) ? engine : 'deterministic';

  // Sanitized evidence: verify it's an array and strip sensitive payload
  const sanitizedEvidence = Array.isArray(evidence) ? evidence.map(item => {
    if (typeof item === 'string') return { text: item.slice(0, 500) };
    if (item && typeof item === 'object') {
      const { document_id, documentId, page, pageRef, segment_id, segmentId, text, similarity, score } = item;
      return {
        document_id: document_id || documentId || null,
        page: page !== undefined ? page : (pageRef !== undefined ? pageRef : null),
        segment_id: segment_id || segmentId || null,
        text: typeof text === 'string' ? text.slice(0, 500) : '',
        similarity: typeof similarity === 'number' ? similarity : (typeof score === 'number' ? score : null)
      };
    }
    return null;
  }).filter(Boolean) : [];

  const isGrounded = Boolean(grounded && sanitizedEvidence.length > 0);

  return {
    engine: normalizedEngine,
    provider: normalizedEngine === 'deterministic' ? null : (provider || 'gemini'),
    model: normalizedEngine === 'deterministic' ? null : (model || getActiveGeminiModel()),
    grounded: isGrounded,
    confidence: {
      score: typeof confidenceScore === 'number' && !isNaN(confidenceScore) ? confidenceScore : null,
      methodology: confidenceMethodology || (typeof confidenceScore === 'number' ? 'calibrated_model_score' : 'not_available')
    },
    retrieval_score: typeof retrievalScore === 'number' && !isNaN(retrievalScore) ? retrievalScore : null,
    retrieval_methodology: retrievalMethodology || (typeof retrievalScore === 'number' ? 'cosine_similarity' : null),
    evidence: sanitizedEvidence,
    fallback: Boolean(fallback)
  };
}

/**
 * Provenance for purely deterministic heuristics, regex, or rule-based logic.
 */
function createDeterministicProvenance({
  methodology = 'deterministic_rule_based',
  evidence = [],
  fallback = false,
  retrievalScore = null,
  retrievalMethodology = null
} = {}) {
  return createProvenance({
    engine: 'deterministic',
    provider: null,
    model: null,
    grounded: Array.isArray(evidence) && evidence.length > 0,
    confidenceScore: null,
    confidenceMethodology: methodology,
    retrievalScore,
    retrievalMethodology,
    evidence,
    fallback
  });
}

/**
 * Provenance for pure external LLM calls.
 */
function createLlmProvenance({
  provider = 'gemini',
  model = null,
  grounded = false,
  evidence = [],
  confidenceScore = null,
  methodology = 'not_available'
} = {}) {
  return createProvenance({
    engine: 'llm',
    provider,
    model: model || getActiveGeminiModel(),
    grounded,
    confidenceScore,
    confidenceMethodology: methodology,
    evidence,
    fallback: false
  });
}

/**
 * Provenance for hybrid workflows (e.g. TF-IDF retrieval + LLM synthesis, or LLM proposal + diff redline).
 */
function createHybridProvenance({
  provider = 'gemini',
  model = null,
  grounded = true,
  evidence = [],
  confidenceScore = null,
  methodology = 'not_available',
  retrievalScore = null,
  retrievalMethodology = 'cosine_similarity',
  fallback = false
} = {}) {
  return createProvenance({
    engine: 'hybrid',
    provider,
    model: model || getActiveGeminiModel(),
    grounded,
    confidenceScore,
    confidenceMethodology: methodology,
    retrievalScore,
    retrievalMethodology,
    evidence,
    fallback
  });
}

module.exports = {
  getActiveGeminiModel,
  createProvenance,
  createDeterministicProvenance,
  createLlmProvenance,
  createHybridProvenance
};
