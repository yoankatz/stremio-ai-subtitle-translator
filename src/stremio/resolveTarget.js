// Turns whatever id Stremio sent into the id the subtitle source understands.

import { parseVideoId } from './ids.js';
import { resolveAnimeToImdb } from './animeIdResolver.js';

/** @returns {Promise<{parsed:object, type:'movie'|'series', videoId:string} | null>} */
export async function resolveTarget(rawId) {
  const parsed = parseVideoId(rawId);
  if (!parsed) return null;

  const imdb = parsed.kind === 'imdb' ? parsed : await resolveAnimeToImdb(parsed);
  if (!imdb) return null;

  const isEpisode = imdb.season !== null && imdb.episode !== null;
  return {
    parsed,
    type: isEpisode ? 'series' : 'movie',
    videoId: isEpisode ? `${imdb.imdbId}:${imdb.season}:${imdb.episode}` : imdb.imdbId,
  };
}
