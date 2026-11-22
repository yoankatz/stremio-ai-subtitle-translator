// Reads a JSON request body with a size cap, so a diagnostics call cannot
// make the server buffer an unbounded upload.

export class BodyError extends Error {}

/** @returns {Promise<object>} the parsed body; throws BodyError when too large or not JSON */
export function readJsonBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;

    req.on('data', (part) => {
      size += part.length;
      if (size > limitBytes) {
        reject(new BodyError('request body too large'));
        req.destroy();
        return;
      }
      parts.push(part);
    });
    req.on('error', reject);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(parts).toString('utf8'));
        if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
        resolve(parsed);
      } catch {
        reject(new BodyError('request body is not JSON'));
      }
    });
  });
}
