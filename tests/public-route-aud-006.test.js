/* AUD-006 (audit task T07) through the public entry point: S5 block 2r's rebuild-proof guard.
 *
 * findingIds: AUD-006; audit task: T07
 *
 * A recurring income that starts partway through a projection period is paid
 * for the part of the period after it starts. A $12,000-a-year rental starting
 * at 60.5 pays $6,000 in the period from 60 to 61, not $0. Before the repair,
 * the whole period was skipped whenever the owner's age at the period's
 * opening was below the start.
 *
 * The existing guard (tests/audit-income-onset.test.js) calls the engine's
 * internal income helper directly, so a rebuild that renamed that helper would
 * leave the behaviour unguarded. This file reaches it only through runPlan(),
 * and reads what any caller can see:
 *   - each row's `income`, which carries the cash;
 *   - each row's `magi`, which shows the income's tax character.
 * Both are measured against the same plan with no other income, so wages,
 * growth and contributions cancel. A row's income is outside income plus
 * wages, and dividends are off in this plan, so a change in row income is the
 * other-income cash itself.
 *
 * Row 0 opens at age 60; row 1 covers 60 to 61; row 2 covers 61 to 62.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function plainPlan(otherIncomes, profile) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  /* RE-FIXTURED at the S5AA R18 round (workstream B): a 0% return and no imputed yield. At 5% the plan without the income sold $155.63 to pay tax in a working year, and under dollar basis that sale realises the growth in it -- $1.42 of gain that is not the income this file measures. */
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 2, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { dividendOn: true, dividendYield: 0 });
  Object.assign(p.profile, { age: 60, retireAge: 62, endAge: 70 }, profile || {});
  Object.assign(p.employment, { salary: 80000, contributionStop: 62 });
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 400000, contribution: 5000, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  p.retirement.otherIncomes = otherIncomes;
  return p;
}

const rental = (fields) => Object.assign({ type: 'rental', owner: 'self', start: 60.5, end: 70, amount: 12000, growthMode: 'fixed', growth: 0 }, fields);

function rowsOf(plan) {
  const result = engine.runPlan(plan);
  assert.equal(result.status, 'ok');
  return result.rows;
}

/* Row-by-row change in `field` against the same plan with no other income. */
function changeIn(otherIncomes, profile) {
  const base = rowsOf(plainPlan([], profile));
  const rows = rowsOf(plainPlan(otherIncomes, profile));
  assert.equal(rows[0].age, 60);
  assert.equal(rows[1].age, 61);
  return {
    rows,
    income: (i) => rows[i].income - base[i].income,
    magi: (i) => rows[i].magi - base[i].magi,
  };
}

/* S5AA R43 (SA42F-20; the owner 2026-09-30: "Today's dollars, all modes"): an amount is in today's dollars in every growth mode, so a
   stream starting after the plan's start is grown at the plan's 2% inflation to its start: at 60.5 by 1.02^0.5, at 61 by 1.02. These
   expectations were the nominal amount until then. A stream from the plan's start, and "Match inflation", are unchanged. */
const AT_60_5 = Math.pow(1.02, 0.5), AT_61 = 1.02;
const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 0.01, what + ': expected ' + expected + ', got ' + actual);

test('AUD-006/T07 (runPlan): a rental starting at 60.5 pays half a year, $6,000, in the 60-61 row, and a full year after', () => {
  const c = changeIn([rental({})]);
  near(c.income(1), 6000 * AT_60_5, 'row 1 income');
  near(c.magi(1), 6000 * AT_60_5, 'row 1 magi');
  near(c.income(2), 12000 * AT_60_5, 'row 2 income');
});

test('AUD-006/T07 (runPlan): an income starting at the period start pays the whole period, and one starting at its end waits for the next', () => {
  const atStart = changeIn([rental({ start: 60 })]);
  near(atStart.income(1), 12000, 'start 60, row 1 income');
  const atEnd = changeIn([rental({ start: 61 })]);
  near(atEnd.income(1), 0, 'start 61, row 1 income');
  near(atEnd.income(2), 12000 * AT_61, 'start 61, row 2 income');
});

test('AUD-006/T07 (runPlan): a stream already active before the period is unaffected', () => {
  const c = changeIn([rental({ start: 50, growth: 2 })]);
  near(c.income(1), 12000 * Math.pow(1.02, 10), 'row 1 income, ten years of 2% growth');
});

test('AUD-006/T07 (runPlan): a spouse-owned income starts on the spouse\'s own age clock', () => {
  const c = changeIn([rental({ owner: 'spouse', start: 58.5 })], { spouseOn: true, spouseAge: 58 });
  near(c.income(1), 6000 * AT_60_5, 'row 1 income for a spouse two years younger, starting at 58.5');
});

test('AUD-006/T07 (runPlan): a prorated start keeps each type\'s tax character', () => {
  const ordinary = changeIn([rental({})]);
  near(ordinary.income(1), 6000 * AT_60_5, 'rental cash');
  near(ordinary.magi(1), 6000 * AT_60_5, 'rental is ordinary income');

  const social = changeIn([rental({ type: 'socialSecurity' })]);
  near(social.income(1), 6000 * AT_60_5, 'Social Security cash');
  assert.ok(social.magi(1) > 0 && social.magi(1) < 6000 * AT_60_5, 'only part of a Social Security benefit is taxable, got ' + social.magi(1));

  const taxFree = changeIn([rental({ type: 'taxFree' })]);
  near(taxFree.income(1), 6000 * AT_60_5, 'tax-free cash');
  near(taxFree.magi(1), 0, 'tax-free income adds nothing to magi');
});

test('AUD-006/T07 (runPlan): growth is measured from the activation age, and an inflation-indexed income is prorated too', () => {
  const grown = changeIn([rental({ growth: 10 })]);
  near(grown.income(1), 6000 * AT_60_5, 'no growth has elapsed at activation');
  near(grown.income(2), 12000 * AT_60_5 * Math.pow(1.1, 0.5), 'half a year of 10% growth by 61');

  const indexed = changeIn([rental({ growthMode: 'inflation' })]);
  near(indexed.income(1), 6000 * indexed.rows[0].inflationFactor, 'row 1 at the opening inflation factor');
  near(indexed.income(2), 12000 * indexed.rows[1].inflationFactor, 'row 2 at the next inflation factor');
});

test('AUD-006/T07 (runPlan): an income wholly outside the period, and a one-time payment inside it, are unchanged', () => {
  const future = changeIn([rental({ start: 65 })]);
  near(future.income(1), 0, 'an income starting at 65');
  const past = changeIn([rental({ start: 40, end: 55 })]);
  near(past.income(1), 0, 'an income that ended at 55, row 1');
  near(past.income(2), 0, 'an income that ended at 55, row 2');
  const once = changeIn([{ type: 'oneTime', owner: 'self', start: 60.5, amount: 50000 }]);
  near(once.income(1), 50000, 'a one-time payment inside the period, cash');
  near(once.magi(1), 50000, 'a one-time payment inside the period, magi');
});
