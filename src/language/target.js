// The language this server translates into, with everything that depends on
// it: what the model is told, what the player is shown, which existing
// subtitles count as "already translated".
//
// One server = one target language (TARGET_LANG). People who want two
// languages run two servers; that keeps every stored file unambiguous.

import { config } from '../config.js';
import { PROFILES } from './profiles.js';

const defaultStrings = (name) => ({
  addonName: `AI subtitles - ${name}`,
  description: `${name} subtitles translated by AI for any movie, series or anime. Self-hosted.`,
  machineLabel: `${name} - AI translation`,
  failedNotice: 'The translation did not succeed this time. Pick another subtitle and come back, or try again in a minute.',
});

const defaultPrompt = (name) => ({
  style: `the way professional ${name} subtitles are written`,
  neutralWording: '(plural, infinitive, impersonal phrasing)',
  unknownFallback: `use the form ${name} normally uses when the gender is not known`,
  namesRule: `Write names of people and places the way ${name} subtitles normally write them, and spell each one the same way every time.`,
  bans: 'No explanations, no transliteration of ordinary words, no quotes added around a line.',
});

const defined = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== ''));

/**
 * @param {string} code TARGET_LANG
 * @param {object} [custom] values from the TARGET_LANG_* / ADDON_NAME / ... variables
 * @param {string} [custom.name] required for a language that has no built-in profile
 * @returns {Readonly<{code:string, name:string, label:string, google:string, rtl:boolean,
 *   codes:string[], strings:object, prompt:object}>}
 *   codes = every source-listing code that means "this language" (existing
 *   subtitles in these are offered as they are, and never translated from).
 */
export function makeTarget(code, custom = {}) {
  const builtIn = PROFILES[code];
  if (!builtIn && !custom.name) {
    throw new Error(
      `TARGET_LANG "${code}" has no built-in profile. Either use one of: ${Object.keys(PROFILES).join(', ')} - ` +
        'or describe the language with TARGET_LANG_NAME (and optionally TARGET_LANG_LABEL, TARGET_LANG_GOOGLE, TARGET_LANG_RTL).',
    );
  }

  const profile = { label: code.slice(0, 2), google: '', rtl: false, ...builtIn, ...defined({ name: custom.name, label: custom.label, google: custom.google }) };
  if (custom.rtl !== undefined) profile.rtl = custom.rtl;

  return Object.freeze({
    code,
    name: profile.name,
    label: profile.label,
    google: profile.google,
    rtl: Boolean(profile.rtl),
    codes: [code],
    strings: Object.freeze({ ...defaultStrings(profile.name), ...profile.strings, ...defined(custom.strings || {}) }),
    prompt: Object.freeze({ ...defaultPrompt(profile.name), ...profile.prompt }),
  });
}

/** The target of this server. Throws at start-up when TARGET_LANG cannot be used. */
export const target = makeTarget(config.targetLang, config.targetCustom);
