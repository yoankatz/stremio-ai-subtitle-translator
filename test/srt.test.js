import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubtitles } from '../src/srt/parse.js';
import { buildSrt } from '../src/srt/build.js';
import { wrapLine } from '../src/srt/wrap.js';
import { toSrtTime } from '../src/srt/time.js';

test('parses SRT with CRLF, a BOM and styling tags', () => {
  const raw = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\n<i>Good morning.</i>\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\n{\\an8}- Who is it?\r\n- It is me.\r\n';
  assert.deepEqual(parseSubtitles(raw), [
    { start: '00:00:01,000', end: '00:00:03,500', text: 'Good morning.' },
    { start: '00:00:04,000', end: '00:00:06,000', text: '- Who is it?\n- It is me.' },
  ]);
});

test('parses WebVTT timings without an hour part', () => {
  const raw = 'WEBVTT\n\n01:02.500 --> 01:04.000\nSee you tomorrow.\n';
  assert.deepEqual(parseSubtitles(raw), [{ start: '00:01:02,500', end: '00:01:04,000', text: 'See you tomorrow.' }]);
});

test('parses ASS dialogue, skips drawings, sorts by time', () => {
  const raw = [
    '[Script Info]',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:05.00,0:00:07.50,Default,,0,0,0,,Second line, with a comma',
    'Dialogue: 0,0:00:01.25,0:00:03.00,Default,,0,0,0,,{\\i1}First{\\i0}\\Nline',
    'Dialogue: 0,0:00:08.00,0:00:09.00,Default,,0,0,0,,{\\p1}m 0 0 l 10 10{\\p0}',
  ].join('\n');
  assert.deepEqual(parseSubtitles(raw), [
    { start: '00:00:01,250', end: '00:00:03,000', text: 'First\nline' },
    { start: '00:00:05,000', end: '00:00:07,500', text: 'Second line, with a comma' },
  ]);
});

test('drops cues that are empty after cleaning', () => {
  assert.deepEqual(parseSubtitles('1\n00:00:01,000 --> 00:00:02,000\n<i></i>\n'), []);
});

test('time fractions are padded on the right', () => {
  assert.equal(toSrtTime('0:00:01.5'), '00:00:01,500');
  assert.equal(toSrtTime('not a time'), null);
});

test('builds numbered SRT with right-to-left marks on every line for a right-to-left language', () => {
  const srt = buildSrt([{ start: '00:00:01,000', end: '00:00:02,000', text: 'שלום\nמה נשמע?' }], { rtl: true });
  assert.equal(srt, '1\n00:00:01,000 --> 00:00:02,000\n‫שלום‬\n‫מה נשמע?‬\n');
});

test('adds no direction marks for a left-to-right language', () => {
  const srt = buildSrt([{ start: '00:00:01,000', end: '00:00:02,000', text: 'Hola\n¿Qué tal?' }]);
  assert.equal(srt, '1\n00:00:01,000 --> 00:00:02,000\nHola\n¿Qué tal?\n');
});

test('wraps only long single lines, near the middle', () => {
  assert.equal(wrapLine('קצר'), 'קצר');
  assert.equal(wrapLine('שורה אחת\nשורה שתיים שכבר מחולקת ולכן לא נוגעים בה בכלל'), 'שורה אחת\nשורה שתיים שכבר מחולקת ולכן לא נוגעים בה בכלל');
  const wrapped = wrapLine('זאת שורה ארוכה מאוד של כתובית שצריך לחלק לשתי שורות מאוזנות');
  const [first, second] = wrapped.split('\n');
  assert.ok(second, 'expected two lines');
  assert.ok(Math.abs(first.length - second.length) < 12);
});
