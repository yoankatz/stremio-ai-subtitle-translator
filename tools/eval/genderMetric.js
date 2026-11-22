// Scores a machine translation's grammatical gender against an existing
// Hebrew translation of the same lines.
//
// For every line, and every word pair in genderPairs.js: if both
// translations used that word, did they pick the same gender? Lines where
// the reference chose the FEMININE form are reported on their own - a
// translator that writes masculine everywhere scores well on the rest and
// zero there, and that is exactly the failure being measured.

import { GENDER_PAIRS } from './genderPairs.js';

// One-letter prefixes Hebrew glues onto a word ("and", "that", "the", ...).
const PREFIXES = 'ושהכלבמ';

const FORMS = new Map(); // word -> [{pair index, gender}]
GENDER_PAIRS.forEach((pair, index) => {
  for (const gender of ['m', 'f']) {
    if (!FORMS.has(pair[gender])) FORMS.set(pair[gender], []);
    FORMS.get(pair[gender]).push({ index, gender });
  }
});

const words = (line) => String(line || '').split(/[^א-ת]+/).filter(Boolean);

/** Strips up to two glued prefix letters to find a listed form. */
function lookup(word) {
  for (let cut = 0; cut <= 2 && cut < word.length - 1; cut++) {
    if (cut > 0 && !PREFIXES.includes(word[cut - 1])) break;
    const hit = FORMS.get(word.slice(cut));
    if (hit) return hit;
  }
  return null;
}

/** @returns {Map<number,'m'|'f'|'both'>} pair index -> gender used in the line */
function gendersIn(line) {
  const found = new Map();
  for (const word of words(line)) {
    for (const { index, gender } of lookup(word) || []) {
      const seen = found.get(index);
      found.set(index, seen && seen !== gender ? 'both' : gender);
    }
  }
  return found;
}

const emptyTally = () => ({ compared: 0, agree: 0, refF: 0, refFAgree: 0, refM: 0, refMAgree: 0 });

function add(tally, refGender, same) {
  tally.compared++;
  if (same) tally.agree++;
  if (refGender === 'f') {
    tally.refF++;
    if (same) tally.refFAgree++;
  } else {
    tally.refM++;
    if (same) tally.refMAgree++;
  }
}

/**
 * @param {Array<string|undefined>} machine one Hebrew line per cue
 * @param {Array<string|undefined>} reference the existing translation, aligned to the same cues
 * @returns {{all:object, addressing:object, describing:object, disagreements:Array<{line:number, word:string, ref:string, got:string}>}}
 */
export function scoreGender(machine, reference) {
  const tallies = { all: emptyTally(), addressing: emptyTally(), describing: emptyTally() };
  const disagreements = [];

  for (let line = 0; line < machine.length; line++) {
    if (!machine[line] || !reference[line]) continue;
    const got = gendersIn(machine[line]);
    for (const [index, refGender] of gendersIn(reference[line])) {
      const gotGender = got.get(index);
      if (!gotGender || refGender === 'both' || gotGender === 'both') continue;
      const same = gotGender === refGender;
      add(tallies.all, refGender, same);
      add(tallies[GENDER_PAIRS[index].kind], refGender, same);
      if (!same) disagreements.push({ line, word: GENDER_PAIRS[index].m, ref: refGender, got: gotGender });
    }
  }
  return { ...tallies, disagreements };
}

const pct = (part, whole) => (whole ? `${Math.round((100 * part) / whole)}%` : '-');

/** One line of numbers, for a results table. */
export function summarise(score) {
  const t = score.all;
  return `compared ${String(t.compared).padStart(3)} | agree ${pct(t.agree, t.compared).padStart(4)} | FEMININE ${String(t.refFAgree).padStart(2)}/${String(t.refF).padEnd(3)} ${pct(t.refFAgree, t.refF).padStart(4)} | masculine ${String(t.refMAgree).padStart(3)}/${String(t.refM).padEnd(3)} ${pct(t.refMAgree, t.refM).padStart(4)} | "you" forms fem ${score.addressing.refFAgree}/${score.addressing.refF}`;
}
