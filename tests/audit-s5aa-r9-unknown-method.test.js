/* S5AA R9 round, DeepSeek audit finding 2e/02 (reproduced at 623cf64): AN UNKNOWN PROJECTION METHOD IS REFUSED, NOT RUN AS
 * "simple".
 *
 * The validator only warns (INVALID_ENUM) about assumptions.method, so an imported plan reached the engine with any
 * value, and every branch that reads it (`=== "monteCarlo"`, `=== "historical"`) fell through to the simple projection:
 * a plan asking for "montecarlo" or "Monte Carlo" got one deterministic path, reported as mode "montecarlo", with no word
 * that the method it named was not run. The boundary now refuses a PRESENT method that is not one the engine runs
 * (simple, historical, monteCarlo), as Q68 made it refuse an unknown filing status. An absent method is left to the
 * existing default. Tested through runPlan() and runScenario().
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
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const CODE = 'SCENARIO_UNKNOWN_METHOD';
function plan(method) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 63, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { returnRate: 5, inflation: 2, runs: 100 });
  if (method === undefined) delete p.assumptions.method; else p.assumptions.method = method;
  p.accounts = [{ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000, basisPct: 100, contribution: 0, priority: 1 }];
  return p;
}

test('finding 2e/02: runPlan() refuses a method it does not run, instead of running it as simple', () => {
  for (const method of ['montecarlo', 'Monte Carlo', 'bootstrap', '', 'constructor', 7, null]) {
    const r = engine.runPlan(plan(method));
    assert.equal(r.calculationErrorCode, CODE, JSON.stringify(method));
    assert.equal(r.rows, null, JSON.stringify(method) + ': no rows');
  }
});

test('finding 2e/02: runScenario() refuses it too', () => {
  const r = engine.runScenario(plan('montecarlo'));
  const result = r && r.result !== undefined ? r.result : r;
  assert.equal(result.calculationErrorCode, CODE);
});

test('finding 2e/02 control: the three methods the engine runs are not refused, and an absent method keeps its default', () => {
  for (const method of ['simple', 'historical', 'monteCarlo', undefined]) {
    const r = engine.runPlan(plan(method));
    assert.equal(r.status, 'ok', JSON.stringify(method) + ': ' + r.calculationErrorCode);
  }
});
