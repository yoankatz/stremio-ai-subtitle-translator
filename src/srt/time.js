// Subtitle timestamps arrive as "1:02:03.45" (ASS), "02:03.450" (VTT) or
// "01:02:03,450" (SRT). Everything is normalised to the SRT form.

const pad = (n, width) => String(n).padStart(width, '0');

/** @returns {string|null} "HH:MM:SS,mmm", or null when the text is not a timestamp. */
export function toSrtTime(text) {
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(text.trim());
  if (!m) return null;
  // ".45" means 450 ms, not 45 ms: pad the fraction on the right.
  const millis = m[4].padEnd(3, '0');
  return `${pad(m[1] ?? 0, 2)}:${pad(m[2], 2)}:${m[3]},${millis}`;
}
