/* S5R-02 and S5R-03 (the 2026-09-16 external audit), the acceptance cases its section 4 and section 5 listed that the repair
 * round did not test: per-owner cap boundaries, an eligible spouse whose IRA is empty, cash sent and tax funding confirmed
 * separately, and a short closing row. Added in R10 on the owner's answer 1 (A) of the fourth set.
 *
 * Every expected figure is derived here from the rule, not measured: each eligible owner's part is min($111,000, request x
 * owner's IRA / eligible owners' IRAs, owner's IRA), the cap is annual (a short row prorates the request, not the cap), and
 * with zero returns every dollar leaving the portfolio in a row is the QCD sent to charity, the tax paid, or the spending.
 * The exclusion in a row is that row's MAGI without the request minus MAGI with it. Fixtures as in the S5RR-01 public
 * witness: zero returns, fees and inflation; no other income; dividends on at a 0% yield; $10,000 spending; manual order.
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
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
const CAP = 111000;

const ira = (owner, balance) => ({ id: 'ira-' + owner, name: 'IRA', owner, type: 'traditionalIRA', taxClass: 'preTax', balance, basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 });

function plan({ spouseAge = null, qcd, accounts, endAge = 82 }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const spouse = spouseAge !== null;
  Object.assign(p.profile, { age: 80, retireAge: 60, endAge, spouseOn: spouse, spouseAge: spouse ? spouseAge : 80, filing: spouse ? 'mfj' : 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 10000, ssBenefit: 0, spouseSS: 0, pension: 0, otherIncomes: [], stages: [], expenses: [], dividendOn: true, dividendYield: 0, withdrawalOrder: 'manual' });
  Object.assign(p.advanced, { rmdOn: true, qcd, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = accounts.map((a, i) => Object.assign({}, a, { priority: i + 1 }));
  return p;
}
function run(opts) {
  const withQcd = engine.runPlan(plan(opts));
  const without = engine.runPlan(plan(Object.assign({}, opts, { qcd: 0 })));
  assert.equal(withQcd.status, 'ok', JSON.stringify(withQcd.issues || []));
  assert.equal(without.status, 'ok', JSON.stringify(without.issues || []));
  return { withQcd, excluded: withQcd.rows.slice(1).map((r, i) => without.rows[i + 1].magi - r.magi) };
}
const near = (actual, expected, what, tol = 0.001) => assert.ok(Math.abs(actual - expected) <= tol, what + ': got ' + actual + ', expected ' + expected);

test('S5R-02: one owner\'s exclusion stops at the $111,000 cap to the cent: $110,999.99, $111,000 and $111,000.01 requested', () => {
  near(run({ qcd: 110999.99, accounts: [ira('self', 6000000)] }).excluded[0], 110999.99, '$110,999.99');
  near(run({ qcd: 111000, accounts: [ira('self', 6000000)] }).excluded[0], CAP, '$111,000');
  near(run({ qcd: 111000.01, accounts: [ira('self', 6000000)] }).excluded[0], CAP, '$111,000.01');
});

test('S5R-02: two owners with equal IRAs each stop at their own cap to the cent', () => {
  const both = (qcd) => run({ spouseAge: 80, qcd, accounts: [ira('self', 3000000), ira('spouse', 3000000)] }).excluded[0];
  near(both(221999.98), 221999.98, 'each owner $110,999.99');
  near(both(222000), 2 * CAP, 'each owner $111,000');
  near(both(222000.02), 2 * CAP, 'each owner $111,000.01');
});

test('S5R-02: an eligible spouse whose IRA is empty adds no exclusion', () => {
  near(run({ spouseAge: 80, qcd: 150000, accounts: [ira('self', 6000000), ira('spouse', 0)] }).excluded[0], CAP, 'the owner\'s $111,000 only');
});

test('S5R-02: cash sent to charity and tax funding reconcile separately -- every dollar leaving the portfolio is the QCD, the tax or the spending', () => {
  for (const [label, opts] of [
    ['one owner, $150,000', { qcd: 150000, accounts: [ira('self', 6000000)] }],
    ['two owners, $200,000', { spouseAge: 80, qcd: 200000, accounts: [ira('self', 4500000), ira('spouse', 1500000)] }],
  ]) {
    const { withQcd, excluded } = run(opts);
    const opening = withQcd.rows[0].total;
    const row = withQcd.rows[1];
    assert.equal(row.calculationError, false, label + ': no calculation error');
    assert.equal(row.shortfall, 0, label + ': no shortfall');
    near(opening - row.total, excluded[0] + row.taxes + row.spending, label + ': the portfolio fell by the QCD, the tax and the spending', 0.01);
  }
});

test('S5R-03: a half-year closing row prorates the request, not the annual cap -- $150,000 a year excludes $75,000 in the final half year', () => {
  const { withQcd, excluded } = run({ qcd: 150000, endAge: 81.5, accounts: [ira('self', 6000000)] });
  assert.deepEqual(withQcd.rows.map((r) => r.age), [80, 81, 81.5], 'premise: the plan ends half way through age 81');
  near(excluded[0], CAP, 'the whole first row');
  near(excluded[1], 75000, 'the closing half row (a prorated cap would have excluded $55,500)');
});
