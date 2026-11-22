// Entry point: checks the configuration and starts the HTTP server.

import http from 'node:http';
import { ADDON_VERSION, config } from './config.js';
import { handleRequest } from './http/router.js';
import { geminiConfigured } from './translate/gemini.js';
import { googleFallbackEnabled } from './translate/googleTranslate.js';
import { target } from './language/target.js';
import { logEvent } from './util/log.js';

const MIN_SECRET_LENGTH = 16;

if (config.secret.length < MIN_SECRET_LENGTH) {
  // Running open would let anyone who finds the host spend the Gemini quota.
  console.error(`ADDON_SECRET must be set (at least ${MIN_SECRET_LENGTH} characters).`);
  process.exit(1);
}

const server = http.createServer(handleRequest);

server.listen(config.port, '0.0.0.0', () => {
  logEvent('started', {
    version: ADDON_VERSION,
    port: config.port,
    cacheDir: config.cacheDir,
    target: target.code + ' (' + target.name + ')',
    gemini: geminiConfigured() ? config.gemini.model : 'not configured',
    googleFallback: googleFallbackEnabled(),
    diagRoutes: config.diagRoutes,
  });
});

// Let held subtitle downloads finish when Railway replaces the container.
process.on('SIGTERM', () => server.close(() => process.exit(0)));
