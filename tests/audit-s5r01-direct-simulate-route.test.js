/* S5R-01 (the 2026-09-16 external audit's first finding; the owner's go of 2026-09-16): the direct simulatePlan() route, and
 * runScenario()'s identity against hashValue() of the executed plain data. The public routes are in
 * tests/audit-s5r01-execution-snapshot.test.js, which states the defect and the repair.
 *
 * A direct simulatePlan() call runs the same input gate when it is not handed the engine's token, so it must refuse and
 * execute exactly what runPlan() does. The Worker cannot carry functions, so hooks are tested on these Node routes only.
 */
'use strict';
const { retireAtEnd } = require('./lib/working-horizon'); // S5AA R53 (the owner's decision 3, 2026-10-04): working-only horizons

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = () => eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const ira = (o) => Object.assign({ id: 'ira', name: 'IRA', owner: 'self', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, basisPct: 0, contribution: 10000, contributionMode: 'dollar', annualChange: 0, annualChangeMode: 'percent', frequency: 12, changeTiming: 'annual', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }, o);
const debt = (o) => Object.assign({ id: 'd1', name: 'Loan', kind: 'loan', balance: 10000, rate: 5, paymentMonthly: 200, payoffAge: 60, includePayment: true }, o);
function working() {
  const p = defaultPlan();
  p.setupComplete = true;
  Object.assign(p.profile, { age: 45, retireAge: 60, endAge: 47, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 100000, spouseSalary: 0, contributionStop: 60 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 30000, ssBenefit: 0, spouseSS: 0, pension: 0, otherIncomes: [], stages: [], expenses: [], dividendOn: false });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = [ira()];
  retireAtEnd(p); // S5AA R53: an end age before the retirement age is refused; the owner retires at the end age instead (output-neutral, tests/lib/working-horizon.js)
  return p;
}
const simulate = (p) => engine.simulatePlan(p, engine.rng(1), 0, null, []);
const hooked = (listOf, make) => { const p = working(); const list = listOf(p); list.toJSON = make(list); return p; };
const zeroHook = (list) => { const a = list[0]; return () => [Object.assign({}, a, { contribution: 0 })]; };
function assertRefused(p, expected, label) {
  let r;
  assert.doesNotThrow(() => { r = simulate(p); }, label + ' must not throw');
  assert.equal(r.calculationErrorCode, expected, label);
  assert.equal(r.rows, null, label + ': no rows on a refusal');
}

test('S5R-01, direct simulatePlan(): a hook that zeroes a contribution deposits nothing, as the returned data would', () => {
  const zero = working(); zero.accounts[0].contribution = 0;
  assert.equal(simulate(zero).rows[1].contributions, 0, 'premise: the plain zero-contribution plan deposits nothing');
  assert.equal(simulate(hooked((q) => q.accounts, zeroHook)).rows[1].contributions, 0);
});

test('S5R-01, direct simulatePlan(): hook-returned duplicate ids, strings, non-finite numbers and non-lists are refused by name', () => {
  assertRefused(hooked((q) => q.accounts, (list) => { const a = list[0]; return () => [Object.assign({}, a), Object.assign({}, a)]; }), 'SCENARIO_DUPLICATE_ACCOUNT_ID', 'duplicate ids');
  assertRefused(hooked((q) => q.accounts, (list) => { const a = list[0]; return () => [Object.assign({}, a, { balance: '6000000' })]; }), 'SCENARIO_NONFINITE_ACCOUNT', 'string balance');
  const p = working(); p.advanced.debts = [debt()];
  { const list = p.advanced.debts; const d = list[0]; list.toJSON = () => [Object.assign({}, d, { balance: '10000' })]; }
  assertRefused(p, 'SCENARIO_NONFINITE_DEBT_BALANCE', 'string debt balance');
  const nanChange = working(); nanChange.accounts[0].annualChange = NaN;
  assertRefused(nanChange, 'SCENARIO_NONFINITE_LIST_VALUE', 'an account annualChange of NaN');
  assertRefused(hooked((q) => q.accounts, () => () => null), 'SCENARIO_NON_ARRAY_LIST_FIELD', 'null');
  assertRefused(hooked((q) => q.accounts, () => () => undefined), 'SCENARIO_NON_ARRAY_LIST_FIELD', 'undefined');
  assertRefused(hooked((q) => q.accounts, () => () => [null]), 'SCENARIO_NON_RECORD_LIST_ELEMENT', '[null]');
});

test('S5R-01, direct simulatePlan(): a getter that throws while the input is checked is SCENARIO_UNREADABLE_INPUT', () => {
  for (const field of ['balance', 'matchOn', 'futureChanges']) {
    const p = working();
    Object.defineProperty(p.accounts[0], field, { enumerable: true, configurable: true, get() { throw new Error('unreadable ' + field); } });
    assertRefused(p, 'SCENARIO_UNREADABLE_INPUT', 'throwing ' + field);
  }
});

test('S5R-01: runScenario()\'s identity is hashValue() of the executed plain data', () => {
  const zero = working(); zero.accounts[0].contribution = 0;
  assert.equal(engine.runScenario(hooked((q) => q.accounts, zeroHook)).identity.inputHash, engine.hashValue(zero));
  const plain = working();
  assert.equal(engine.runScenario(plain).identity.inputHash, engine.hashValue(plain), 'a plain plan\'s identity is still the plan\'s');
});

test('control, direct simulatePlan(): a supported hook runs exactly once per call', () => {
  let calls = 0;
  simulate(hooked((q) => q.accounts, (list) => { const a = list[0]; return () => { calls++; return [Object.assign({}, a)]; }; }));
  assert.equal(calls, 1);
});
