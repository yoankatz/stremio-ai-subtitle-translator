// Chooses which source subtitles to translate. English first (best machine
// translation quality); if a title has no English at all, any other language
// is still better than no translation.

const FALLBACK_LANGS = ['spa', 'fre', 'fra', 'ger', 'deu', 'ita', 'por', 'pob', 'dut', 'nld', 'rus', 'pol', 'tur', 'ara', 'jpn', 'kor', 'zho', 'zht', 'chi'];

// OpenSubtitles marks a file whose hash matches the playing video with m:"h".
// That file was made for this exact release, so its timing is right.
const rank = (sub) => (sub.m === 'h' ? 0 : 1);

/** Files in the target language are never a source: they are offered as they are. */
function poolFor(subtitles, targetCodes) {
  const usable = subtitles.filter((s) => !targetCodes.includes(s.lang));

  const english = usable.filter((s) => s.lang === 'eng');
  if (english.length) return english;

  for (const lang of FALLBACK_LANGS) {
    const found = usable.filter((s) => s.lang === lang);
    if (found.length) return found;
  }
  return usable;
}

/**
 * @param {Array<{url:string, lang:string, m?:string}>} subtitles
 * @param {number} max
 * @param {string[]} targetCodes the listing codes of the language being translated into
 * @returns {Array<{url:string, lang:string}>} best first, at most `max`.
 */
export function pickSources(subtitles, max, targetCodes) {
  const seen = new Set();
  return poolFor(subtitles, targetCodes)
    .map((sub, index) => ({ sub, index }))
    .sort((a, b) => rank(a.sub) - rank(b.sub) || a.index - b.index)
    .map(({ sub }) => ({ url: sub.url, lang: sub.lang }))
    .filter((s) => !seen.has(s.url) && seen.add(s.url))
    .slice(0, max);
}
