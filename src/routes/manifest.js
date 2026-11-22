// What Stremio reads when the addon is installed: which content it serves
// subtitles for and under which id families.

import { ADDON_VERSION, config } from '../config.js';
import { target } from '../language/target.js';

export const manifest = Object.freeze({
  id: config.addonId || `community.ai-subtitles.${target.code}`,
  version: ADDON_VERSION,
  name: target.strings.addonName,
  description: target.strings.description,
  types: ['movie', 'series', 'anime'],
  resources: [
    {
      name: 'subtitles',
      types: ['movie', 'series', 'anime'],
      idPrefixes: ['tt', 'kitsu:', 'mal:', 'anilist:', 'anidb:'],
    },
  ],
  catalogs: [],
  behaviorHints: { configurable: false, configurationRequired: false },
});
