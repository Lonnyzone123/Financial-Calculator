'use strict';

/*
 * S5 block 2r -- RISK-001's withdrawal-timing share, through the public entry
 * point.
 *
 * Withdrawal timing decides how much of a period's market return lands before
 * the period's withdrawal and how much after it: all of it for annual timing,
 * 62.5% of a year's compounding for quarterly, and half for monthly. The
 * coupled evidence tests rebuild that step from the engine's internal growth
 * and spending functions. This file reads it from runPlan()'s rows, with a
 * fixture of its own.
 *
 * Only the growth split is guarded here. Those evidence tests also spend 4%
 * of the grown balance. The engine no longer decides that way: spending reads
 * the start-of-period balance, so the first year spends $4,000 under every
 * timing, and this file asserts that premise rather than the old rule.
 *
 * Household: single, 65 and retired, one $100,000 Roth (no tax), a constant 4%
 * withdrawal, zero inflation and fees, the simple method. With a return r and a
 * timing share s, the first year ends at
 *   (100,000 x (1 + r)^s - 4,000) x (1 + r)^(1 - s),
 * computed here, not read from the engine.
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

const SHARE = { annual: 1, quarterly: 0.625, monthly: 0.5 };

function plan(returnRate, timing) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: timing });
  Object.assign(p.profile, { filing: 'single', spouseOn: false, age: 65, retireAge: 65, endAge: 67 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  p.accounts = [{
    id: 'roth1', name: 'Roth', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 100000, contribution: 0,
    contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
    changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }];
  Object.assign(p.retirement, { strategy: 'constantPercent', withdrawalRate: 4, pension: 0, ssBenefit: 0, spouseSS: 0, flexibility: 0, dividendOn: false, stages: [], expenses: [], otherIncomes: [] });
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  return p;
}
const firstYear = (returnRate, timing) => {
  const r = engine.runPlan(plan(returnRate, timing));
  assert.equal(r.status, 'ok', 'the plan runs');
  return r.rows[1];
};
const expectedTotal = (returnRate, share) => {
  const g = 1 + returnRate / 100;
  return (100000 * Math.pow(g, share) - 4000) * Math.pow(g, 1 - share);
};

test('RISK-001 (runPlan): each withdrawal timing lands its own share of the return before the withdrawal, and the rest after', () => {
  for (const returnRate of [20, -20]) {
    for (const timing of Object.keys(SHARE)) {
      const row = firstYear(returnRate, timing);
      assert.ok(Math.abs(row.spending - 4000) < 1e-9, 'premise: the first year spends 4% of the opening balance; ' + timing + ' at ' + returnRate + '% spent ' + row.spending);
      const want = expectedTotal(returnRate, SHARE[timing]);
      assert.ok(Math.abs(row.total - want) < 0.01,
        timing + ' timing at ' + returnRate + '% must land ' + SHARE[timing] + ' of the return before the withdrawal: expected the year to end at ' + want + ', got ' + row.total);
    }
  }
});

test('RISK-001 (runPlan): with no return, every withdrawal timing ends the year at the same balance', () => {
  const totals = Object.keys(SHARE).map((timing) => firstYear(0, timing).total);
  assert.ok(totals.every((t) => Math.abs(t - 96000) < 1e-9), 'with no return the timing share moves nothing: ' + JSON.stringify(totals));
});
