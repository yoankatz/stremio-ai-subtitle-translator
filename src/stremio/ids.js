// Stremio video ids come in two families:
//   tt1234567            (movie)      tt1234567:2:5   (series, season:episode)
//   kitsu:46917          (anime film) kitsu:46917:5   (anime, absolute episode)
// mal: / anilist: / anidb: follow the kitsu shape.

const ANIME_PREFIXES = ['kitsu', 'mal', 'anilist', 'anidb'];

const toInt = (value) => (/^\d+$/.test(value ?? '') ? Number(value) : null);

/** @returns {{kind:'imdb',imdbId:string,season:number|null,episode:number|null} | {kind:'anime',prefix:string,animeId:string,episode:number|null} | null} */
export function parseVideoId(id) {
  const parts = String(id).split(':');

  if (/^tt\d+$/.test(parts[0])) {
    const season = toInt(parts[1]);
    const episode = toInt(parts[2]);
    // A series id needs both numbers; anything else is treated as a movie.
    return season !== null && episode !== null
      ? { kind: 'imdb', imdbId: parts[0], season, episode }
      : { kind: 'imdb', imdbId: parts[0], season: null, episode: null };
  }

  if (ANIME_PREFIXES.includes(parts[0]) && /^\d+$/.test(parts[1] ?? '')) {
    return { kind: 'anime', prefix: parts[0], animeId: parts[1], episode: toInt(parts[2]) };
  }

  return null;
}

/** Id of the episode after this one, or null for movies. */
export function nextEpisodeId(parsed) {
  if (!parsed || parsed.episode === null) return null;
  return parsed.kind === 'imdb'
    ? `${parsed.imdbId}:${parsed.season}:${parsed.episode + 1}`
    : `${parsed.prefix}:${parsed.animeId}:${parsed.episode + 1}`;
}
