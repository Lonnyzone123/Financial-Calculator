/* S5AA R40 (found by Claude reviewing R32F's unconfirmed suspicions; the owner 2026-09-30: "Repair all four now") -- MEDICARE CHARGES A
 * PART D PREMIUM, NOT ONLY ITS SURCHARGE.
 *
 * Each person on Medicare was charged the Part B premium, the Part B deductible and, above the IRMAA thresholds, the Part D income-related
 * surcharge -- but no Part D premium itself, so a surcharge was charged on a premium that was never charged. Undisclosed. Each person on
 * Medicare now also pays the 2026 Part D base beneficiary premium, $38.99 a month: CMS, "Annual Release of Part D National Average
 * Monthly Bid Amount and Other Part C & D Bid Information", July 28, 2025 ("the Part D base beneficiary premium is $38.99"), computed
 * under 42 CFR 423.286(c). It is the statutory base plan premiums are set around, used as the proxy for a plan's premium, and like the
 * other Medicare premiums it stays at 2026's in later years.
 *
 * Witness, by hand: retired at 66, health costs on with no pre-Medicare cost, no income (the lowest IRMAA tier). Each Medicare year:
 * Part B 202.90 x 12 + the 283 deductible = 2,717.80, plus Part D 38.99 x 12 = 467.88: 3,185.68 a person. No other spending, so row
 * `spending` is the health cost. Prediction: audit/S5AA/R40/S5AA_R40_PREDICTION_RECORD_20260930.md section 2. */
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
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function healthRows(profile) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { retireAge: 60, filing: 'single', spouseOn: false }, profile);
  p.profile.endAge = p.profile.age + 3;
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 60 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95, spouseLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: true, healthCost: 0, healthInflation: 5, conversionOn: false, transferOn: false, ltcOn: false });
  p.accounts = [{ id: 'c', name: 'Cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1000000, basisPct: 100, cashHolding: true,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0, vesting: 100, priority: 1 }];
  assert.ok(validateScenario(p).valid, 'witness must be a valid plan');
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return r.rows.slice(1).map((x) => +x.spending.toFixed(2));
}

test('R40: one person on Medicare pays the Part D base premium each year', () => {
  assert.deepStrictEqual(healthRows({ age: 66 }), [3185.68, 3185.68, 3185.68]);   // before: 2,717.80 a year
});

test('R40: a couple on Medicare pays it twice', () => {
  assert.deepStrictEqual(healthRows({ age: 66, spouseOn: true, spouseAge: 66, filing: 'mfj' }), [6371.36, 6371.36, 6371.36]);
});

test('R40: control -- before 65 there is no Medicare, so no Part D premium', () => {
  assert.deepStrictEqual(healthRows({ age: 60 }), [0, 0, 0]);
});
