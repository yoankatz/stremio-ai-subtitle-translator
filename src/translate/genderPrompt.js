// The translation request that makes the model decide who is speaking to
// whom before it writes the translation.
//
// English does not mark the gender of "you" or of "I am tired"; many
// languages do, in almost every sentence. Left alone, a model writes
// masculine by default. This request gives it evidence (the cast, the same
// line in languages that do mark gender, the lines before) and makes it
// commit to a speaker and a listener for each line ("from" / "to") ahead of
// the translated text.
//
// The wording was measured for Hebrew (tools/eval) and the Hebrew request is
// pinned by test/hebrew-golden.test.js. Everything language-specific comes
// from the target's profile (src/language), so other languages get the same
// request with their own name and wording.

import { target as serverTarget } from '../language/target.js';

const baseRules = (t) => `You are a professional subtitle translator. Translate each subtitle line into natural, modern, spoken ${t.name}, ${t.prompt.style}.

INPUT: a JSON object.
- "lines": the lines to translate, each {"id", "text"}; a line may also carry "alt" - the same moment of the film in other languages.
- "before": the lines spoken just before this batch. Context only, do not translate them.
- "show" and "characters" (when present): what is being translated and who appears in it, with each character's gender.

OUTPUT: a JSON array with one object per line, in this field order: {"id", "from", "to", "${t.label}"}. Use exactly the ids you were given, copied as they are. Never merge, split, drop or reorder lines.

GENDER comes first. ${t.name} marks gender where English does not: "you", verbs, adjectives and "I am ..." all change with the gender of the speaker and of the person spoken to. Translating everything as masculine is the most common mistake - do not default to it. For every line decide, before writing the ${t.name}:
- "from": the speaker - "m" (male), "f" (female), or "?" (cannot tell, narrator, text on screen).
- "to": the person spoken to - "m", "f", "p" (several people), or "?" (nobody in particular, cannot tell).
Then write "${t.label}" so that it agrees with both.`;

const EVIDENCE_INTRO = `How to tell, strongest evidence first:`;

// One rule per language family, added only when a line actually carries it.
const existingTranslationRule = (t) =>
  `"${t.label}" in alt is an existing ${t.name} translation of the same moment: take the gender and the spelling of names from it.`;

const ALT_RULES = {
  he: `"he" (Hebrew): second-person pronouns, verbs and adjectives show the listener's gender; first-person verbs and adjectives show the speaker's.`,
  ar: `"ar" (Arabic): second-person verbs and pronouns show the listener's gender (feminine endings such as ـين, ـكِ, أنتِ); adjectives and participles show the speaker's.`,
  'zh-TW': `"zh-TW" (Traditional Chinese): 妳 means the person spoken to is female; 你 in the same file is a male listener or unspecified. 她 = she, 他 = he.`,
  slavic: `"ru", "uk", "pl", "cs", "sr", "hr", "bg": past-tense verbs and adjectives show the gender of "I" and "you" (сказал / сказала, zrobiłeś / zrobiłaś).`,
  romance: `"es", "fr", "it", "pt", "ro": adjectives and participles show gender (cansado / cansada, désolé / désolée, sicuro / sicura).`,
  ja: `"ja" (the original Japanese): 俺 and 僕 are a male "I", あたし a female one; speech style and honorifics also tell who is speaking to whom.`,
};
const SLAVIC = ['ru', 'uk', 'pl', 'cs', 'sr', 'hr', 'bg'];
const ROMANCE = ['es', 'fr', 'it', 'pt', 'ro'];

const ALT_CLOSING = `An alt line can be missing, or belong to the line next to it; ignore one that clearly does not match "text". Translate from "text" - use alt only for gender and for names.`;

const CHARACTER_RULE = `"characters": a name spoken in the line or near it tells who is spoken to or about. The list is not complete; a character missing from it can still be male or female.`;

const contextRules = (t) => `The conversation itself: who was just named, who answers whom, the lines in "before". Keep each person's gender the same through the batch - two people talking keep the same pair of genders line after line.
When nothing tells who is spoken to, prefer ${t.name} wording that needs no gender ${t.prompt.neutralWording} over guessing. Only if that sounds unnatural, ${t.prompt.unknownFallback}.`;

const styleRules = (t) => `STYLE:
- Translate the meaning, not word by word. Keep each line short and easy to read.
- ${t.prompt.namesRule}
- Keep a line break ("\\n") where the source has one, and keep a leading "-" on dialogue lines.
- Translate sound descriptions and on-screen text too, keeping their brackets.
- ${t.prompt.bans}
- A line that is only music symbols, numbers or punctuation is returned unchanged.`;

/** The rules for the hint languages present, never for the target's own label. */
function altRules(labels, t) {
  const hint = (label) => label !== t.label && labels.has(label);
  const rules = [];
  if (labels.has(t.label)) rules.push(existingTranslationRule(t));
  if (hint('he')) rules.push(ALT_RULES.he);
  if (hint('ar')) rules.push(ALT_RULES.ar);
  if (hint('zh-TW')) rules.push(ALT_RULES['zh-TW']);
  if (SLAVIC.some(hint)) rules.push(ALT_RULES.slavic);
  if (ROMANCE.some(hint)) rules.push(ALT_RULES.romance);
  if (hint('ja')) rules.push(ALT_RULES.ja);
  return rules;
}

/** The system prompt, mentioning only the kinds of evidence this request carries. */
export function genderSystemPrompt({ altLabels = new Set(), hasCharacters = false, target = serverTarget } = {}) {
  const evidence = [];
  const rules = altRules(altLabels, target);
  if (rules.length) evidence.push(`The "alt" lines. They say the same thing in a language that marks gender, so read the gender from them:\n${rules.map((rule) => `   - ${rule}`).join('\n')}\n   ${ALT_CLOSING}`);
  if (hasCharacters) evidence.push(CHARACTER_RULE);
  evidence.push(contextRules(target));

  const numbered = evidence.map((item, i) => `${i + 1}. ${item}`).join('\n');
  return `${baseRules(target)}\n\n${EVIDENCE_INTRO}\n${numbered}\n\n${styleRules(target)}`;
}

/** Makes the model write "from" and "to" before the translated text. */
export function genderResponseSchema(target = serverTarget) {
  const fields = ['id', 'from', 'to', target.label];
  return {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        id: { type: 'INTEGER' },
        from: { type: 'STRING', enum: ['m', 'f', '?'] },
        to: { type: 'STRING', enum: ['m', 'f', 'p', '?'] },
        [target.label]: { type: 'STRING' },
      },
      required: fields,
      propertyOrdering: fields,
    },
  };
}

const BEFORE_LINES = 8;

/**
 * @param {object} request
 * @param {string[]} request.texts the lines of this batch
 * @param {number[]} request.ids one id per line
 * @param {string} request.sourceLang
 * @param {Array<Record<string,string>|undefined>} [request.alt] per line: language label -> text
 * @param {string[]} [request.before] the lines preceding this batch
 * @param {object|null} [request.show]
 * @param {Array<{name:string, gender:string}>} [request.characters]
 * @param {object} [request.target] the language translated into (default: this server's)
 * @returns {{system:string, user:string}}
 */
export function buildGenderRequest({ texts, ids, sourceLang, alt = [], before = [], show = null, characters = [], target = serverTarget }) {
  const altLabels = new Set(alt.flatMap((entry) => (entry ? Object.keys(entry) : [])));

  const payload = { source_language: sourceLang };
  if (show) payload.show = show;
  if (characters.length) payload.characters = characters;
  if (before.length) payload.before = before.slice(-BEFORE_LINES);
  payload.lines = texts.map((text, i) => (alt[i] ? { id: ids[i], text, alt: alt[i] } : { id: ids[i], text }));

  return {
    system: genderSystemPrompt({ altLabels, hasCharacters: characters.length > 0, target }),
    user: JSON.stringify(payload),
  };
}
