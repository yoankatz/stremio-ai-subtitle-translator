// Downloads a source subtitle file. The subtitle host sits behind a CDN that
// now and then answers a 5xx for a file that is fine a second later (seen
// from Railway: HTTP 520), so server errors and network failures are retried.

import { fetchWithTimeout, sleep } from '../util/fetchWithTimeout.js';

const MAX_BYTES = 2 * 1024 * 1024;
const RETRY_DELAYS_MS = [700, 2_000, 4_000];

class PermanentError extends Error {}

async function attempt(url) {
  const res = await fetchWithTimeout(url, { timeoutMs: 15_000 });
  // 4xx will not change on retry (file removed, bad link).
  if (res.status >= 400 && res.status < 500) throw new PermanentError(`source download HTTP ${res.status}`);
  if (!res.ok) throw new Error(`source download HTTP ${res.status}`);

  const text = await res.text();
  if (text.length > MAX_BYTES) throw new PermanentError('source subtitle is too large');
  return text;
}

export async function downloadSource(url) {
  for (let tries = 0; ; tries++) {
    try {
      return await attempt(url);
    } catch (error) {
      if (error instanceof PermanentError || tries >= RETRY_DELAYS_MS.length) throw error;
      await sleep(RETRY_DELAYS_MS[tries]);
    }
  }
}
