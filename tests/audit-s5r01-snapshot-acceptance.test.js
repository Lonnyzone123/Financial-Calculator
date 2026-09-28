/* S5R-01 (the 2026-09-16 external audit), the acceptance cases its section 3 listed that the repair round did not test:
 * callbacks that change otherwise-valid debt terms and other-asset values, compared with executing their returned plain data;
 * and the table's malformed data sent as plain data through a fresh build's main thread and its generated Worker (a Worker
 * cannot carry functions, so the hooks stay on the Node routes). Added in R10 on the owner's answer 1 (A) of the fourth set.
 *
 * The expectations are equalities and named refusals: a hook's result must be exactly the result of the data it returns, and
 * each malformed input must be refused by its code with no rows, on every route.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bootBuild } = require('./lib/build-routes.js');
const { postToWorker } = require('./lib/worker-source.js');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

/* A retired single, 60 to 63, with a Roth, one other asset in net worth and one ordinary debt whose payment counts. */
function household() {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 63, spouseOn: false });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: 60 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, seed: 7 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 10000, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [], otherIncomes: [], dividendOn: false, flexibility: 0 });
  Object.assign(p.advanced, { networthOn: true, insurance: 0, assetsOn: true, rmdOn: false, healthOn: false, ltcOn: false, transferOn: false, conversionOn: false });
  p.advanced.otherAssets = [{ id: 'o1', type: 'bankCash', name: 'Savings', owner: 'household', value: 400000, growth: 0, liquidity: 'liquid', available: false, availableAge: 65, accessPct: 80 }];
  p.advanced.debts = [{ id: 'd1', name: 'Loan', type: 'otherDebt', owner: 'household', balance: 150000, rate: 6, rateType: 'fixed', paymentMonthly: 1500, payoffAge: 80, includePayment: true, includeHousingCosts: false, extraPrincipalMonthly: 0 }];
  p.accounts = [{ id: 'a1', name: 'Roth', owner: 'self', type: 'rothIRA', taxClass: 'roth', balance: 1000000, basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  return p;
}
const plain = (p) => JSON.parse(JSON.stringify(p));
const refused = (r, code) => r && r.calculationErrorCode === code && r.rows === null;

let built;
test.before(async () => { built = await bootBuild(); });
test.after(() => { if (built) built.dom.window.close(); });

test('S5R-01: a debt-list hook that changes valid terms gives exactly the result of the plain data it returns, via runPlan() and runScenario()', () => {
  const changed = (p) => { p.advanced.debts[0] = Object.assign({}, p.advanced.debts[0], { rate: 9, paymentMonthly: 2500, payoffAge: 70 }); return p; };
  const expected = changed(household());
  const hooked = household();
  const debts = hooked.advanced.debts;
  debts.toJSON = () => [Object.assign({}, debts[0], { rate: 9, paymentMonthly: 2500, payoffAge: 70 })];
  const byPlain = engine.runPlan(plain(expected));
  assert.equal(byPlain.status, 'ok', 'premise: the changed terms are valid');
  assert.notDeepEqual(byPlain.rows, engine.runPlan(household()).rows, 'premise: the changed terms move the result');
  assert.deepEqual(engine.runPlan(hooked).rows, byPlain.rows, 'runPlan()');
  const scenario = engine.runScenario(hooked);
  assert.deepEqual(scenario.rows, byPlain.rows, 'runScenario() rows');
  assert.equal(scenario.identity.inputHash, engine.runScenario(plain(expected)).identity.inputHash, 'runScenario() identity');
});

test('S5R-01: an other-asset hook that changes a valid value gives exactly the result of the plain data it returns', () => {
  const expected = household();
  expected.advanced.otherAssets[0].value = 250000;
  const hooked = household();
  const assets = hooked.advanced.otherAssets;
  assets.toJSON = () => [Object.assign({}, assets[0], { value: 250000 })];
  const byPlain = engine.runPlan(plain(expected));
  assert.equal(byPlain.status, 'ok');
  assert.deepEqual(engine.runPlan(hooked).rows, byPlain.rows);
});

test('S5R-01: the table\'s malformed data, sent as plain data, is refused by name on the main thread of a fresh build and in its generated Worker', () => {
  const cases = [
    ['a NaN in a list field no named check covers', 'SCENARIO_NONFINITE_LIST_VALUE', (p) => { p.accounts[0].annualChange = NaN; }],
    ['two accounts with one id', 'SCENARIO_DUPLICATE_ACCOUNT_ID', (p) => { p.accounts.push(Object.assign({}, p.accounts[0], { name: 'Second' })); }],
    ['a string account balance', 'SCENARIO_NONFINITE_ACCOUNT', (p) => { p.accounts[0].balance = '1000000'; }],
    ['a string debt balance', 'SCENARIO_NONFINITE_DEBT_BALANCE', (p) => { p.advanced.debts[0].balance = '150000'; }],
  ];
  const wrong = [];
  for (const [label, code, edit] of cases) {
    const p = household();
    edit(p);
    const page = built.engine.runPlan(structuredClone(p));
    const worker = postToWorker(built.workerSource, structuredClone(p));
    if (!refused(page, code)) wrong.push(label + ' via the main thread: ' + page.status + ' / ' + page.calculationErrorCode);
    if (worker.error !== undefined || !refused(worker.result, code)) wrong.push(label + ' via the Worker: ' + (worker.error || worker.result.status + ' / ' + worker.result.calculationErrorCode));
  }
  assert.deepEqual(wrong, [], 'each is refused by its code with no rows');
});

test('control: the household runs on the main thread and in the Worker, with the same rows', () => {
  const page = built.engine.runPlan(structuredClone(household()));
  const worker = postToWorker(built.workerSource, structuredClone(household()));
  assert.equal(page.status, 'ok');
  assert.equal(worker.error, undefined);
  assert.equal(JSON.stringify(worker.result.rows), JSON.stringify(page.rows), 'the Worker and the main thread (compared as JSON: their objects come from different realms)');
});
