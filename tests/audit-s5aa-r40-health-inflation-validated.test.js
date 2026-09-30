/* S5AA R40 (the audit of PR #35) -- HEALTHCARE INFLATION IS VALIDATED.
 *
 * `advanced.healthInflation` grows the pre-Medicare health cost and, since R40's repair 1 (8f20d90), the long-term-care cost. It had no
 * type or range rule. The audit found that at -150 a fractional first row gave a calculation error (a fractional power of a negative
 * growth factor is NaN), that 1e40 with a care probability of 0 gave a calculation error (Infinity x 0), and that a non-number or an
 * absent value silently gave the care cost 0% while the health path errored. The validator now reports:
 *   - WRONG_TYPE when it is present and not a finite number;
 *   - OUT_OF_RANGE (an error) at -100 or below, where the growth factor is no longer positive, and above 100, a hundred percent a year;
 *   - OUT_OF_RANGE (a warning) outside the form's 0 to 20;
 *   - MISSING_FIELD when health or care costs are on and it is absent. */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function issues(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  edit(p.advanced);
  return validateScenario(p).issues.filter((i) => i.path === 'advanced.healthInflation').map((i) => String(i.severity).toUpperCase() + ':' + i.code);
}

test('R40: a healthcare inflation that is not a number, or breaks the growth factor, is an error', () => {
  assert.deepStrictEqual(issues((a) => { a.healthInflation = 'abc'; }), ['ERROR:WRONG_TYPE']);
  assert.deepStrictEqual(issues((a) => { a.healthInflation = -150; }), ['ERROR:OUT_OF_RANGE']);
  assert.deepStrictEqual(issues((a) => { a.healthInflation = -100; }), ['ERROR:OUT_OF_RANGE']);
  assert.deepStrictEqual(issues((a) => { a.healthInflation = 1e40; }), ['ERROR:OUT_OF_RANGE']);
});

test('R40: outside the form\'s 0 to 20 is a warning; absent while health or care costs are on is missing', () => {
  assert.deepStrictEqual(issues((a) => { a.healthInflation = 30; }), ['WARNING:OUT_OF_RANGE']);
  assert.deepStrictEqual(issues((a) => { a.healthInflation = -2; }), ['WARNING:OUT_OF_RANGE']);
  assert.deepStrictEqual(issues((a) => { delete a.healthInflation; a.ltcOn = true; }), ['ERROR:MISSING_FIELD']);
  assert.deepStrictEqual(issues((a) => { delete a.healthInflation; a.healthOn = true; }), ['ERROR:MISSING_FIELD']);
});

test('R40: controls -- the default, 0 and 20 raise nothing, nor does an absent value with both costs off', () => {
  assert.deepStrictEqual(issues(() => {}), []);
  assert.deepStrictEqual(issues((a) => { a.healthInflation = 0; }), []);
  assert.deepStrictEqual(issues((a) => { a.healthInflation = 20; }), []);
  assert.deepStrictEqual(issues((a) => { delete a.healthInflation; a.healthOn = false; a.ltcOn = false; }), []);
});
