// Reads a subtitle file (SRT, WebVTT or ASS) into plain cues:
//   { start: "HH:MM:SS,mmm", end: "HH:MM:SS,mmm", text: "line\nline" }

import { toSrtTime } from './time.js';
import { cleanText } from './cleanText.js';
import { parseAss } from './parseAss.js';

const TIMING = /^\s*([\d:.,]+)\s+-->\s+([\d:.,]+)/;

function parseSrtLike(text) {
  const lines = text.split('\n');
  const cues = [];

  for (let i = 0; i < lines.length; i++) {
    const timing = TIMING.exec(lines[i]);
    if (!timing) continue;

    const body = [];
    // A cue's text runs until the next blank line.
    while (i + 1 < lines.length && lines[i + 1].trim() !== '') body.push(lines[++i]);

    const start = toSrtTime(timing[1]);
    const end = toSrtTime(timing[2]);
    const spoken = cleanText(body.join('\n'));
    if (start && end && spoken) cues.push({ start, end, text: spoken });
  }
  return cues;
}

export function parseSubtitles(raw) {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const isAss = /^\[Script Info\]/im.test(text) || /^Dialogue:/m.test(text);
  return isAss ? parseAss(text) : parseSrtLike(text);
}
