import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeTarget } from '../src/language/target.js';
import { PROFILES } from '../src/language/profiles.js';
import { hintLanguage } from '../src/hints/languages.js';
import { keyScope, sourceKey } from '../src/sources/sourceRef.js';
import { buildGenderRequest } from '../src/translate/genderPrompt.js';

test('Hebrew keeps the labels and notice it had before targets existed', () => {
  const hebrew = makeTarget('heb');
  assert.equal(hebrew.label, 'he');
  assert.equal(hebrew.google, 'iw');
  assert.equal(hebrew.rtl, true);
  assert.equal(hebrew.strings.machineLabel, 'עברית - תרגום אוטומטי');
  assert.equal(hebrew.strings.addonName, 'כתוביות AI בעברית');
});

test('a built-in language gets English defaults for everything it does not define', () => {
  const spanish = makeTarget('spa');
  assert.equal(spanish.name, 'Spanish');
  assert.equal(spanish.rtl, false);
  assert.equal(spanish.strings.machineLabel, 'Spanish - AI translation');
  assert.match(spanish.prompt.style, /Spanish subtitles/);
});

test('a language that is not built in needs a name, and can then be fully described', () => {
  assert.throws(() => makeTarget('xyz'), /TARGET_LANG_NAME/);
  const custom = makeTarget('xyz', { name: 'Klingon', label: 'tlh', google: '', rtl: false, strings: { machineLabel: 'tlhIngan - AI' } });
  assert.equal(custom.name, 'Klingon');
  assert.equal(custom.label, 'tlh');
  assert.equal(custom.google, '');
  assert.equal(custom.strings.machineLabel, 'tlhIngan - AI');
  assert.equal(custom.strings.addonName, 'AI subtitles - Klingon');
});

test('every built-in profile has the fields the server relies on', () => {
  for (const [code, profile] of Object.entries(PROFILES)) {
    assert.match(code, /^[a-z]{3}$/, code);
    assert.ok(profile.name && profile.label && profile.google, code);
  }
});

test('a file in the target language is the strongest hint; one sharing its label is no hint', () => {
  const spanish = makeTarget('spa');
  assert.deepEqual(hintLanguage('spa', spanish), { code: 'spa', label: 'es', family: 'target', order: -1 });
  assert.equal(hintLanguage('heb', spanish).family, 'semitic'); // Hebrew becomes an ordinary hint
  const hebrew = makeTarget('heb');
  assert.equal(hintLanguage('heb', hebrew).family, 'target');
  assert.equal(hintLanguage('eng', hebrew), null);
});

test('the request for another language names it and uses its own reply field', () => {
  const { system } = buildGenderRequest({ texts: ['Are you sure?'], ids: [111], sourceLang: 'eng', alt: [{ es: 'x', he: 'y' }], target: makeTarget('spa') });
  assert.match(system, /spoken Spanish, the way professional Spanish subtitles are written/);
  assert.match(system, /\{"id", "from", "to", "es"\}/);
  assert.match(system, /existing Spanish translation/);
  assert.match(system, /"he" \(Hebrew\)/);
  assert.doesNotMatch(system, /Israeli|nikud/);
});

test('Hebrew cache keys are the ones version 1.1 stored; other targets get their own', () => {
  const source = { url: 'https://subs5.strem.io/en/download/file/123', lang: 'eng' };
  const v11 = createHash('sha1').update(`p2|${source.url}`).digest('hex').slice(0, 24);
  assert.equal(keyScope('heb'), 'p2');
  assert.equal(sourceKey(source, 'heb'), v11);
  assert.notEqual(sourceKey(source, 'spa'), v11);
  assert.notEqual(sourceKey(source, 'spa'), sourceKey(source, 'fre'));
});
