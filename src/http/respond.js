// Small response helpers. Stremio's web player runs on another origin, so
// every answer carries permissive CORS headers.

export const CORS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
});

export const SRT_TYPE = 'application/x-subrip; charset=utf-8';

function send(res, status, body, headers) {
  res.writeHead(status, { ...CORS, 'Content-Length': Buffer.byteLength(body), ...headers });
  // HEAD gets the headers only.
  res.end(res.req.method === 'HEAD' ? undefined : body);
}

export const sendJson = (res, status, data, headers = {}) =>
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', ...headers });

export const sendText = (res, status, text, headers = {}) =>
  send(res, status, text, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });

export const sendSrt = (res, srt, headers = {}) => send(res, 200, srt, { 'Content-Type': SRT_TYPE, ...headers });
