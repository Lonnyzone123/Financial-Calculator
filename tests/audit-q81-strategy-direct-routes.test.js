/* Q81 (direct routes) -- a plan's withdrawal-strategy name means the same on the exported simulatePlan() and the heat
 * map's call as it does through runPlan().
 *
 * The resolution policy: a wrong-case name maps silently to the declared strategy; an unrecognised name is reported and
 * runs as income-first. That resolution lived only in runPlan(), so a direct call ran a wrong-case name as income-first.
 *
 * This file is implementation-coupled on purpose: these two routes are the engine's internal export, and the
 * resolution being witnessed runs there. The public routes -- runPlan(), runScenario(), a fresh build's main thread
 * and its Worker -- are witnessed in the companion public-routes file, which reads no internal.
 * Each title is a literal, so the requirements register names every one.
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

const direct = (p, issues) => engine.simulatePlan(p, engine.rng(p.assumptions.seed), 0, null, issues);
/* The heat map's own call shape (src/app-shell.html): a shallow copy with its own assumptions object. */
const heatMap = (p, issues) => engine.simulatePlan(Object.assign({}, p, { assumptions: Object.assign({}, p.assumptions) }), engine.rng(p.assumptions.seed), 0, null, issues);
const rowsOf = (r) => JSON.stringify(r.rows);
const UNRECOGNIZED = 'RETIREMENT_STRATEGY_UNRECOGNIZED';

/* A retired single, 60 to 62, with a $1,000,000 Roth, no growth, and a 4% rate a percentage strategy acts on. */
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

test('Q81 (direct routes): the exported simulatePlan() runs a wrong-case name of every declared strategy as that strategy, with runPlan()\'s rows', () => {
  /* The declared set, read from the engine's own declaration by the seeded generator: never a second list. */
  const { STRATEGIES } = require('./lib/scenario-generator.js');
  assert.ok(STRATEGIES.length > 1 && STRATEGIES.includes('constantPercent'), 'CONTROL: the declared strategy set must be readable');
  const mismatched = [];
  for (const name of STRATEGIES) {
    const shouted = name.toUpperCase();
    const viaRunPlan = engine.runPlan(household(shouted));
    const declared = direct(household(name), []);
    const viaDirect = direct(household(shouted), []);
    if (rowsOf(viaDirect) !== rowsOf(viaRunPlan) || rowsOf(viaDirect) !== rowsOf(declared)) mismatched.push(shouted);
  }
  assert.deepStrictEqual(mismatched, [], 'a wrong-case strategy name must run as the declared strategy on a direct call');
});

test('Q81 (direct routes): the heat map\'s call runs a wrong-case strategy name as the declared strategy in historical mode, with runPlan()\'s rows', () => {
  const edit = (p) => { Object.assign(p.assumptions, { method: 'historical', historyStart: 1928 }); };
  const viaRunPlan = engine.runPlan(household('CONSTANTPERCENT', edit));
  const viaHeatMap = heatMap(household('CONSTANTPERCENT', edit), []);
  assert.strictEqual(viaHeatMap.rows[1].spending, 40000, 'the heat map\'s call must spend 4% of the balance, as constantPercent does');
  assert.strictEqual(rowsOf(viaHeatMap), rowsOf(viaRunPlan));
});

test('Q81 (direct routes): an unrecognised strategy name on a direct simulatePlan() call is reported once in the caller\'s collector, and runs as income-first', () => {
  const issues = [];
  const viaDirect = direct(household('notAStrategy'), issues);
  const incomeFirst = direct(household('incomeFirst'), []);
  assert.strictEqual(issues.filter((x) => x.code === UNRECOGNIZED).length, 1, 'an unrecognised strategy must be reported once on a direct call');
  assert.strictEqual(rowsOf(viaDirect), rowsOf(incomeFirst));
});

test('Q81 (direct routes) control: a canonical strategy name on a direct call already gives runPlan()\'s rows, and a wrong-case name leaves the caller\'s plan as given', () => {
  assert.strictEqual(rowsOf(direct(household('constantPercent'), [])), rowsOf(engine.runPlan(household('constantPercent'))));
  const p = household('CONSTANTPERCENT');
  direct(p, []);
  heatMap(p, []);
  assert.strictEqual(p.retirement.strategy, 'CONSTANTPERCENT', 'the caller\'s plan is not changed');
});
