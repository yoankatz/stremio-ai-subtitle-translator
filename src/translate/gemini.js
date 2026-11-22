// Primary translator: one chunk of subtitle lines through Gemini.
// The API call itself is in geminiClient.js; what the model is asked, and
// why, is in genderPrompt.js.

import { config } from '../config.js';
import { target } from '../language/target.js';
import { logEvent } from '../util/log.js';
import { GeminiError, finishReasonOf, geminiGenerate, replyText, thinkingConfigFor } from './geminiClient.js';
import { buildGenderRequest, genderResponseSchema } from './genderPrompt.js';
import { lineIds } from './lineIds.js';
import { mapById, parseJsonArray } from './mapResults.js';

export { GeminiError, geminiConfigured } from './geminiClient.js';

// Optional request features. Current models accept both; if the API rejects
// the request (HTTP 400) we drop one at a time and remember the result,
// rather than failing every chunk the same way.
const features = { thinking: true, schema: true };

/** Which optional request features are still in use (shown on /status). */
export const geminiOptions = () => ({ ...features });

function generationConfig() {
  const generation = { responseMimeType: 'application/json', maxOutputTokens: 16_384 };
  if (features.schema) generation.responseSchema = genderResponseSchema(target);
  // Measured on films with a human translation to compare with: more
  // reasoning doubled the wait and did not clearly improve the result.
  if (features.thinking) generation.thinkingConfig = thinkingConfigFor(config.gemini.model, 'minimal');
  return generation;
}

/** @returns {string|null} the feature that was switched off, if any was left */
function dropOneFeature() {
  const name = features.thinking ? 'thinking' : features.schema ? 'schema' : null;
  if (name) features[name] = false;
  return name;
}

/**
 * Translates one chunk into the server's target language.
 * @param {string[]} texts
 * @param {string} sourceLang
 * @param {{alt?:Array, before?:string[], show?:object|null, characters?:Array}} [context]
 *   what the model is told besides the lines (see genderPrompt.js)
 * @returns {Promise<{lines:Array<string|undefined>, returned:number, finishReason:string}>}
 *   lines is aligned with the input; entries the model skipped are undefined.
 *   returned and finishReason are diagnostics for when lines are missing.
 */
export async function geminiTranslateBatch(texts, sourceLang, context = {}) {
  const ids = lineIds(texts.length);
  const { system, user } = buildGenderRequest({ texts, ids, sourceLang, ...context, target });

  for (;;) {
    try {
      const data = await geminiGenerate({ system, user, generationConfig: generationConfig() });
      const items = parseJsonArray(replyText(data));
      if (!items) throw new GeminiError('Gemini reply was not a JSON array', { retryable: true });
      return { lines: mapById(items, ids, target.label), returned: items.length, finishReason: finishReasonOf(data) };
    } catch (error) {
      // A 400 that is not about the key usually means an unsupported option.
      const optionRejected = error.status === 400 && !/api key/i.test(error.message);
      const dropped = optionRejected ? dropOneFeature() : null;
      if (!dropped) throw error;
      logEvent('gemini-option-dropped', { option: dropped, message: error.message });
    }
  }
}
