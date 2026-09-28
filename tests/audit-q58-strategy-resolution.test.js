/* S5 block 2k -- Q58: a withdrawal strategy's name is resolved once, before
 * every reader. A wrong-case name maps silently to the strategy it names; an
 * unrecognised one is reported and runs as incomeFirst.
 *
 * Decided 2026-09-13 (the owner): warn, then default to incomeFirst, not a refusal;
 * normalise case silently. Before this, 'Guardrails' ran as incomeFirst with
 * nothing reported, and so did any unknown name.
 *
 * Two layers (2k.1): runPlan() here, and the validator's warning, below. One
 * list (2k.2): both read the engine's WITHDRAWAL_STRATEGIES; the validator's
 * copy is pinned to it in tests/registry-single-definition.test.js.
 *
 * "Removed" names (2k.6) are synthetic: the original app offered exactly
 * today's nine strategies, so no name has ever been removed.
 *
 * The app's own load path, which erased an unmatched saved name before any
 * engine could see it, is S5 2k's second commit and has its own witness.
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
const validator = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

/* The declared set, read from the engine's source text -- the declaration is not exported. */
const DECLARED = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'engine.js'), 'utf8').match(/^var WITHDRAWAL_STRATEGIES=(\[[^\]\n]*\]);$/m)[1]);
const WARN = 'RETIREMENT_STRATEGY_UNRECOGNIZED';

function plan(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 5, inflation: 2, fee: 0, volatility: 0, runs: 20, seed: 3 });
  Object.assign(p.profile, { age: 64, retireAge: 65, endAge: 90, spouseOn: false });
  Object.assign(p.employment, { salary: 0, contributionStop: 64 });
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 2500000, contribution: 0,
    contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
    changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }];
  Object.assign(p.retirement, { strategy: 'guardrails', spending: 60000, withdrawalRate: 4, floor: 0, ceiling: 10000000, ssBenefit: 0, stages: [], expenses: [], otherIncomes: [] });
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  if (edit) edit(p);
  return p;
}
const withStrategy = (strategy, more) => plan((p) => { p.retirement.strategy = strategy; if (more) more(p); });
const warnings = (r) => (r.issues || []).filter((i) => i.code === WARN);
const rowsOf = (r) => JSON.stringify(r.rows);

test('Q58 wrong case: \'Guardrails\' runs exactly as guardrails, and nothing is reported', () => {
  const exact = engine.runPlan(withStrategy('guardrails'));
  const income = engine.runPlan(withStrategy('incomeFirst'));
  assert.notEqual(rowsOf(exact), rowsOf(income), 'CONTROL: guardrails and incomeFirst differ on this plan, so a substitution is visible');
  for (const name of ['Guardrails', 'GUARDRAILS', 'gUaRdRaIlS']) {
    const r = engine.runPlan(withStrategy(name));
    assert.equal(rowsOf(r), rowsOf(exact), name + ' did not run as guardrails (the unrepaired engine ran it as incomeFirst)');
    assert.deepEqual(warnings(r), [], name + ' is normalised silently, not reported');
  }
});

test('Q58 unknown and removed names: reported once, and run as incomeFirst', () => {
  const income = engine.runPlan(withStrategy('incomeFirst'));
  for (const name of ['bucketStrategy', 'percentOfPortfolio', '']) {
    const r = engine.runPlan(withStrategy(name));
    assert.equal(r.status, 'ok');
    assert.equal(rowsOf(r), rowsOf(income), JSON.stringify(name) + ' runs as incomeFirst');
    const found = warnings(r);
    assert.equal(found.length, 1, 'expected exactly one ' + WARN + ' for ' + JSON.stringify(name) + ', got ' + found.length);
    assert.equal(found[0].severity, 'WARNING');
    assert.ok(found[0].message.includes(JSON.stringify(name)), 'the warning names the value it could not use: ' + found[0].message);
  }
});

test('Q58 non-string strategies: reported once, and run as incomeFirst', () => {
  const income = engine.runPlan(withStrategy('incomeFirst'));
  for (const value of [5, null, true, {}]) {
    const r = engine.runPlan(withStrategy(value));
    assert.equal(rowsOf(r), rowsOf(income), JSON.stringify(value) + ' runs as incomeFirst');
    assert.equal(warnings(r).length, 1, 'expected exactly one ' + WARN + ' for ' + JSON.stringify(value) + ', got ' + warnings(r).length);
  }
});

test('Q58 controls: every exact name, and an absent strategy, run unreported', () => {
  assert.equal(DECLARED.length, 9, 'CONTROL: the declared set was read from the engine source');
  for (const name of DECLARED) {
    const r = engine.runPlan(withStrategy(name));
    assert.equal(r.status, 'ok', name + ' runs');
    assert.deepEqual(warnings(r), [], name + ' is a real strategy and is not reported');
  }
  const absent = engine.runPlan(plan((p) => { delete p.retirement.strategy; }));
  assert.equal(absent.status, 'ok');
  assert.deepEqual(warnings(absent), [], 'an absent strategy stays silent, as before');
});

test('Q58 Monte Carlo: an unknown strategy is reported once for the run, not once per path', () => {
  const r = engine.runPlan(withStrategy('bucketStrategy', (p) => { Object.assign(p.assumptions, { method: 'monteCarlo', volatility: 12, runs: 20, seed: 3 }); }));
  assert.equal(r.status, 'ok');
  assert.equal(warnings(r).length, 1, 'expected exactly one warning for a 20-path run, got ' + warnings(r).length);
});

test('Q58 resolved before every reader: a wrong-case guardrails plan with an inverted floor and ceiling still gets the swap warning', () => {
  const r = engine.runPlan(withStrategy('Guardrails', (p) => { p.retirement.floor = 80000; p.retirement.ceiling = 50000; }));
  const swaps = (r.issues || []).filter((i) => i.code === 'SPENDING_FLOOR_CEILING_SWAPPED');
  assert.equal(swaps.length, 1, 'the swap warning must see the resolved strategy; it saw ' + swaps.length + ' (the unrepaired engine compared the raw name)');
  assert.deepEqual(warnings(r), [], 'the wrong case itself is not reported');
});

test('Q58 runScenario(): an unknown strategy is reported, and the caller\'s plan is not mutated', () => {
  const p = withStrategy('Guardrails');
  const r = engine.runScenario(p);
  assert.equal(r.status, 'ok');
  assert.equal(p.retirement.strategy, 'Guardrails', 'resolution must not rewrite the caller\'s plan');
  const u = engine.runScenario(withStrategy('bucketStrategy'));
  assert.equal(warnings(u).length, 1, 'runScenario() reports it too');
});

test('Q58 validator: an unknown strategy is a WARNING, not an ERROR; a wrong-case or exact name is not reported', () => {
  const issuesFor = (strategy) => validator.validateScenario(withStrategy(strategy)).issues.filter((i) => i.path === 'retirement.strategy');
  const unknown = validator.validateScenario(withStrategy('bucketStrategy'));
  const found = unknown.issues.filter((i) => i.path === 'retirement.strategy');
  assert.equal(found.length, 1, 'expected one issue at retirement.strategy for an unknown name, got ' + JSON.stringify(found));
  assert.equal(found[0].code, 'UNKNOWN_STRATEGY');
  assert.equal(found[0].severity, 'WARNING', 'decided: warn and default, not refuse');
  assert.equal(unknown.valid, true, 'a warning does not make the plan invalid');
  assert.deepEqual(issuesFor('Guardrails'), [], 'a wrong-case name is accepted silently');
  assert.deepEqual(issuesFor('guardrails'), [], 'CONTROL: an exact name raises nothing');
});

/* ---- the generated Worker ---- */

const { liveWorkerSource, postToWorker, cleanup } = require('./lib/worker-source.js');
test.after(() => cleanup());

test('Q58 worker: the Worker resolves the name too -- an unknown strategy is reported, not a posted error', async () => {
  const source = await liveWorkerSource();
  const message = postToWorker(source, withStrategy('bucketStrategy'));
  assert.equal(message.error, undefined, 'the Worker posted an error: ' + message.error);
  const found = (message.result.issues || []).filter((i) => i.code === WARN);
  assert.equal(found.length, 1, 'the Worker returned ' + found.length + ' ' + WARN + ' warnings');
});

test('Q58 worker control: the Worker runs an exact strategy unreported', async () => {
  const source = await liveWorkerSource();
  const message = postToWorker(source, withStrategy('guardrails'));
  assert.equal(message.error, undefined, 'the Worker posted an error: ' + message.error);
  assert.equal(message.result.status, 'ok');
  assert.deepEqual((message.result.issues || []).filter((i) => i.code === WARN), []);
});
