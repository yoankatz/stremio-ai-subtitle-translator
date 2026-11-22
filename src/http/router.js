// Maps URLs to handlers. Everything except /health sits behind the secret
// path segment:  /<secret>/manifest.json, /<secret>/subtitles/..., etc.

import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { CORS, sendJson, sendText } from './respond.js';
import { BodyError, readJsonBody } from './readBody.js';
import { manifest } from '../routes/manifest.js';
import { subtitlesList } from '../routes/subtitlesList.js';
import { subtitleFile } from '../routes/subtitleFile.js';
import { selfTest, status } from '../routes/status.js';
import { diagGemini, diagModels } from '../routes/diagGemini.js';
import { logEvent } from '../util/log.js';

// A diagnostics prompt carries a whole episode of lines plus hints.
const DIAG_BODY_LIMIT = 800 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };

function secretMatches(candidate) {
  const given = Buffer.from(candidate ?? '');
  const expected = Buffer.from(config.secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Railway terminates TLS, so the public scheme is in x-forwarded-proto.
function publicBase(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return `${proto}://${req.headers.host}/${config.secret}`;
}

const stripJson = (segment) => segment.replace(/\.json$/, '');

const safeDecode = (segment) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/**
 * Owner diagnostics: /<secret>/diag/models (GET), /<secret>/diag/gemini (POST).
 * They exist only when DIAG_ROUTES is on: the addon URL is shared with every
 * device that plays through it, and these let its holder run any prompt on
 * the owner's key.
 */
async function routeDiag(req, res, [tool]) {
  if (!config.diagRoutes) return sendText(res, 404, 'not found');
  if (tool === 'models' && req.method === 'GET') return sendJson(res, 200, await diagModels(), NO_STORE);
  if (tool === 'gemini' && req.method === 'POST') {
    try {
      return sendJson(res, 200, await diagGemini(await readJsonBody(req, DIAG_BODY_LIMIT)), NO_STORE);
    } catch (error) {
      if (error instanceof BodyError) return sendText(res, 400, error.message);
      throw error;
    }
  }
  return sendText(res, 404, 'not found');
}

async function routePrivate(req, res, [route, ...rest]) {
  if (route === 'diag') return routeDiag(req, res, rest);
  // Everything below is read-only.
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'method not allowed');

  if (route === 'manifest.json') return sendJson(res, 200, manifest, { 'Cache-Control': 'max-age=3600' });
  if (route === 'status') return sendJson(res, 200, await status(), NO_STORE);
  if (route === 'selftest') return sendJson(res, 200, await selfTest(), NO_STORE);

  // /subtitles/<type>/<id>.json   or   /subtitles/<type>/<id>/<extra>.json
  if (route === 'subtitles' && (rest.length === 2 || rest.length === 3)) {
    const hasExtra = rest.length === 3;
    const body = await subtitlesList({
      videoId: safeDecode(hasExtra ? rest[1] : stripJson(rest[1])),
      extra: hasExtra ? stripJson(rest[2]) : undefined, // passed on still encoded
      baseUrl: publicBase(req),
    });
    return sendJson(res, 200, body, { 'Cache-Control': 'max-age=60' });
  }

  // /sub/<encoded source>/<source lang>/<encoded video>/translated.srt
  // (links issued by version 1.0 have no video segment and still work)
  if (route === 'sub' && (rest.length === 3 || rest.length === 4)) {
    return subtitleFile(req, res, { encodedSource: rest[0], lang: rest[1], encodedVideo: rest.length === 4 ? rest[2] : undefined });
  }

  return sendText(res, 404, 'not found');
}

export async function handleRequest(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) return sendText(res, 405, 'method not allowed');

    const segments = req.url.split('?')[0].split('/').filter(Boolean);
    if (segments[0] === 'health') return sendText(res, 200, 'ok');
    // Wrong or missing secret looks exactly like an unknown page.
    if (!secretMatches(segments[0])) return sendText(res, 404, 'not found');

    return await routePrivate(req, res, segments.slice(1));
  } catch (error) {
    logEvent('request-failed', { error: error.message });
    if (!res.headersSent) sendText(res, 500, 'server error');
    else res.end();
  }
}
