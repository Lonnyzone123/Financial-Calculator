/* S5AA task 5.3, Q106 (G14) -- the opening row's `realTotal`. DOCUMENTATION AND PINS ONLY.
 *
 * NO VALUE CHANGES, AND THAT IS THE FINDING. An external audit reported that the opening row's
 * `realTotal` is nominal. It is -- and it is CORRECT. Every row reports `realTotal` as
 * `total / inflationFactor`, and the opening row's factor is 1 by definition, because no time has
 * elapsed and no inflation has accrued. `RESULT_CONTRACT.md` specified exactly this before the audit
 * ran, under R-OPENING.
 *
 * What was genuinely missing was the BASE DATE. The real series is denominated in dollars of the
 * projection's START date, and nothing said so: the contract described the ratio, and the CSV column
 * was headed "Inflation-adjusted balance" with no base named. A consumer reading it as "today's
 * dollars" is right only if "today" is the day the projection starts, and reading two projections that
 * start on different dates against each other is wrong without restating one.
 *
 * So this task adds a callout to the contract and a base date to the export header, and changes no
 * number anywhere. The pins below exist so a later reader cannot "fix" a correct opening value.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function plan(inflation) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 40, retireAge: 41, endAge: 55, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [],
  });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false });
  p.accounts = [{
    id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1000000,
    basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }];
  return p;
}

const rowsOf = (p) => {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r.rows;
};

test('S5AA 5.3 (Q106): the opening row is real AND nominal at once, because no time has elapsed', () => {
  const rows = rowsOf(plan(3.5));
  assert.equal(rows[0].inflationFactor, 1, 'the opening factor is 1 by definition');
  assert.equal(rows[0].realTotal, rows[0].total, 'so real and nominal coincide there');
  assert.equal(rows[0].realTotal, 1000000, 'and both are the balance as supplied');
});

test('S5AA 5.3 (Q106): every later row IS deflated, so the opening row is not a missing deflation', () => {
  /* The control. Without it, "realTotal equals total on row 0" would be satisfied by an engine that
     never deflated anything at all. */
  const rows = rowsOf(plan(3.5));
  const later = rows[rows.length - 1];
  assert.ok(later.inflationFactor > 1.5, 'fifteen years at 3.5% must compound the factor well past 1');
  assert.ok(later.realTotal < later.total * 0.7, 'and the last row must be materially deflated');
  assert.ok(Math.abs(later.realTotal - later.total / later.inflationFactor) < 1e-9,
    'by exactly the ratio the contract states');
});

test('S5AA 5.3 (Q106): at zero inflation every row is real and nominal together, opening row included', () => {
  for (const row of rowsOf(plan(0))) {
    assert.equal(row.inflationFactor, 1);
    assert.equal(row.realTotal, row.total);
  }
});

test('S5AA 5.3 (Q106): the contract carries the callout, and the export names its base date', () => {
  const contract = fs.readFileSync(path.join(ROOT, 'RESULT_CONTRACT.md'), 'utf8');
  assert.match(contract, /base date is the START of the projection/i,
    'the contract must say what the real series is denominated in, not only the ratio');
  assert.match(contract, /"fixed" by altering a correct opening value/i,
    'and must say plainly that the opening value is correct, so it is not "repaired" later');
  assert.match(shell, /Inflation-adjusted balance \(start-of-plan dollars\)/,
    'the CSV column must name its base date: "inflation-adjusted" alone does not say adjusted to when');
});
