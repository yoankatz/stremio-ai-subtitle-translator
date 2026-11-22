// The cast of an anime with each character's gender, from AniList (free, no
// key). English subtitles never say whether "you" is a man or a woman; a
// name in the dialogue plus this list often does.

import { fetchWithTimeout } from '../util/fetchWithTimeout.js';

const ENDPOINT = 'https://graphql.anilist.co';
const TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 60 * 60 * 1000; // a failed lookup is retried sooner
const MAX_ENTRIES = 300;
const MAX_CHARACTERS = 30;

// Several results, most popular first: the top search hit for a film title
// can be a commercial or a special that shares its name and has two
// characters, while the film itself is second.
const QUERY = `query($search:String){ Page(perPage:6){ media(search:$search, type:ANIME, sort:[POPULARITY_DESC]){
  title{ romaji english } synonyms
  characters(sort:[ROLE,RELEVANCE], perPage:${MAX_CHARACTERS}){ edges{ node{ name{ full } gender } } }
} } }`;

const cache = new Map(); // normalised title -> { at, characters }

const normalise = (title) => String(title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Catalogues decorate titles ("A Silent Voice: The Movie", "Your Name.");
 * AniList finds nothing for the decorated form. Tried in order.
 */
export function titleVariants(title) {
  const plain = String(title).trim();
  const beforeSubtitle = plain.split(/\s*[:(–—]\s*|\s+-\s+/)[0];
  return [...new Set([plain, plain.replace(/[.!?]+$/, ''), beforeSubtitle].map((t) => t.trim()).filter((t) => t.length > 1))];
}

/**
 * A search returns its best guesses even for a title AniList does not have.
 * Accept a result only if one of its names is the title asked for, or one
 * contains the other (season suffixes, subtitles).
 */
function sameShow(media, wanted) {
  const want = normalise(wanted);
  if (!want) return false;
  return [media?.title?.english, media?.title?.romaji, ...(media?.synonyms || [])]
    .filter(Boolean)
    .map(normalise)
    .some((name) => name === want || (name.length > 5 && (name.includes(want) || want.includes(name))));
}

const GENDER = { male: 'm', female: 'f' };

function charactersOf(media) {
  return (media?.characters?.edges || [])
    .map((edge) => ({ name: edge?.node?.name?.full, gender: GENDER[String(edge?.node?.gender || '').toLowerCase()] }))
    .filter((character) => character.name && character.gender);
}

async function search(title) {
  const res = await fetchWithTimeout(ENDPOINT, {
    method: 'POST',
    timeoutMs: 5_000,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { search: title } }),
  });
  // AniList answers 404 when a search has no result at all.
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  return (await res.json())?.data?.Page?.media || [];
}

async function lookup(title) {
  for (const variant of titleVariants(title)) {
    const match = (await search(variant)).find((media) => sameShow(media, variant));
    if (match) return charactersOf(match);
  }
  return [];
}

/** @returns {Promise<Array<{name:string, gender:'m'|'f'}>>} empty when unknown */
export async function fetchCharacters(title) {
  const key = normalise(title);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.characters.length ? TTL_MS : MISS_TTL_MS)) return hit.characters;

  const characters = await lookup(title);
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), characters });
  return characters;
}
