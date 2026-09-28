'use strict';

/*
 * S5 block 2r -- R2R-003 (ARCH-01) through the public entry points.
 *
 * Every period the engine checks that the cash it committed balances: what the
 * required distribution, sales and any fallback raised must equal what
 * spending, tax, donations, the shortfall and retained deposits used. A plan
 * whose figures stop balancing is refused as COMMITTED_CASH_MISMATCH instead of
 * being published. The coupled guards feed hand-built settlement records to the
 * internal check. This file reads only what runPlan() and runScenario() return:
 * a plan that passes every input check and then overflows during growth, so its
 * cash cannot balance, and ordinary plans that must not be refused.
 *
 * Plans: 75 and retired, required distributions on, one traditional 401(k).
 * The overflowing plan has a 7% return on a balance of 1e308.
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
function overflowing(method) {
  const p = plan();
  p.assumptions.returnRate = 7;
  p.assumptions.method = method;
  if (method === 'monteCarlo') p.assumptions.runs = 20;
  p.accounts = [account({ balance: 1e308 })];
  return p;
}

test('R2R-003/ARCH-01 (runPlan): a plan whose committed cash stops balancing is refused as COMMITTED_CASH_MISMATCH, in simple mode, through runScenario() and under Monte Carlo', () => {
  const runs = [
    ['runPlan (simple)', () => engine.runPlan(overflowing('simple'))],
    ['runScenario (simple)', () => engine.runScenario(overflowing('simple'))],
    ['runPlan (Monte Carlo)', () => engine.runPlan(overflowing('monteCarlo'))],
  ];
  for (const [label, run] of runs) {
    const r = run();
    assert.equal(r.status, 'calculation_error',
      'a plan whose committed cash cannot balance must be refused: ' + label + ' returned status ' + r.status + ', code ' + r.calculationErrorCode);
    assert.equal(r.calculationErrorCode, 'COMMITTED_CASH_MISMATCH', label + ' names the mismatch');
  }
});

test('R2R-003/ARCH-01 (runPlan): ordinary plans are not refused: distributions spent, taxed, donated and retained, an extra tax sale, a true shortfall, and fallback cash from other assets', () => {
  const cases = [
    ['ordinary spending, no required distribution', () => { const p = plan(); p.advanced.rmdOn = false; p.retirement.pension = 40000; p.retirement.spending = 20000; return p; }],
    ['a distribution used for spending, tax and retention', () => { const p = plan(); p.retirement.spending = 12000; return p; }],
    ['a charitable distribution', () => { const p = plan(); p.advanced.qcd = 5000; return p; }],
    ['an additional tax sale', () => { const p = plan(); p.retirement.spending = 39000; return p; }],
    ['a true shortfall', () => { const p = plan(); p.retirement.spending = 500000; p.accounts = [account({ balance: 100000 })]; return p; }],
    ['fallback cash from other assets', () => {
      const p = plan();
      p.retirement.spending = 400000;
      p.accounts = [account({ balance: 100000 })];
      p.retirement.homeEquityFallback = true;
      p.advanced.networthOn = true;
      p.advanced.otherAssets = [{ id: 'home', name: 'Home equity', value: 250000, growth: 0, liquidity: 'limited', available: true, availableAge: 60, accessPct: 100 }];
      return p;
    }],
  ];
  for (const [label, build] of cases) {
    const r = engine.runPlan(build());
    assert.equal(r.calculationError, false, label + ' must not be refused; got ' + r.calculationErrorCode);
    assert.equal(r.status, 'ok', label + ' runs');
    if (label === 'fallback cash from other assets') {
      assert.ok(r.rows[1].nonPortfolioDraw > 1000, 'the fallback case really draws on other assets: ' + r.rows[1].nonPortfolioDraw);
    }
  }
});
