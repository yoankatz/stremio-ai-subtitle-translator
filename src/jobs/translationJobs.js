// One translation job per source file. A job started when the player asked
// for the subtitle list is the same job the subtitle download then waits on,
// so the work is never done twice.

import { cacheGet, cacheSet } from '../cache/diskCache.js';
import { sourceKey } from '../sources/sourceRef.js';
import { downloadSource } from '../sources/downloadSource.js';
import { parseSubtitles } from '../srt/parse.js';
import { buildSrt } from '../srt/build.js';
import { wrapLine } from '../srt/wrap.js';
import { translateTexts } from '../translate/index.js';
import { target } from '../language/target.js';
import { geminiUsable } from '../translate/geminiGate.js';
import { logEvent } from '../util/log.js';
import { finishContext, startContext } from './translationContext.js';
import { isImprovement, needsUpgrade } from './upgradePolicy.js';

const MAX_CUES = 6_000;

const inFlight = new Map(); // job key -> Promise

export const jobsInFlight = () => inFlight.size;

/**
 * Downloads and translates a source file. Does not touch the cache.
 * @param {{url:string, lang:string}} source
 * @param {'interactive'|'background'} priority
 * @param {{type:string, videoId:string}|null} video the video the file belongs to, when known
 */
async function produce(source, priority, video) {
  const startedAt = Date.now();
  // The context lookups do not need the cues, so they run during the download.
  const started = startContext(video);
  const cues = parseSubtitles(await downloadSource(source.url));
  if (!cues.length) throw new Error('source subtitle has no readable lines');
  if (cues.length > MAX_CUES) throw new Error('source subtitle has too many lines');

  const { summary, ...context } = await finishContext(started, cues, priority);
  const { texts, provider, counts } = await translateTexts(cues.map((cue) => cue.text), { sourceLang: source.lang, priority, context });
  const srt = buildSrt(cues.map((cue, i) => ({ ...cue, text: wrapLine(texts[i]) })), { rtl: target.rtl });
  const meta = { provider, counts, context: summary, cues: cues.length, sourceLang: source.lang, targetLang: target.code, createdAt: new Date().toISOString() };
  return { srt, meta, ms: Date.now() - startedAt };
}

const describe = (meta) => ({
  provider: meta.provider,
  ...meta.counts,
  cues: meta.cues,
  hints: meta.context.hints.join(',') || 'none',
  cast: meta.context.characters,
  ...(meta.context.incomplete ? { contextIncomplete: true } : {}),
});

async function translateAndStore(source, key, priority, video) {
  const { srt, meta, ms } = await produce(source, priority, video);
  await cacheSet(key, srt, meta);
  logEvent('translated', { key, ...describe(meta), ms, priority });
  return { srt, meta };
}

/**
 * Redoes a stored file in the background. The stored file is replaced only
 * if the new one is better - a redo that ran into the rate limit must not
 * turn a mostly-Gemini file into a Google one. Either way the attempt is
 * recorded, which is what stops the redo from repeating for ever.
 */
async function upgrade(source, key, stored, video) {
  const attempt = { upgradeAttempts: (stored.meta.upgradeAttempts || 0) + 1, lastUpgradeAt: new Date().toISOString() };
  let fresh;
  try {
    fresh = await produce(source, 'background', video);
  } catch (error) {
    await cacheSet(key, stored.srt, { ...stored.meta, ...attempt });
    throw error;
  }

  const improved = isImprovement(fresh.meta, stored.meta);
  const kept = improved ? fresh : stored;
  await cacheSet(key, kept.srt, { ...kept.meta, ...attempt });
  logEvent(improved ? 'upgraded' : 'upgrade-kept-stored', { key, ...describe(fresh.meta), ms: fresh.ms, attempt: attempt.upgradeAttempts });
}

function track(jobKey, work) {
  const job = work().finally(() => inFlight.delete(jobKey));
  // Background callers do not await; without this a failure would be an
  // unhandled rejection. Awaiting callers still receive the error.
  job.catch((error) => logEvent('translation-failed', { key: jobKey, error: error.message }));
  inFlight.set(jobKey, job);
  return job;
}

export const getCachedTranslation = (source) => cacheGet(sourceKey(source));

/**
 * Returns the finished translation, starting or joining a job as needed.
 * @param {{url:string, lang:string}} source
 * @param {{priority?:'interactive'|'background', video?:{type:string, videoId:string}|null}} [options]
 */
export function ensureTranslation(source, { priority = 'interactive', video = null } = {}) {
  const key = sourceKey(source);
  return (
    inFlight.get(key) ??
    track(key, async () => (await cacheGet(key)) ?? translateAndStore(source, key, priority, video))
  );
}

/**
 * Called when a video is opened. A file not translated yet starts now, so it
 * is on its way before the player asks for it. A file stored earlier is
 * redone in the background if the policy says it is worth it; whoever is
 * watching now keeps the stored one.
 *
 * The decision is taken from what was stored before this call. Chaining the
 * redo after ensureTranslation would either never run (the job is already
 * registered) or redo a translation that finished a second ago.
 */
export async function warmTranslation(source, video = null) {
  const key = sourceKey(source);
  if (inFlight.has(key)) return;

  const stored = await cacheGet(key);
  if (!stored) {
    ensureTranslation(source, { priority: 'interactive', video });
    return;
  }

  const upgradeKey = `${key}:upgrade`;
  if (!geminiUsable() || inFlight.has(upgradeKey) || !needsUpgrade(stored.meta)) return;
  track(upgradeKey, () => upgrade(source, key, stored, video));
}
