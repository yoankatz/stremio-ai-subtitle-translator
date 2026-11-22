// The languages subtitles can be translated INTO, chosen with TARGET_LANG.
//
// code    the id subtitle sources and the Stremio player use for the
//         language (ISO 639-2). Only codes actually seen in OpenSubtitles
//         listings are here - the player picks a subtitle automatically by
//         this code, so a guessed one would silently never be picked.
// name    English name, as the model is told it
// label   short name used inside the request to the model
// google  the code Google Translate (the fallback translator) uses
// rtl     written right to left
//
// A language may also carry its own wording (see HEBREW below). Anything not
// given falls back to the defaults in target.js. A language missing from this
// list can still be used through the TARGET_LANG_* variables.

/**
 * Hebrew is the language this addon was built and measured for; its request
 * to the model is pinned by test/hebrew-golden.test.js. Change a word here
 * and that test fails - by design, measure again before changing it.
 */
const HEBREW = {
  name: 'Hebrew',
  label: 'he',
  google: 'iw',
  rtl: true,
  strings: {
    addonName: 'כתוביות AI בעברית',
    description: 'כתוביות בעברית בתרגום AI לכל סרט, סדרה ואנימה, עם זכר ונקבה נכונים.',
    machineLabel: 'עברית - תרגום אוטומטי',
    failedNotice: 'התרגום לא הצליח הפעם. בחרו כתובית אחרת וחזרו לכאן, או נסו שוב בעוד דקה.',
  },
  prompt: {
    style: 'the way Israeli TV subtitles are written',
    neutralWording: '(plural, infinitive, "אפשר", "צריך" impersonal)',
    unknownFallback: 'use masculine',
    namesRule: 'Write names of people and places in Hebrew letters and spell each one the same way every time.',
    bans: 'No nikud, no explanations, no transliteration of ordinary words, no quotes added around a line.',
  },
};

export const PROFILES = Object.freeze({
  heb: HEBREW,
  ara: { name: 'Arabic', label: 'ar', google: 'ar', rtl: true },
  per: { name: 'Persian', label: 'fa', google: 'fa', rtl: true },
  spa: { name: 'Spanish', label: 'es', google: 'es' },
  fre: { name: 'French', label: 'fr', google: 'fr' },
  ita: { name: 'Italian', label: 'it', google: 'it' },
  por: { name: 'Portuguese', label: 'pt', google: 'pt-PT' },
  pob: { name: 'Brazilian Portuguese', label: 'pt-BR', google: 'pt' },
  ron: { name: 'Romanian', label: 'ro', google: 'ro' },
  ger: { name: 'German', label: 'de', google: 'de' },
  nld: { name: 'Dutch', label: 'nl', google: 'nl' },
  rus: { name: 'Russian', label: 'ru', google: 'ru' },
  pol: { name: 'Polish', label: 'pl', google: 'pl' },
  cze: { name: 'Czech', label: 'cs', google: 'cs' },
  slo: { name: 'Slovak', label: 'sk', google: 'sk' },
  bul: { name: 'Bulgarian', label: 'bg', google: 'bg' },
  srp: { name: 'Serbian', label: 'sr', google: 'sr' },
  hrv: { name: 'Croatian', label: 'hr', google: 'hr' },
  bos: { name: 'Bosnian', label: 'bs', google: 'bs' },
  slv: { name: 'Slovenian', label: 'sl', google: 'sl' },
  mac: { name: 'Macedonian', label: 'mk', google: 'mk' },
  ell: { name: 'Greek', label: 'el', google: 'el' },
  tur: { name: 'Turkish', label: 'tr', google: 'tr' },
  hun: { name: 'Hungarian', label: 'hu', google: 'hu' },
  fin: { name: 'Finnish', label: 'fi', google: 'fi' },
  est: { name: 'Estonian', label: 'et', google: 'et' },
  swe: { name: 'Swedish', label: 'sv', google: 'sv' },
  dan: { name: 'Danish', label: 'da', google: 'da' },
  nor: { name: 'Norwegian', label: 'no', google: 'no' },
  alb: { name: 'Albanian', label: 'sq', google: 'sq' },
  ind: { name: 'Indonesian', label: 'id', google: 'id' },
  may: { name: 'Malay', label: 'ms', google: 'ms' },
  vie: { name: 'Vietnamese', label: 'vi', google: 'vi' },
  tha: { name: 'Thai', label: 'th', google: 'th' },
  ben: { name: 'Bengali', label: 'bn', google: 'bn' },
  tam: { name: 'Tamil', label: 'ta', google: 'ta' },
  sin: { name: 'Sinhala', label: 'si', google: 'si' },
  kor: { name: 'Korean', label: 'ko', google: 'ko' },
  jpn: { name: 'Japanese', label: 'ja', google: 'ja' },
  zho: { name: 'Simplified Chinese', label: 'zh-CN', google: 'zh-CN' },
  zht: { name: 'Traditional Chinese', label: 'zh-TW', google: 'zh-TW' },
  eng: { name: 'English', label: 'en', google: 'en' },
});
