// Turns the model's reply into an array aligned with the input lines.
// Missing or malformed entries stay undefined so the caller can fill exactly
// those from the fallback translator.

/** Models sometimes wrap the JSON in prose or a code fence; dig the array out. */
export function parseJsonArray(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fall through to the bracket search
  }
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {Array<object>} items the model's reply
 * @param {number[]} ids the id sent with each line, in line order
 * @param {string} field the reply field that holds the translation (the
 *   target language's label, e.g. "he")
 * @returns {Array<string|undefined>} one entry per line. Position in the
 *   reply is never trusted: a line is filled only by an item carrying its id.
 */
export function mapById(items, ids, field) {
  const out = new Array(ids.length).fill(undefined);
  if (!Array.isArray(items)) return out;

  const lineOf = new Map(ids.map((id, line) => [id, line]));
  for (const item of items) {
    const line = lineOf.get(Number(item?.id));
    const text = typeof item?.[field] === 'string' ? item[field].trim() : '';
    if (line !== undefined && text) out[line] = text;
  }
  return out;
}
