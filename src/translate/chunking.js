// How a file is cut into translation requests.
//
// An episode (~400 lines) is cut at the configured size and its few chunks
// run in parallel. A feature film (~1,700 lines) at that size would need 20+
// requests and trip the free-tier rate limit, so its chunks grow instead —
// up to a size the model still returns reliably in one reply.

const MAX_CHUNKS = 12;
const MAX_CHUNK_SIZE = 160;

export function chunkSizeFor(lineCount, baseSize) {
  return Math.min(MAX_CHUNK_SIZE, Math.max(baseSize, Math.ceil(lineCount / MAX_CHUNKS)));
}

export function chunk(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}
