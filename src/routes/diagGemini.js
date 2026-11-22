// Owner-only diagnostics (behind the secret): run one Gemini call with a
// prompt supplied by the caller. This is how translation prompts are tried
// and measured from the owner's computer without the API key ever leaving
// the server. Nothing here touches the translation cache.

import { config } from '../config.js';
import { finishReasonOf, geminiGenerate, geminiListModels, replyText, thinkingConfigFor } from '../translate/geminiClient.js';

const LEVELS = ['minimal', 'low', 'medium', 'high'];
const MAX_TIMEOUT_MS = 100_000;

const isText = (value) => typeof value === 'string' && value.length > 0;

/**
 * @param {{system:string, user:string, model?:string, thinkingLevel?:string,
 *          json?:boolean, responseSchema?:object, maxOutputTokens?:number, timeoutMs?:number}} body
 */
export async function diagGemini(body) {
  if (!isText(body.system) || !isText(body.user)) return { ok: false, error: 'system and user must be non-empty strings' };

  const model = isText(body.model) ? body.model : config.gemini.model;
  const generationConfig = { maxOutputTokens: Number(body.maxOutputTokens) || 16_384 };
  if (body.json !== false) generationConfig.responseMimeType = 'application/json';
  if (body.responseSchema && typeof body.responseSchema === 'object') generationConfig.responseSchema = body.responseSchema;
  if (LEVELS.includes(body.thinkingLevel)) generationConfig.thinkingConfig = thinkingConfigFor(model, body.thinkingLevel);

  const startedAt = Date.now();
  try {
    const data = await geminiGenerate({
      system: body.system,
      user: body.user,
      generationConfig,
      model,
      timeoutMs: Math.min(Number(body.timeoutMs) || 60_000, MAX_TIMEOUT_MS),
    });
    return {
      ok: true,
      model,
      ms: Date.now() - startedAt,
      text: replyText(data),
      finishReason: finishReasonOf(data),
      usage: data?.usageMetadata || null,
    };
  } catch (error) {
    return { ok: false, model, ms: Date.now() - startedAt, status: error.status || 0, error: error.message };
  }
}

/** Which models the configured key can call. */
export async function diagModels() {
  try {
    return { ok: true, current: config.gemini.model, models: await geminiListModels() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
