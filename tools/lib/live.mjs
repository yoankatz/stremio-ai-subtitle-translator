// Access to a running addon for the owner's tools (tools/live-check.mjs,
// tools/eval). Where the server is comes from, in order:
//   1. the ADDON_URL environment variable: https://host/<ADDON_SECRET>
//   2. tools/local.json (not committed - see tools/local.example.json):
//      "addonUrl", or "host" + "railwayService", in which case the secret is
//      read from Railway at run time with the Railway CLI.
// The secret is never printed and never written to disk by these tools.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOCAL_FILE = path.join(ROOT, 'tools', 'local.json');

function localSettings() {
  try {
    return JSON.parse(readFileSync(LOCAL_FILE, 'utf8'));
  } catch {
    return {};
  }
}

const trimSlash = (url) => String(url).replace(/\/+$/, '');

let resolved;
function resolveBase() {
  if (resolved) return resolved;
  const fromEnv = (process.env.ADDON_URL || '').trim();
  const local = localSettings();
  const direct = fromEnv || (local.addonUrl && !local.addonUrl.includes('<') ? local.addonUrl : '');

  if (direct) {
    const base = trimSlash(direct).replace(/\/manifest\.json$/, '');
    resolved = { base, secret: base.split('/').pop() };
  } else if (local.host && local.railwayService) {
    const vars = JSON.parse(execSync(`railway variables --service ${local.railwayService} --json`, { cwd: ROOT, encoding: 'utf8' }));
    resolved = { base: `${trimSlash(local.host)}/${vars.ADDON_SECRET}`, secret: vars.ADDON_SECRET };
  } else {
    throw new Error('Set ADDON_URL (https://host/<ADDON_SECRET>) or create tools/local.json - see tools/local.example.json.');
  }
  return resolved;
}

export const baseUrl = () => resolveBase().base;

/** Removes the secret from text that is about to be printed. */
export const scrub = (text) => String(text).split(resolveBase().secret).join('<secret>');

/** Runs one Gemini call on the server (where the API key lives). Needs DIAG_ROUTES=on there. */
export async function diagGemini(body) {
  const res = await fetch(`${baseUrl()}/diag/gemini`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (res.status === 404) return { ok: false, status: 404, error: 'diagnostics are off on the server (set DIAG_ROUTES=on)' };
  if (!res.ok) return { ok: false, status: res.status, error: `diag HTTP ${res.status}` };
  return res.json();
}

export async function diagModels() {
  const res = await fetch(`${baseUrl()}/diag/models`, { signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) return { ok: false, error: 'diagnostics are off on the server (set DIAG_ROUTES=on)' };
  return res.ok ? res.json() : { ok: false, error: `diag HTTP ${res.status}` };
}
