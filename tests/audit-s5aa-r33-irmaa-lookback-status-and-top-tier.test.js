/* S5AA R33 (SA32F-09, SA32F-23; Claude's R32F full-model audit, confirmed by ChatGPT's R32V) -- IRMAA READS THE LOOKBACK YEAR'S
 * OWN FILING STATUS, AND ITS TOP TIER INCLUDES ITS THRESHOLD.
 *
 * SA32F-09: 20 CFR 418.1115 pairs "your modified adjusted gross income amount together with your tax filing status" for the tax
 *   year SSA uses (two years back, 418.1135(a)); the joint ranges apply to people who "filed a joint tax return" that year. For
 *   two years after a death the engine priced the joint-return MAGI on the survivor's CURRENT single ranges.
 * SA32F-23: CMS's 2026 table puts "Greater than or equal to $500,000" ($750,000 joint) in the top tier; the engine used ">".
 *
 * healthOn with no pre-Medicare cost and no spending, so a row's spending is exactly its Medicare cost: (Part B + Part D
 * add-on) x 12 + the $283 Part B deductible, per person 65 or older. Rows are read by the age they close at. Plan years 0 and 1
 * carry no IRMAA (MODEL_ASSUMPTIONS section 11). */
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

/* Re-fixtured by intent in S5AA R40: each person on Medicare now also pays the 2026 Part D base beneficiary premium, $38.99 a month
   (CMS, July 28, 2025), which the engine had not charged; the surcharges these tests are about are unchanged. */
const PART_D_BASE = 38.99;
const annual = (partB, partD, people) => ((partB + partD + PART_D_BASE) * 12 + 283) * (people || 1);

function run(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: o.age, retireAge: 60, endAge: o.endAge, spouseOn: !!o.spouseOn, spouseAge: o.age, filing: o.spouseOn ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 101 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, stages: [], expenses: [],
    pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false, irmaaGuard: false, selfLife: o.selfLife || 100, spouseLife: 100,
    otherIncomes: [{ name: 'Pension stream', type: 'pension', owner: o.owner || 'self', amount: o.magi, start: 0, end: 100, growth: 0, growthMode: 'fixed' }] });
  Object.assign(p.advanced, { healthOn: true, healthCost: 0, rmdOn: false, conversionOn: false, transferOn: false });
  p.accounts = [{ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 3000000, basisPct: 100, cashHolding: true,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 0 }];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  return (closeAge) => r.rows.find((x) => Math.abs(x.age - closeAge) < 1e-9).spending;
}
const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 0.005, what + ': expected ' + expected + ', got ' + actual);

test('R33 SA32F-09: for two years after a death the survivor\'s IRMAA reads the lookback year\'s JOINT return', () => {
  /* A couple, both 70; the self dies at 71; the spouse's 150,000 pension stream continues. The rows opening at 72 and 73 look back
     to the joint returns of the rows opening at 70 and 71: 150,000 is under the joint 218,000 tier, so the survivor pays the
     standard 202.90: 2,717.80. The engine priced 150,000 on the single ranges (tier 3, 405.80 + 37.50): 5,602.60. */
  const spending = run({ age: 70, endAge: 76, spouseOn: true, selfLife: 71, owner: 'spouse', magi: 150000 });
  near(spending(73), annual(202.90, 0), 'opens 72: the joint return of the row opening 70');
  near(spending(74), annual(202.90, 0), 'opens 73: the joint return of the year of death');
  /* CONTROL: the row opening at 74 looks back to the survivor's own single return: tier 3. */
  near(spending(75), annual(405.80, 37.50), 'opens 74: a single-return lookback');
});

test('R33 SA32F-23: MAGI of exactly $500,000 (single) or $750,000 (joint) is the top tier', () => {
  /* Single, 65: the row opening at 67 looks back to 500,000: top tier 689.90 + 91.00 = 9,653.80 (the engine: 649.20 + 83.30 = 9,073). */
  near(run({ age: 65, endAge: 68, magi: 500000 })(68), annual(689.90, 91.00), 'single at 500,000');
  /* CONTROL: 499,999 is the tier below. */
  near(run({ age: 65, endAge: 68, magi: 499999 })(68), annual(649.20, 83.30), 'single at 499,999');
  /* Joint, both 65, 750,000: two people at the top tier. */
  near(run({ age: 65, endAge: 68, spouseOn: true, magi: 750000 })(68), annual(689.90, 91.00, 2), 'joint at 750,000');
});
