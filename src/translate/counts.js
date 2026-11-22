// Where each line of a translated file came from. Stored with the file, so
// later it is possible to tell a clean Gemini translation from one that was
// patched by the fallback and is worth redoing.

/**
 * gemini - translated by Gemini
 * google - translated by the Google Translate fallback
 * source - both translators failed; the line was left in the source language
 * kept   - nothing to translate (no words), copied as it is
 */
export const newCounts = () => ({ gemini: 0, google: 0, source: 0, kept: 0 });

/** @returns {'gemini'|'google'|'mixed'} */
export function providerOf(counts) {
  const fallback = counts.google + counts.source;
  if (fallback === 0) return 'gemini';
  return counts.gemini === 0 ? 'google' : 'mixed';
}
