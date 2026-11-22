// Everything that exists for one video, asked once and shared by the list
// the player sees, the translation and the next-episode job:
//   available  every subtitle file OpenSubtitles lists
//   extra      target-language files from a language-specific source
//   existing   subtitles that already exist in the target language
//   sources    the files worth translating from, best first

import { config } from '../config.js';
import { target } from '../language/target.js';
import { logEvent } from '../util/log.js';
import { listOpenSubtitles } from './opensubtitlesV3.js';
import { listWizdom } from './wizdom.js';
import { pickExisting } from './existingTranslations.js';
import { pickSources } from './pickSources.js';

const MAX_EXISTING = 3;

/**
 * Sources that carry one language only. Today there is one: Wizdom, for
 * Hebrew. A source for another language would be added here.
 * It is a second opinion; when it is down the addon behaves as if it had nothing.
 */
export async function listLanguageSource(query) {
  if (target.code !== 'heb') return [];
  try {
    return await listWizdom(query);
  } catch (error) {
    logEvent('wizdom-failed', { videoId: query.videoId, error: error.message });
    return [];
  }
}

/**
 * @param {{type:'movie'|'series', videoId:string, extra?:string}} query
 * @returns {Promise<{available:Array, extra:Array, existing:Array<{url:string}>, sources:Array<{url:string,lang:string}>}>}
 */
export async function findSubtitles(query) {
  const [available, extra] = await Promise.all([listOpenSubtitles(query), listLanguageSource(query)]);
  return {
    available,
    extra,
    existing: pickExisting(available, extra, { max: MAX_EXISTING, codes: target.codes }),
    sources: pickSources(available, config.maxVariants, target.codes),
  };
}
