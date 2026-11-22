// Decides whether a stored translation should be made again.
//
// A file is worth redoing when a real share of it came from the fallback
// (Google Translate, or lines left in the source language), or when it was
// translated while part of its context could not be fetched (cast list, hint
// files). The limits below exist because redoing costs Gemini quota every
// time: without them a file that keeps coming out the same would be
// translated again on every opening, for ever.

const MIN_GOOGLE_SHARE = 0.05; // a handful of fallback lines is not worth a whole new run
const MAX_ATTEMPTS = 3;
const COOLDOWN_MS = 30 * 60 * 1000;

/** Lines that did not come from Gemini. */
export function fallbackLines(meta) {
  if (meta?.counts) return (meta.counts.google || 0) + (meta.counts.source || 0);
  // Files stored before line counts existed: only the provider name is known,
  // so anything that is not pure Gemini counts in full.
  return meta?.provider === 'gemini' ? 0 : meta?.cues || 1;
}

/** How much the translator was told: each hint file counts, then the cast list. */
const contextScore = (meta) => (meta?.context?.hints?.length || 0) * 2 + (meta?.context?.characters ? 1 : 0);

function worthRedoing(meta) {
  if ((meta?.counts?.source || 0) > 0) return true; // untranslated lines: always
  if (fallbackLines(meta) / (meta?.cues || 1) > MIN_GOOGLE_SHARE) return true; // Google lines: only in bulk
  return meta?.context?.incomplete === true; // a context lookup was failing at the time
}

export function needsUpgrade(meta, now = Date.now()) {
  if (!meta || !worthRedoing(meta)) return false;
  if ((meta.upgradeAttempts || 0) >= MAX_ATTEMPTS) return false;
  const lastTry = meta.lastUpgradeAt ? Date.parse(meta.lastUpgradeAt) : 0;
  return now - lastTry >= COOLDOWN_MS;
}

/**
 * A redo replaces the stored file only when it is better: fewer fallback
 * lines, or the same number with more context behind the translation.
 */
export function isImprovement(freshMeta, storedMeta) {
  const fresh = fallbackLines(freshMeta);
  const stored = fallbackLines(storedMeta);
  return fresh !== stored ? fresh < stored : contextScore(freshMeta) > contextScore(storedMeta);
}
