// What is being watched, by IMDb id: title, year, genres and the episode's
// own title. Comes from Stremio's Cinemeta, the same catalogue the player uses.

import { fetchWithTimeout } from '../util/fetchWithTimeout.js';

const BASE = 'https://v3-cinemeta.strem.io/meta';
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;

const cache = new Map(); // "series/tt123" -> { at, meta }

async function loadMeta(type, imdbId) {
  const key = `${type}/${imdbId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.meta;

  const res = await fetchWithTimeout(`${BASE}/${key}.json`, { timeoutMs: 5_000 });
  if (!res.ok) throw new Error(`Cinemeta HTTP ${res.status}`);
  const meta = (await res.json())?.meta || null;

  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), meta });
  return meta;
}

const firstYear = (meta) => Number(/\d{4}/.exec(String(meta?.year ?? meta?.releaseInfo ?? ''))?.[0]) || null;

/**
 * @param {{type:'movie'|'series', imdbId:string, season:number|null, episode:number|null}} video
 * @returns {Promise<{title:string, year:number|null, genres:string[], season?:number, episode?:number, episodeTitle?:string} | null>}
 */
export async function fetchTitle({ type, imdbId, season, episode }) {
  const meta = await loadMeta(type, imdbId);
  if (!meta?.name) return null;

  const info = { title: meta.name, year: firstYear(meta), genres: meta.genres || meta.genre || [] };
  if (season === null || episode === null) return info;

  const video = (meta.videos || []).find((v) => v.season === season && (v.episode ?? v.number) === episode);
  const episodeTitle = video?.name || video?.title;
  return { ...info, season, episode, ...(episodeTitle ? { episodeTitle } : {}) };
}
