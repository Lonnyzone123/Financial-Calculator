/* Q72 -- an other asset's value or a debt's balance that is not a finite number is refused at the public boundary, not
 * added into the rows.
 *
 * Both reach every row through a sum that adds with +, so a numeric string concatenated: 0 + "400000" became "0400000".
 * Decided 2026-09-14 (the owner), answer (a): the input gate refuses a present value that is not a finite number, by type,
 * before any arithmetic. Public routes only: runPlan(), runScenario(), a fresh build's main thread and its generated
 * Worker. Each title is a literal, so the requirements register names every one.
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

const ASSET_CODE = 'SCENARIO_NONFINITE_OTHER_ASSET_VALUE';
const DEBT_CODE = 'SCENARIO_NONFINITE_DEBT_BALANCE';
const NOT_NUMBERS = ['400000', null, NaN, Infinity, true];

/* A retired single, 60 to 62, with a Roth, one other asset held in net worth, and one ordinary debt. */
function household(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 62, spouseOn: false });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: 60 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, seed: 7 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 10000, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [], otherIncomes: [], dividendOn: false, flexibility: 0 });
  Object.assign(p.advanced, { networthOn: true, insurance: 0, assetsOn: true, rmdOn: false, healthOn: false, ltcOn: false, transferOn: false, conversionOn: false });
  p.advanced.otherAssets = [{ id: 'o1', type: 'bankCash', name: 'Savings', owner: 'household', value: 400000, growth: 0, liquidity: 'liquid', available: false, availableAge: 65, accessPct: 80 }];
  p.advanced.debts = [{ id: 'd1', name: 'Loan', type: 'otherDebt', owner: 'household', balance: 150000, rate: 6, rateType: 'fixed', paymentMonthly: 1500, payoffAge: 80, includePayment: true, includeHousingCosts: false, extraPrincipalMonthly: 0 }];
  p.accounts = [{ id: 'a1', name: 'Roth', owner: 'self', type: 'rothIRA', taxClass: 'roth', balance: 1000000, basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  if (edit) edit(p);
  return p;
}
const show = (v) => (typeof v === 'number' ? String(v) : JSON.stringify(v));
const refused = (r, code) => r && r.calculationErrorCode === code && r.rows === null;

let built;
test.before(async () => { built = await bootBuild(); });
test.after(() => { if (built) built.dom.window.close(); });

test('Q72: runPlan() refuses an other-asset value that is not a finite number, instead of adding it into the rows', () => {
  const wrong = [];
  for (const v of NOT_NUMBERS) {
    const r = engine.runPlan(household((p) => { p.advanced.otherAssets[0].value = v; }));
    if (!refused(r, ASSET_CODE)) wrong.push(show(v) + ' -> ' + r.status + ' / ' + r.calculationErrorCode);
  }
  assert.deepStrictEqual(wrong, [], 'each must be refused as ' + ASSET_CODE + ' with no rows');
});

test('Q72: runPlan() refuses a debt balance that is not a finite number, instead of adding it into the rows', () => {
  const wrong = [];
  for (const v of NOT_NUMBERS) {
    const r = engine.runPlan(household((p) => { p.advanced.debts[0].balance = v; }));
    if (!refused(r, DEBT_CODE)) wrong.push(show(v) + ' -> ' + r.status + ' / ' + r.calculationErrorCode);
  }
  assert.deepStrictEqual(wrong, [], 'each must be refused as ' + DEBT_CODE + ' with no rows');
});

test('Q72: runScenario(), a fresh build\'s main thread and its generated Worker refuse a numeric-string other-asset value and debt balance', () => {
  const cases = [
    ['other-asset value', ASSET_CODE, (p) => { p.advanced.otherAssets[0].value = '400000'; }],
    ['debt balance', DEBT_CODE, (p) => { p.advanced.debts[0].balance = '150000'; }],
  ];
  const wrong = [];
  for (const [label, code, edit] of cases) {
    const plan = household(edit);
    const scenario = engine.runScenario(JSON.parse(JSON.stringify(plan)));
    const page = built.engine.runPlan(JSON.parse(JSON.stringify(plan)));
    const worker = postToWorker(built.workerSource, JSON.parse(JSON.stringify(plan)));
    if (!refused(scenario, code)) wrong.push(label + ' via runScenario(): ' + scenario.calculationErrorCode);
    if (!refused(page, code)) wrong.push(label + ' via the main thread: ' + page.calculationErrorCode);
    if (worker.error !== undefined || !refused(worker.result, code)) wrong.push(label + ' via the Worker: ' + (worker.error || worker.result.calculationErrorCode));
  }
  assert.deepStrictEqual(wrong, []);
});

test('Q72 control: the same plan with numeric values runs, and its rows carry numbers', () => {
  const r = engine.runPlan(household());
  assert.strictEqual(r.status, 'ok', 'CONTROL: got ' + r.calculationErrorCode);
  assert.strictEqual(typeof r.rows[0].otherAssets, 'number');
  assert.strictEqual(typeof r.rows[0].debtBalance, 'number');
  assert.ok(r.rows[0].otherAssets > 0 && r.rows[0].debtBalance > 0, 'CONTROL: the fixture must hold an asset and a debt');
});
