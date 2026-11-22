// Lines up a second subtitle file (another language, usually another release)
// with the cues being translated, by time.
//
// Two files of the same film rarely share timings: one may start a few
// seconds later, one may be cut for a different frame rate. A hint taken from
// the wrong moment is worse than no hint, so this module first measures
// whether the files agree at all ("peak"), and only then pairs lines.

import { srtTimeToMs } from '../srt/timeMs.js';

const BIN_MS = 100;
const SEARCH_MS = 20_000; // how far apart two releases are allowed to start
const MIN_SHARE = 0.6; // of the shorter cue that must overlap to count as "the same moment"
const MAX_PARTS = 2; // one line here is at most two cues there

const toSpan = (cue) => ({ start: srtTimeToMs(cue.start), end: srtTimeToMs(cue.end), text: cue.text });
const valid = (span) => Number.isFinite(span.start) && Number.isFinite(span.end) && span.end > span.start;
const byStart = (a, b) => a.start - b.start;

/**
 * The constant shift (other minus base) most cue starts agree on.
 * @returns {{offsetMs:number, peak:number}} peak = share of base cues whose
 *   start matches a cue in the other file under that shift (within ~150 ms).
 *   Files of the same cut score high; unrelated timings stay near zero.
 */
export function estimateOffset(base, other) {
  const votes = new Map();
  let from = 0;
  for (const b of base) {
    while (from < other.length && other[from].start < b.start - SEARCH_MS) from++;
    for (let k = from; k < other.length && other[k].start <= b.start + SEARCH_MS; k++) {
      const bin = Math.round((other[k].start - b.start) / BIN_MS);
      votes.set(bin, (votes.get(bin) || 0) + 1);
    }
  }

  let best = 0;
  let bestScore = 0;
  for (const bin of votes.keys()) {
    // Neighbouring bins count too: a true shift straddles a bin edge.
    const score = (votes.get(bin - 1) || 0) + votes.get(bin) + (votes.get(bin + 1) || 0);
    if (score > bestScore || (score === bestScore && Math.abs(bin) < Math.abs(best))) {
      best = bin;
      bestScore = score;
    }
  }
  return { offsetMs: best * BIN_MS, peak: base.length ? Math.min(1, bestScore / base.length) : 0 };
}

/**
 * @param {Array<{start:string,end:string,text:string}>} baseCues the cues being translated
 * @param {Array<{start:string,end:string,text:string}>} otherCues the other file
 * @returns {{texts:Array<string|undefined>, peak:number, offsetMs:number, covered:number}}
 *   texts[i] is the other file's text for base cue i (undefined when no cue
 *   there clearly covers the same moment); covered = share of lines that got one.
 */
export function alignByTime(baseCues, otherCues) {
  const base = baseCues.map(toSpan);
  const other = otherCues.map(toSpan).filter(valid).sort(byStart);
  const { offsetMs, peak } = estimateOffset(base.filter(valid).sort(byStart), other);

  const texts = new Array(base.length).fill(undefined);
  let covered = 0;
  let from = 0;

  for (let i = 0; i < base.length; i++) {
    const b = base[i];
    if (!valid(b)) continue;
    // `other` is sorted; cues are short, so a small look-back is enough.
    while (from < other.length && other[from].end - offsetMs < b.start - 30_000) from++;

    const parts = [];
    for (let k = from; k < other.length && other[k].start - offsetMs < b.end; k++) {
      const start = other[k].start - offsetMs;
      const end = other[k].end - offsetMs;
      const overlap = Math.min(b.end, end) - Math.max(b.start, start);
      if (overlap <= 0) continue;
      if (overlap / Math.min(b.end - b.start, end - start) >= MIN_SHARE) parts.push(other[k].text);
    }
    if (parts.length && parts.length <= MAX_PARTS) {
      texts[i] = parts.join(' ').replace(/\s+/g, ' ').trim();
      covered++;
    }
  }
  return { texts, peak, offsetMs, covered: base.length ? covered / base.length : 0 };
}
