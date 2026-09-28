/* Q69 -- an other income without an owner is refused at the public boundary, not silently timed against self.
 *
 * otherIncomeFor() times an income against the spouse's age only when its owner is "spouse", so an income with no
 * owner ran on self's age and the plan returned status ok. The validator refuses an absent owner as MISSING_FIELD,
 * for every income type. Decided 2026-09-14 (the owner), answer (a): refused at the boundary with a named code. Absent
 * means undefined, as in the validator. How a household-owned income is timed is a separate, held question; the
 * control only shows such an income still runs.
 *
 * Public routes only: runPlan(), runScenario(), a fresh build's main thread and its generated Worker. Each title is
 * a literal, so the requirements register names every one.
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

const CODE = 'SCENARIO_MISSING_INCOME_OWNER';

/* A couple, self 60 and spouse 52, both retired, drawing on one IRA, with a spouse-owned pension and a one-time
   inheritance: an income timed on the wrong person's age would start eight years off. */
function fixture() {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 4, inflation: 2, fee: 0, volatility: 0 });
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 80, spouseOn: true, spouseAge: 52 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  p.accounts = [{ id: 'a1', name: 'IRA', owner: 'self', type: 'traditionalIRA', taxClass: 'preTax', balance: 900000, basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  p.advanced.otherAssets = [];
  p.advanced.debts = [];
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 40000, stages: [], expenses: [],
    otherIncomes: [
      { name: 'Pension', type: 'pension', owner: 'spouse', amount: 18000, start: 62, end: 90, growth: 0, growthMode: 'fixed' },
      { name: 'Inheritance', type: 'oneTime', owner: 'self', amount: 50000, start: 66 },
    ],
  });
  return p;
}
const copy = (v) => JSON.parse(JSON.stringify(v));
const attempt = (fn) => { try { return fn(); } catch (e) { return { threw: String(e && e.message).split('\n')[0] }; } };
const outcome = (r) => (r.threw !== undefined ? 'threw: ' + r.threw : r.status + ' / ' + r.calculationErrorCode + (r.rows === null ? ' / no rows' : ' / rows'));
const refused = (r) => r.threw === undefined && r.calculationErrorCode === CODE && r.rows === null;

let built;
test.before(async () => { built = await bootBuild(); });
test.after(() => { if (built) built.dom.window.close(); });

test('Q69: runPlan() refuses an other income without an owner, whichever position it holds and whatever its type', () => {
  const cases = [
    ['the first income, a pension', (p) => { delete p.retirement.otherIncomes[0].owner; }],
    ['the second income, a one-time inheritance', (p) => { delete p.retirement.otherIncomes[1].owner; }],
    ['a third income, a rental, after two owned ones', (p) => { p.retirement.otherIncomes.push({ name: 'Rental', type: 'rental', amount: 12000, start: 60, end: 80, growth: 0, growthMode: 'fixed' }); }],
  ];
  const wrong = [];
  for (const [label, edit] of cases) {
    const p = fixture();
    edit(p);
    const r = attempt(() => engine.runPlan(p));
    if (!refused(r)) wrong.push(label + ' -> ' + outcome(r));
  }
  assert.deepStrictEqual(wrong, []);
});

test('Q69: runScenario(), a fresh build\'s main thread and its generated Worker refuse an other income without an owner', () => {
  const plan = fixture();
  delete plan.retirement.otherIncomes[0].owner;
  const wrong = [];
  const scenario = attempt(() => engine.runScenario(copy(plan)));
  const page = attempt(() => built.engine.runPlan(copy(plan)));
  const worker = attempt(() => postToWorker(built.workerSource, copy(plan)));
  if (!refused(scenario)) wrong.push('runScenario(): ' + outcome(scenario));
  if (!refused(page)) wrong.push('the main thread: ' + outcome(page));
  if (worker.threw !== undefined) wrong.push('the Worker: threw: ' + worker.threw);
  else if (worker.error !== undefined) wrong.push('the Worker: posted error: ' + String(worker.error).split('\n')[0]);
  else if (!refused(worker.result)) wrong.push('the Worker: ' + outcome(worker.result));
  assert.deepStrictEqual(wrong, []);
});

test('Q69 control: an other income owned by self, spouse or household still runs', () => {
  const wrong = [];
  for (const owner of ['self', 'spouse', 'household']) {
    const p = fixture();
    p.retirement.otherIncomes[0].owner = owner;
    const r = attempt(() => engine.runPlan(p));
    if (r.threw !== undefined || r.status !== 'ok') wrong.push('owner ' + owner + ' -> ' + outcome(r));
  }
  assert.deepStrictEqual(wrong, [], 'CONTROL: an owned income is not claimed');
});
