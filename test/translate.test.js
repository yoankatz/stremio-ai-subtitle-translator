import test from 'node:test';
import assert from 'node:assert/strict';
import { mapById, parseJsonArray } from '../src/translate/mapResults.js';
import { pickSources } from '../src/sources/pickSources.js';
import { decodeSource, encodeSource, sourceKey } from '../src/sources/sourceRef.js';
import { createSemaphore } from '../src/util/semaphore.js';
import { chunk, chunkSizeFor } from '../src/translate/chunking.js';

test('episodes keep the base chunk size; films grow it, up to a cap', () => {
  assert.equal(chunkSizeFor(400, 80), 80);
  assert.equal(chunkSizeFor(1700, 80), 142);
  assert.equal(chunkSizeFor(5000, 80), 160);
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 2), []);
});

test('maps model output by id and leaves gaps for skipped lines', () => {
  const items = [{ id: 2, he: ' שתיים ' }, { id: 1, he: 'אחת' }, { id: 9, he: 'מחוץ לטווח' }, { id: 3, he: '' }];
  assert.deepEqual(mapById(items, [1, 2, 3], 'he'), ['אחת', 'שתיים', undefined]);
  assert.deepEqual(mapById('not an array', [1, 2], 'he'), [undefined, undefined]);
});

test('reads the translation from the field named after the target language', () => {
  const items = [{ id: 7, es: 'Hola', he: 'not this one' }];
  assert.deepEqual(mapById(items, [7], 'es'), ['Hola']);
});

test('finds the JSON array even when the model adds text around it', () => {
  assert.deepEqual(parseJsonArray('[{"id":1,"he":"שלום"}]'), [{ id: 1, he: 'שלום' }]);
  assert.deepEqual(parseJsonArray('Here you go:\n```json\n[{"id":1,"he":"שלום"}]\n```'), [{ id: 1, he: 'שלום' }]);
  assert.equal(parseJsonArray('no array here'), null);
});

test('prefers English, hash-matched first, without duplicates', () => {
  const subs = [
    { url: 'https://subs5.strem.io/a', lang: 'jpn' },
    { url: 'https://subs5.strem.io/b', lang: 'eng', m: 'i' },
    { url: 'https://subs5.strem.io/c', lang: 'eng', m: 'h' },
    { url: 'https://subs5.strem.io/b', lang: 'eng', m: 'i' },
  ];
  assert.deepEqual(pickSources(subs, 3, ['heb']), [
    { url: 'https://subs5.strem.io/c', lang: 'eng' },
    { url: 'https://subs5.strem.io/b', lang: 'eng' },
  ]);
});

test('falls back to another language when there is no English, never to the target language', () => {
  const subs = [
    { url: 'https://subs5.strem.io/he', lang: 'heb' },
    { url: 'https://subs5.strem.io/jp', lang: 'jpn' },
    { url: 'https://subs5.strem.io/es', lang: 'spa' },
  ];
  assert.deepEqual(pickSources(subs, 1, ['heb']), [{ url: 'https://subs5.strem.io/es', lang: 'spa' }]);
  assert.deepEqual(pickSources([{ url: 'https://subs5.strem.io/he', lang: 'heb' }], 3, ['heb']), []);
  // Translating into Spanish: the Spanish file is not a source; the fallback order picks Japanese.
  assert.deepEqual(pickSources(subs, 1, ['spa']), [{ url: 'https://subs5.strem.io/jp', lang: 'jpn' }]);
});

test('source references round-trip and reject foreign hosts', () => {
  const source = { url: 'https://subs5.strem.io/en/download/file/123', lang: 'eng' };
  assert.deepEqual(decodeSource(encodeSource(source), 'eng'), source);
  assert.match(sourceKey(source), /^[a-f0-9]{24}$/);

  const evil = { url: 'https://example.com/x.srt', lang: 'eng' };
  assert.equal(decodeSource(encodeSource(evil), 'eng'), null);
  assert.equal(decodeSource(encodeSource({ url: 'http://subs5.strem.io/x', lang: 'eng' }), 'eng'), null);
  assert.equal(decodeSource(encodeSource(source), '../etc'), null);
  assert.equal(decodeSource('%%%', 'eng'), null);
});

test('semaphore limits concurrency and runs high priority first', async () => {
  const run = createSemaphore(1);
  const order = [];
  let release;
  const gate = new Promise((resolve) => (release = resolve));

  const first = run(async () => { await gate; order.push('first'); });
  const low = run(async () => order.push('low'));
  const high = run(async () => order.push('high'), { priority: 'high' });

  release();
  await Promise.all([first, low, high]);
  assert.deepEqual(order, ['first', 'high', 'low']);
});
