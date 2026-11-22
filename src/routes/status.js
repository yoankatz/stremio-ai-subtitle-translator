// Owner-only diagnostics (behind the secret): is Gemini connected, how many
// translations are stored, what happened recently. Never returns the key.

import { ADDON_VERSION } from '../config.js';
import { target } from '../language/target.js';
import { cacheStats } from '../cache/diskCache.js';
import { jobsInFlight } from '../jobs/translationJobs.js';
import { translateTexts, translatorStatus } from '../translate/index.js';
import { recentEvents } from '../util/log.js';

const describeTarget = () => ({ code: target.code, name: target.name, rtl: target.rtl });

export async function status() {
  return {
    version: ADDON_VERSION,
    uptimeSeconds: Math.round(process.uptime()),
    target: describeTarget(),
    translator: translatorStatus(),
    cache: await cacheStats(),
    jobsInFlight: jobsInFlight(),
    recent: recentEvents().slice(0, 40),
  };
}

/** Translates two fixed lines, to prove the configured translator works. */
export async function selfTest() {
  const startedAt = Date.now();
  try {
    const sample = ['Hello, how are you today?', "I'll be right back."];
    const { texts, provider } = await translateTexts(sample, { sourceLang: 'eng', priority: 'interactive' });
    return { ok: true, target: describeTarget(), provider, ms: Date.now() - startedAt, texts, translator: translatorStatus() };
  } catch (error) {
    return { ok: false, target: describeTarget(), ms: Date.now() - startedAt, error: error.message, translator: translatorStatus() };
  }
}
