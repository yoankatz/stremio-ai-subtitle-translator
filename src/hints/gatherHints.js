// Collects, for the cues being translated, the same lines in languages that
// mark gender (see languages.js). At most one file per language family; a
// file is used only if its timing demonstrably matches.

import { target as serverTarget } from '../language/target.js';
import { fetchWithTimeout } from '../util/fetchWithTimeout.js';
import { parseSubtitles } from '../srt/parse.js';
import { alignByTime } from './align.js';
import { FAMILY_ORDER, hintLanguage } from './languages.js';

// Share of cues whose start times agree once the files are shifted onto each
// other. Measured on real files: the same cut scores 0.6-0.99, a different
// cut or frame rate stays under 0.4.
const MIN_PEAK = 0.45;
const MAX_BYTES = 2 * 1024 * 1024;

const downloader = (timeoutMs) => async (url) => {
  const res = await fetchWithTimeout(url, { timeoutMs });
  if (!res.ok) throw new Error(`hint download HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('hint file too large');
  return text;
};

/** Candidates of one family, best language first, in the source's own order. */
function candidatesByFamily(subtitles, exclude, target) {
  const families = new Map();
  subtitles.forEach((sub, index) => {
    const language = hintLanguage(sub.lang, target);
    if (!language || exclude.includes(language.family) || exclude.includes(sub.lang)) return;
    if (!families.has(language.family)) families.set(language.family, []);
    families.get(language.family).push({ url: sub.url, language, index });
  });
  for (const list of families.values()) list.sort((a, b) => a.language.order - b.language.order || a.index - b.index);
  return families;
}

/** Tries a family's files in order and returns the first whose timing matches. */
async function firstMatching(candidates, baseCues, { download, attempts }) {
  const rejected = [];
  for (const candidate of candidates.slice(0, attempts)) {
    try {
      const raw = await download(candidate.url);
      if (candidate.language.usable && !candidate.language.usable(raw)) {
        rejected.push({ lang: candidate.language.code, why: 'no gender marks' });
        continue;
      }
      const aligned = alignByTime(baseCues, parseSubtitles(raw));
      if (aligned.peak >= MIN_PEAK) return { hit: { language: candidate.language, ...aligned }, rejected };
      rejected.push({ lang: candidate.language.code, why: `timing peak ${aligned.peak.toFixed(2)}` });
    } catch (error) {
      // A file that could not be fetched may be fetched next time; a file
      // that does not fit never will. The caller treats the two differently.
      rejected.push({ lang: candidate.language.code, why: error.message, transient: true });
    }
  }
  return { hit: null, rejected };
}

/**
 * @param {Array<{start:string,end:string,text:string}>} baseCues
 * @param {Array<{url:string, lang:string}>} subtitles every file listed for this video
 * @param {object} [options]
 * @param {number} [options.maxFiles] at most this many files (one per family)
 * @param {string[]} [options.exclude] family names or language codes to leave out
 * @param {number} [options.attempts] files tried per family before giving up on it
 * @param {number} [options.timeoutMs] per download
 * @param {object} [options.target] the language translated into (default: this server's)
 * @param {(url:string)=>Promise<string>} [options.download] replaces the network in tests
 * @returns {Promise<{perLine:Array<Record<string,string>|undefined>, used:Array<object>, rejected:Array<object>}>}
 *   perLine[i] maps a language label to that language's text for cue i.
 */
export async function gatherHints(
  baseCues,
  subtitles,
  { maxFiles = 3, exclude = [], attempts = 2, timeoutMs = 8_000, target = serverTarget, download = downloader(timeoutMs) } = {},
) {
  const empty = { perLine: new Array(baseCues.length).fill(undefined), used: [], rejected: [] };
  if (maxFiles <= 0) return empty;

  const families = candidatesByFamily(subtitles, exclude, target);
  const order = FAMILY_ORDER.filter((family) => families.has(family));

  const results = await Promise.all(order.map((family) => firstMatching(families.get(family), baseCues, { download, attempts })));
  const hits = results.map((r) => r.hit).filter(Boolean).slice(0, maxFiles);

  const perLine = empty.perLine;
  for (const hit of hits) {
    hit.texts.forEach((text, i) => {
      if (text) (perLine[i] ??= {})[hit.language.label] = text;
    });
  }

  return {
    perLine,
    used: hits.map((hit) => ({
      lang: hit.language.code,
      label: hit.language.label,
      peak: Number(hit.peak.toFixed(2)),
      covered: Number(hit.covered.toFixed(2)),
      offsetMs: hit.offsetMs,
    })),
    rejected: results.flatMap((r) => r.rejected),
  };
}
