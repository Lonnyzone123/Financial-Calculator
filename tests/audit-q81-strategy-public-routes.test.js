/* Q81 -- a plan's withdrawal-strategy name means the same on every public route.
 *
 * The resolution policy: a wrong-case name maps silently to the declared strategy; an unrecognised name is reported
 * once and runs as income-first. This file holds that policy on the public routes -- runPlan(), runScenario(), a fresh
 * build's main thread and its generated Worker -- and holds that a Monte Carlo run reports an unrecognised name once,
 * not once per path. The direct routes (the exported simulation function and the heat map's call) are witnessed in the
 * companion direct-routes file, which is implementation-coupled by nature.
 * Each title is a literal, so the requirements register names every one.
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
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const rowsOf = (r) => JSON.stringify(r.rows);
const UNRECOGNIZED = 'RETIREMENT_STRATEGY_UNRECOGNIZED';

function household(strategy, edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 62, spouseOn: false });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: 60 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, seed: 7 });
  Object.assign(p.retirement, { strategy, withdrawalRate: 4, spending: 10000, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [], otherIncomes: [], dividendOn: false, flexibility: 0 });
  Object.assign(p.advanced, { debts: [], otherAssets: [], networthOn: true, insurance: 0, assetsOn: false, rmdOn: false, healthOn: false, ltcOn: false, transferOn: false, conversionOn: false });
  p.accounts = [{ id: 'a1', name: 'Roth', owner: 'self', type: 'rothIRA', taxClass: 'roth', balance: 1000000, basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  if (edit) edit(p);
  return p;
}

let built;
test.before(async () => { built = await bootBuild(); });
test.after(() => { if (built) built.dom.window.close(); });

test('Q81: runPlan(), runScenario(), a fresh build\'s main thread and its generated Worker run a wrong-case strategy name as the declared strategy', () => {
  const declared = engine.runPlan(household('constantPercent'));
  assert.strictEqual(declared.rows[1].spending, 40000, 'CONTROL: constantPercent spends 4% of the balance here');
  const shouted = household('CONSTANTPERCENT');
  const viaRunPlan = engine.runPlan(JSON.parse(JSON.stringify(shouted)));
  const viaScenario = engine.runScenario(JSON.parse(JSON.stringify(shouted)));
  const viaPage = built.engine.runPlan(JSON.parse(JSON.stringify(shouted)));
  const viaWorker = postToWorker(built.workerSource, JSON.parse(JSON.stringify(shouted)));
  assert.strictEqual(viaWorker.error, undefined);
  for (const [route, rows] of [['runPlan()', rowsOf(viaRunPlan)], ['runScenario()', rowsOf(viaScenario)], ['main thread', JSON.stringify(viaPage.rows)], ['Worker', JSON.stringify(viaWorker.result.rows)]]) {
    assert.strictEqual(rows, rowsOf(declared), route + ' must run a wrong-case name as the declared strategy');
  }
});

test('Q81: an unrecognised strategy name is reported once by runPlan() in Monte Carlo mode, and the run spends as income-first', () => {
  const edit = (p) => { Object.assign(p.assumptions, { method: 'monteCarlo', runs: 20, volatility: 12, returnRate: 5 }); };
  const unknown = engine.runPlan(household('notAStrategy', edit));
  const incomeFirst = engine.runPlan(household('incomeFirst', edit));
  assert.strictEqual(unknown.issues.filter((x) => x.code === UNRECOGNIZED).length, 1, 'a Monte Carlo run must report an unrecognised strategy once, not once per path');
  assert.strictEqual(rowsOf(unknown), rowsOf(incomeFirst));
});
