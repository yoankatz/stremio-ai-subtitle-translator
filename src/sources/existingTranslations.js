// Subtitles that already exist in the target language for a video. When
// there are any, they are offered first and nothing is machine-translated
// until the viewer asks.
//
// "Existing" is all that can be said about them: nothing in the listings
// tells a professional translation from a fan's or from someone else's
// machine translation.

/**
 * @param {Array<{url:string, lang:string, m?:string}>} openSubtitles the OpenSubtitles listing
 * @param {Array<{url:string}>} extra files from a language-specific source (already in the target language)
 * @param {{max:number, codes:string[]}} options codes = the listing codes that mean the target language
 * @returns {Array<{url:string}>} best guess at "fits this video" first
 */
export function pickExisting(openSubtitles, extra, { max, codes }) {
  const inTarget = openSubtitles.filter((s) => codes.includes(s.lang));
  // m:"h" = the file was made for exactly this release, so its timing fits.
  const exact = inTarget.filter((s) => s.m === 'h');
  const others = inTarget.filter((s) => s.m !== 'h');
  // The extra source orders its own list by how well the file name matches the video.
  const ordered = [...exact, ...extra.slice(0, 1), ...others, ...extra.slice(1)];

  const seen = new Set();
  return ordered
    .filter((s) => !seen.has(s.url) && seen.add(s.url))
    .slice(0, max)
    .map((s) => ({ url: s.url }));
}
