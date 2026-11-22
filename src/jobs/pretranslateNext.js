// While an episode is being watched, the next one is translated quietly so
// it is ready the moment it starts.

import { config } from '../config.js';
import { nextEpisodeId } from '../stremio/ids.js';
import { resolveTarget } from '../stremio/resolveTarget.js';
import { findSubtitles } from '../sources/catalog.js';
import { ensureTranslation } from './translationJobs.js';
import { logEvent } from '../util/log.js';

const REMEMBER_MS = 6 * 60 * 60 * 1000;
const scheduled = new Map(); // next video id -> time scheduled

function alreadyScheduled(videoId) {
  const now = Date.now();
  for (const [id, at] of scheduled) if (now - at > REMEMBER_MS) scheduled.delete(id);
  if (scheduled.has(videoId)) return true;
  scheduled.set(videoId, now);
  return false;
}

async function pretranslate(videoId) {
  const target = await resolveTarget(videoId);
  if (!target) return;
  const video = { type: target.type, videoId: target.videoId };
  // No release hash is known yet, so this takes OpenSubtitles' default order -
  // the same first choice the player will be offered unless a hash match exists.
  const found = await findSubtitles(video);
  // An episode that already has Hebrew is not machine-translated ahead of time.
  if (found.existing.length || !found.sources.length) return;
  await ensureTranslation(found.sources[0], { priority: 'background', video });
}

export function scheduleNextEpisode(parsed) {
  const nextId = nextEpisodeId(parsed);
  if (!nextId || alreadyScheduled(nextId)) return;

  setTimeout(() => {
    pretranslate(nextId).catch((error) => logEvent('pretranslate-failed', { videoId: nextId, error: error.message }));
  }, config.pretranslateDelayMs).unref();
}
