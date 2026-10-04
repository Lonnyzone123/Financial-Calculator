/* S5AA R49 (the owner's AA1 decisions, 2026-10-03) -- THE CASES THAT NEED ENGINE INTERNALS, split from
 * tests/audit-s5aa-r49-spending-debt-disclosure.test.js so that file stays on the public routes (runPlan(), the validator, the app).
 *
 * AA1-37: with advanced.ltcOnsetAge entered, Monte Carlo draws the care onset uniformly from 10 years before to 10 years after it (the
 * default rule's 20-year spread, centred on the entered age), not rounded, never before the plan's starting age; absent, the default
 * max(65, round(retireAge + 5 + 20u)). Only simulatePlan() takes the care draw as an argument, so these cases supply it.
 * AA1-34: pmiStopAge(), the HPA midpoint default (12 USC 4901(7), 4902(c)).
 * Every expected figure is hand-derived from the rule and the inputs; the derivation sits beside each case.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const at = (r, age) => { const row = r.rows.find((x) => Math.abs(x.age - age) < 1e-9); assert.ok(row, 'row ' + age); return row; };
const roth = (balance, extra) => L.account('roth', 'rothIRA', balance, extra);
const near = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 0.01, msg + ': ' + actual + ' vs ' + expected);

// Self 66, retired at 60, nothing else to spend: each row's spending is the care cost alone. $50,000 a year, 50%, two years,
// healthcare inflation 0.
function care(onset, o = {}) {
  const p = L.basePlan({ age: 66, retireAge: 60, endAge: 76, spending: 0, accounts: [roth(1000000)] });
  Object.assign(p.advanced, { ltcOn: true, ltcCost: 50000, ltcProbability: 50, ltcYears: 2, ltcInsurance: 0, healthInflation: 0 });
  if (onset !== undefined) p.advanced.ltcOnsetAge = onset;
  Object.assign(p.assumptions, o);
  return p;
}
// One path through simulatePlan(), with the care draw supplied. The first draw decides the event (below 50% = care);
// the second places it. Volatility 0, so returns do not matter. A drawn event charges the full cost.
function carePath(onset, draws) {
  const p = care(onset, { method: 'monteCarlo', runs: 100, volatility: 0 });
  const q = draws.slice();
  return engine.simulatePlan(structuredClone(p), engine.rng(1), 0, () => q.shift(), []);
}
test('R49 AA1-37: Monte Carlo centres the draw on the onset age -- 76 with u = 0.25 starts care at 76 - 10 + 5 = 71', () => {
  const r = carePath(76, [0.1, 0.25]);
  for (const [age, cost] of [[71, 0], [72, 50000], [73, 50000], [74, 0]]) near(at(r, age).spending, cost, 'row ' + age);
});
test('R49 AA1-37: Monte Carlo never starts care before the plan -- 72 with u = 0 gives 62, held at the starting age 66', () => {
  // Care from 66 to 68: the rows closing 67 and 68.
  const r = carePath(72, [0.1, 0]);
  for (const [age, cost] of [[67, 50000], [68, 50000], [69, 0]]) near(at(r, age).spending, cost, 'row ' + age);
});
test('R49 AA1-37 control: Monte Carlo with no onset age -- max(65, round(60 + 5 + 0.25 x 20)) = 70, as before', () => {
  const r = carePath(undefined, [0.1, 0.25]);
  for (const [age, cost] of [[70, 0], [71, 50000], [72, 50000], [73, 0]]) near(at(r, age).spending, cost, 'row ' + age);
});


test('R49 AA1-34: pmiStopAge() -- a 30-year conventional loan with 16 years left, from 60: the month after the midpoint, 61 and one month', () => {
  // Amortization began 14 years before 60; its midpoint, 15 years in, is at 61; PMI stops when the next month opens.
  near(engine.pmiStopAge({ type: 'mortgage', mortgageType: 'conventional', loanTermYears: 30, remainingTermYears: 16 }, 60), 61 + 1 / 12, 'pmiStopAge');
  // An entered age wins; another program, or missing or inconsistent terms, gives null (PMI while owed).
  assert.equal(engine.pmiStopAge({ mortgageType: 'conventional', loanTermYears: 30, remainingTermYears: 16, pmiEndAge: 62.5 }, 60), 62.5);
  assert.equal(engine.pmiStopAge({ mortgageType: 'fha', loanTermYears: 30, remainingTermYears: 16 }, 60), null);
  assert.equal(engine.pmiStopAge({ mortgageType: 'conventional', loanTermYears: 30 }, 60), null);
  assert.equal(engine.pmiStopAge({ mortgageType: 'conventional', loanTermYears: 15, remainingTermYears: 20 }, 60), null);
});
