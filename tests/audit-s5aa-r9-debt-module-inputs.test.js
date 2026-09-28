/* S5AA R9 round, DeepSeek audit findings 2g/01 and 2g/04 (reproduced at 623cf64): TWO DEBT-MODULE INPUTS THAT GAVE A
 * WRONG ANSWER INSTEAD OF A REFUSAL.
 *
 * 2g/01. normalizeTerm() refuses a missing term (null, '', [], a boolean) because Number() turns each into 0 and a
 * zero-month loan is "a wrong financial answer wearing the costume of a right one" -- its own words. A WHITESPACE-ONLY
 * string was not on the list, and Number('   ') is 0 too, so it amortized nothing and reported payoff in month 0. It is
 * now missing, like ''.
 *
 * 2g/04. The ARM module refuses a ceiling that is ABSENT ("a worst case without a ceiling is undefined, not merely
 * large") but honoured one BELOW ZERO: clamp(rate, floor >= 0, ceiling < 0) returns the negative ceiling, so every row
 * reported a negative note rate while amortizationSchedule() charged 0%. A lifetime ceiling below zero is now refused by
 * name, as the absent one is.
 *
 * Neither module is reached by the engine's own projection; both are public module contracts, tested directly.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const amort = require(path.join(ROOT, 'src', 'debt-amortization.js'));
const arm = require(path.join(ROOT, 'src', 'debt-arm.js'));

test('finding 2g/01: a whitespace-only term is missing, not zero -- refused like the empty string', () => {
  for (const term of ['   ', '\t', ' \n ']) {
    assert.throws(() => amort.normalizeTerm(term, 'test'), RangeError, JSON.stringify(term));
    assert.throws(() => amort.monthlyPayment(100000, 6, term), RangeError, 'monthlyPayment ' + JSON.stringify(term));
  }
  assert.throws(() => amort.normalizeTerm('', 'test'), RangeError, 'CONTROL: the empty string, already refused');
  assert.equal(amort.normalizeTerm(' 360 ', 'test'), 360, 'CONTROL: a padded number is still a number');
  assert.equal(amort.normalizeTerm(0, 'test'), 0, 'CONTROL: a real zero keeps its documented contract');
});

const ARM = { termMonths: 360, principal: 300000, startRatePct: 5, marginPct: 2.5, indexRatePct: 3, initialCapPct: 2,
  periodicCapPct: 1, fixedPeriodMonths: 60, resetEveryMonths: 12 };

test('finding 2g/04: a lifetime ceiling below zero is refused by name, as an absent one is', () => {
  assert.throws(() => arm.armRatePath(Object.assign({}, ARM, { lifetimeCapPct: -1 })), /lifetime ceiling/, 'an absolute cap below zero');
  assert.throws(() => arm.armRatePath(Object.assign({}, ARM, { lifetimeIncreaseCapPct: -6 })), /lifetime ceiling/,
    'a rise cap that takes the ceiling below zero (5% start - 6 points)');
});

test('finding 2g/04 control: a ceiling at or above zero is honoured, and no reported rate is negative', () => {
  assert.doesNotThrow(() => arm.armRatePath(Object.assign({}, ARM, { lifetimeCapPct: 0 })), 'a zero ceiling is a real instrument, not refused');
  const ok = arm.armRatePath(Object.assign({}, ARM, { lifetimeIncreaseCapPct: 5 }));
  const rates = JSON.stringify(ok).match(/"rate":-?[0-9.e-]+/g) || [];
  assert.ok(rates.every((r) => Number(r.split(':')[1]) >= 0), 'every reported rate is at or above zero');
});
