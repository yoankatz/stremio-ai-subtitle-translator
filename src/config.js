// Every environment-driven setting lives here, so no other module reads
// process.env and the deploy contract is visible in one file.
// .env.example lists the same settings with explanations for whoever deploys.

const env = (name) => (process.env[name] || '').trim();

const positiveInt = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

const nonNegativeInt = (name, fallback) => {
  const n = Number(process.env[name]);
  return env(name) !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

/** "on"/"off" switch; anything else (or nothing) keeps the default. */
const flag = (name, fallback) => {
  const value = env(name).toLowerCase();
  if (['on', 'true', '1', 'yes'].includes(value)) return true;
  if (['off', 'false', '0', 'no'].includes(value)) return false;
  return fallback;
};

export const ADDON_VERSION = '1.2.0';

export const config = Object.freeze({
  port: positiveInt('PORT', 7860),

  // Secret path segment: the addon URL is https://host/<secret>/manifest.json.
  // Without it anyone who finds the host could spend the Gemini quota.
  secret: env('ADDON_SECRET'),

  // On Railway this points at the mounted volume so translations survive deploys.
  cacheDir: env('CACHE_DIR') || './cache',

  // The language to translate into (see src/language/profiles.js for the
  // built-in codes). The TARGET_LANG_* values describe a language that is not
  // built in, or adjust one that is.
  targetLang: env('TARGET_LANG').toLowerCase() || 'heb',
  targetCustom: Object.freeze({
    name: env('TARGET_LANG_NAME'),
    label: env('TARGET_LANG_LABEL'),
    google: env('TARGET_LANG_GOOGLE'),
    rtl: env('TARGET_LANG_RTL') === '' ? undefined : flag('TARGET_LANG_RTL', false),
    strings: Object.freeze({
      addonName: env('ADDON_NAME'),
      machineLabel: env('MACHINE_LABEL'),
      failedNotice: env('FAILED_NOTICE'),
    }),
  }),

  // Manifest id. Stremio keeps an installed addon by its URL, but an id that
  // changes under it is one thing fewer to wonder about, so an existing
  // installation can pin the id it was installed with.
  addonId: env('ADDON_ID'),

  gemini: Object.freeze({
    apiKey: env('GEMINI_API_KEY'),
    model: env('GEMINI_MODEL') || 'gemini-3.1-flash-lite',
    timeoutMs: positiveInt('GEMINI_TIMEOUT_MS', 25_000),
  }),

  // Google Translate's public web endpoint as the fallback translator (no
  // key). It is not an official API; "off" leaves Gemini as the only
  // translator, and a file Gemini cannot do then fails instead.
  googleFallback: flag('GOOGLE_FALLBACK', true),

  // Other-language subtitle files given to the model as gender hints (one
  // per language family). 0 switches them off.
  hintFiles: nonNegativeInt('HINT_FILES', 3),
  // Cast list with genders (AniList) for animation.
  castLookup: flag('CAST_LOOKUP', true),

  // Where existing Hebrew subtitles are looked up besides OpenSubtitles: the
  // public Wizdom addon. Used only when the target language is Hebrew.
  // "off" disables the lookup.
  wizdomBase: (() => {
    const value = env('WIZDOM_ADDON_URL') || 'https://4b139a4b7f94-wizdom-stremio-v2.baby-beamup.club';
    return value === 'off' ? '' : value.replace(/\/(manifest\.json)?$/, '');
  })(),

  // Owner diagnostics (/<secret>/diag/...): run a Gemini call with a prompt
  // of the caller's choosing. Off unless asked for, because whoever holds the
  // addon URL could use it to spend the key on anything.
  diagRoutes: flag('DIAG_ROUTES', false),

  // How many translation chunks run at once (Gemini free tier is rate limited).
  concurrency: positiveInt('TRANSLATE_CONCURRENCY', 5),
  // Subtitle lines per translation request: small enough to run many in
  // parallel, large enough to give the model context.
  chunkSize: positiveInt('CHUNK_SIZE', 80),

  // How many machine-translated variants (different source subtitles) to offer per video.
  maxVariants: positiveInt('MAX_VARIANTS', 3),

  // A subtitle request is held open until the translation is ready, because
  // TV players fetch the file once and keep whatever came back.
  holdTimeoutMs: positiveInt('HOLD_TIMEOUT_MS', 110_000),
  keepAliveMs: 2_000,

  // Delay before translating the next episode in the background, so the
  // episode being watched gets the rate limit first.
  pretranslateDelayMs: positiveInt('PRETRANSLATE_DELAY_MS', 45_000),
});
