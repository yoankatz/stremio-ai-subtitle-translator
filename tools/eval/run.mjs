// Measures how well a translation setup gets Hebrew grammatical gender right.
//
//   node tools/eval/run.mjs <benchmark> <variant>[,<variant>...] [lines=N]
//
// A variant is "base" (the prompt in production before gender work) or a
// "+"-joined set of switches for the gender prompt:
//   gender      the gender prompt alone (speaker / listener fields, context lines)
//   cast        + show title and the character list with genders
//   alt         + the same lines in gender-marking languages (all found)
//   alt=ar,fr   + only these languages
//   low|medium|high   thinking level (default minimal)
//   model=NAME  another Gemini model
// Example: node tools/eval/run.mjs yourname base,gender,cast+alt lines=400
//
// Prints numbers only. The Gemini calls run on the server (tools/lib/live.mjs);
// nothing is written to the translation cache.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listOpenSubtitles } from '../../src/sources/opensubtitlesV3.js';
import { listWizdom } from '../../src/sources/wizdom.js';
import { downloadSource } from '../../src/sources/downloadSource.js';
import { parseSubtitles } from '../../src/srt/parse.js';
import { alignByTime } from '../../src/hints/align.js';
import { gatherHints } from '../../src/hints/gatherHints.js';
import { loadShowContext } from '../../src/context/showContext.js';
import { lineIds } from '../../src/translate/lineIds.js';
import { SYSTEM_PROMPT, userPayload } from './baselinePrompt.js';
import { buildGenderRequest, genderResponseSchema } from '../../src/translate/genderPrompt.js';
import { makeTarget } from '../../src/language/target.js';
import { parseJsonArray } from '../../src/translate/mapResults.js';
import { chunk } from '../../src/translate/chunking.js';
import { diagGemini } from '../lib/live.mjs';
import { BENCHMARKS } from './benchmarks.js';
import { scoreGender, summarise } from './genderMetric.js';

// The benchmark measures Hebrew: its references are human Hebrew translations.
const HEBREW = makeTarget('heb');
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const CHUNK = 80;
const PARALLEL = 3;
const BASE_SCHEMA = {
  type: 'ARRAY',
  items: { type: 'OBJECT', properties: { id: { type: 'INTEGER' }, he: { type: 'STRING' } }, required: ['id', 'he'] },
};

// --- preparing a benchmark -------------------------------------------------

const cuesOf = async (url) => parseSubtitles(await downloadSource(url));

/** The English file and the Hebrew reference whose timings agree best. */
async function pickPair(bench, subtitles) {
  const english = subtitles.filter((s) => s.lang === 'eng').slice(0, 3);
  const hebrew = (bench.reference === 'wizdom' ? await listWizdom(bench) : subtitles.filter((s) => s.lang === 'heb')).slice(0, 6);
  if (!english.length || !hebrew.length) throw new Error(`need English and Hebrew files (eng ${english.length}, heb ${hebrew.length})`);

  const refs = (await Promise.all(hebrew.map((h) => cuesOf(h.url).catch(() => null)))).filter(Boolean);
  let best = null;
  for (const source of english) {
    const base = await cuesOf(source.url).catch(() => null);
    if (!base) continue;
    for (const ref of refs) {
      const aligned = alignByTime(base, ref);
      if (!best || aligned.peak > best.aligned.peak) best = { source, base, aligned };
    }
  }
  if (!best) throw new Error('no usable English / Hebrew pair');
  return best;
}

// --- variants --------------------------------------------------------------

function parseVariant(spec) {
  const flags = spec.split('+');
  const value = (name) => flags.find((f) => f.startsWith(`${name}=`))?.slice(name.length + 1);
  return {
    spec,
    base: spec === 'base',
    cast: flags.includes('cast'),
    alt: flags.includes('alt') ? 'all' : value('alt')?.split(',') || null,
    thinking: flags.find((f) => ['low', 'medium', 'high'].includes(f)) || 'minimal',
    model: value('model'),
  };
}

function requestFor(variant, { texts, ids, before, alt, context }) {
  if (variant.base) return { system: SYSTEM_PROMPT, user: userPayload(texts, 'eng', ids), responseSchema: BASE_SCHEMA };

  const wanted = (entry) => {
    if (!entry || !variant.alt) return undefined;
    if (variant.alt === 'all') return entry;
    const kept = Object.fromEntries(Object.entries(entry).filter(([label]) => variant.alt.includes(label)));
    return Object.keys(kept).length ? kept : undefined;
  };
  return {
    ...buildGenderRequest({
      texts,
      ids,
      sourceLang: 'eng',
      before,
      alt: alt.map(wanted),
      show: variant.cast ? context.show : null,
      characters: variant.cast ? context.characters : [],
      target: HEBREW,
    }),
    responseSchema: genderResponseSchema(HEBREW),
  };
}

async function runChunk(variant, job) {
  const request = requestFor(variant, job);
  const reply = await diagGemini({ ...request, thinkingLevel: variant.thinking, model: variant.model, timeoutMs: 90_000 });
  if (!reply.ok) return { error: reply.error, ms: reply.ms || 0, items: new Map() };

  const byId = new Map((parseJsonArray(reply.text) || []).map((item) => [Number(item?.id), item]));
  return { ms: reply.ms, usage: reply.usage || {}, items: byId, promptChars: request.system.length + request.user.length };
}

async function inBatches(jobs, size, work) {
  const results = [];
  for (let i = 0; i < jobs.length; i += size) results.push(...(await Promise.all(jobs.slice(i, i + size).map(work))));
  return results;
}

async function runVariant(variant, { texts, alt, context, reference }) {
  const jobs = chunk(texts.map((_, i) => i), CHUNK).map((indexes) => ({
    indexes,
    texts: indexes.map((i) => texts[i]),
    ids: lineIds(indexes.length),
    before: texts.slice(Math.max(0, indexes[0] - 8), indexes[0]),
    alt: indexes.map((i) => alt[i]),
    context,
  }));
  const replies = await inBatches(jobs, PARALLEL, (job) => runChunk(variant, job));

  const lines = new Array(texts.length).fill(undefined);
  const tally = { from: {}, to: {} };
  let ms = 0, tokensIn = 0, tokensOut = 0, thoughts = 0, errors = 0;
  replies.forEach((reply, n) => {
    if (reply.error) { errors++; console.log(`    chunk ${n + 1} failed: ${String(reply.error).slice(0, 140)}`); }
    ms += reply.ms || 0;
    tokensIn += reply.usage?.promptTokenCount || 0;
    tokensOut += reply.usage?.candidatesTokenCount || 0;
    thoughts += reply.usage?.thoughtsTokenCount || 0;
    jobs[n].indexes.forEach((line, k) => {
      const item = reply.items.get(jobs[n].ids[k]);
      if (!item || typeof item.he !== 'string' || !item.he.trim()) return;
      lines[line] = { he: item.he.trim(), from: item.from, to: item.to };
      if (item.from) tally.from[item.from] = (tally.from[item.from] || 0) + 1;
      if (item.to) tally.to[item.to] = (tally.to[item.to] || 0) + 1;
    });
  });

  const score = scoreGender(lines.map((l) => l?.he), reference);
  return {
    score,
    lines,
    stats: { chunks: jobs.length, errors, missing: lines.filter((l) => !l).length, avgChunkMs: Math.round(ms / jobs.length), tokensIn, tokensOut, thoughts, tally },
  };
}

// --- main ------------------------------------------------------------------

const [benchName, variantList = 'base', ...rest] = process.argv.slice(2);
const bench = BENCHMARKS[benchName];
if (!bench) {
  console.log(`benchmarks: ${Object.keys(BENCHMARKS).join(', ')}`);
  process.exit(1);
}
const limit = Number(rest.find((a) => a.startsWith('lines='))?.slice(6)) || 400;

const subtitles = await listOpenSubtitles(bench);
const pair = await pickPair(bench, subtitles);
const base = pair.base.slice(0, limit);
const reference = pair.aligned.texts.slice(0, limit);
console.log(`${benchName}: ${base.length} lines | Hebrew reference: timing peak ${pair.aligned.peak.toFixed(2)}, covers ${Math.round(100 * reference.filter(Boolean).length / base.length)}% of lines`);
if (pair.aligned.peak < 0.45) console.log('  WARNING: the reference does not line up with the English file; scores below are not reliable');

const [hints, context] = await Promise.all([
  gatherHints(base, subtitles, { exclude: ['target'], maxFiles: 4, target: HEBREW }),
  loadShowContext(bench),
]);
console.log(`  hint files: ${hints.used.map((u) => `${u.label} (peak ${u.peak}, covers ${Math.round(u.covered * 100)}%)`).join(', ') || 'none'}${hints.rejected.length ? ` | rejected: ${hints.rejected.map((r) => `${r.lang} ${r.why}`).join('; ')}` : ''}`);
console.log(`  context: ${context.show ? `"${context.show.title}" (${context.show.year})` : 'no title'}, characters with gender ${context.characters.length} (f ${context.characters.filter((c) => c.gender === 'f').length})`);

await mkdir(OUT_DIR, { recursive: true });
const texts = base.map((cue) => cue.text);
for (const spec of variantList.split(',')) {
  const variant = parseVariant(spec);
  const startedAt = Date.now();
  const result = await runVariant(variant, { texts, alt: hints.perLine, context, reference });
  const s = result.stats;
  console.log(`\n[${spec}]  ${summarise(result.score)}`);
  console.log(`    ${s.chunks} chunks, avg ${s.avgChunkMs} ms each, wall ${Math.round((Date.now() - startedAt) / 1000)} s | tokens in ${s.tokensIn}, out ${s.tokensOut}, thinking ${s.thoughts} | missing lines ${s.missing}, failed chunks ${s.errors}`);
  if (!variant.base) console.log(`    speaker ${JSON.stringify(s.tally.from)} | listener ${JSON.stringify(s.tally.to)}`);
  await writeFile(
    path.join(OUT_DIR, `${benchName}-${spec.replace(/[^a-z0-9+=,-]/gi, '_')}.json`),
    JSON.stringify({ benchmark: benchName, variant: spec, stats: s, score: result.score, lines: result.lines }, null, 1),
  );
}
