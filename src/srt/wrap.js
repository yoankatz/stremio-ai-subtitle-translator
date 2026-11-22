// A long single-line subtitle covers the picture edge to edge. Split it into
// two balanced lines at the space nearest the middle.

const MAX_LINE = 42;

export function wrapLine(text, max = MAX_LINE) {
  if (text.includes('\n') || text.length <= max) return text;

  const middle = Math.floor(text.length / 2);
  const after = text.indexOf(' ', middle);
  const before = text.lastIndexOf(' ', middle);
  const candidates = [before, after].filter((i) => i > 0);
  if (!candidates.length) return text;

  const at = candidates.reduce((best, i) => (Math.abs(i - middle) < Math.abs(best - middle) ? i : best));
  return `${text.slice(0, at)}\n${text.slice(at + 1)}`;
}
