// Strips styling markup that would otherwise be "translated" into garbage:
// HTML-like tags (<i>, <font ...>) and ASS override blocks ({\an8}, {\i1}).

export function cleanText(text) {
  return text
    .replace(/\{[^}]*\}/g, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
