import test from 'node:test';
import assert from 'node:assert/strict';
import { createChunkTranslator } from '../src/translate/translateChunk.js';
import { newCounts, providerOf } from '../src/translate/counts.js';
import { hasWords } from '../src/translate/lineKinds.js';
import { mapById } from '../src/translate/mapResults.js';
import { lineIds } from '../src/translate/lineIds.js';
import { fallbackLines, isImprovement, needsUpgrade } from '../src/jobs/upgradePolicy.js';

// --- helpers -----------------------------------------------------------

const reply = (lines) => ({ lines, returned: lines.filter(Boolean).length, finishReason: 'STOP' });

/** Builds a chunk translator around scripted Gemini replies and a Google stub. */
function pipeline({ geminiReplies = [], google = async (texts) => texts.map((t) => `G:${t}`), usable = true } = {}) {
  const calls = { gemini: [], google: [], log: [] };
  const translate = createChunkTranslator({
    gemini: async (texts) => {
      calls.gemini.push(texts);
      const next = geminiReplies.shift();
      if (next instanceof Error) throw next;
      return reply(next);
    },
    google: async (texts) => {
      calls.google.push(texts);
      return google(texts);
    },
    geminiUsable: () => usable,
    log: (kind, data) => calls.log.push({ kind, ...data }),
  });
  return { translate, calls };
}

const run = async (p, texts) => {
  const counts = newCounts();
  const out = await p.translate(texts, { sourceLang: 'eng', priority: 'interactive', counts });
  return { out, counts };
};

// --- the per-chunk pipeline --------------------------------------------

test('a chunk Gemini fully translates never reaches the fallback', async () => {
  const p = pipeline({ geminiReplies: [['A', 'B']] });
  const { out, counts } = await run(p, ['one', 'two']);
  assert.deepEqual(out, ['A', 'B']);
  assert.deepEqual(counts, { gemini: 2, google: 0, source: 0, kept: 0 });
  assert.equal(p.calls.google.length, 0);
  assert.equal(providerOf(counts), 'gemini');
});

test('a line Gemini skipped is asked again on its own before the fallback', async () => {
  const p = pipeline({ geminiReplies: [['A', undefined, 'C'], ['B']] });
  const { out, counts } = await run(p, ['one', 'two', 'three']);
  assert.deepEqual(out, ['A', 'B', 'C']);
  assert.deepEqual(p.calls.gemini[1], ['two']);
  assert.equal(p.calls.google.length, 0);
  assert.equal(counts.gemini, 3);
  assert.equal(p.calls.log[0].kind, 'gemini-skipped');
  assert.deepEqual(p.calls.log[0].indexes, [1]);
});

test('a line Gemini skips twice goes to Google, and only that line', async () => {
  const p = pipeline({ geminiReplies: [['A', undefined], [undefined]] });
  const { out, counts } = await run(p, ['one', 'two']);
  assert.deepEqual(out, ['A', 'G:two']);
  assert.deepEqual(p.calls.google, [['two']]);
  assert.deepEqual(counts, { gemini: 1, google: 1, source: 0, kept: 0 });
  assert.equal(providerOf(counts), 'mixed');
});

test('if the fallback fails too, a mostly translated chunk keeps the source line', async () => {
  const p = pipeline({
    geminiReplies: [['A', undefined], [undefined]],
    google: async () => { throw new Error('Google Translate HTTP 429'); },
  });
  const { out, counts } = await run(p, ['one', 'two']);
  assert.deepEqual(out, ['A', 'two']);
  assert.deepEqual(counts, { gemini: 1, google: 0, source: 1, kept: 0 });
  assert.equal(p.calls.log.at(-1).kind, 'fallback-failed');
});

test('a chunk nobody could translate fails instead of passing as translated', async () => {
  const p = pipeline({ usable: false, google: async () => { throw new Error('Google Translate HTTP 429'); } });
  await assert.rejects(run(p, ['one', 'two']), /429/);
});

test('without Gemini the whole chunk is translated by Google', async () => {
  const p = pipeline({ usable: false });
  const { out, counts } = await run(p, ['one', 'two']);
  assert.deepEqual(out, ['G:one', 'G:two']);
  assert.equal(p.calls.gemini.length, 0);
  assert.equal(providerOf(counts), 'google');
});

test('a failed Gemini request sends the chunk to Google', async () => {
  const p = pipeline({ geminiReplies: [new Error('Gemini HTTP 429')] });
  const { out, counts } = await run(p, ['one', 'two']);
  assert.deepEqual(out, ['G:one', 'G:two']);
  assert.equal(p.calls.gemini.length, 1); // no second pass after a failure
  assert.deepEqual(counts, { gemini: 0, google: 2, source: 0, kept: 0 });
});

test('lines with no words are copied and never count against the translation', async () => {
  const p = pipeline({ geminiReplies: [['A', undefined, undefined]] });
  const { out, counts } = await run(p, ['one', '...', '123']);
  assert.deepEqual(out, ['A', '...', '123']);
  assert.deepEqual(counts, { gemini: 1, google: 0, source: 0, kept: 2 });
  assert.equal(p.calls.gemini.length, 1);
  assert.equal(p.calls.google.length, 0);
  assert.equal(providerOf(counts), 'gemini');
});

test('a chunk with no words at all calls no translator', async () => {
  const p = pipeline();
  const { out } = await run(p, ['...', '?!']);
  assert.deepEqual(out, ['...', '?!']);
  assert.equal(p.calls.gemini.length + p.calls.google.length, 0);
});

test('hasWords recognises letters in any script', () => {
  assert.equal(hasWords('Hello'), true);
  assert.equal(hasWords('שלום'), true);
  assert.equal(hasWords('こんにちは'), true);
  assert.equal(hasWords('♪ ♪'), false);
  assert.equal(hasWords('... 12:30'), false);
});

// --- reading the model reply -------------------------------------------

test('line ids are distinct and do not follow each other, up to the largest chunk', () => {
  const ids = lineIds(160);
  assert.equal(new Set(ids).size, 160);
  assert.ok(ids.every((id, i) => i === 0 || id !== ids[i - 1] + 1));
});

test('a line asked again on its own takes its own hints along, not its neighbours', async () => {
  const seen = [];
  const translate = createChunkTranslator({
    gemini: async (texts, _lang, _priority, context) => {
      seen.push(context);
      return reply(seen.length === 1 ? ['A', undefined, 'C'] : ['B']);
    },
    google: async (texts) => texts,
    geminiUsable: () => true,
    log: () => {},
  });
  const context = { alt: [{ ar: 'a1' }, { ar: 'a2' }, undefined], before: ['earlier'], show: { title: 'T' }, characters: [{ name: 'N', gender: 'f' }] };
  await translate(['one', 'two', 'three'], { sourceLang: 'eng', priority: 'interactive', counts: newCounts(), context });

  assert.deepEqual(seen[0].alt, context.alt);
  assert.deepEqual(seen[0].before, ['earlier']);
  assert.deepEqual(seen[1].alt, [{ ar: 'a2' }]);
  assert.deepEqual(seen[1].before, []); // "before" belongs to the whole chunk only
  assert.deepEqual(seen[1].characters, context.characters);
});

test('a line is filled only by the item that carries its id, whatever the order', () => {
  const ids = lineIds(3);
  const items = [{ id: ids[2], he: 'C' }, { id: ids[0], he: 'A' }];
  assert.deepEqual(mapById(items, ids, 'he'), ['A', undefined, 'C']);
});

test('a model that merged a line and renumbered 1, 2, 3 fills nothing by accident', () => {
  const ids = lineIds(3);
  const renumbered = [{ id: 1, he: 'A' }, { id: 2, he: 'B+C' }];
  assert.deepEqual(mapById(renumbered, ids, 'he'), [undefined, undefined, undefined]);
});

// --- when a stored file is redone ---------------------------------------

const NOW = Date.parse('2026-11-14T12:00:00Z');
const meta = (counts, extra = {}) => ({ provider: providerOf({ ...newCounts(), ...counts }), counts: { ...newCounts(), ...counts }, cues: 400, ...extra });

test('a clean Gemini file is never redone', () => {
  assert.equal(needsUpgrade(meta({ gemini: 400 }), NOW), false);
});

test('a few Google lines are left alone; a real share is redone', () => {
  assert.equal(needsUpgrade(meta({ gemini: 390, google: 10 }), NOW), false);
  assert.equal(needsUpgrade(meta({ gemini: 300, google: 100 }), NOW), true);
  assert.equal(needsUpgrade(meta({ google: 400 }), NOW), true);
});

test('any line left in the source language is worth another try', () => {
  assert.equal(needsUpgrade(meta({ gemini: 399, source: 1 }), NOW), true);
});

test('redoing stops after three attempts and waits between them', () => {
  const google = { google: 400 };
  assert.equal(needsUpgrade(meta(google, { upgradeAttempts: 3 }), NOW), false);
  assert.equal(needsUpgrade(meta(google, { upgradeAttempts: 1, lastUpgradeAt: '2026-11-14T11:50:00Z' }), NOW), false);
  assert.equal(needsUpgrade(meta(google, { upgradeAttempts: 1, lastUpgradeAt: '2026-11-14T11:00:00Z' }), NOW), true);
});

test('files stored before line counts existed are judged by provider name', () => {
  assert.equal(fallbackLines({ provider: 'gemini', cues: 400 }), 0);
  assert.equal(fallbackLines({ provider: 'google', cues: 400 }), 400);
  assert.equal(needsUpgrade({ provider: 'mixed', cues: 400 }, NOW), true);
  assert.equal(needsUpgrade({ provider: 'gemini', cues: 400 }, NOW), false);
});

test('a redo replaces the stored file only when it leans less on the fallback', () => {
  const stored = meta({ gemini: 380, google: 20 });
  assert.equal(isImprovement(meta({ gemini: 400 }), stored), true);
  assert.equal(isImprovement(meta({ google: 400 }), stored), false);
  assert.equal(isImprovement(meta({ gemini: 380, google: 20 }), stored), false);
});
