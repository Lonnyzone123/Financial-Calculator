'use strict';

/*
 * S5 block 2r -- R2-001 through the public entry point.
 *
 * When spending is drawn from savings, the tax that draw creates must itself be
 * funded by selling more. Before the repair that extra sale was priced with one
 * rate taken before the sale, so a sale that crossed a tax bracket, or ran out
 * of a full-basis account into one full of gains, funded the wrong amount. The
 * engine now walks the sale through each breakpoint, account by account, solves
 * it exactly, and verifies the result against the real tax calculation; a quote
 * that does not reproduce the real tax is refused as a calculation error. The
 * coupled guards call the quote directly. This file reads only what runPlan()
 * returns.
 *
 * Plans: single, 62 and retired, simple mode, no return or inflation, one year,
 * a pension, and fixed spending above it.
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
  owner: 'self', contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
}, o);
function plan({ pension, spending, order, accounts }) {
  const p = defaultPlan();
  p.setupComplete = true;
  Object.assign(p.profile, { filing: 'single', spouseOn: false, age: 62, retireAge: 60, endAge: 63 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0 });
  Object.assign(p.retirement, {
    /* RE-FIXTURED at the S5AA R18 round (workstream B, taxable basis in dollars): dividends ON at a 0% yield, so no imputed 1.5% -- at a 0% return a taxed, retained yield adds basis the account never gains, and the tax sales then realise small capital losses that are not what this test is about. */ dividendOn: true, dividendYield: 0, strategy: 'fixedNominal', spending, ssBenefit: 0, spouseSS: 0, pension,
    withdrawalOrder: 'manual', manualOrder: order, expenses: [], otherIncomes: [], stages: [],
  });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, healthOn: false, ltcOn: false, conversionOn: false, transferOn: false, reserveOn: false, debts: [], otherAssets: [] });
  p.accounts = accounts;
  return p;
}
const ira = () => account({ id: 'ira', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', balance: 1000000, priority: 1, basisPct: 0 });
const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 0.01, what + ': expected ' + expected + ', got ' + actual);
function settled(r, label, need) {
  const row = r.rows[1];
  near(row.shortfall, 0, label + ', shortfall');
  near(row.withdrawals - row.taxes, need, label + ', withdrawals less tax against the need');
  return row;
}

test('R2-001 (runPlan): a tax-funding draw from an IRA that crosses a tax breakpoint settles exactly, $7,241.72 of tax on $37,241.72 withdrawn', () => {
  const r = engine.runPlan(plan({ pension: 30000, spending: 60000, order: 'preTax,taxable,roth,hsa', accounts: [ira()] }));
  assert.equal(r.status, 'ok', 'a tax-funding sale that crosses a breakpoint must settle: status ' + r.status + ', code ' + r.calculationErrorCode);
  const row = settled(r, 'the IRA draw', 30000);
  near(row.taxes, 7241.72, 'the IRA draw, tax');
  near(row.withdrawals, 37241.72, 'the IRA draw, withdrawn');
});

/* RE-FIXTURED at the S5AA R18 round: the figures are derived again for the fixture without the imputed yield (see plan()).
   Single, 62: a $40,000 pension against $60,000 of spending, so $20,000 must come from savings. The $15,000 full-basis
   account comes first and realises nothing; the rest, X, comes from the no-basis account and is all gain. Federal: 40,000 -
   16,100 = 23,900 of ordinary income taxed 1,240 + 1,380 = 2,620, and the gain stacks inside the 0% band (to 49,450).
   Arizona: 2.5% x (23,900 + X). So T = 3,217.50 + 0.025 X and X = 5,000 + T: X = 8,217.50 / 0.975 = 8,428.21, T = 3,428.21.
   (It was $3,810.90 with the imputed yield's dividends stacked in the gain band.) */
test('R2-001 (runPlan): a sale that runs out of a full-basis account into a no-basis one pays the gains tax it realises, $3,428.21', () => {
  const r = engine.runPlan(plan({
    pension: 40000, spending: 60000, order: 'taxable,preTax,roth,hsa', accounts: [
      account({ id: 'hi', name: 'Full basis', type: 'taxable', taxClass: 'taxable', balance: 15000, priority: 1, basisPct: 100 }),
      account({ id: 'lo', name: 'No basis', type: 'taxable', taxClass: 'taxable', balance: 1000000, priority: 2, basisPct: 0 }),
    ],
  }));
  assert.equal(r.status, 'ok', 'a sale that spills into a no-basis account must settle: status ' + r.status + ', code ' + r.calculationErrorCode);
  const row = settled(r, 'the spill', 20000);
  const X = 8217.5 / 0.975, T = 3217.5 + 0.025 * X;
  near(row.taxes, T, 'the spill, tax');
  near(row.withdrawals, 15000 + X, 'the spill, withdrawn');
  near(row.taxable, 1015000 - 15000 - X, 'the spill, taxable savings left');
});

test('R2-001 (runPlan): a draw that crosses no breakpoint settles the same way, $5,459.06 of tax on $35,459.06 withdrawn', () => {
  const r = engine.runPlan(plan({ pension: 20000, spending: 50000, order: 'preTax,taxable,roth,hsa', accounts: [ira()] }));
  assert.equal(r.status, 'ok', 'the plan runs: ' + r.calculationErrorCode);
  const row = settled(r, 'the plain draw', 30000);
  near(row.taxes, 5459.06, 'the plain draw, tax');
  near(row.withdrawals, 35459.06, 'the plain draw, withdrawn');
});
