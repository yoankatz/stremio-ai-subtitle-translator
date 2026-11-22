// One chunk of lines through the whole pipeline:
//
//   1. lines with no words are copied as they are;
//   2. Gemini translates the chunk (all lines, so it has context);
//   3. lines Gemini skipped are asked again on their own - a model that
//      dropped a line in a long reply usually returns it in a short one;
//   4. whatever is still missing goes to Google Translate;
//   5. if that fails too, the line stays in the source language rather than
//      failing a file that is otherwise translated.
//
// The translators are passed in, so the pipeline can be tested without a
// network.

import { hasWords } from './lineKinds.js';

const preview = (text) => text.replace(/\s+/g, ' ').slice(0, 50);

/**
 * What Gemini is told for a subset of the chunk's lines: each line keeps its
 * own hints; the lines-before context only makes sense for the whole chunk.
 */
function contextFor(indexes, context, isWholeChunk) {
  return {
    show: context.show ?? null,
    characters: context.characters ?? [],
    alt: indexes.map((i) => context.alt?.[i]),
    before: isWholeChunk ? context.before ?? [] : [],
  };
}

/**
 * @param {object} deps
 * @param {(texts:string[], sourceLang:string, priority:string, context:object) => Promise<{lines:Array<string|undefined>, returned:number, finishReason:string}>} deps.gemini
 * @param {(texts:string[], sourceLang:string) => Promise<string[]>} deps.google
 * @param {() => boolean} deps.geminiUsable
 * @param {(kind:string, data:object) => void} deps.log
 */
export function createChunkTranslator({ gemini, google, geminiUsable, log }) {
  /** Asks Gemini for the given line indexes and fills what it returned. */
  async function askGemini(indexes, texts, out, { sourceLang, priority, context }) {
    let reply;
    try {
      const whole = indexes.length === texts.length;
      reply = await gemini(indexes.map((i) => texts[i]), sourceLang, priority, contextFor(indexes, context, whole));
    } catch {
      return { filled: 0, reply: null }; // already logged by the retry wrapper
    }
    let filled = 0;
    indexes.forEach((index, k) => {
      if (out[index] === undefined && reply.lines[k]) {
        out[index] = reply.lines[k];
        filled++;
      }
    });
    return { filled, reply };
  }

  /**
   * @param {string[]} texts
   * @param {{sourceLang:string, priority:string, counts:object, context?:{alt?:Array, before?:string[], show?:object|null, characters?:Array}}} options
   */
  return async function translateChunk(texts, { sourceLang, priority, counts, context = {} }) {
    const out = texts.map((text) => (hasWords(text) ? undefined : text));
    const missing = () => out.flatMap((text, i) => (text === undefined ? [i] : []));
    counts.kept += texts.length - missing().length;

    let fromGemini = 0;
    if (geminiUsable() && missing().length) {
      // The full chunk is sent, wordless lines included, so ids stay aligned
      // with the file and the model sees the dialogue around each line.
      const all = texts.map((_, i) => i);
      const first = await askGemini(all, texts, out, { sourceLang, priority, context });
      fromGemini += first.filled;

      const skipped = missing();
      if (first.reply && skipped.length) {
        log('gemini-skipped', {
          of: texts.length,
          skipped: skipped.length,
          returned: first.reply.returned,
          finishReason: first.reply.finishReason,
          indexes: skipped.slice(0, 12),
          sample: skipped.slice(0, 3).map((i) => preview(texts[i])),
        });
        if (geminiUsable()) fromGemini += (await askGemini(skipped, texts, out, { sourceLang, priority, context })).filled;
      }
    }
    counts.gemini += fromGemini;

    const rest = missing();
    if (!rest.length) return out;

    try {
      const filled = await google(rest.map((i) => texts[i]), sourceLang);
      rest.forEach((index, k) => {
        if (!filled[k]) return;
        out[index] = filled[k];
        counts.google++;
      });
    } catch (error) {
      // Nothing in this chunk is translated: better to fail the file (the
      // viewer is told, and it is retried) than to show it in the source language.
      if (fromGemini === 0) throw error;
      log('fallback-failed', { lines: rest.length, error: error.message });
    }

    for (const index of missing()) {
      out[index] = texts[index];
      counts.source++;
    }
    return out;
  };
}
