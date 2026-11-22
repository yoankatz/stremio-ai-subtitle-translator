// What a translation is given besides the lines themselves: the show, its
// cast, and the same lines in languages that mark gender. Gathered per video,
// in two steps so the slow parts overlap with the source download:
//   startContext(video)        listings and show details (no cues needed)
//   finishContext(start, cues) hint files, lined up with the actual cues
//
// Nothing here may fail a translation. A part that cannot be had is left
// out, and "incomplete" records that a later try could do better.

import { config } from '../config.js';
import { listOpenSubtitles } from '../sources/opensubtitlesV3.js';
import { listLanguageSource } from '../sources/catalog.js';
import { loadShowContext } from '../context/showContext.js';
import { gatherHints } from '../hints/gatherHints.js';
import { logEvent } from '../util/log.js';

// Someone waiting for the subtitle gets a tighter budget than background work.
const HINT_BUDGET = {
  interactive: { attempts: 1, timeoutMs: 4_000 },
  background: { attempts: 2, timeoutMs: 8_000 },
};

const EMPTY = { alt: [], show: null, characters: [], summary: { linked: false, show: false, characters: 0, hints: [], incomplete: false } };

/** @param {{type:'movie'|'series', videoId:string}|null} video null for links that carry no video */
export function startContext(video) {
  if (!video) return null;
  const failedTo = (fallback) => () => ({ ...fallback, failed: true });
  return {
    video,
    listing: listOpenSubtitles(video).then((subtitles) => ({ subtitles, failed: false }), failedTo({ subtitles: [] })),
    // Existing files in the target language are the best hint there is, when
    // they fit. listLanguageSource never throws; it marks them as such itself.
    extra: listLanguageSource(video).then((files) => files.map((file) => ({ ...file, lang: config.targetLang }))),
    show: loadShowContext(video),
  };
}

/**
 * @param {ReturnType<typeof startContext>} started
 * @param {Array<{start:string,end:string,text:string}>} cues the cues being translated
 * @param {'interactive'|'background'} priority
 * @returns {Promise<{alt:Array, show:object|null, characters:Array, summary:object}>}
 *   alt / show / characters go to the translator; summary is stored with the file.
 */
export async function finishContext(started, cues, priority) {
  if (!started) return EMPTY;

  const [listing, extra, show] = await Promise.all([started.listing, started.extra, started.show]);
  const budget = HINT_BUDGET[priority] ?? HINT_BUDGET.interactive;
  const hints = await gatherHints(cues, [...listing.subtitles, ...extra], { maxFiles: config.hintFiles, ...budget }).catch((error) => {
    logEvent('hints-failed', { videoId: started.video.videoId, error: error.message });
    return { perLine: [], used: [], rejected: [{ transient: true }] };
  });

  const incomplete = listing.failed || show.failed || hints.rejected.some((r) => r.transient);
  return {
    alt: hints.perLine,
    show: show.show,
    characters: show.characters,
    summary: {
      linked: true,
      show: Boolean(show.show),
      characters: show.characters.length,
      hints: hints.used.map((u) => u.label),
      incomplete,
    },
  };
}
