// Owner checks against the live addon. Prints numbers and metadata only -
// never subtitle text, never the secret.
//
//   node tools/live-check.mjs selftest
//   node tools/live-check.mjs status [events]
//   node tools/live-check.mjs open <movie|series> <id>      what the player is offered (starts nothing extra)
//   node tools/live-check.mjs machine <movie|series> <id>   downloads the machine translation and checks it

import { parseSubtitles } from '../src/srt/parse.js';
import { alignByTime } from '../src/hints/align.js';
import { baseUrl, scrub } from './lib/live.mjs';

const getJson = async (path) => (await fetch(`${baseUrl()}/${path}`)).json();

// 'ai-' since 1.2; 'heb-ai-' before.
const isMachine = (sub) => /^(heb-)?ai-/.test(String(sub.id));
const hostOf = (url) => new URL(url).hostname.split('.').slice(-2).join('.');

async function list(type, id) {
  return (await getJson(`subtitles/${type}/${encodeURIComponent(id)}.json`)).subtitles || [];
}

function describeList(subs) {
  const existing = subs.filter((s) => !isMachine(s));
  const machine = subs.filter(isMachine);
  console.log(`existing in the target language: ${existing.length}${existing.length ? ` (${existing.map((s) => `${s.lang} @ ${hostOf(s.url)}`).join(', ')})` : ''}`);
  console.log(`machine translation: ${machine.length} offered, label "${machine[0]?.lang ?? '-'}"`);
}

/** The English source URL is the first base64url segment of a machine link. */
const sourceUrlOf = (link) => Buffer.from(link.split('/sub/')[1].split('/')[0], 'base64url').toString('utf8');

async function download(url) {
  const startedAt = Date.now();
  const res = await fetch(url);
  let firstByteMs = null;
  let text = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    firstByteMs ??= Date.now() - startedAt;
    text += decoder.decode(value, { stream: true });
  }
  return { status: res.status, firstByteMs, totalMs: Date.now() - startedAt, text };
}

const strip = (text) => text.replace(/[‪-‮⁦-⁩]/g, '');

const [mode, ...args] = process.argv.slice(2);

if (mode === 'selftest') {
  const r = await getJson('selftest');
  console.log(scrub(JSON.stringify({ ok: r.ok, target: r.target, provider: r.provider, ms: r.ms, translator: r.translator })));
} else if (mode === 'status') {
  const s = await getJson('status');
  console.log(scrub(JSON.stringify({ version: s.version, uptimeSeconds: s.uptimeSeconds, target: s.target, translator: s.translator, cache: s.cache, jobsInFlight: s.jobsInFlight })));
  for (const event of (s.recent || []).slice(0, Number(args[0] || 12)).reverse()) {
    delete event.sample; // source dialogue
    console.log(scrub(JSON.stringify(event)));
  }
} else if (mode === 'open') {
  describeList(await list(args[0], args[1]));
} else if (mode === 'machine') {
  const subs = await list(args[0], args[1]);
  describeList(subs);
  const machine = subs.find(isMachine);
  // No early process.exit here: on Windows it aborts while a connection is closing.
  if (machine) {
    const file = await download(machine.url);
    const hebrew = parseSubtitles(strip(file.text));
    const english = parseSubtitles(await fetch(sourceUrlOf(machine.url)).then((r) => r.text()));
    const aligned = alignByTime(english, hebrew);
    const withHebrew = hebrew.filter((c) => /[א-ת]/.test(c.text)).length; // meaningful for a Hebrew target only
    const leftLatin = hebrew.filter((c) => !/[א-ת]/.test(c.text) && /[A-Za-z]{3,}/.test(c.text)).length;
    console.log(`file http ${file.status}, first byte ${file.firstByteMs} ms, total ${file.totalMs} ms`);
    console.log(`cues ${hebrew.length} (source ${english.length}), timing agreement ${aligned.peak.toFixed(2)}, lines with Hebrew ${withHebrew}, lines left in Latin letters ${leftLatin}`);
  } else {
    console.log('nothing to translate from (no source subtitle for this video yet)');
  }
} else {
  console.log('usage: selftest | status [events] | open <type> <id> | machine <type> <id>');
}
