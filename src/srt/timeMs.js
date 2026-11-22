// Cue times are kept as SRT text ("HH:MM:SS,mmm"). Comparing two subtitle
// files by time needs them as numbers.

/** @returns {number} milliseconds, or NaN when the text is not an SRT time */
export function srtTimeToMs(time) {
  const m = /^(\d+):(\d{2}):(\d{2}),(\d{3})$/.exec(time);
  return m ? ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Number(m[4]) : NaN;
}
