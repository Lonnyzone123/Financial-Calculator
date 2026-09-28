/* Q80 -- a documented flag default is filled without leaving the serialize-once check.
 *
 * A debt that lacks a default-true flag (includePayment; includeHousingCosts on a mortgage) must still meet the
 * serialization policy. A supported toJSON hook is called exactly once. A hook that throws is refused as the named
 * scenario refusal, and so is an accessor that throws, rather than escaping. A hook that succeeds is run on the data
 * it returns, with the documented default applied to that data. Explicit flags, ordinary absent flags, an explicit
 * false and the caller's plan are held beside them.
 *
 * Public routes only: runPlan() and runScenario() in Node, and a fresh build's main thread. The generated Worker is not
 * a route for these cases, because its transport refuses function-valued data before the engine sees it.
 * Each title is a literal, so the requirements register names every one.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { bootBuild } = require('./lib/build-routes.js');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const REFUSED = 'SCENARIO_NONSERIALIZABLE_INPUT';

/* A retired single, 60 to 62, with a Roth and nothing moving but spending and one debt. */
function household(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 62, spouseOn: false });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: 60 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, seed: 7 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 10000, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [], otherIncomes: [], dividendOn: false, flexibility: 0 });
  Object.assign(p.advanced, { debts: [], otherAssets: [], networthOn: true, insurance: 0, assetsOn: false, rmdOn: false, healthOn: false, ltcOn: false, transferOn: false, conversionOn: false });
  p.accounts = [{ id: 'a1', name: 'Roth', owner: 'self', type: 'rothIRA', taxClass: 'roth', balance: 1000000, basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  if (edit) edit(p);
  return p;
}
const loan = () => ({ id: 'd1', name: 'Loan', type: 'otherDebt', owner: 'household', balance: 10000, rate: 6, rateType: 'fixed', paymentMonthly: 500, payoffAge: 80, includePayment: true, includeHousingCosts: false, extraPrincipalMonthly: 0 });
const mortgage = () => ({
  id: 'd1', type: 'mortgage', name: 'Mortgage', owner: 'household', balance: 150000, rate: 6, paymentMonthly: 1200, payoffAge: 78,
  includePayment: true, taxDeductible: false, mortgageType: 'conventional', rateType: 'fixed', originalAmount: 200000, propertyValue: 300000,
  remainingTermYears: 18, loanTermYears: 30, extraPrincipalMonthly: 0, annualPropertyTax: 3000, annualInsurance: 1200, hoaMonthly: 0,
  pmiMonthly: 0, includeHousingCosts: true,
});
const without = (record, key) => { delete record[key]; return record; };
const rowsOf = (r) => JSON.stringify(r.rows);

/* A list whose own toJSON counts its calls and throws. */
function throwingList(records) {
  const list = records;
  const counter = { calls: 0 };
  list.toJSON = () => { counter.calls++; throw new Error('this list refuses serialization'); };
  return counter;
}

let built;
test.before(async () => { built = await bootBuild(); });
test.after(() => { if (built) built.dom.window.close(); });

test('Q80: runPlan() calls a debt list\'s throwing toJSON exactly once, and refuses the plan, when includePayment must be filled', () => {
  const p = household((q) => { q.advanced.debts = [without(loan(), 'includePayment')]; });
  const counter = throwingList(p.advanced.debts);
  const r = engine.runPlan(p);
  assert.strictEqual(counter.calls, 1, 'a supported serialization callback must be called exactly once, even when a default is filled');
  assert.strictEqual(r.calculationErrorCode, REFUSED);
  assert.strictEqual(r.rows, null);
});

test('Q80: runPlan() calls a debt list\'s throwing toJSON exactly once, and refuses the plan, when a mortgage\'s includeHousingCosts must be filled', () => {
  const p = household((q) => { q.advanced.debts = [without(mortgage(), 'includeHousingCosts')]; });
  const counter = throwingList(p.advanced.debts);
  const r = engine.runPlan(p);
  assert.strictEqual(counter.calls, 1, 'a supported serialization callback must be called exactly once, even when a default is filled');
  assert.strictEqual(r.calculationErrorCode, REFUSED);
  assert.strictEqual(r.rows, null);
});

test('Q80: runPlan() refuses the plan, and does not throw, when a debt record carries a throwing getter and includePayment must be filled', () => {
  const p = household((q) => { q.advanced.debts = [without(loan(), 'includePayment')]; });
  Object.defineProperty(p.advanced.debts[0], 'note', { enumerable: true, get() { throw new Error('this getter refuses to be read'); } });
  let r;
  assert.doesNotThrow(() => { r = engine.runPlan(p); }, 'filling a default must not read an accessor outside the serialization refusal');
  assert.strictEqual(r.calculationErrorCode, REFUSED);
  assert.strictEqual(r.rows, null);
});

test('Q80: runPlan() runs a debt list\'s successful toJSON exactly once, on the data it returns, with the documented default applied to that data', () => {
  const expected = engine.runPlan(household((q) => { q.advanced.debts = [loan()]; }));
  const p = household((q) => { q.advanced.debts = [without(loan(), 'includePayment')]; });
  let calls = 0;
  const returned = [without(loan(), 'includePayment')];
  p.advanced.debts.toJSON = () => { calls++; return returned; };
  const r = engine.runPlan(p);
  assert.strictEqual(calls, 1, 'a successful serialization callback must be called exactly once');
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(rowsOf(r), rowsOf(expected), 'the returned data must take includePayment\'s documented default, true');
});

test('Q80: runPlan() calls a stateful toJSON that succeeds only once exactly once, and runs the plan, when includePayment must be filled', () => {
  const p = household((q) => { q.advanced.debts = [without(loan(), 'includePayment')]; });
  let calls = 0;
  const data = [without(loan(), 'includePayment')];
  p.advanced.debts.toJSON = () => { calls++; if (calls > 1) throw new Error('this list serializes only once'); return data; };
  const r = engine.runPlan(p);
  assert.strictEqual(calls, 1, 'a stateful serialization callback must be called exactly once');
  assert.strictEqual(r.status, 'ok');
});

test('Q80: runScenario() calls a debt list\'s throwing toJSON exactly once, and refuses the plan, when includePayment must be filled', () => {
  const p = household((q) => { q.advanced.debts = [without(loan(), 'includePayment')]; });
  const counter = throwingList(p.advanced.debts);
  const r = engine.runScenario(p);
  assert.strictEqual(counter.calls, 1, 'a supported serialization callback must be called exactly once, even when a default is filled');
  assert.strictEqual(r.calculationErrorCode, REFUSED);
  assert.strictEqual(r.rows, null);
});

test('Q80: a fresh build\'s main thread calls a debt list\'s throwing toJSON exactly once, and refuses the plan, when includePayment must be filled', () => {
  const p = household((q) => { q.advanced.debts = [without(loan(), 'includePayment')]; });
  const counter = throwingList(p.advanced.debts);
  const r = built.engine.runPlan(p);
  assert.strictEqual(counter.calls, 1, 'a supported serialization callback must be called exactly once, even when a default is filled');
  assert.strictEqual(r.calculationErrorCode, REFUSED);
  assert.strictEqual(r.rows, null);
});

test('Q80: a fresh build\'s main thread refuses the plan, and does not throw, when a debt record carries a throwing getter and includePayment must be filled', () => {
  const p = household((q) => { q.advanced.debts = [without(loan(), 'includePayment')]; });
  Object.defineProperty(p.advanced.debts[0], 'note', { enumerable: true, get() { throw new Error('this getter refuses to be read'); } });
  let r;
  assert.doesNotThrow(() => { r = built.engine.runPlan(p); }, 'filling a default must not read an accessor outside the serialization refusal');
  assert.strictEqual(r.calculationErrorCode, REFUSED);
  assert.strictEqual(r.rows, null);
});

test('Q80 control: runPlan() calls a debt record\'s own throwing toJSON exactly once, and refuses the plan, when includePayment must be filled', () => {
  const p = household((q) => { q.advanced.debts = [without(loan(), 'includePayment')]; });
  let calls = 0;
  p.advanced.debts[0].toJSON = () => { calls++; throw new Error('this record refuses serialization'); };
  const r = engine.runPlan(p);
  assert.strictEqual(calls, 1);
  assert.strictEqual(r.calculationErrorCode, REFUSED);
});

test('Q80 control: with every flag explicit, runPlan() calls a debt list\'s throwing toJSON exactly once and refuses the plan', () => {
  const p = household((q) => { q.advanced.debts = [loan()]; });
  const counter = throwingList(p.advanced.debts);
  const r = engine.runPlan(p);
  assert.strictEqual(counter.calls, 1);
  assert.strictEqual(r.calculationErrorCode, REFUSED);
});

test('Q80 control: an ordinary absent includePayment and includeHousingCosts still take their documented defaults, and the plan passed in is unchanged', () => {
  const expected = engine.runPlan(household((q) => { q.advanced.debts = [mortgage()]; }));
  const p = household((q) => { q.advanced.debts = [without(without(mortgage(), 'includePayment'), 'includeHousingCosts')]; });
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(rowsOf(r), rowsOf(expected), 'absent flags must run as their documented defaults, true for this mortgage');
  assert.strictEqual(p.advanced.debts[0].includePayment, undefined, 'the caller\'s plan is not changed');
  assert.strictEqual(p.advanced.debts[0].includeHousingCosts, undefined, 'the caller\'s plan is not changed');
});

test('Q80 control: an explicit false is kept, and differs from the default where the flag acts', () => {
  const byDefault = engine.runPlan(household((q) => { q.advanced.debts = [without(mortgage(), 'includeHousingCosts')]; }));
  const explicitFalse = engine.runPlan(household((q) => { q.advanced.debts = [Object.assign(mortgage(), { includeHousingCosts: false })]; }));
  assert.strictEqual(explicitFalse.status, 'ok');
  assert.notStrictEqual(rowsOf(explicitFalse), rowsOf(byDefault), 'CONTROL: includeHousingCosts false must differ from its default here');
});

test('Q80 control: a fresh build\'s main thread runs ordinary absent flags exactly as Node does', () => {
  const p = household((q) => { q.advanced.debts = [without(without(mortgage(), 'includePayment'), 'includeHousingCosts')]; });
  const node = engine.runPlan(JSON.parse(JSON.stringify(p)));
  const page = built.engine.runPlan(JSON.parse(JSON.stringify(p)));
  assert.strictEqual(node.status, 'ok');
  assert.strictEqual(JSON.stringify(page.rows), rowsOf(node));
});
