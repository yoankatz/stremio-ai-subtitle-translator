// Raw calls to the Gemini API. Knows the endpoint, the key header and how to
// turn a failure into a GeminiError; knows nothing about subtitles. The key
// (GEMINI_API_KEY, supplied by the owner) is never logged or returned.

import { config } from '../config.js';
import { fetchWithTimeout } from '../util/fetchWithTimeout.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Dialogue in films and anime is full of fights and insults; the default
// filters would refuse whole chunks.
const SAFETY = ['HARASSMENT', 'HATE_SPEECH', 'SEXUALLY_EXPLICIT', 'DANGEROUS_CONTENT'].map((name) => ({
  category: `HARM_CATEGORY_${name}`,
  threshold: 'BLOCK_NONE',
}));

export class GeminiError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.retryable = retryable;
  }
}

export const geminiConfigured = () => config.gemini.apiKey.length > 0;

/**
 * How much the model may reason before answering. Gemini 3 takes a level
 * ("minimal" | "low" | "medium" | "high"); older models take a token budget.
 */
export const thinkingConfigFor = (model, level) =>
  /gemini-3/.test(model) ? { thinkingLevel: level } : { thinkingBudget: level === 'minimal' ? 0 : -1 };

const headers = () => ({ 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey });

async function toError(res) {
  const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
  const retryable = res.status === 429 || res.status >= 500;
  return new GeminiError(`Gemini HTTP ${res.status}: ${body}`, { status: res.status, retryable });
}

/**
 * One generateContent call.
 * @returns {Promise<object>} the API's JSON reply
 */
export async function geminiGenerate({ system, user, generationConfig, model = config.gemini.model, timeoutMs = config.gemini.timeoutMs }) {
  const url = `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`;
  let res;
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      timeoutMs,
      headers: headers(),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig,
        safetySettings: SAFETY,
      }),
    });
  } catch (error) {
    throw new GeminiError(`Gemini network error: ${error.message}`, { retryable: true });
  }
  if (!res.ok) throw await toError(res);
  return res.json();
}

export const finishReasonOf = (data) => data?.candidates?.[0]?.finishReason || '';

/** The reply's text; throws when the model returned none (blocked, empty). */
export function replyText(data) {
  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts || []).map((part) => part.text || '').join('');
  if (text) return text;
  const reason = candidate?.finishReason || data?.promptFeedback?.blockReason || 'empty';
  throw new GeminiError(`Gemini returned no text (${reason})`, { retryable: false });
}

/** Names of the models this key may call with generateContent. */
export async function geminiListModels() {
  const res = await fetchWithTimeout(`${API_BASE}/models?pageSize=200`, { timeoutMs: 15_000, headers: headers() });
  if (!res.ok) throw await toError(res);
  const models = (await res.json())?.models || [];
  return models
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name).replace(/^models\//, ''));
}
