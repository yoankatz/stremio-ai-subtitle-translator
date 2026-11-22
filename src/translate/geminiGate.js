// Decides whether Gemini may be called right now, and retries it politely.
// Kept apart from the request code so the "is it worth calling" rules are in
// one place.

import { sleep } from '../util/fetchWithTimeout.js';
import { logEvent } from '../util/log.js';
import { geminiConfigured, geminiTranslateBatch } from './gemini.js';

// Someone is watching: give up on Gemini quickly and fall back.
// Background work: wait out the rate limit to keep the better translation.
const RETRY_DELAYS_MS = { interactive: [1_200], background: [5_000, 15_000, 30_000] };

// A bad key or blocked project fails every request the same way; pause
// Gemini for a while instead of adding a failed call to every chunk.
const PAUSE_MS = 10 * 60 * 1000;
let pausedUntil = 0;
let lastError = null;

export const geminiUsable = () => geminiConfigured() && Date.now() >= pausedUntil;

export const geminiGateStatus = () => ({ geminiPaused: Date.now() < pausedUntil, lastGeminiError: lastError });

function noteFailure(error) {
  lastError = { at: new Date().toISOString(), message: error.message };
  if ([400, 401, 403].includes(error.status)) pausedUntil = Date.now() + PAUSE_MS;
  logEvent('gemini-error', { status: error.status || 0, message: error.message });
}

/** Same arguments and result as geminiTranslateBatch, plus the priority; throws once the retries are used up. */
export async function geminiWithRetry(texts, sourceLang, priority, context) {
  const delays = RETRY_DELAYS_MS[priority] ?? RETRY_DELAYS_MS.interactive;
  for (let attempt = 0; ; attempt++) {
    try {
      return await geminiTranslateBatch(texts, sourceLang, context);
    } catch (error) {
      noteFailure(error);
      if (!error.retryable || attempt >= delays.length || !geminiUsable()) throw error;
      await sleep(delays[attempt]);
    }
  }
}
