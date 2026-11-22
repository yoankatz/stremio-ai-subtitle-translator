// A translated-subtitle URL must be self-contained: after a restart the
// server has no memory of which source file a link pointed to, or of which
// video it belongs to. So both travel inside the link (base64url), and are
// validated on the way back.

import { createHash } from 'node:crypto';
import { target } from '../language/target.js';

// Only hosts we fetch sources from. Keeps the endpoint from being used to
// make this server download arbitrary URLs.
const ALLOWED_HOST = /(^|\.)strem\.io$/;
const LANG = /^[a-z]{2,3}$/;
const VIDEO = /^(movie|series)\/tt\d+(?::\d+:\d+)?$/;

// Version of the translation method. It is part of the cache key, so a file
// stored by an older method is simply not found and gets made again by the
// current one - no stored translation outlives the method that produced it.
//   p1  first version (key had no prefix)
//   p2  gender-aware: cast list, same line in other languages, speaker/listener
const PIPELINE = 'p2';

export const encodeSource = (source) => Buffer.from(source.url, 'utf8').toString('base64url');

/** @returns {{url:string, lang:string} | null} */
export function decodeSource(encoded, lang) {
  try {
    const url = new URL(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (url.protocol !== 'https:' || !ALLOWED_HOST.test(url.hostname) || !LANG.test(lang)) return null;
    return { url: url.href, lang };
  } catch {
    return null;
  }
}

/** The video a subtitle belongs to, as it travels in the link. */
export const encodeVideo = (video) => Buffer.from(`${video.type}/${video.videoId}`, 'utf8').toString('base64url');

/** @returns {{type:'movie'|'series', videoId:string} | null} */
export function decodeVideo(encoded) {
  try {
    const text = Buffer.from(String(encoded), 'base64url').toString('utf8');
    if (!VIDEO.test(text)) return null;
    const [type, videoId] = text.split('/');
    return { type, videoId };
  } catch {
    return null;
  }
}

/**
 * What a stored translation depends on besides its source file: the method
 * and the language it was translated into. A server switched to another
 * TARGET_LANG on the same disk must not serve the old language's files.
 * Hebrew was the only target before targets existed, so its keys keep the
 * form they had then and files stored then are still found.
 */
export const keyScope = (targetCode) => (targetCode === 'heb' ? PIPELINE : `${PIPELINE}|${targetCode}`);

/** Stable cache key for a source file under the current method and target language. */
export const sourceKey = (source, targetCode = target.code) =>
  createHash('sha1').update(`${keyScope(targetCode)}|${source.url}`).digest('hex').slice(0, 24);
