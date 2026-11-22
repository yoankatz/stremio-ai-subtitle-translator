// Subtitle databases are keyed by IMDb id, but anime catalogs hand out
// kitsu:/mal:/anilist:/anidb: ids with absolute episode numbers. The public
// Anime Kitsu addon already publishes the mapping per episode, so we ask it.

import { fetchWithTimeout } from '../util/fetchWithTimeout.js';
import { logEvent } from '../util/log.js';

const META_BASE = 'https://anime-kitsu.strem.fun/meta';
const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

const cache = new Map(); // "kitsu:46917" -> { at, meta }

async function fetchMeta(prefix, animeId, hasEpisode) {
  // The same anime id can be listed as a series or a movie; try the likely one first.
  for (const type of hasEpisode ? ['series', 'movie'] : ['movie', 'series']) {
    try {
      const res = await fetchWithTimeout(`${META_BASE}/${type}/${prefix}:${animeId}.json`, { timeoutMs: 8_000 });
      if (!res.ok) continue;
      const meta = (await res.json())?.meta;
      if (meta?.imdb_id) return meta;
    } catch (error) {
      logEvent('anime-meta-error', { id: `${prefix}:${animeId}`, error: error.message });
    }
  }
  return null;
}

async function loadMeta(prefix, animeId, hasEpisode) {
  const key = `${prefix}:${animeId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.meta;

  const meta = await fetchMeta(prefix, animeId, hasEpisode);
  if (meta) {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), meta });
  }
  return meta;
}

/** @returns {Promise<{imdbId:string, season:number|null, episode:number|null} | null>} */
export async function resolveAnimeToImdb({ prefix, animeId, episode }) {
  const meta = await loadMeta(prefix, animeId, episode !== null);
  if (!meta) return null;
  if (episode === null) return { imdbId: meta.imdb_id, season: null, episode: null };

  const video = (meta.videos || []).find((v) => String(v.id).endsWith(`:${episode}`) || v.episode === episode);
  const mapped = Number.isInteger(video?.imdbSeason) && Number.isInteger(video?.imdbEpisode);
  // Unmapped episodes (very new shows) fall back to "season 1, same number".
  return {
    imdbId: video?.imdb_id || meta.imdb_id,
    season: mapped ? video.imdbSeason : 1,
    episode: mapped ? video.imdbEpisode : episode,
  };
}
