// Videos that have an English source AND an existing Hebrew translation, so
// a machine translation can be scored against a human one. Chosen for female
// leads or mixed casts - a male-only cast cannot show a gender problem.
//
// reference: where the existing Hebrew comes from.

export const BENCHMARKS = {
  yourname: { type: 'movie', videoId: 'tt5311514', reference: 'wizdom' },
  spirited: { type: 'movie', videoId: 'tt0245429', reference: 'wizdom' },
  howl: { type: 'movie', videoId: 'tt0347149', reference: 'wizdom' },
  silent: { type: 'movie', videoId: 'tt5323662', reference: 'wizdom' },
  violet: { type: 'series', videoId: 'tt7078180:1:1', reference: 'opensubtitles' },
  aot: { type: 'series', videoId: 'tt2560140:1:1', reference: 'opensubtitles' },
  spy: { type: 'series', videoId: 'tt13706018:1:1', reference: 'wizdom' },
};
