// Which subtitle languages can tell the translator what English cannot:
// the gender of the speaker and of the person spoken to.
//
// Families matter more than languages - each family marks gender in a
// different place, so one file per family covers more than three files of
// the same family:
//   target   an existing translation in the target language itself: gender
//            and name spelling as they are
//   semitic  Arabic, Hebrew: second-person verbs and pronouns, in every tense
//   chinese  Traditional Chinese: a separate character for a female "you"
//   slavic   past-tense verbs and adjectives, for "I" and "you"
//   romance  adjectives and participles
//   japanese the original dialogue of anime: gendered "I", speech style

const count = (text, piece) => text.split(piece).length - 1;

// Many Chinese files never use the feminine "you" (Simplified Chinese does
// not have it; some Traditional files are plain conversions). Those carry no
// gender information and only cost tokens.
const usesFeminineYou = (text) => count(text, '妳') >= 3;

/** code = the id used by the subtitle source; label = the name the model sees. */
const HINT_LANGUAGES = [
  { code: 'heb', label: 'he', family: 'semitic' },
  { code: 'ara', label: 'ar', family: 'semitic' },
  { code: 'zht', label: 'zh-TW', family: 'chinese', usable: usesFeminineYou },
  { code: 'zho', label: 'zh-TW', family: 'chinese', usable: usesFeminineYou },
  { code: 'rus', label: 'ru', family: 'slavic' },
  { code: 'ukr', label: 'uk', family: 'slavic' },
  { code: 'pol', label: 'pl', family: 'slavic' },
  { code: 'cze', label: 'cs', family: 'slavic' },
  { code: 'srp', label: 'sr', family: 'slavic' },
  { code: 'hrv', label: 'hr', family: 'slavic' },
  { code: 'bul', label: 'bg', family: 'slavic' },
  { code: 'spa', label: 'es', family: 'romance' },
  { code: 'fre', label: 'fr', family: 'romance' },
  { code: 'ita', label: 'it', family: 'romance' },
  { code: 'por', label: 'pt', family: 'romance' },
  { code: 'pob', label: 'pt', family: 'romance' },
  { code: 'ron', label: 'ro', family: 'romance' },
  { code: 'jpn', label: 'ja', family: 'japanese' },
];

/** Most informative first. */
export const FAMILY_ORDER = ['target', 'semitic', 'chinese', 'slavic', 'romance', 'japanese'];

const BY_CODE = new Map(HINT_LANGUAGES.map((language, order) => [language.code, { ...language, order }]));

/**
 * How a subtitle file in language `code` can serve as a hint when
 * translating into `target`, or null when it cannot.
 * A file in the target language itself is the "target" family: an existing
 * translation, the strongest hint there is.
 */
export function hintLanguage(code, target) {
  if (target.codes.includes(code)) return { code, label: target.label, family: 'target', order: -1 };
  const language = BY_CODE.get(code);
  if (!language) return null;
  // Same label as the target (European and Brazilian Portuguese, say): the
  // model could not tell the hint from its own output field.
  return language.label === target.label ? null : language;
}
