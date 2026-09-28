'use strict';

/*
 * S5 block 2r -- RC-02 through the public entry point.
 *
 * The survivor reduction is a household-size adjustment: after the first death,
 * spending falls by the configured share once and then holds. Before the repair
 * the reduced amount was carried into the next year and reduced again, so the
 * cut compounded every year. The coupled guard's file also loads unbundled debt
 * modules; this file reaches the behaviour only through runPlan(), with a
 * fixture of its own.
 *
 * Household: married filing jointly, both 65 and retired, zero returns and
 * inflation, one $500,000 Roth, a fixed real 5% withdrawal, no benefits. The
 * first death is at 67 and the reduction is 20%, so 5% of 500,000 is 25,000 a
 * year, and 20,000 in every year after the first death.
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

function plan(survivor) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.profile, { filing: 'mfj', spouseOn: true, age: 65, spouseAge: 65, retireAge: 65, endAge: 72 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  p.accounts = [{
    id: 'roth1', name: 'Roth', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 500000, contribution: 0,
    contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
    changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }];
  Object.assign(p.retirement, {
    /* S5AA R9 round, decision 7: selfLife was 67. The year of death is now spent for two, so the lifespan moves one year
       earlier to keep the first reduced row, and every expectation, where it was. The claim is unchanged. */
    strategy: 'fixedReal', withdrawalRate: 5, survivor, selfLife: 66, spouseLife: 95, survivorSpendingReduction: 20,
    pension: 0, ssBenefit: 0, spouseSS: 0, flexibility: 0, dividendOn: true, dividendYield: 0, otherIncomes: [], expenses: [], stages: [],
  });
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  return p;
}
const rowsOf = (survivor) => {
  const r = engine.runPlan(plan(survivor));
  assert.equal(r.status, 'ok', 'the plan runs');
  return r.rows;
};
const close = (a, b) => Math.abs(a - b) < 1e-6;

test('RC-02 (runPlan): after the first death the survivor reduction applies once, and spending then holds', () => {
  const rows = rowsOf(true);
  assert.deepEqual(rows.map((row) => row.age), [65, 66, 67, 68, 69, 70, 71, 72], 'premise: one row a year from 65 to 72');
  for (const row of rows.slice(1)) {
    const expected = row.age <= 67 ? 25000 : 20000;
    assert.ok(close(row.spending, expected),
      'age ' + row.age + ': the survivor reduction must apply once; expected ' + expected + ', got ' + row.spending);
  }
  assert.ok(close(rows[rows.length - 1].total, 350000),
    'ending portfolio: 500,000 less two years at 25,000 and five at 20,000 is 350,000; got ' + rows[rows.length - 1].total);
});

test('RC-02 (runPlan): with the survivor adjustment off, spending holds at the full amount', () => {
  const rows = rowsOf(false);
  for (const row of rows.slice(1)) {
    assert.ok(close(row.spending, 25000), 'age ' + row.age + ': expected 25000, got ' + row.spending);
  }
  assert.ok(close(rows[rows.length - 1].total, 325000), 'ending portfolio: 500,000 less seven years at 25,000; got ' + rows[rows.length - 1].total);
});
