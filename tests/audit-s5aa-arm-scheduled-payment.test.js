/* S5AA task 1.4, Q103 -- projectDebts() writes a private _armScheduledPayment field onto the debt record it is
 * given. This file records the VERIFICATION that decided not to repair it, and pins the behaviour the decision
 * rests on, so a later change cannot quietly invalidate the reasoning.
 *
 * WHY THIS IS A CHARACTERIZATION FILE AND NOT A REPAIR. Decision 12.7 made this row conditional: verify at the
 * supported public entry points FIRST, and repair only if public input or a later run is affected. An isolated,
 * documented internal mutation does not earn a pre-rebuild refactor. The verification says:
 *
 *   at the DIRECT call, the mutation is real -- projectDebts() leaves the field on the caller's object, and a
 *   second call on the same array sees it and skips recomputation;
 *
 *   at the PUBLIC entry points it is not observable -- simulatePlan() deep-clones the debts array, so the
 *   household's own plan object is untouched and repeated runs of the same plan agree to the cent.
 *
 * So the disposition is VERIFIED, NO REPAIR, and what is guarded here is the second half: the isolation that makes
 * the first half harmless. If a future change stopped cloning the debts array, or made a run depend on a previous
 * one, these tests fail and the disposition has to be revisited -- which is the whole point of pinning a class-V
 * finding rather than merely writing it down.
 *
 * Amendment A-02: a "verified correct, no repair needed" row is evidenced by a characterization check plus a
 * written reason the alleged defect does not apply. Both are here.
 */
'use strict';
const { retireAtEnd } = require('./lib/working-horizon'); // S5AA R53 (the owner's decision 3, 2026-10-04): working-only horizons

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const FIELD = '_armScheduledPayment';

function armDebt(over) {
  return Object.assign({
    id: 'm1', name: 'ARM', type: 'mortgage', owner: 'household', balance: 400000,
    rate: 3, rateType: 'adjustable', resetRate: 6, nextRateResetAge: 45,
    paymentMonthly: 1686, extraPrincipalMonthly: 0, payoffAge: 75,
    includePayment: true, includeHousingCosts: false,
  }, over);
}

function fixture() {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 40, retireAge: 70, endAge: 60, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 150000, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0 });
  p.accounts = [{ id: 'a1', name: 'Taxable', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 2000000, basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  /* S5AA task 5.1 retired this switch; the recast is unconditional. The line is gone rather than
     left setting a key that decides nothing. */
  p.advanced.debts = [armDebt()];
  retireAtEnd(p); // S5AA R53: an end age before the retirement age is refused; the owner retires at the end age instead (output-neutral, tests/lib/working-horizon.js)
  return p;
}

test('S5AA 1.4: the internal mutation is real at a direct projectDebts() call -- this is the finding, stated plainly', () => {
  const debts = [armDebt()];
  assert.strictEqual(Object.prototype.hasOwnProperty.call(debts[0], FIELD), false, 'the field should not exist before the call');
  engine.projectDebts(debts, 44, 46, 0);
  assert.ok(Object.prototype.hasOwnProperty.call(debts[0], FIELD), 'projectDebts() writes the field onto the caller\'s object');
  assert.ok(Number.isFinite(debts[0][FIELD]), 'and it is a real recomputed payment, not a marker');
});

test('S5AA 1.4: runPlan() does not mutate the caller\'s own debt record -- the isolation the disposition rests on', () => {
  const plan = fixture();
  const before = JSON.stringify(plan);
  const r = engine.runPlan(plan);
  assert.strictEqual(r.status, 'ok', 'the fixture must actually run, or this proves nothing');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(plan.advanced.debts[0], FIELD), false,
    'simulatePlan() clones the debts array, so the household\'s plan must come back untouched');
  assert.strictEqual(JSON.stringify(plan), before, 'and nothing else of the caller\'s plan changed either');
});

test('S5AA 1.4: repeated runs of the same plan object agree to the cent, so no run inherits a previous one', () => {
  const plan = fixture();
  const first = engine.runPlan(plan);
  const second = engine.runPlan(plan);
  const third = engine.runPlan(plan);
  const at = (r, age) => r.rows.find((x) => x.age >= age && x.age < age + 1);
  for (const age of [44, 46, 50, 55]) {
    assert.strictEqual(at(second, age).debtBalance, at(first, age).debtBalance, 'debt balance at ' + age + ' drifted between runs');
    assert.strictEqual(at(third, age).debtBalance, at(first, age).debtBalance, 'debt balance at ' + age + ' drifted by the third run');
    assert.strictEqual(at(second, age).debtPaymentsTotal, at(first, age).debtPaymentsTotal, 'debt payments at ' + age + ' drifted between runs');
  }
});

test('S5AA 1.4: call order does not change the answer -- one plan run after another is unaffected', () => {
  /* S5AA TASK 5.1 RETIRED THE DISCRIMINATOR THIS TEST USED. It compared a recast plan against a
     non-recast one, and the recast is unconditional now, so those two plans are identical and the
     control below would be vacuous. The CLAIM is unchanged -- no run may inherit state from a
     previous one -- and it is made against a pair that still differs: the same ARM with its reset
     INSIDE the projection, and with it pushed outside. Only the first ever re-amortises, so the two
     balances genuinely diverge, which is exactly what the control needs. */
  const resets = fixture();
  const never = fixture();
  never.advanced.debts[0].nextRateResetAge = 999;

  const resetsFirst = engine.runPlan(JSON.parse(JSON.stringify(resets)));
  const neverAfter = engine.runPlan(JSON.parse(JSON.stringify(never)));
  const neverFirst = engine.runPlan(JSON.parse(JSON.stringify(never)));
  const resetsAfter = engine.runPlan(JSON.parse(JSON.stringify(resets)));

  const at = (r, age) => r.rows.find((x) => x.age >= age && x.age < age + 1);
  assert.strictEqual(at(neverAfter, 55).debtBalance, at(neverFirst, 55).debtBalance,
    'a never-resetting run must give the same answer whether or not a resetting run preceded it');
  assert.strictEqual(at(resetsAfter, 55).debtBalance, at(resetsFirst, 55).debtBalance,
    'and a resetting run must give the same answer whether or not a never-resetting run preceded it');
  assert.notStrictEqual(at(resetsFirst, 55).debtBalance, at(neverFirst, 55).debtBalance,
    'CONTROL: the two plans must actually differ, or the equalities above are vacuous');
});
