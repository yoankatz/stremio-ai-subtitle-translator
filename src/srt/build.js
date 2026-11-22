// Writes cues back as an SRT file.
//
// For a right-to-left language each line is wrapped in right-to-left
// embedding marks: without them most players lay the line out left-to-right
// and the full stop or question mark lands on the wrong side.

const RLE = '‫'; // start right-to-left embedding
const PDF = '‬'; // end embedding

const embed = (text) => text.split('\n').map((line) => `${RLE}${line}${PDF}`).join('\n');

/**
 * @param {Array<{start:string, end:string, text:string}>} cues
 * @param {{rtl?:boolean}} [options] rtl = the text is in a right-to-left language
 */
export function buildSrt(cues, { rtl = false } = {}) {
  return cues.map((cue, i) => `${i + 1}\n${cue.start} --> ${cue.end}\n${rtl ? embed(cue.text) : cue.text}\n`).join('\n');
}

/** A one-cue file, used to tell the viewer something went wrong. */
export function noticeSrt(message, { rtl = false, seconds = 30 } = {}) {
  const end = `00:00:${String(seconds).padStart(2, '0')},000`;
  return buildSrt([{ start: '00:00:00,500', end, text: message }], { rtl });
}
