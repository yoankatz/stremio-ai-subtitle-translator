// Finished translations, kept forever: a translated episode must never be
// translated again, on any device. Two layers: a small in-memory map for
// speed and files on disk (Railway volume) that survive restarts.

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { logEvent } from '../util/log.js';

const MEMORY_MAX = 300;
const KEY = /^[a-f0-9]{24}$/;
const memory = new Map();

let dirReady = null;
// If the volume is missing or read-only the addon still works from memory;
// it just forgets on restart.
const ensureDir = () =>
  (dirReady ??= mkdir(config.cacheDir, { recursive: true }).then(
    () => true,
    (error) => {
      logEvent('cache-dir-error', { error: error.message });
      return false;
    },
  ));

const fileFor = (key, ext) => path.join(config.cacheDir, `${key}.${ext}`);

function remember(key, entry) {
  memory.delete(key);
  memory.set(key, entry);
  if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value);
}

// Write to a temp name and rename, so a crash never leaves half a file.
async function writeAtomic(file, content) {
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, content, 'utf8');
  await rename(temp, file);
}

/** @returns {Promise<{srt:string, meta:object} | null>} */
export async function cacheGet(key) {
  if (!KEY.test(key)) return null;
  if (memory.has(key)) return memory.get(key);
  if (!(await ensureDir())) return null;
  try {
    const [srt, meta] = await Promise.all([readFile(fileFor(key, 'srt'), 'utf8'), readFile(fileFor(key, 'json'), 'utf8')]);
    const entry = { srt, meta: JSON.parse(meta) };
    remember(key, entry);
    return entry;
  } catch {
    return null; // not translated yet
  }
}

export async function cacheSet(key, srt, meta) {
  if (!KEY.test(key)) return;
  remember(key, { srt, meta });
  if (!(await ensureDir())) return;
  try {
    // The .json is written last: a reader needs both, so it marks "complete".
    await writeAtomic(fileFor(key, 'srt'), srt);
    await writeAtomic(fileFor(key, 'json'), JSON.stringify(meta));
  } catch (error) {
    logEvent('cache-write-error', { key, error: error.message });
  }
}

export async function cacheStats() {
  if (!(await ensureDir())) return { onDisk: 0, inMemory: memory.size, persistent: false };
  const files = await readdir(config.cacheDir).catch(() => []);
  return { onDisk: files.filter((f) => f.endsWith('.json')).length, inMemory: memory.size, persistent: true };
}
