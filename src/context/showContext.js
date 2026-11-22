// Everything the translator is told about the video besides its lines:
// what it is, and who is in it. All of it is optional - a lookup that fails
// or runs late simply leaves that part out; it never fails a translation.

import { config } from '../config.js';
import { logEvent } from '../util/log.js';
import { fetchTitle } from './cinemeta.js';
import { fetchCharacters } from './anilist.js';

const BUDGET_MS = 6_000;
const NOTHING = { show: null, characters: [] };

// AniList only lists animation; asking it about a live-action series would
// at best waste a request and at worst return a namesake.
const isAnimation = (title) => title.genres.some((genre) => /animation|anime/i.test(genre));

async function lookUp(video) {
  const title = await fetchTitle(video);
  if (!title) return { ...NOTHING, failed: false };

  const { genres, ...show } = title;
  if (!config.castLookup || !isAnimation(title)) return { show, characters: [], failed: false };
  try {
    return { show, characters: await fetchCharacters(title.title), failed: false };
  } catch (error) {
    logEvent('context-failed', { part: 'characters', error: error.message });
    return { show, characters: [], failed: true };
  }
}

/**
 * @param {{type:'movie'|'series', videoId:string}} target as returned by resolveTarget
 * @returns {Promise<{show:object|null, characters:Array<{name:string, gender:'m'|'f'}>, failed:boolean}>}
 *   failed = a lookup broke or ran out of time (as opposed to "nothing is known"),
 *   so the same translation may come out better on a later try.
 */
export async function loadShowContext({ type, videoId }) {
  const [imdbId, season, episode] = videoId.split(':');
  const video = { type, imdbId, season: season ? Number(season) : null, episode: episode ? Number(episode) : null };

  const work = lookUp(video).catch((error) => {
    logEvent('context-failed', { part: 'title', videoId, error: error.message });
    return { ...NOTHING, failed: true };
  });
  const late = new Promise((resolve) => setTimeout(() => resolve({ ...NOTHING, failed: true }), BUDGET_MS).unref());
  return Promise.race([work, late]);
}
