/* S5AA R40 (found by Claude while recording R37's refusals in RESULT_CONTRACT.md) -- THE VALIDATOR REFUSES WHAT runPlan()
 * REFUSES FOR AN ADJUSTABLE DEBT'S RESET TERMS.
 *
 * R37 (ad62460, SA32F-21/-40) made runPlan() refuse an adjustable debt that resets its rate at an age but has no reset rate
 * or no payoff age: SCENARIO_DEBT_RESET_TERMS_MISSING, where it had thrown a RangeError (no payoff age) or run the rest of
 * the loan at 0% (no reset rate). R37's e923123 (SA32F-51) set out to make the validator and runPlan() agree on input gaps,
 * but validateScenario() never looked at the reset terms, so it called such a plan valid and runPlan() then returned a
 * calculation error. No figure was wrong -- the plan was refused, not computed -- but a valid plan must not be one the
 * engine refuses. The validator now reports the same gap by the same name, on the field that is missing. */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function withDebt(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  /* The debt of tests/audit-s5aa-r37-engine-safeguards.test.js. */
  p.advanced.debts = [{ id: 'm', type: 'mortgage', name: 'Mortgage', owner: 'household', balance: 300000, rate: 6, paymentMonthly: 1798.65,
    rateType: 'adjustable', nextRateResetAge: 61, resetRate: 8, payoffAge: 85, includePayment: true }];
  edit(p.advanced.debts[0]);
  return p;
}
const errors = (p) => validateScenario(p).issues.filter((i) => String(i.severity).toUpperCase() === 'ERROR').map((i) => i.code + '@' + i.path);

test('R40: a reset age with no reset rate or no payoff age is refused by the validator, as runPlan() refuses it', () => {
  const cases = [
    [(d) => { delete d.resetRate; }, ['DEBT_RESET_TERMS_MISSING@advanced.debts[0].resetRate']],
    [(d) => { delete d.payoffAge; }, ['DEBT_RESET_TERMS_MISSING@advanced.debts[0].payoffAge']],
    [(d) => { delete d.resetRate; delete d.payoffAge; }, ['DEBT_RESET_TERMS_MISSING@advanced.debts[0].resetRate']]
  ];
  for (const [edit, expected] of cases) {
    const p = withDebt(edit);
    assert.deepStrictEqual(errors(p), expected);
    assert.strictEqual(validateScenario(p).valid, false);
    assert.strictEqual(engine.runPlan(p).calculationErrorCode, 'SCENARIO_DEBT_RESET_TERMS_MISSING', 'the engine refuses the same plan');
  }
});

test('R40 (the audit of PR #35): a reset rate or reset age that is present but not a number is WRONG_TYPE, and the engine refuses it', () => {
  /* The audit found a numeric-string reset age passed both gates: projectDebts() read Number("61"), and with no reset rate ran the debt
     at 0% after the reset (with no payoff age, it threw). And a string reset rate was reported as missing, which it is not. */
  const cases = [
    [(d) => { d.resetRate = '8'; }, ['WRONG_TYPE@advanced.debts[0].resetRate'], 'SCENARIO_NONFINITE_DEBT_RATE'],
    [(d) => { d.nextRateResetAge = '61'; }, ['WRONG_TYPE@advanced.debts[0].nextRateResetAge'], 'SCENARIO_NONFINITE_DEBT_RESET_AGE'],
    [(d) => { d.nextRateResetAge = '61'; delete d.resetRate; }, ['WRONG_TYPE@advanced.debts[0].nextRateResetAge'], 'SCENARIO_NONFINITE_DEBT_RESET_AGE']
  ];
  for (const [edit, expected, code] of cases) {
    const p = withDebt(edit);
    assert.deepStrictEqual(errors(p), expected);
    assert.strictEqual(engine.runPlan(p).calculationErrorCode, code, 'the engine refuses the same plan');
  }
});

test('R40: controls -- both terms present, no reset age, a null reset age, and a fixed rate are valid and run', () => {
  for (const edit of [() => {}, (d) => { delete d.nextRateResetAge; delete d.resetRate; }, (d) => { d.nextRateResetAge = null; delete d.resetRate; },
    (d) => { d.rateType = 'fixed'; delete d.resetRate; delete d.payoffAge; }]) {
    const p = withDebt(edit);
    assert.deepStrictEqual(errors(p), []);
    assert.strictEqual(engine.runPlan(p).status, 'ok');
  }
});
