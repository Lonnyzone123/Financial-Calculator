/* S5R-04 (the 2026-09-16 external audit), the acceptance cases its section 6 listed that the repair round did not test: the
 * income classifications beyond the default and self-employment, a household owner on the accepted self-age clock, and a
 * final partial row. Added in R10 on the owner's answer 1 (A) of the fourth set.
 *
 * Every expected figure is cash-overlap arithmetic on the rule, not another call to the helper: an income pays its annual
 * amount times the overlap of [start, end) with the row, on its owner's ages. Each classification then carries that amount
 * where its tax treatment puts it, derived here: ordinary types count fully in federal AGI; Social Security counts half in
 * provisional income and nothing in AGI below the $25,000 base; tax-free income counts in neither; self-employment income
 * counts less the deductible half of its SE tax (92.35% x 15.3% / 2). Fixture: single, 60, retired, a Roth account only (no
 * imputed dividends), zero returns, $1,000 spending.
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
const AMOUNT = 100000;

function plan({ incomes, spouseAge = null, endAge = 64 }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const spouse = spouseAge !== null;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge, spouseOn: spouse, spouseAge: spouse ? spouseAge : 60, filing: spouse ? 'mfj' : 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: 60 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 1000, ssBenefit: 0, spouseSS: 0, pension: 0, otherIncomes: incomes, stages: [], expenses: [], dividendOn: false });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = [{ id: 'roth', name: 'Roth', owner: 'self', type: 'rothIRA', taxClass: 'roth', balance: 500000, basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  return p;
}
const income = (o) => Object.assign({ id: 'inc', name: 'Income', owner: 'self', type: 'other', amount: AMOUNT, growthMode: 'fixed', growth: 0 }, o);
function rows(opts) {
  const r = engine.runPlan(plan(opts));
  assert.equal(r.status, 'ok', JSON.stringify(r.issues || []));
  return r.rows.slice(1);
}
const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) <= 0.01, what + ': got ' + actual + ', expected ' + expected);
const HALF = AMOUNT * 0.5;

for (const type of ['pension', 'rental', 'employment', 'investment']) {
  test('S5R-04: a ' + type + ' income ending at 60.5 pays half a year in the row 60-61, all of it ordinary income', () => {
    const [row] = rows({ incomes: [income({ type, start: 60, end: 60.5 })] });
    near(row.income, HALF, 'cash');
    near(row.federalAgi, HALF, 'federal AGI');
  });
}

test('S5R-04: a Social Security income ending at 60.5 pays half a year, half of it in provisional income and none in AGI below the base', () => {
  const [row] = rows({ incomes: [income({ type: 'socialSecurity', start: 60, end: 60.5 })] });
  near(row.income, HALF, 'cash');
  near(row.ssProvisionalIncome, HALF / 2, 'provisional income');
  near(row.federalAgi, 0, 'federal AGI');
});

test('S5R-04: a tax-free income ending at 60.5 pays half a year, in neither AGI nor provisional income', () => {
  const [row] = rows({ incomes: [income({ type: 'taxFree', start: 60, end: 60.5 })] });
  near(row.income, HALF, 'cash');
  near(row.federalAgi, 0, 'federal AGI');
  near(row.ssProvisionalIncome, 0, 'provisional income');
});

test('S5R-04: a self-employment income ending at 60.5 carries only the half year into AGI, less the deductible half of its SE tax', () => {
  const [row] = rows({ incomes: [income({ type: 'selfEmployment', start: 60, end: 60.5 })] });
  near(row.income, HALF, 'cash');
  near(row.federalAgi, HALF - HALF * 0.9235 * 0.153 / 2, 'federal AGI');
});

test('S5R-04: a household income runs on the self-age clock -- ending at 60.5 on the self\'s ages, with a spouse five years younger', () => {
  const [first, second] = rows({ spouseAge: 55, incomes: [income({ owner: 'household', start: 60, end: 60.5 })] });
  near(first.income, HALF, 'row 60-61 on the self\'s ages (on the spouse\'s, 55-56, it would pay nothing)');
  near(second.income, 0, 'row 61-62');
});

test('S5R-04: a final partial row pays only the overlap -- an income ending at 60.25 in a plan ending at 60.5, and one running past the plan\'s end', () => {
  const [short] = rows({ endAge: 60.5, incomes: [income({ start: 60, end: 60.25 })] });
  near(short.income, AMOUNT * 0.25, 'ends inside the final half row');
  const [past] = rows({ endAge: 60.5, incomes: [income({ start: 60, end: 70 })] });
  near(past.income, HALF, 'runs past the plan\'s end: the final half row pays half');
});
