/* S5AA R37 (SA32F-51; Claude's R32F full-model audit DMC-07, confirmed by ChatGPT's R32V) -- THE VALIDATOR AND runPlan() AGREE.
 *
 * R32V: "V/runPlan disagree on runs 20,000; historyStart 2030 silently selects 1928; strings for fee/inflation fail later under
 * unrelated codes; negative extra principal/text PMI can silently become zero; negative class volatility is accepted ... Separate
 * invalid-input refusals from silent replacement of financially meaningful fields."
 *
 * Each case below is refused by BOTH: the validator reports an ERROR at the field, and runPlan() returns the documented refusal
 * shape with a code that names the input, instead of running on a replaced value or failing later under an unrelated code.
 * - runs above 10,000: runPlan() already refused (SCENARIO_INVALID_RUN_COUNT); the validator accepted it.
 * - historyStart after the last year of return data, on the historical method: the sequence silently started in 1928. The
 *   validator's copy of that year is held to the engine's through runPlan(): the year runs, and the year after is refused.
 * - inflation or fee that is not a number: "x" failed later under an unrelated code; "1" ran as text.
 * - a debt's extra principal, PMI, property tax, insurance or HOA that is negative or not a number, and a payment that is not a
 *   number: Math.max(0, Number(x) || 0) made each one zero. (A NEGATIVE payment stays the validator's decided NEGATIVE_PAYMENT
 *   warning, which this round does not reopen.)
 * - an asset class's volatility that is negative or not a number: the blend multiplies volatilities in pairs, so a negative one
 *   cancels the others' risk instead of adding to it.
 * The app's own form never produces any of these: it clamps runs to 100-10,000, offers only data years, and clamps each debt
 * amount and each volatility to zero or more. Only direct callers and edited imports are turned away. */
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

function planWith(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.profile.age = 55;
  p.accounts = [{ id: 'b', name: 'Brokerage', type: 'brokerage', taxClass: 'taxable', owner: 'self', balance: 500000, basisPct: 60,
    contribution: 0, allocation: { stocks: 60, bonds: 30, cash: 10 } }];
  p.advanced.debts = [{ id: 'm', type: 'mortgage', name: 'Mortgage', owner: 'household', balance: 200000, rate: 6, paymentMonthly: 1500,
    payoffAge: 80, rateType: 'fixed', includePayment: true, includeHousingCosts: true, extraPrincipalMonthly: 100, pmiMonthly: 50,
    annualPropertyTax: 3000, annualInsurance: 1200, hoaMonthly: 25 }];
  edit(p);
  return p;
}
function errorsAt(p, field) {
  return validateScenario(p).issues.filter((i) => i.severity === 'ERROR' && i.path === field);
}
function refusal(p) {
  const r = engine.runPlan(p);
  return r.status === 'ok' ? 'ok' : r.calculationErrorCode;
}

test('R37 SA32F-51: the control plan is valid and runs', () => {
  const p = planWith(() => {});
  assert.deepStrictEqual(validateScenario(p).issues.filter((i) => i.severity === 'ERROR'), []);
  assert.strictEqual(refusal(p), 'ok');
});

test('R37 SA32F-51: runs above 10,000 is an ERROR in the validator, as runPlan() already refused it', () => {
  const over = planWith((p) => { p.assumptions.runs = 20000; });
  assert.strictEqual(errorsAt(over, 'assumptions.runs').length, 1, 'the validator accepted 20,000 runs');
  assert.strictEqual(refusal(over), 'SCENARIO_INVALID_RUN_COUNT');
  assert.strictEqual(errorsAt(planWith((p) => { p.assumptions.runs = 10000; }), 'assumptions.runs').length, 0);
});

test('R37 SA32F-51: a historical start after the return data is refused, not replaced by 1928', () => {
  /* The validator's own copy of the last data year. Through the public route, the engine runs that year and refuses the next,
     so the two copies cannot drift apart without this test failing. */
  const last = require(path.join(ROOT, 'src', 'scenario-validator.js')).LAST_HISTORY_YEAR;
  const after = planWith((p) => { p.assumptions.method = 'historical'; p.assumptions.historyStart = last + 1; });
  assert.strictEqual(errorsAt(after, 'assumptions.historyStart').length, 1, 'the validator accepted it');
  assert.strictEqual(refusal(after), 'SCENARIO_HISTORY_START_AFTER_DATA', 'the sequence silently started in the first data year');
  /* CONTROLS: the last data year runs and is valid; on a method that reads no history the field is inert and is not refused. */
  const lastYear = planWith((p) => { p.assumptions.method = 'historical'; p.assumptions.historyStart = last; });
  assert.strictEqual(errorsAt(lastYear, 'assumptions.historyStart').length, 0);
  assert.strictEqual(refusal(lastYear), 'ok');
  const inert = planWith((p) => { p.assumptions.historyStart = last + 5; });
  assert.strictEqual(errorsAt(inert, 'assumptions.historyStart').length, 0);
  assert.strictEqual(refusal(inert), 'ok');
});

test('R37 SA32F-51: an inflation, fee or history start that is not a number is refused by name', () => {
  for (const [field, value] of [['inflation', 'x'], ['inflation', '3'], ['fee', '1'], ['historyStart', '1950']]) {
    const p = planWith((q) => { q.assumptions[field] = value; });
    assert.strictEqual(errorsAt(p, 'assumptions.' + field).length, 1, `the validator accepted ${field} ${JSON.stringify(value)}`);
    assert.strictEqual(refusal(p), 'SCENARIO_NONNUMBER_PLAN_VALUE', `${field} ${JSON.stringify(value)}`);
  }
});

test('R37 SA32F-51: a debt amount that is negative or not a number is refused, not made zero', () => {
  const cases = [['extraPrincipalMonthly', -100], ['extraPrincipalMonthly', '100'], ['pmiMonthly', 'abc'], ['pmiMonthly', -50],
    ['annualPropertyTax', -3000], ['annualInsurance', null], ['hoaMonthly', '25'], ['paymentMonthly', '1500']];
  for (const [field, value] of cases) {
    const p = planWith((q) => { q.advanced.debts[0][field] = value; });
    assert.strictEqual(errorsAt(p, 'advanced.debts[0].' + field).length, 1, `the validator accepted ${field} ${JSON.stringify(value)}`);
    assert.strictEqual(refusal(p), 'SCENARIO_INVALID_DEBT_AMOUNT', `${field} ${JSON.stringify(value)} ran as zero`);
  }
  /* CONTROLS: zero is a stated amount and runs; a negative PAYMENT keeps the decided warning and still runs. */
  assert.strictEqual(refusal(planWith((q) => { q.advanced.debts[0].extraPrincipalMonthly = 0; q.advanced.debts[0].pmiMonthly = 0; })), 'ok');
  const negPay = planWith((q) => { q.advanced.debts[0].paymentMonthly = -1; });
  assert.strictEqual(errorsAt(negPay, 'advanced.debts[0].paymentMonthly').length, 0);
  assert.ok(validateScenario(negPay).issues.some((i) => i.code === 'NEGATIVE_PAYMENT'));
  assert.strictEqual(refusal(negPay), 'ok');
});

test('R37 SA32F-51: a negative asset-class volatility is refused, not blended as negative risk', () => {
  const neg = planWith((p) => { p.advanced.assetsOn = true; p.advanced.assetClasses[1].volatility = -7; });
  assert.strictEqual(errorsAt(neg, 'advanced.assetClasses[1].volatility').length, 1, 'the validator accepted it');
  assert.strictEqual(refusal(neg), 'SCENARIO_INVALID_CLASS_VOLATILITY');
  const text = planWith((p) => { p.advanced.assetsOn = true; p.advanced.assetClasses[1].volatility = '7'; });
  assert.strictEqual(refusal(text), 'SCENARIO_INVALID_CLASS_VOLATILITY');
  /* CONTROL: a zero volatility is a stated certainty and runs. */
  assert.strictEqual(refusal(planWith((p) => { p.advanced.assetsOn = true; p.advanced.assetClasses[2].volatility = 0; })), 'ok');
});
