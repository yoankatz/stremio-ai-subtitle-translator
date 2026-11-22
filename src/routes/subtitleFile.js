// Serves the translated subtitle file.
//
// TV players download a subtitle once and keep whatever came back, so a
// "still translating" placeholder would stay on screen for the whole
// episode. Instead the request is held open until the real file is ready.
// Two things keep the player from giving up while it waits:
//   1. headers leave immediately (Stremio's own server allows 10 s for them);
//   2. a blank line is sent every couple of seconds, so no read timeout
//      fires. Blank lines before the first cue are valid in SRT.

import { config } from '../config.js';
import { target } from '../language/target.js';
import { CORS, SRT_TYPE, sendSrt, sendText } from '../http/respond.js';
import { decodeSource, decodeVideo } from '../sources/sourceRef.js';
import { ensureTranslation, getCachedTranslation } from '../jobs/translationJobs.js';
import { needsUpgrade } from '../jobs/upgradePolicy.js';
import { noticeSrt } from '../srt/build.js';
import { logEvent } from '../util/log.js';

const HELD_HEADERS = {
  ...CORS,
  'Content-Type': SRT_TYPE,
  'Cache-Control': 'no-store',
  'X-Accel-Buffering': 'no', // ask reverse proxies not to buffer the trickle
};

// A file that is about to be made again must not sit in a client's cache for
// a day, or the better version would not be seen.
const cacheControlFor = (meta) => `public, max-age=${needsUpgrade(meta) ? 300 : 86_400}`;

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('translation timed out')), ms).unref())]);

async function holdUntilReady(res, source, video) {
  res.writeHead(200, HELD_HEADERS);
  res.write('\n'); // first byte now, so every proxy on the way flushes the headers

  const keepAlive = setInterval(() => res.write('\n'), config.keepAliveMs);
  res.on('close', () => clearInterval(keepAlive));

  try {
    const { srt } = await withTimeout(ensureTranslation(source, { priority: 'interactive', video }), config.holdTimeoutMs);
    res.end(srt);
  } catch (error) {
    logEvent('file-failed', { error: error.message });
    // The viewer sees this as the only subtitle line, so it says what to do.
    res.end(noticeSrt(target.strings.failedNotice, { rtl: target.rtl }));
  } finally {
    clearInterval(keepAlive);
  }
}

/**
 * @param {{encodedSource:string, lang:string, encodedVideo?:string}} link
 *   lang is the SOURCE file's language. encodedVideo names the video the file
 *   belongs to. It is what lets a translation started from the link alone
 *   (after a restart, or when the viewer picks the machine translation
 *   later) still get its context. Links issued before it existed do without.
 */
export async function subtitleFile(req, res, { encodedSource, lang, encodedVideo }) {
  const source = decodeSource(encodedSource, lang);
  if (!source) return sendText(res, 400, 'bad subtitle reference');
  const video = encodedVideo ? decodeVideo(encodedVideo) : null;

  const cached = await getCachedTranslation(source);
  if (cached) return sendSrt(res, cached.srt, { 'Cache-Control': cacheControlFor(cached.meta) });

  // A HEAD probe must not start a held download.
  if (req.method === 'HEAD') return sendSrt(res, '', { 'Cache-Control': 'no-store' });
  return holdUntilReady(res, source, video);
}
