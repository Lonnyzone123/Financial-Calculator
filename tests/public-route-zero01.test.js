'use strict';

/*
 * S5 block 2r -- ZERO-01 through the public entry point.
 *
 * An explicit zero maximum VPW rate is a policy setting: it holds the base
 * withdrawal to zero. Before the repair the maximum read the rate or 100, so an
 * explicit 0 fell back to a 100% cap and the plan spent freely. The coupled
 * guard calls the engine's spending function directly; this file reaches the
 * behaviour only through runPlan(), so it survives a rebuild that renames that
 * function.
 *
 * Household: 64 and retiring at 65, simple method, 5% return, 2% inflation, one
 * $2.5M taxable account, no income, expenses or stages, a minimum rate of 0.
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

function plan(maxRate) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 5, inflation: 2, fee: 0, volatility: 0, runs: 20, seed: 3 });
  Object.assign(p.profile, { age: 64, retireAge: 65, endAge: 90, spouseOn: false });
  Object.assign(p.employment, { salary: 0, contributionStop: 64 });
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 2500000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }];
  Object.assign(p.retirement, { strategy: 'vpw', spending: 60000, withdrawalRate: 4, ssBenefit: 0, stages: [], expenses: [], otherIncomes: [], vpwMinRate: 0 });
  if (maxRate === undefined) delete p.retirement.vpwMaxRate; else p.retirement.vpwMaxRate = maxRate;
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  return p;
}
const rowsOf = (maxRate) => {
  const r = engine.runPlan(plan(maxRate));
  assert.equal(r.status, 'ok', 'the plan runs');
  return r.rows;
};

test('ZERO-01 (runPlan): an explicit zero maximum VPW rate permits no base withdrawal', () => {
  const zero = rowsOf(0);
  const absent = rowsOf(undefined);
  const first = absent.findIndex((row) => row.spending > 0);
  assert.ok(first >= 0, 'premise: with no maximum set, the plan spends');
  for (let i = first; i < zero.length; i++) {
    assert.equal(zero[i].spending, 0,
      'age ' + zero[i].age + ': an explicit zero maximum must hold the base withdrawal to zero; spending was ' + zero[i].spending);
    assert.ok(Math.abs(zero[i].withdrawals - zero[i].taxes) < 1e-6,
      'age ' + zero[i].age + ': with no base withdrawal, the only withdrawal is the tax; withdrawals ' + zero[i].withdrawals + ', taxes ' + zero[i].taxes);
  }
});

test('ZERO-01 (runPlan): an absent maximum still reads as 100%, and a 1% maximum binds below it', () => {
  const absent = rowsOf(undefined);
  assert.equal(JSON.stringify(absent), JSON.stringify(rowsOf(100)), 'an absent maximum keeps the legacy 100% cap');
  const one = rowsOf(1);
  const first = absent.findIndex((row) => row.spending > 0);
  assert.ok(first >= 0, 'premise: with no maximum set, the plan spends');
  assert.ok(one[first].spending > 0 && one[first].spending < absent[first].spending,
    'a 1% maximum spends something, and less than the uncapped amount: ' + one[first].spending + ' against ' + absent[first].spending);
});
