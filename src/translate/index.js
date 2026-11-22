// Translation orchestrator: splits a file into chunks and runs them in
// parallel (that is what brings an episode down to a few seconds). What
// happens to each chunk is in translateChunk.js.

import { config } from '../config.js';
import { createSemaphore } from '../util/semaphore.js';
import { logEvent } from '../util/log.js';
import { chunk, chunkSizeFor } from './chunking.js';
import { newCounts, providerOf } from './counts.js';
import { geminiConfigured, geminiOptions } from './gemini.js';
import { geminiGateStatus, geminiUsable, geminiWithRetry } from './geminiGate.js';
import { googleFallbackEnabled, googleTranslateBatch } from './googleTranslate.js';
import { createChunkTranslator } from './translateChunk.js';

// Chunks are translated at the same time, so a chunk cannot see how the one
// before it was translated - but it is shown the source lines that led up to it.
const LINES_BEFORE = 8;

const runLimited = createSemaphore(config.concurrency);

const translateChunk = createChunkTranslator({
  gemini: geminiWithRetry,
  google: googleTranslateBatch,
  geminiUsable,
  log: logEvent,
});

export const translatorStatus = () => ({
  geminiConfigured: geminiConfigured(),
  geminiModel: config.gemini.model,
  geminiOptions: geminiOptions(),
  googleFallback: googleFallbackEnabled(),
  ...geminiGateStatus(),
});

/**
 * @param {string[]} texts cue texts in order
 * @param {object} options
 * @param {string} options.sourceLang
 * @param {'interactive'|'background'} [options.priority]
 * @param {{alt?:Array<Record<string,string>|undefined>, show?:object|null, characters?:Array}} [options.context]
 *   alt[i] holds line i in other languages; show and characters describe the video.
 * @returns {Promise<{texts:string[], provider:'gemini'|'google'|'mixed', counts:object}>}
 */
export async function translateTexts(texts, { sourceLang, priority = 'interactive', context = {} }) {
  const counts = newCounts();
  const queuePriority = priority === 'interactive' ? 'high' : 'low';
  const size = chunkSizeFor(texts.length, config.chunkSize);

  const parts = await Promise.all(
    chunk(texts, size).map((part, n) => {
      const start = n * size;
      const chunkContext = {
        show: context.show ?? null,
        characters: context.characters ?? [],
        alt: (context.alt ?? []).slice(start, start + part.length),
        before: texts.slice(Math.max(0, start - LINES_BEFORE), start),
      };
      return runLimited(() => translateChunk(part, { sourceLang, priority, counts, context: chunkContext }), { priority: queuePriority });
    }),
  );

  return { texts: parts.flat(), provider: providerOf(counts), counts };
}
