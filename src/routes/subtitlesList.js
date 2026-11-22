// Answers "which subtitles exist for this video?". Stremio asks this the
// moment a stream opens.
//
// Two cases:
//   - Subtitles in the target language already exist for the video: they are
//     listed first, under the language's own code. The machine translation is
//     still offered, under its own label, and is made only if the viewer
//     picks it.
//   - None exist: the machine translation is listed under the language's code
//     (so a viewer whose player is set to that language gets it
//     automatically) and starts at once - by the time the player downloads
//     the file, most of the work is done.

import { createHash } from 'node:crypto';
import { target } from '../language/target.js';
import { resolveTarget } from '../stremio/resolveTarget.js';
import { findSubtitles } from '../sources/catalog.js';
import { encodeSource, encodeVideo, sourceKey } from '../sources/sourceRef.js';
import { warmTranslation } from '../jobs/translationJobs.js';
import { scheduleNextEpisode } from '../jobs/pretranslateNext.js';
import { logEvent } from '../util/log.js';

const fileUrl = (baseUrl, source, video) =>
  `${baseUrl}/sub/${encodeSource(source)}/${source.lang}/${encodeVideo(video)}/translated.srt`;

const shortHash = (text) => createHash('sha1').update(text).digest('hex').slice(0, 12);

function warmUp(first, video, parsed) {
  // Not awaited: the list must return at once. Failures are logged by the job.
  warmTranslation(first, video).catch((error) => logEvent('warm-failed', { error: error.message }));
  scheduleNextEpisode(parsed);
}

/**
 * @param {{videoId:string, extra?:string, baseUrl:string}} request
 *   baseUrl already includes the secret segment.
 */
export async function subtitlesList({ videoId, extra, baseUrl }) {
  try {
    const resolved = await resolveTarget(videoId);
    if (!resolved) return { subtitles: [] };

    const video = { type: resolved.type, videoId: resolved.videoId };
    const found = await findSubtitles({ ...video, extra });
    const alreadyTranslated = found.existing.length > 0;
    if (!alreadyTranslated && found.sources.length) warmUp(found.sources[0], video, resolved.parsed);

    logEvent('list', { videoId, resolved: resolved.videoId, found: found.available.length, existing: found.existing.length, offered: found.sources.length });
    return {
      subtitles: [
        // The language's code is what makes Stremio pick a subtitle by
        // itself. Any other text is shown as its own entry in the language menu.
        ...found.existing.map((sub) => ({ id: `existing-${shortHash(sub.url)}`, url: sub.url, lang: target.code })),
        ...found.sources.map((source) => ({
          id: `ai-${sourceKey(source)}`,
          url: fileUrl(baseUrl, source, video),
          lang: alreadyTranslated ? target.strings.machineLabel : target.code,
        })),
      ],
    };
  } catch (error) {
    // An empty list is harmless; an error page would not be.
    logEvent('list-failed', { videoId, error: error.message });
    return { subtitles: [] };
  }
}
