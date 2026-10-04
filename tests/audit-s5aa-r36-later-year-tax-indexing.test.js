/* S5AA R36 (SA32F-D1; Claude's R32F full-model audit TAXFED-02, a declared item ChatGPT's R32V confirmed; the owner's decision 8,
 * "Index, own round", and D8, "Keep it even after 2028") -- LATER YEARS' TAX FIGURES, THROUGH THE PUBLIC ROUTE.
 *
 * The rules package holds 2026's figures and every later year used them while incomes inflated (R32F: +$17,644 of tax over 14 years
 * on a $60k inflating pension). Each price-linked amount now rises with the plan's inflation and each statute's rounding (IRC
 * 1(f)(7): the increase down to $50; 63(c)(4): the increase down to $50; Arizona conforms); the senior deduction stays $6,000
 * (statutory; D8 kept it after 2028 until S5AA R47, AA1-30, ended it after 2028 -- this test reads only plan years 0 and 1).
 *
 * A single 67-year-old, a $60,000 pension with no COLA, no other income, 3% inflation, a 0% return, taxes paid from a Roth. Plan
 * year 0 (2026): federal taxable 60,000 - 16,100 - 2,050 - 6,000 = 35,850: 10% of 12,400 + 12% of 23,450 = 4,054; Arizona
 * (60,000 - 16,100 - 2,100) x 2.5% = 1,045: 5,099. Plan year 1 (f = 1.03): the standard deduction 16,100 + (483 down to 450) =
 * 16,550; the age-65 addition 2,050 + (61.50 down to 50) = 2,100; the 10% band 12,400 + (372 down to 350) = 12,750. Federal taxable
 * 60,000 - 16,550 - 2,100 - 6,000 = 35,350: 1,275 + 12% of 22,600 = 3,987; Arizona (60,000 - 16,550 - 2,100) x 2.5% = 1,033.75:
 * 5,020.75. The frozen engine charged 5,099 again. */
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

function taxes(inflation) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 67, retireAge: 60, endAge: 70, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 50 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, stages: [], expenses: [], otherIncomes: [],
    pension: 60000, pensionCola: 0, ssBenefit: 0, spouseSS: 0, survivor: false, selfLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [{ id: 'roth', name: 'Roth', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 1000000, contribution: 0, contributionMode: 'amount',
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0,
    matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return r.rows.map((x) => +x.taxes.toFixed(2));
}

test('R36 SA32F-D1: plan year 0 is 2026; plan year 1 indexes the standard deduction, the age-65 addition and the brackets', () => {
  const t = taxes(3);
  /* S5AA R48 (AA1-16, the owner's AA1 decision of 2026-10-03): Arizona also subtracts the federal senior deduction (A.R.S. 43-1022(35)),
     a fixed $6,000 here in both years: Arizona falls by $150 in each. Plan year 0: 4,054 + (60,000 - 16,100 - 2,100 - 6,000) x 2.5% =
     4,054 + 895 = 4,949 (was 5,099); plan year 1: 3,987 + (60,000 - 16,550 - 2,100 - 6,000) x 2.5% = 3,987 + 883.75 = 4,870.75 (was
     5,020.75). The indexing this pins is unchanged. */
  assert.strictEqual(t[1], 4949, 'plan year 0: the 2026 figures');
  assert.strictEqual(t[2], 4870.75, 'plan year 1: indexed with each statute\'s rounding. The engine charged 5,099 again.');
});

test('R36 SA32F-D1: with no inflation every year is 2026\'s', () => {
  const t = taxes(0);
  /* S5AA R48 (AA1-16): 4,949 each (was 5,099), Arizona's senior-deduction subtraction as above. */
  assert.strictEqual(t[1], 4949);
  assert.strictEqual(t[2], 4949);
  assert.strictEqual(t[3], 4949);
});
