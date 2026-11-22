// A safety net for a repository meant to be shared: no file in it may look
// like it contains a key, a token or a filled-in secret. It does not replace
// looking before committing - it catches the obvious slip.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Not part of what is shared (see .gitignore), or not text.
const SKIP_DIRS = new Set(['.git', 'node_modules', 'cache', 'out']);
const SKIP_FILES = new Set(['OWNER-NOTES.md', 'local.json', '.env']);
const TEXT = /\.(js|mjs|cjs|json|md|txt|svg|yml|yaml|toml|example|gitignore)$|^\.env\.example$/;

const PATTERNS = [
  ['Google API key', /AIza[0-9A-Za-z_-]{30,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['OpenAI-style key', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['filled-in secret variable', /^(ADDON_SECRET|GEMINI_API_KEY)=\S+/m],
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* files(full);
    } else if (!SKIP_FILES.has(name) && TEXT.test(name)) {
      yield full;
    }
  }
}

test('no file in the repository contains a key, a token or a filled-in secret', () => {
  const found = [];
  for (const file of files(ROOT)) {
    const text = readFileSync(file, 'utf8');
    for (const [what, pattern] of PATTERNS) if (pattern.test(text)) found.push(`${path.relative(ROOT, file)}: ${what}`);
  }
  assert.deepEqual(found, []);
});
