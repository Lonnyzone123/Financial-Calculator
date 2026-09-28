/* S5R-01 (the 2026-09-16 external audit's first finding; the owner's go of 2026-09-16): one validated execution snapshot.
 * Public routes, runPlan() and runScenario(); the direct simulatePlan() route is in
 * tests/audit-s5r01-direct-simulate-route.test.js.
 *
 * The input gates checked the caller's objects, then serialized accounts, other assets and debts once (running any
 * supported toJSON hook), and the simulation parsed that text, while the contribution audit and other readers still
 * read the caller's objects. A hook could therefore hand the simulation data no gate had seen: a zero contribution that
 * still deposited, duplicate ids, a string balance, a list that is not a list. A getter that threw during the checks
 * escaped as an exception.
 *
 * Now the gate re-checks the serialized snapshot, applies defaults to it, and hands every reader that snapshot; an
 * exception while reading the input is a named refusal, SCENARIO_UNREADABLE_INPUT. runScenario() gates once and builds
 * its identity from the executed data, so a hook still runs exactly once, and the caller's plan is never changed.
 *
 * Because every reader now sees the serialized text, JSON's NaN-to-null would be silent for every reader; a non-finite
 * number in those lists is refused during the one serialization, SCENARIO_NONFINITE_LIST_VALUE, after the named checks.
 */
'use strict';

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
  return p;
}
const ROUTES = {
  runPlan: (p) => engine.runPlan(p),
  runScenario: (p) => engine.runScenario(p),
};
const code = (r) => r.calculationErrorCode || null;
const hooked = (listOf, make) => { const p = working(); const list = listOf(p); list.toJSON = make(list); return p; };
const zeroHook = (list) => { const a = list[0]; return () => [Object.assign({}, a, { contribution: 0 })]; };
function assertRefused(p, expected, label) {
  for (const [route, run] of Object.entries(ROUTES)) {
    let r;
    assert.doesNotThrow(() => { r = run(p); }, label + ' via ' + route + ' must not throw');
    assert.equal(code(r), expected, label + ' via ' + route);
    assert.equal(r.rows, null, label + ' via ' + route + ': no rows on a refusal');
  }
}

test('S5R-01: a hook that zeroes an account\'s contribution deposits nothing, as the returned data would, via runPlan() and runScenario()', () => {
  const zero = working(); zero.accounts[0].contribution = 0;
  const expected = engine.runPlan(zero).rows[1].contributions;
  assert.equal(expected, 0, 'premise: the plain zero-contribution plan deposits nothing');
  for (const [route, run] of Object.entries(ROUTES)) {
    const r = run(hooked((q) => q.accounts, zeroHook));
    assert.equal(r.status, 'ok', route);
    assert.equal(r.rows[1].contributions, expected, route);
  }
});

test('S5R-01: a hook that returns two accounts with one id is refused as a duplicate id', () => {
  assertRefused(hooked((q) => q.accounts, (list) => { const a = list[0]; return () => [Object.assign({}, a), Object.assign({}, a)]; }), 'SCENARIO_DUPLICATE_ACCOUNT_ID', 'duplicate ids');
});

test('S5R-01: a hook that returns a string account balance is refused before any arithmetic', () => {
  assertRefused(hooked((q) => q.accounts, (list) => { const a = list[0]; return () => [Object.assign({}, a, { balance: '6000000' })]; }), 'SCENARIO_NONFINITE_ACCOUNT', 'string balance');
});

test('S5R-01: a debt-list hook that returns a string balance is refused', () => {
  const p = working(); p.advanced.debts = [debt()];
  const list = p.advanced.debts; const d = list[0];
  list.toJSON = () => [Object.assign({}, d, { balance: '10000' })];
  assertRefused(p, 'SCENARIO_NONFINITE_DEBT_BALANCE', 'string debt balance');
});

test('S5R-01: a non-finite number no named check covers is refused by name before JSON can turn it into null', () => {
  const nanChange = working(); nanChange.accounts[0].annualChange = NaN;
  assertRefused(nanChange, 'SCENARIO_NONFINITE_LIST_VALUE', 'an account annualChange of NaN');
  const infRate = working(); infRate.advanced.debts = [debt()];
  { const list = infRate.advanced.debts; const d = list[0]; list.toJSON = () => [Object.assign({}, d, { rate: Infinity })]; }
  assertRefused(infRate, 'SCENARIO_NONFINITE_LIST_VALUE', 'a debt hook returning an infinite rate');
});

test('control: a named check keeps its own code, because it runs before serialization', () => {
  const p = working(); p.accounts[0].contribution = NaN;
  assertRefused(p, 'SCENARIO_NONFINITE_CONTRIBUTION', 'a NaN contribution');
});

test('S5R-01: a hook that returns null, undefined or [null] is refused by name, never thrown', () => {
  assertRefused(hooked((q) => q.accounts, () => () => null), 'SCENARIO_NON_ARRAY_LIST_FIELD', 'null');
  assertRefused(hooked((q) => q.accounts, () => () => undefined), 'SCENARIO_NON_ARRAY_LIST_FIELD', 'undefined');
  assertRefused(hooked((q) => q.accounts, () => () => [null]), 'SCENARIO_NON_RECORD_LIST_ELEMENT', '[null]');
});

test('S5R-01: a getter that throws while the input is checked is a contained refusal, SCENARIO_UNREADABLE_INPUT, with no identity', () => {
  for (const field of ['balance', 'matchOn', 'futureChanges']) {
    const make = () => { const p = working(); Object.defineProperty(p.accounts[0], field, { enumerable: true, configurable: true, get() { throw new Error('unreadable ' + field); } }); return p; };
    assertRefused(make(), 'SCENARIO_UNREADABLE_INPUT', 'throwing ' + field);
    assert.equal(engine.runScenario(make()).identity, null, 'no identity for an unreadable input (' + field + ')');
  }
});

test('S5R-01: runScenario()\'s identity fingerprints the data it executed, not the pre-hook objects', () => {
  const zero = working(); zero.accounts[0].contribution = 0;
  const executed = engine.runScenario(zero).identity.inputHash;
  const hookedHash = engine.runScenario(hooked((q) => q.accounts, zeroHook)).identity.inputHash;
  assert.notEqual(engine.runScenario(working()).identity.inputHash, executed, 'premise: the two plain plans have different identities');
  assert.equal(hookedHash, executed);
});

test('control: a supported hook runs exactly once per call, via runPlan() and runScenario()', () => {
  for (const [route, run] of Object.entries(ROUTES)) {
    let calls = 0;
    const p = hooked((q) => q.accounts, (list) => { const a = list[0]; return () => { calls++; return [Object.assign({}, a)]; }; });
    run(p);
    assert.equal(calls, 1, route);
  }
});

test('control: the caller\'s plan is not changed, hook included', () => {
  const p = hooked((q) => q.accounts, zeroHook);
  const hook = p.accounts.toJSON;
  const before = JSON.stringify(Object.assign({}, p, { accounts: p.accounts.map((a) => Object.assign({}, a)) }));
  for (const run of Object.values(ROUTES)) run(p);
  assert.equal(p.accounts.toJSON, hook, 'the hook is still the caller\'s');
  assert.equal(p.accounts[0].contribution, 10000, 'the caller\'s contribution is untouched');
  assert.equal(JSON.stringify(Object.assign({}, p, { accounts: p.accounts.map((a) => Object.assign({}, a)) })), before);
});

test('control: a plain plan runs as before, and its identity is the identity of the same data', () => {
  const p = working();
  const r = engine.runScenario(p);
  assert.equal(r.status, 'ok');
  assert.equal(r.identity.inputHash, engine.runScenario(JSON.parse(JSON.stringify(working()))).identity.inputHash);
  assert.deepEqual(r.rows, engine.runPlan(working()).rows);
});
