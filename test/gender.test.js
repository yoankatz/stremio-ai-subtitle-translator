import test from 'node:test';
import assert from 'node:assert/strict';
import { srtTimeToMs } from '../src/srt/timeMs.js';
import { alignByTime, estimateOffset } from '../src/hints/align.js';
import { gatherHints } from '../src/hints/gatherHints.js';
import { hintLanguage } from '../src/hints/languages.js';
import { buildGenderRequest, genderResponseSchema, genderSystemPrompt } from '../src/translate/genderPrompt.js';
import { makeTarget } from '../src/language/target.js';
import { titleVariants } from '../src/context/anilist.js';
import { pickExisting } from '../src/sources/existingTranslations.js';
import { decodeVideo, encodeVideo, keyScope, sourceKey } from '../src/sources/sourceRef.js';
import { isImprovement, needsUpgrade } from '../src/jobs/upgradePolicy.js';
import { scoreGender } from '../tools/eval/genderMetric.js';

// --- helpers -----------------------------------------------------------

const pad = (n, width = 2) => String(n).padStart(width, '0');
const time = (ms) => `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
const cue = (startMs, lengthMs, text) => ({ start: time(startMs), end: time(startMs + lengthMs), text });

/** A file of n cues, one every 4 s, each 2 s long, shifted by offsetMs. */
const file = (n, { offsetMs = 0, label = 'L' } = {}) => Array.from({ length: n }, (_, i) => cue(10_000 + i * 4_000 + offsetMs, 2_000, `${label}${i}`));

const srt = (cues) => cues.map((c, i) => `${i + 1}\n${c.start} --> ${c.end}\n${c.text}\n`).join('\n');

// --- time and alignment -------------------------------------------------

test('reads an SRT time as milliseconds', () => {
  assert.equal(srtTimeToMs('01:02:03,450'), 3_723_450);
  assert.ok(Number.isNaN(srtTimeToMs('not a time')));
});

test('two files of the same cut line up even when one starts later', () => {
  const base = file(40);
  const other = file(40, { offsetMs: 3_300, label: 'X' });
  const aligned = alignByTime(base, other);
  assert.equal(aligned.offsetMs, 3_300);
  assert.ok(aligned.peak > 0.9);
  assert.equal(aligned.texts[0], 'X0');
  assert.equal(aligned.texts[39], 'X39');
});

test('files with unrelated timings are recognised as not lining up', () => {
  const base = file(40);
  // Same number of cues, but spaced differently: no single shift fits.
  const other = Array.from({ length: 40 }, (_, i) => cue(11_000 + i * 5_300 + (i % 3) * 700, 1_500, `X${i}`));
  const toSpan = (c) => ({ start: srtTimeToMs(c.start), end: srtTimeToMs(c.end) });
  assert.ok(estimateOffset(base.map(toSpan), other.map(toSpan)).peak < 0.45);
});

test('a line with no clear counterpart gets no hint rather than a neighbour', () => {
  const base = [cue(10_000, 2_000, 'a'), cue(14_000, 2_000, 'b'), cue(18_000, 2_000, 'c'), cue(22_000, 2_000, 'd')];
  const other = [cue(10_000, 2_000, 'A'), cue(18_000, 2_000, 'C'), cue(22_000, 2_000, 'D')];
  assert.deepEqual(alignByTime(base, other).texts, ['A', undefined, 'C', 'D']);
});

// --- choosing hint files ------------------------------------------------

test('hint files: one per language family, only when the timing fits', async () => {
  const base = file(30);
  const files = {
    'https://x/ar': srt(file(30, { label: 'AR' })),
    'https://x/es': srt(file(30, { offsetMs: 1_000, label: 'ES' })),
    'https://x/fr': srt(file(30, { label: 'FR' })), // same family as es: not needed
    'https://x/ru-bad': srt(Array.from({ length: 30 }, (_, i) => cue(11_000 + i * 5_300 + (i % 3) * 700, 1_500, `RU${i}`))),
  };
  const listing = [
    { url: 'https://x/fr', lang: 'fre' },
    { url: 'https://x/ru-bad', lang: 'rus' },
    { url: 'https://x/es', lang: 'spa' },
    { url: 'https://x/ar', lang: 'ara' },
    { url: 'https://x/en', lang: 'eng' },
  ];
  const hints = await gatherHints(base, listing, { download: async (url) => files[url] });

  assert.deepEqual(hints.used.map((u) => u.label), ['ar', 'es']);
  assert.deepEqual(hints.perLine[0], { ar: 'AR0', es: 'ES0' });
  assert.equal(hints.rejected.length, 1);
  assert.match(hints.rejected[0].why, /timing/);
});

test('a hint file that cannot be downloaded is marked as worth another try', async () => {
  const hints = await gatherHints(file(10), [{ url: 'https://x/ar', lang: 'ara' }], {
    download: async () => { throw new Error('hint download HTTP 429'); },
  });
  assert.deepEqual(hints.used, []);
  assert.equal(hints.rejected[0].transient, true);
});

test('Chinese counts as a hint only when the file uses the feminine "you"', () => {
  const chinese = hintLanguage('zht', makeTarget('heb'));
  assert.equal(chinese.usable('你 你 你'), false);
  assert.equal(chinese.usable('妳 妳 妳 你'), true);
  assert.equal(hintLanguage('eng', makeTarget('heb')), null);
});

test('families can be left out by name (the benchmark must not see its reference translation)', async () => {
  const base = file(10);
  const listing = [{ url: 'https://x/he', lang: 'heb' }, { url: 'https://x/ar', lang: 'ara' }];
  const hints = await gatherHints(base, listing, { exclude: ['target'], download: async () => srt(file(10, { label: 'T' })) });
  assert.deepEqual(hints.used.map((u) => u.label), ['ar']);
});

// --- the request sent to the model --------------------------------------

test('the request tells the model only about evidence it actually carries', () => {
  const plain = genderSystemPrompt();
  assert.doesNotMatch(plain, /"alt" lines\. They say/);
  assert.doesNotMatch(plain, /"characters": a name/);

  const rich = genderSystemPrompt({ altLabels: new Set(['zh-TW', 'fr']), hasCharacters: true });
  assert.match(rich, /Traditional Chinese/);
  assert.match(rich, /"es", "fr"/);
  assert.doesNotMatch(rich, /Arabic/);
  assert.match(rich, /"characters": a name/);
});

test('the request carries the lines with their ids and hints, and the context around them', () => {
  const { system, user } = buildGenderRequest({
    texts: ['Are you ready?', '...'],
    ids: [111, 148],
    sourceLang: 'eng',
    alt: [{ ar: 'x' }, undefined],
    before: Array.from({ length: 12 }, (_, i) => `b${i}`),
    show: { title: 'T', year: 2026 },
    characters: [{ name: 'Mira', gender: 'f' }],
  });
  const payload = JSON.parse(user);
  assert.deepEqual(payload.lines, [{ id: 111, text: 'Are you ready?', alt: { ar: 'x' } }, { id: 148, text: '...' }]);
  assert.equal(payload.before.length, 8);
  assert.equal(payload.before.at(-1), 'b11');
  assert.deepEqual(payload.characters, [{ name: 'Mira', gender: 'f' }]);
  assert.match(system, /Arabic/);
});

test('the model must name speaker and listener before the Hebrew text', () => {
  const hebrew = genderResponseSchema(makeTarget('heb'));
  assert.deepEqual(hebrew.items.propertyOrdering, ['id', 'from', 'to', 'he']);
  assert.deepEqual(hebrew.items.required, ['id', 'from', 'to', 'he']);
  assert.deepEqual(genderResponseSchema(makeTarget('spa')).items.propertyOrdering, ['id', 'from', 'to', 'es']);
});

// --- cast lookup --------------------------------------------------------

test('catalogue decorations are stripped from a title before the cast search', () => {
  assert.deepEqual(titleVariants('A Silent Voice: The Movie'), ['A Silent Voice: The Movie', 'A Silent Voice']);
  assert.deepEqual(titleVariants('Your Name.'), ['Your Name.', 'Your Name']);
  assert.deepEqual(titleVariants('Overgeared'), ['Overgeared']);
});

// --- existing Hebrew ----------------------------------------------------

test('existing translations: exact-release files first, then Wizdom, without repeats', () => {
  const open = [
    { url: 'https://s/en', lang: 'eng' },
    { url: 'https://s/he1', lang: 'heb' },
    { url: 'https://s/he2', lang: 'heb', m: 'h' },
  ];
  const wizdom = [{ url: 'https://w/1' }, { url: 'https://w/2' }, { url: 'https://s/he1' }];
  assert.deepEqual(pickExisting(open, wizdom, { max: 3, codes: ['heb'] }).map((s) => s.url), ['https://s/he2', 'https://w/1', 'https://s/he1']);
  assert.deepEqual(pickExisting([{ url: 'https://s/en', lang: 'eng' }], [], { max: 3, codes: ['heb'] }), []);
});

// --- links and cache keys ------------------------------------------------

test('the video travels in the link and anything else is refused', () => {
  const episode = { type: 'series', videoId: 'tt28313387:1:4' };
  assert.deepEqual(decodeVideo(encodeVideo(episode)), episode);
  assert.deepEqual(decodeVideo(encodeVideo({ type: 'movie', videoId: 'tt5311514' })), { type: 'movie', videoId: 'tt5311514' });
  assert.equal(decodeVideo(encodeVideo({ type: 'series', videoId: 'kitsu:1:2' })), null);
  assert.equal(decodeVideo(Buffer.from('movie/tt1/../../x').toString('base64url')), null);
  assert.equal(decodeVideo('%%%'), null);
});

test('the cache key belongs to the current translation method', () => {
  const source = { url: 'https://subs5.strem.io/en/download/file/123', lang: 'eng' };
  // The key used by version 1.0 for the same file (sha1 of the bare URL).
  assert.notEqual(sourceKey(source), 'b6f1a0d4c1b0e2f7a9d3c5e8');
  assert.match(sourceKey(source), /^[a-f0-9]{24}$/);
});

// --- redoing a stored file ------------------------------------------------

const NOW = Date.parse('2026-11-21T12:00:00Z');
const stored = (context, counts = { gemini: 400, google: 0, source: 0, kept: 0 }) => ({ provider: 'gemini', counts, cues: 400, context });

test('a file translated while its context could not be fetched is redone, a complete one is not', () => {
  assert.equal(needsUpgrade(stored({ hints: [], characters: 0, incomplete: true }), NOW), true);
  assert.equal(needsUpgrade(stored({ hints: [], characters: 0, incomplete: false }), NOW), false);
  assert.equal(needsUpgrade(stored({ hints: ['ar'], characters: 12, incomplete: false }), NOW), false);
});

test('with equal fallback lines, more context behind the translation wins', () => {
  const thin = stored({ hints: [], characters: 0, incomplete: true });
  const rich = stored({ hints: ['zh-TW'], characters: 12, incomplete: false });
  assert.equal(isImprovement(rich, thin), true);
  assert.equal(isImprovement(thin, rich), false);
  assert.equal(isImprovement(thin, thin), false);
});

// --- the benchmark's scoring ----------------------------------------------

test('the benchmark counts agreement on gendered words, feminine cases apart', () => {
  // m = masculine form, f = feminine form of "know" and of "tell (you)".
  const [knowM, knowF, tellM, tellF] = ['יודע', 'יודעת', 'תגיד', 'תגידי'];
  const reference = [`x ${knowF} y`, `${tellF} z`, `${knowM}`, 'nothing gendered'];
  const machine = [`x ${knowM} y`, `${tellF} z`, `ו${knowM}`, 'nothing gendered'];
  const score = scoreGender(machine, reference);

  assert.equal(score.all.compared, 3);
  assert.equal(score.all.refF, 2);
  assert.equal(score.all.refFAgree, 1);
  assert.equal(score.all.refMAgree, 1); // the glued "and" prefix is seen through
  assert.equal(score.addressing.refFAgree, 1);
  assert.deepEqual(score.disagreements.map((d) => d.line), [0]);
});
