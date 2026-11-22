// Existing Hebrew subtitles from Wizdom, the largest Israeli subtitle
// collection, through its public Stremio addon. It understands IMDb ids only,
// which is why this server asks it itself: a video opened from an anime
// catalogue reaches the Wizdom addon with an id it cannot use.

import { config } from '../config.js';
import { fetchWithTimeout } from '../util/fetchWithTimeout.js';

/**
 * @param {{type:'movie'|'series', videoId:string, extra?:string}} query same shape as the OpenSubtitles query
 * @returns {Promise<Array<{url:string, lang:'heb'}>>} empty when Wizdom has nothing
 */
export async function listWizdom({ type, videoId, extra }) {
  if (!config.wizdomBase) return [];
  const tail = extra ? `/${extra}` : '';
  const res = await fetchWithTimeout(`${config.wizdomBase}/subtitles/${type}/${videoId}${tail}.json`, { timeoutMs: 4_000 });
  if (!res.ok) throw new Error(`Wizdom list HTTP ${res.status}`);

  const subtitles = (await res.json())?.subtitles;
  return Array.isArray(subtitles)
    ? subtitles.filter((s) => typeof s?.url === 'string' && /^https:\/\//.test(s.url)).map((s) => ({ url: s.url, lang: 'heb' }))
    : [];
}
