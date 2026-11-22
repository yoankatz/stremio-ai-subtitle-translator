// Hebrew is the language this addon was measured for (tools/eval). The
// request sent to the model for Hebrew is pinned here, character for
// character: a change to the shared wording that looks harmless for another
// language must not quietly change what was measured.
//
// If this fails on purpose - the Hebrew wording is being improved - measure
// again with tools/eval, bump PIPELINE in src/sources/sourceRef.js, and
// regenerate test/fixtures/hebrew-request.golden.json.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGenderRequest, genderResponseSchema } from '../src/translate/genderPrompt.js';
import { makeTarget } from '../src/language/target.js';

const golden = JSON.parse(readFileSync(new URL('./fixtures/hebrew-request.golden.json', import.meta.url), 'utf8'));
const hebrew = makeTarget('heb');

for (const example of golden.cases) {
  test(`the Hebrew request is unchanged: ${example.name}`, () => {
    const { system, user } = buildGenderRequest({ ...example.input, target: hebrew });
    assert.equal(system, example.system);
    assert.equal(user, example.user);
  });
}

test('the Hebrew reply format is unchanged', () => {
  assert.deepEqual(genderResponseSchema(hebrew), golden.schema);
});
