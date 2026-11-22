// Minimal ASS/SSA reader: anime subtitles are often in this format. Only the
// timing and the spoken text are kept; positioning and effects are dropped.

import { toSrtTime } from './time.js';
import { cleanText } from './cleanText.js';

const DEFAULT_FORMAT = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];

function eventFormat(lines) {
  const inEvents = lines.slice(lines.findIndex((l) => /^\[Events\]/i.test(l.trim())) + 1);
  const format = inEvents.find((l) => /^Format:/i.test(l));
  return format
    ? format.slice(format.indexOf(':') + 1).split(',').map((f) => f.trim().toLowerCase())
    : DEFAULT_FORMAT;
}

export function parseAss(text) {
  const lines = text.split('\n');
  const format = eventFormat(lines);
  const startAt = format.indexOf('start');
  const endAt = format.indexOf('end');
  const textAt = format.indexOf('text');
  if (startAt < 0 || endAt < 0 || textAt < 0) return [];

  const cues = [];
  for (const line of lines) {
    if (!/^Dialogue:/i.test(line)) continue;
    const raw = line.slice(line.indexOf(':') + 1);
    // The text field is last and may itself contain commas.
    const fields = raw.split(',');
    const body = fields.slice(textAt).join(',');
    // {\p1} switches to vector drawing: the "text" is coordinates, not speech.
    if (/\\p[1-9]/.test(body)) continue;

    const start = toSrtTime(fields[startAt] ?? '');
    const end = toSrtTime(fields[endAt] ?? '');
    const spoken = cleanText(body.replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' '));
    if (start && end && spoken) cues.push({ start, end, text: spoken });
  }
  // ASS files are not required to be in time order; SRT players expect it.
  return cues.sort((a, b) => a.start.localeCompare(b.start));
}
