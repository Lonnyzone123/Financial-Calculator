/* S5 block 2i -- Q55: a list field that is present but not a list is refused
 * with the invalid-result contract, never thrown and never normalized.
 *
 * Decided 2026-09-13 (the owner): reject, do not normalize. The engine read each list
 * with (x||[]).forEach or .reduce, which absorbs null and undefined but not a
 * truthy non-array, so {} crashed runPlan() with a TypeError while the
 * validator refused the same plan.
 *
 * The nine sites were enumerated from the engine by behaviour, not taken from
 * Q55's list of eight. At 60a874e every path of a validator-clean plan was set
 * to {}, "x", 5 and true, and only these threw: the seven top-level lists, each
 * account's futureChanges, and manualOrder (a comma-separated list read with
 * split()). A string manualOrder is not refused: its tokens are the
 * validator's to check.
 *
 * Not claimed here: an absent list; a list whose elements are not records
 * (Q71); an absent or null manualOrder under a manual withdrawal order.
 *
 * Reachability: programmatic. Import runs the validator, and the app always
 * writes lists, so a caller of runPlan() or runScenario() that has not
 * validated is the surface. The Worker is covered below because it rebuilds
 * the engine from app-shell.html's hand-kept function list, where a missing
 * entry is a ReferenceError.
 *
 * The export-level test of the gate itself lives in tests/audit-q55-gate-export.test.js. It was split
 * out at S5 block 2r so that this file reaches the engine only through runPlan(), runScenario() and
 * the Worker, and so survives a rebuild that renames the gate.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const CODE = 'SCENARIO_NON_ARRAY_LIST_FIELD';

const account = (o) => Object.assign({
  id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 400000, contribution: 5000,
  contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: { stocks: 60, bonds: 30, cash: 10 }, matchOn: false, matchCap: 0,
  matchRate: 0, profitShare: 0, vesting: 100,
}, o);

/* Validator-clean, and it exercises every list: both accounts carry futureChanges
   arrays, asset classes are on, and the withdrawal order is manual. */
function fixture() {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 5, inflation: 2, fee: 0, volatility: 0 });
  Object.assign(p.profile, { age: 55, retireAge: 60, endAge: 85, spouseOn: true, spouseAge: 55 });
  Object.assign(p.employment, { salary: 90000, contributionStop: 60 });
  p.accounts = [
    account({ futureChanges: [{ age: 57, mode: 'dollar', value: 500 }] }),
    account({ id: 'a2', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', balance: 300000, contribution: 0, basisPct: 0, priority: 2 }),
  ];
  p.advanced.assetsOn = true;
  p.advanced.networthOn = true;
  p.advanced.otherAssets = [{ id: 'o1', type: 'primaryResidence', name: 'Home', value: 400000, available: true, accessPct: 50 }];
  p.advanced.debts = [{ id: 'd1', type: 'mortgage', name: 'Mortgage', owner: 'self', balance: 150000, rate: 6, paymentMonthly: 1200, payoffAge: 75, includePayment: true, includeHousingCosts: false, taxDeductible: true, mortgageType: 'conventional', rateType: 'fixed', extraPrincipalMonthly: 0, annualPropertyTax: 0, annualInsurance: 0, hoaMonthly: 0, pmiMonthly: 0 }];
  Object.assign(p.retirement, {
    withdrawalOrder: 'manual', manualOrder: 'taxable,preTax,roth,hsa',
    stages: [{ start: 70, end: 80, mode: 'percent', value: -10 }],
    expenses: [{ age: 65, amount: 20000, kind: 'expense' }],
    otherIncomes: [{ type: 'pension', owner: 'self', amount: 10000, start: 65, end: 85, growth: 0, growthMode: 'fixed' }],
  });
  return p;
}

const SITES = [
  ['accounts', (p, v) => { p.accounts = v; }],
  ['accounts[0].futureChanges', (p, v) => { p.accounts[0].futureChanges = v; }],
  ['retirement.stages', (p, v) => { p.retirement.stages = v; }],
  ['retirement.expenses', (p, v) => { p.retirement.expenses = v; }],
  ['retirement.otherIncomes', (p, v) => { p.retirement.otherIncomes = v; }],
  ['advanced.assetClasses', (p, v) => { p.advanced.assetClasses = v; }],
  ['advanced.otherAssets', (p, v) => { p.advanced.otherAssets = v; }],
  ['advanced.debts', (p, v) => { p.advanced.debts = v; }],
  ['retirement.manualOrder', (p, v) => { p.retirement.manualOrder = v; }, 'string'],
];
const VALUES = [['{}', () => ({})], ['"x"', () => 'x'], ['5', () => 5], ['true', () => true]];

for (const [site, set, shape] of SITES) {
  test('Q55 ' + site + ': a value that is not a ' + (shape || 'list') + ' is refused with ' + CODE + ', never thrown', () => {
    for (const [name, make] of VALUES) {
      if (shape === 'string' && name === '"x"') continue;
      const p = fixture();
      set(p, make());
      let r;
      assert.doesNotThrow(() => { r = engine.runPlan(p); }, 'runPlan() threw for ' + site + ' = ' + name);
      assert.equal(r.calculationErrorCode, CODE, site + ' = ' + name);
      assert.equal(r.rows, null, site + ' = ' + name + ': the invalid-result shape carries no rows');
      const q = fixture();
      set(q, make());
      let s;
      assert.doesNotThrow(() => { s = engine.runScenario(q); }, 'runScenario() threw for ' + site + ' = ' + name);
      assert.equal(s.calculationErrorCode, CODE, 'runScenario(): ' + site + ' = ' + name);
    }
  });
}

test('Q55 controls: the fixture runs, a string manualOrder is not refused, and a cycle is still the serialization refusal', () => {
  assert.equal(engine.runPlan(fixture()).status, 'ok', 'CONTROL: the validator-clean fixture runs');
  const text = fixture();
  text.retirement.manualOrder = 'x';
  assert.notEqual(engine.runPlan(text).calculationErrorCode, CODE, 'a string manualOrder is the validator\'s to check, not a list-shape refusal');
  const cyclic = fixture();
  cyclic.accounts[0].self = cyclic.accounts[0];
  assert.equal(engine.runPlan(cyclic).calculationErrorCode, 'SCENARIO_NONSERIALIZABLE_INPUT', 'a cycle inside a real list is still the serialization gate\'s');
});

/* ---- the generated Worker ---- */

const { liveWorkerSource, postToWorker, cleanup } = require('./lib/worker-source.js');
test.after(() => cleanup());

test('Q55 worker: a plan whose stages is not a list comes back refused, not as a posted error', async () => {
  const source = await liveWorkerSource();
  const plan = fixture();
  plan.retirement.stages = {};
  const message = postToWorker(source, plan);
  assert.equal(message.error, undefined, 'the Worker posted an error: ' + message.error);
  assert.equal(message.result.calculationErrorCode, CODE);
});

test('Q55 worker control: the Worker still runs the ordinary fixture', async () => {
  const source = await liveWorkerSource();
  const message = postToWorker(source, fixture());
  assert.equal(message.error, undefined, 'the Worker posted an error: ' + message.error);
  assert.equal(message.result.status, 'ok');
});
