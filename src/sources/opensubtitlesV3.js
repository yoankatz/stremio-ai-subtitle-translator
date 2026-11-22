// Source subtitles come from Stremio's own OpenSubtitles v3 addon: free, no
// key, and its files are already re-encoded to UTF-8.

import { fetchWithTimeout } from '../util/fetchWithTimeout.js';

const BASE = 'https://opensubtitles-v3.strem.io/subtitles';

// One opening of a video asks for the same list several times (the list the
// player sees, the hint files for the translation, the next episode).
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 200;
const cache = new Map(); // request path -> { at, subtitles }

/**
 * @param {{type:'movie'|'series', videoId:string, extra?:string}} query
 *   `extra` is Stremio's raw "filename=..&videoHash=..&videoSize=.." segment;
 *   passing it on lets OpenSubtitles match the exact release (best sync).
 * @returns {Promise<Array<{id:string,url:string,lang:string,m?:string}>>}
 */
export async function listOpenSubtitles({ type, videoId, extra }) {
  const path = `${type}/${videoId}${extra ? `/${extra}` : ''}`;
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.subtitles;

  const res = await fetchWithTimeout(`${BASE}/${path}.json`, { timeoutMs: 9_000 });
  if (!res.ok) throw new Error(`OpenSubtitles list HTTP ${res.status}`);

  const listed = (await res.json())?.subtitles;
  const subtitles = Array.isArray(listed)
    ? listed.filter((s) => typeof s?.url === 'string' && typeof s?.lang === 'string')
    : [];

  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(path, { at: Date.now(), subtitles });
  return subtitles;
}
