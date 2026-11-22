// The id sent to the model with each line.
//
// Ids are deliberately not 1, 2, 3...: a model that merges two lines and then
// carries on counting would move every later line up by one, and nothing in
// the reply would show it. Ids that do not follow each other can only be
// copied, so a merged line is simply a missing id.
// 211 is prime and above the largest chunk (160), so every id is distinct.
const STEP = 37;
const MODULUS = 211;

/** @returns {number[]} one distinct id per line, in line order */
export const lineIds = (count) => Array.from({ length: count }, (_, i) => 100 + ((i * STEP + 11) % MODULUS));
