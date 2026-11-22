// Fallback translator: Google Translate's public web endpoint. No key, so the
// addon works before a Gemini key is added and whenever Gemini is rate
// limited. Plainer than Gemini, blind to gender, and Google may throttle it.
// It is not an official API - GOOGLE_FALLBACK=off turns it off.

import { config } from '../config.js';
import { target } from '../language/target.js';
import { fetchWithTimeout, sleep } from '../util/fetchWithTimeout.js';
import { createSemaphore } from '../util/semaphore.js';

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const MAX_CHARS = 3_500;
const MAX_LINES = 60;
const SINGLE_LINE_PARALLEL = 5;

// Google answers 429 to bursts from shared server addresses (seen on
// Railway: five requests at once were refused, one at a time was fine). So
// requests go out two at a time across the whole process, and a refusal is
// retried patiently while still holding its slot, which slows everyone down.
const runLimited = createSemaphore(2);
const RETRY_DELAYS_MS = [1_500, 3_000, 6_000];

// The endpoint only needs the source when we are sure of it.
const toGoogleLang = (lang) => (lang === 'eng' ? 'en' : 'auto');

function post(text, sourceLang) {
  const params = new URLSearchParams({ client: 'gtx', sl: toGoogleLang(sourceLang), tl: target.google, dt: 't' });
  return fetchWithTimeout(`${ENDPOINT}?${params}`, {
    method: 'POST',
    timeoutMs: 12_000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ q: text }).toString(),
  });
}

async function postWithRetry(text, sourceLang) {
  for (let attempt = 0; ; attempt++) {
    const res = await post(text, sourceLang);
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= RETRY_DELAYS_MS.length) throw new Error(`Google Translate HTTP ${res.status}`);
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}

async function translateText(text, sourceLang) {
  const res = await runLimited(() => postWithRetry(text, sourceLang));
  const data = await res.json();
  return (data?.[0] || []).map((segment) => segment?.[0] ?? '').join('');
}

/** Groups lines so each request stays under the endpoint's size limit. */
function groupLines(lines) {
  const groups = [];
  let current = [];
  let chars = 0;
  for (const line of lines) {
    if (current.length && (current.length >= MAX_LINES || chars + line.length > MAX_CHARS)) {
      groups.push(current);
      current = [];
      chars = 0;
    }
    current.push(line);
    chars += line.length + 1;
  }
  if (current.length) groups.push(current);
  return groups;
}

async function translateOneByOne(lines, sourceLang) {
  const out = [];
  for (let i = 0; i < lines.length; i += SINGLE_LINE_PARALLEL) {
    const slice = lines.slice(i, i + SINGLE_LINE_PARALLEL);
    out.push(...(await Promise.all(slice.map((line) => translateText(line, sourceLang)))));
  }
  return out;
}

async function translateGroup(lines, sourceLang) {
  // One request per group: lines are joined with newlines and split back.
  const translated = (await translateText(lines.join('\n'), sourceLang)).split('\n').map((l) => l.trim());
  // If Google merged or split a line the alignment is lost; redo line by line.
  return translated.length === lines.length ? translated : translateOneByOne(lines, sourceLang);
}

/** Off by choice, or because the target language has no Google code. */
export const googleFallbackEnabled = () => config.googleFallback && Boolean(target.google);

/** @returns {Promise<string[]>} same length and order as `texts`. */
export async function googleTranslateBatch(texts, sourceLang) {
  if (!googleFallbackEnabled()) throw new Error('the fallback translator is switched off');
  // A cue's own line break would be mistaken for a line separator.
  const flat = texts.map((text) => text.replace(/\s*\n\s*/g, ' '));
  const out = [];
  for (const group of groupLines(flat)) out.push(...(await translateGroup(group, sourceLang)));
  return out;
}
