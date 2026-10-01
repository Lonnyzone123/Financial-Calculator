/* S5R-04 (the 2026-09-16 external audit; decided by the owner on 2026-09-16, answer 3 (A)): a recurring income stops the
 * moment its owner reaches its end age, prorated within the year, as the "End age" label says.
 *
 * otherIncomeFor() clipped the start of an income's active interval inside a row but not its end: the paid duration ran
 * from the later of the row start and the income's start to the row's END, so an income ending at 60.5 paid a full year
 * over ages 60-61, and a row starting exactly at the end age still paid in full.
 *
 * Every expected figure here is the rule's arithmetic, not a measurement: amount x the overlap, in years, of the row
 * [row start, row end) with the income's [start, end), on its owner's ages. The row's `income` is that cash alone: the
 * household has no salary, Social Security, pension or dividends. The figure each case replaces is named beside it.
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
  p.accounts = [{ id: 'cash', name: 'Brokerage', owner: 'self', type: 'taxable', taxClass: 'taxable', balance: 500000, basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  return p;
}
const income = (o) => Object.assign({ id: 'inc', name: 'Income', owner: 'self', type: 'other', amount: AMOUNT, growthMode: 'fixed', growth: 0 }, o);
/* rows[1] covers ages 60-61, rows[2] 61-62, rows[3] 62-63. */
function incomeByRow(opts) {
  const r = engine.runPlan(plan(opts));
  assert.equal(r.status, 'ok', JSON.stringify(r.issues || []));
  return r.rows.slice(1).map((row) => row.income);
}
const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) <= 0.01, what + ': paid ' + actual + ', expected ' + expected);

test('S5R-04: an income ending at 60.5 pays half a year in the row 60-61, not a full year', () => {
  near(incomeByRow({ incomes: [income({ start: 60, end: 60.5 })] })[0], AMOUNT * 0.5, 'the overlap of [60, 61) with [60, 60.5) is 0.5 years (it paid $100,000)');
});

test('S5R-04: a row that starts exactly at the end age pays nothing', () => {
  const paid = incomeByRow({ incomes: [income({ start: 60, end: 62 })] });
  near(paid[0], AMOUNT, 'row 60-61');
  near(paid[1], AMOUNT, 'row 61-62');
  near(paid[2], 0, 'row 62-63 starts at the end age 62 (it paid $100,000)');
});

test('S5R-04: an income that starts and ends inside one row pays only the months between', () => {
  near(incomeByRow({ incomes: [income({ start: 60.25, end: 60.75 })] })[0], AMOUNT * 0.5, 'the overlap of [60, 61) with [60.25, 60.75) is 0.5 years (it paid $75,000)');
});

test('S5R-04: a self-employment income, the audit\'s case, stops at its end age inside the row', () => {
  near(incomeByRow({ incomes: [income({ type: 'selfEmployment', start: 60, end: 60.5 })] })[0], AMOUNT * 0.5, 'self-employment from 60 to 60.5 (it paid $100,000)');
});

test('S5R-04: a spouse\'s income stops at the spouse\'s end age, on the spouse\'s ages', () => {
  /* The spouse is 58 when self is 60, so the spouse's [58, 58.5) is self's [60, 60.5). */
  near(incomeByRow({ spouseAge: 58, incomes: [income({ owner: 'spouse', start: 58, end: 58.5 })] })[0], AMOUNT * 0.5, 'the spouse\'s income from 58 to 58.5 (it paid $100,000)');
});

test('S5R-04: an income whose end age precedes its start pays nothing, never a negative amount', () => {
  near(incomeByRow({ incomes: [income({ start: 60.8, end: 60.5 })] })[0], 0, 'start 60.8, end 60.5: no overlap (it paid $20,000)');
});

test('control: whole-year incomes and a mid-row start are paid as before', () => {
  const paid = incomeByRow({ incomes: [income({ start: 60, end: 63 })] });
  near(paid[0], AMOUNT, 'row 60-61');
  near(paid[1], AMOUNT, 'row 61-62');
  near(paid[2], AMOUNT, 'row 62-63');
  near(incomeByRow({ incomes: [income({ start: 60.5, end: 70 })] })[0], AMOUNT * 0.5, 'a start at 60.5 pays half of the row 60-61');
});

/* S5AA R43 (SA42F-06): a recurring income with NO end age was paid without end; the validator already refused it, and the engine now
   refuses it too (src/plan-value-contract.json, SCENARIO_NONNUMBER_PLAN_VALUE at the end's path). The control keeps the point -- an
   income runs to its end -- with an end age past the horizon. */
test('control: an income whose end is past the horizon keeps paying', () => {
  const paid = incomeByRow({ incomes: [income({ start: 60, end: 120 })] });
  paid.slice(0, 3).forEach((x, i) => near(x, AMOUNT, 'row ' + (60 + i)));
});
