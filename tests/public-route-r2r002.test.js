'use strict';

/*
 * S5 block 2r -- R2R-002 through the public entry point.
 *
 * A result whose calculation failed is not a financial result. runPlan() takes
 * it out of the ordinary contract entirely: status "calculation_error", and no
 * success rate, failure flag, rows, lifetime totals or shortfall ages, with the
 * partial run kept only under a separately labelled diagnostic object. Before
 * the repair the numbers from the failed run were still published beside the
 * error flag, in simple mode as a 0% success with rows, and under Monte Carlo
 * as an ordinary batch. The coupled guard feeds fabricated path results to the
 * engine's internal aggregator. This file reads only what runPlan() returns.
 *
 * Plan: 75 and retired, required distributions on, no spending, a 7% return on
 * a traditional 401(k) balance of 1e308. It passes every input check and
 * overflows during growth, so the error arises inside the simulation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require('../src/engine.js');
// eslint-disable-next-line no-eval
const defaultPlan = () => JSON.parse(JSON.stringify(eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')')));

const account = (o) => Object.assign({
  id: 'pretax', name: '401k', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 100000, contribution: 0,
  contributionMode: 'amount', priority: 1, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
}, o);
function plan({ method, overflow }) {
  const p = defaultPlan();
  p.setupComplete = true;
  Object.assign(p.profile, { age: 75, retireAge: 65, endAge: 76 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, { ssBenefit: 0, dividendOn: false, strategy: 'fixedNominal', spending: 0 });
  p.advanced.rmdOn = true;
  Object.assign(p.assumptions, { returnRate: overflow ? 7 : 0, method });
  if (method === 'monteCarlo') p.assumptions.runs = 20;
  p.accounts = [account({ balance: overflow ? 1e308 : 1000000 })];
  return p;
}
function assertNoOrdinaryFields(r, mode, label) {
  assert.equal(r.status, 'calculation_error',
    mode + ': a calculation error must take the result out of the ordinary financial contract: status ' + r.status);
  assert.equal(r.calculationError, true, mode + ': the error is flagged');
  assert.equal(r.successRate, null, mode + ': no success rate');
  assert.equal(r.failed, null, mode + ': the financial failure flag is not reused');
  assert.equal(r.rows, null, mode + ': no rows');
  assert.equal(r.lifetimeTaxes, null, mode + ': no lifetime totals');
  assert.equal(r.firstShortfallAge, null, mode + ': no shortfall age');
  assert.ok(r.partialDiagnostics, mode + ': the partial run is kept for diagnostics');
  assert.match(String(r.partialDiagnostics.label), label, mode + ': under a label that says it is not the plan result');
}

test('R2R-002 (runPlan): in simple mode, a calculation error returns no ordinary financial fields, only a labelled partial diagnostic', () => {
  assertNoOrdinaryFields(engine.runPlan(plan({ method: 'simple', overflow: true })), 'simple mode', /^partial run up to the calculation error -- diagnostic, not the plan result/);
});

test('R2R-002 (runPlan): under Monte Carlo, a calculation error takes the whole batch out of the ordinary contract', () => {
  assertNoOrdinaryFields(engine.runPlan(plan({ method: 'monteCarlo', overflow: true })), 'Monte Carlo', /^valid paths only -- diagnostic, not the plan result/);
});

test('R2R-002 (runPlan): a valid plan keeps its ordinary fields in both modes', () => {
  for (const method of ['simple', 'monteCarlo']) {
    const r = engine.runPlan(plan({ method, overflow: false }));
    assert.equal(r.status, 'ok', method + ': the valid plan runs');
    assert.equal(r.calculationError, false, method + ': with no error');
    assert.equal(r.successRate, 100, method + ': and a real success rate');
    assert.equal(r.failed, false, method + ': and the ordinary failure flag');
    assert.ok(Array.isArray(r.rows) && r.rows.length === 2, method + ': and its rows');
    assert.ok(!r.partialDiagnostics, method + ': and no diagnostic object');
  }
});
