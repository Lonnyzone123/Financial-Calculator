'use strict';

/*
 * S5 block 2r -- R2R-001 through the public entry points.
 *
 * runPlan() and runScenario() refuse an account whose balance, or whose
 * taxable basis percentage, is not a usable number, before the simulation
 * copies the plan. Without that boundary check the copy turns Infinity into
 * null and growth turns null into 0, so an Infinity balance ran as an ordinary
 * plan on a silently emptied account; and a taxable account with no basis
 * percentage went on to the tax quote, which refused it only there. The
 * coupled guards call the tax quote and its input checks directly. This file
 * reads only what runPlan() and runScenario() return.
 *
 * Plan: 75 and retired, simple mode, no return, required distributions on, no
 * spending, one $1,000,000 traditional 401(k). Each refused plan changes one
 * account.
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
function plan() {
  const p = defaultPlan();
  p.setupComplete = true;
  Object.assign(p.profile, { age: 75, retireAge: 65, endAge: 76 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, { ssBenefit: 0, dividendOn: false, strategy: 'fixedNominal', spending: 0 });
  p.advanced.rmdOn = true;
  Object.assign(p.assumptions, { returnRate: 0, method: 'simple' });
  p.accounts = [account({ balance: 1000000 })];
  return p;
}
function taxableAccountPlan(basisPct) {
  const p = plan();
  p.advanced.rmdOn = false;
  p.retirement.pension = 80000;
  p.accounts = [account({ id: 'broker', taxClass: 'taxable', type: 'taxable', balance: 100000, priority: 1, basisPct })];
  if (basisPct === undefined) delete p.accounts[0].basisPct;
  return p;
}
const entryPoints = [['runPlan', engine.runPlan], ['runScenario', engine.runScenario]];

test('R2R-001 (runPlan): an account balance of Infinity is refused at the boundary by runPlan() and runScenario(), with no rows', () => {
  for (const [name, run] of entryPoints) {
    const p = plan();
    p.accounts = [account({ balance: Infinity })];
    const r = run(p);
    assert.equal(r.status, 'calculation_error',
      'an Infinity balance must be refused at the boundary: ' + name + ' returned status ' + r.status + ', code ' + r.calculationErrorCode);
    assert.equal(r.calculationErrorCode, 'SCENARIO_NONFINITE_ACCOUNT', name + ' names the refusal');
    assert.equal(r.rows, null, name + ' publishes no rows for a refused plan');
  }
});

test('R2R-001 (runPlan): a taxable account with no basis percentage is refused at the boundary, not left to the tax quote', () => {
  for (const [name, run] of entryPoints) {
    const r = run(taxableAccountPlan(undefined));
    assert.equal(r.status, 'calculation_error', name + ' refuses the plan');
    assert.equal(r.calculationErrorCode, 'SCENARIO_NONFINITE_ACCOUNT',
      'a missing taxable basis must be refused at the boundary: ' + name + ' returned code ' + r.calculationErrorCode);
    assert.equal(r.rows, null, name + ' publishes no rows for a refused plan');
  }
});

test('R2R-001 (runPlan): the same accounts with usable numbers run as ordinary plans', () => {
  for (const [name, run] of entryPoints) {
    const pretax = run(plan());
    assert.equal(pretax.status, 'ok', name + ': a $1,000,000 balance runs');
    assert.equal(pretax.successRate, 100, name + ': and succeeds');
    const taxable = run(taxableAccountPlan(100));
    assert.equal(taxable.status, 'ok', name + ': a taxable account with a 100% basis runs');
    assert.ok(Array.isArray(taxable.rows) && taxable.rows.length === 2, name + ': with its two rows');
  }
});
