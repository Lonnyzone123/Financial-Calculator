/* Q71 -- a list element that is not a record is refused at the public boundary, never thrown.
 *
 * A list of the right type can hold an element of the wrong one. Before the repair a null element threw in all eight
 * lists the list gate reads, and a number, string or boolean threw in other assets and debts; elsewhere a primitive
 * ran ok, was refused under an unrelated name, or failed downstream. The validator refuses every one as WRONG_TYPE.
 * Decided 2026-09-14 (the owner), answer (a): any element that is not a record is refused, in every list. A record is what
 * the validator's isPlainObject() accepts: not null, an object, not an array.
 *
 * Public routes only: runPlan(), runScenario(), a fresh build's main thread and its generated Worker. Outcomes are
 * collected per site, so a failure names every site and route that answered wrongly. Each title is a literal, so the
 * requirements register names every one.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { bootBuild } = require('./lib/build-routes.js');
const { postToWorker } = require('./lib/worker-source.js');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
/* The debt modules, installed exactly as the browser bundle provides them, before the engine is loaded. */
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const CODE = 'SCENARIO_NON_RECORD_LIST_ELEMENT';

const account = (o) => Object.assign({
  id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 400000, contribution: 5000,
  contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: { stocks: 60, bonds: 30, cash: 10 }, matchOn: false, matchCap: 0,
  matchRate: 0, profitShare: 0, vesting: 100,
}, o);

/* Validator-clean, and every list holds a record: both accounts carry futureChanges arrays, asset classes are on,
   and there is one stage, expense, other income, other asset and debt. */
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

/* Each list, by the plan path that holds it. */
const LISTS = [
  ['accounts', (p) => p.accounts],
  ['accounts[0].futureChanges', (p) => p.accounts[0].futureChanges],
  ['retirement.stages', (p) => p.retirement.stages],
  ['retirement.expenses', (p) => p.retirement.expenses],
  ['retirement.otherIncomes', (p) => p.retirement.otherIncomes],
  ['advanced.assetClasses', (p) => p.advanced.assetClasses],
  ['advanced.otherAssets', (p) => p.advanced.otherAssets],
  ['advanced.debts', (p) => p.advanced.debts],
];
const copy = (v) => JSON.parse(JSON.stringify(v));
const attempt = (fn) => { try { return fn(); } catch (e) { return { threw: String(e && e.message).split('\n')[0] }; } };
const outcome = (r) => (r.threw !== undefined ? 'threw: ' + r.threw : r.status + ' / ' + r.calculationErrorCode + (r.rows === null ? ' / no rows' : ' / rows'));
const refused = (r) => r.threw === undefined && r.calculationErrorCode === CODE && r.rows === null;

let built;
test.before(async () => { built = await bootBuild(); });
test.after(() => { if (built) built.dom.window.close(); });

test('Q71: runPlan() refuses a null element in each of the eight lists, instead of throwing', () => {
  const wrong = [];
  for (const [site, list] of LISTS) {
    const p = fixture();
    list(p)[0] = null;
    const r = attempt(() => engine.runPlan(p));
    if (!refused(r)) wrong.push(site + '[0] = null -> ' + outcome(r));
  }
  assert.deepStrictEqual(wrong, []);
});

test('Q71: runPlan() refuses a number, string, boolean or array element in each of the eight lists', () => {
  const wrong = [];
  for (const [site, list] of LISTS) {
    for (const [name, value] of [['5', 5], ['"x"', 'x'], ['true', true], ['[]', []]]) {
      const p = fixture();
      list(p)[0] = value;
      const r = attempt(() => engine.runPlan(p));
      if (!refused(r)) wrong.push(site + '[0] = ' + name + ' -> ' + outcome(r));
    }
  }
  assert.deepStrictEqual(wrong, []);
});

test('Q71: runScenario(), a fresh build\'s main thread and its generated Worker refuse a null debt and a string spending stage', () => {
  const cases = [
    ['a null debt', (p) => { p.advanced.debts[0] = null; }],
    ['a string spending stage', (p) => { p.retirement.stages[0] = 'x'; }],
  ];
  const wrong = [];
  for (const [label, edit] of cases) {
    const plan = fixture();
    edit(plan);
    const scenario = attempt(() => engine.runScenario(copy(plan)));
    const page = attempt(() => built.engine.runPlan(copy(plan)));
    const worker = attempt(() => postToWorker(built.workerSource, copy(plan)));
    if (!refused(scenario)) wrong.push(label + ' via runScenario(): ' + outcome(scenario));
    if (!refused(page)) wrong.push(label + ' via the main thread: ' + outcome(page));
    if (worker.threw !== undefined) wrong.push(label + ' via the Worker: threw: ' + worker.threw);
    else if (worker.error !== undefined) wrong.push(label + ' via the Worker: posted error: ' + String(worker.error).split('\n')[0]);
    else if (!refused(worker.result)) wrong.push(label + ' via the Worker: ' + outcome(worker.result));
  }
  assert.deepStrictEqual(wrong, []);
});

test('Q71 control: the fixture with a record in every list runs, and so do its lists emptied one at a time', () => {
  const wrong = [];
  const base = attempt(() => engine.runPlan(fixture()));
  if (base.threw !== undefined || base.status !== 'ok') wrong.push('fixture -> ' + outcome(base));
  for (const [site, list] of LISTS.filter(([site]) => site !== 'accounts' && site !== 'advanced.assetClasses')) {
    const p = fixture();
    list(p).length = 0;
    const r = attempt(() => engine.runPlan(p));
    if (r.threw !== undefined || r.status !== 'ok') wrong.push(site + ' emptied -> ' + outcome(r));
  }
  assert.deepStrictEqual(wrong, [], 'CONTROL: records and empty lists are not claimed');
});
