/**
 * Deciva — Gemini API Integration Module
 * ---------------------------------------------------------------------------
 * Uses Google Gemini API (GEMINI_API_KEY) to power the AI Chatbot and document analysis.
 * Fallbacks gracefully to local heuristic RAG engine if API key is missing or rate limited.
 */

const { ragAnswer } = require('./aiEngine');
const { getActiveGeminiModel, createLlmProvenance, createDeterministicProvenance } = require('./aiProvenance');
const { getGeminiApiKey } = require('../services/productionConfigService');

async function askGeminiOrFallback(question, documentText) {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    console.log('[AI Chat] No GEMINI_API_KEY/GOOGLE_API_KEY set. Using local heuristic RAG engine.');
    const fallbackRes = ragAnswer(question, documentText);
    return {
      ...fallbackRes,
      engine: 'deterministic',
      provider: null,
      model: null,
      fallbackUsed: true
    };
  }

  // Canonical single configured model target (no hidden multi-model retry drift)
  const configuredModel = getActiveGeminiModel();

  const prompt = `You are Deciva, an elite legal intelligence copilot.
Analyze the following document text and answer the user's question accurately, clearly, and concisely.

DOCUMENT TEXT:
${documentText.slice(0, 15000)}

USER QUESTION:
${question}

Provide a direct, authoritative legal answer based strictly on the document text.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${configuredModel}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024
        }
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (response.ok) {
      const data = await response.json();
      const answerText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (answerText) {
        const hasDocText = Boolean(documentText && documentText.trim().length > 0);
        const prov = createLlmProvenance({
          provider: 'gemini',
          model: configuredModel,
          grounded: hasDocText,
          evidence: []
        });

        return {
          answer: answerText.trim(),
          engine: 'llm',
          provider: 'gemini',
          model: configuredModel,
          grounded: prov.grounded,
          groundingStatus: prov.grounded ? 'GROUNDED' : 'INSUFFICIENT_EVIDENCE',
          confidence: {
            score: null,
            methodology: 'not_available'
          },
          confidenceScore: null,
          sources: [],
          provenance: prov,
          fallbackUsed: false
        };
      }
    } else {
      const errorText = await response.text();
      console.warn(`[Gemini API] Model ${configuredModel} responded with status ${response.status}: ${errorText.slice(0, 200)}`);
    }
  } catch (err) {
    console.error(`[Gemini API Error] (${configuredModel}):`, err.message);
  }

  // Fallback to deterministic local RAG engine if API call fails or quota exceeded
  console.log('[AI Chat] Gemini API unavailable/quota exceeded. Falling back to local RAG engine.');
  const fallbackResult = ragAnswer(question, documentText);
  return {
    ...fallbackResult,
    engine: 'deterministic',
    provider: null,
    model: null,
    fallbackUsed: true
  };
}

module.exports = {
  askGeminiOrFallback
};
