'use strict';

/*
 * S5 block 2r -- R2V-001 through the public entry point.
 *
 * A tax settlement paid entirely from cash already raised is funded, and the
 * surplus is kept. When a required distribution has emptied every account, the
 * settlement's search over account classes has nothing to walk; before the
 * repair it then reported the obligation unfunded however much cash it already
 * held, and that cash vanished from the result. This file reaches the behaviour
 * only through runPlan(), with a fixture of its own.
 *
 * Household: single, 88 and retired, one $600,000 traditional IRA, required
 * distributions on, annual withdrawal timing, and a -95% return (the engine's
 * floor). The whole period's loss lands before the distribution, so the IRA can
 * pay only 5% of its balance, $30,000, against a larger required amount, and it
 * ends empty.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require('../src/engine.js');
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function plan(returnRate) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'annual' });
  Object.assign(p.profile, { filing: 'single', spouseOn: false, age: 88, retireAge: 65, endAge: 89 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  p.accounts = [{
    id: 'ira', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', owner: 'self', balance: 600000, contribution: 0,
    contributionMode: 'amount', priority: 1, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
    changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }];
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, pension: 0, ssBenefit: 0, spouseSS: 0, flexibility: 0, dividendOn: false, otherIncomes: [], expenses: [], stages: [] });
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  Object.assign(p.advanced, { rmdOn: true, conversionOn: false, conversionAmount: 0, transferOn: false });
  return p;
}

test('R2V-001 (runPlan): a settlement paid from cash alone, with every account emptied, is funded and keeps the surplus', () => {
  const r = engine.runPlan(plan(-95));
  assert.equal(r.status, 'ok',
    'a cash-only settlement must not invalidate the run (' + r.calculationErrorCode + '); the cash already raised pays the tax');
  const row = r.rows[1];
  assert.equal(row.preTax, 0, 'premise: the distribution empties the IRA');
  assert.ok(row.rmdUnmet > 0, 'premise: the IRA could not pay the whole required amount; unmet ' + row.rmdUnmet);
  assert.ok(Math.abs(row.rmdDistributed - 30000) < 1e-6, 'premise: 5% of $600,000 is distributed; got ' + row.rmdDistributed);
  assert.ok(row.taxes > 0, 'premise: the distribution is taxed');
  assert.equal(row.shortfall, 0, 'nothing is short');
  assert.ok(Math.abs(row.total - (row.rmdDistributed - row.taxes)) < 0.01,
    'the household keeps the distribution less its tax; total ' + row.total + ' against ' + (row.rmdDistributed - row.taxes));
  assert.deepEqual(r.issues || [], [], 'no settlement issue is raised');
});

test('R2V-001 (runPlan): with money left in the IRA, the same distribution settles through the ordinary search', () => {
  const r = engine.runPlan(plan(0));
  assert.equal(r.status, 'ok');
  const row = r.rows[1];
  assert.ok(row.preTax > 0 && Math.abs(row.rmdUnmet) < 1e-6, 'the whole required amount is distributed and money is left: IRA ' + row.preTax + ', unmet ' + row.rmdUnmet);
  assert.ok(Math.abs(row.total - (600000 - row.taxes)) < 0.01, 'the household keeps everything but the tax; total ' + row.total + ', taxes ' + row.taxes);
});
