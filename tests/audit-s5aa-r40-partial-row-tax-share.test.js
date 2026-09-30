/* S5AA R40 (an R32F suspicion confirmed by Claude; the owner 2026-09-30: "Repair all four now") -- A PARTIAL ROW IS TAXED AS ITS SHARE
 * OF A YEAR.
 *
 * A plan that opens at 60.5 has a first row of half a year. That half is part of a tax year whose other months the plan does not see,
 * but it was taxed with the whole year's standard deduction and brackets -- as if nothing were earned outside it -- so the first year's
 * tax was understated. The same held for a last row cut at a fractional end age. A partial row is now taxed as its share s of a year
 * earning at the row's rate: every annual dollar amount of the tax rules is multiplied by s, which, each schedule being linear between
 * its thresholds, is exactly s times the whole-year tax on the income annualized. The owner's rule for a partial row elsewhere is the
 * same: R39's contribution limits take the row's share, and R35 completes a partial first IRMAA year at the row's own annual rate.
 *
 * Witness, by hand (2026 figures, single, no inflation): a $60,000 pension, retired.
 *   Whole year: federal (60,000 - 16,100) = 43,900 -> 10% x 12,400 + 12% x 31,500 = 5,020.00; Arizona 2.5% x 43,900 = 1,097.50; 6,117.50.
 *   Half a year, before: 30,000 against the whole year's figures -> federal 1,420.00 + Arizona 347.50 = 1,767.50.
 *   Half a year, now: half of the whole year -> federal 2,510.00 + Arizona 548.75 = 3,058.75.
 * Prediction: audit/S5AA/R40/S5AA_R40_PREDICTION_RECORD_20260930.md section 3. */
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

function taxes(age, endAge) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age, retireAge: 60, endAge, filing: 'single', spouseOn: false });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 60 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 60000, pensionCola: 0, ssBenefit: 0,
    spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false, ltcOn: false });
  p.accounts = [{ id: 'c', name: 'Cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 100000, basisPct: 100, cashHolding: true,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0, vesting: 100, priority: 1 }];
  assert.ok(validateScenario(p).valid, 'witness must be a valid plan');
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return r.rows.slice(1).map((x) => [x.age, +x.taxes.toFixed(2), +x.federalAgi.toFixed(2)]);
}

test('R40: a half-year first row is taxed as half of the year it belongs to', () => {
  assert.deepStrictEqual(taxes(60.5, 62), [[61, 3058.75, 30000], [62, 6117.5, 60000]]);   // before: 1,767.50 in the first row
});

test('R40: so is a half-year last row', () => {
  assert.deepStrictEqual(taxes(60, 61.5), [[61, 6117.5, 60000], [61.5, 3058.75, 30000]]);
});

test('R40: control -- whole rows are taxed as before', () => {
  assert.deepStrictEqual(taxes(60, 62), [[61, 6117.5, 60000], [62, 6117.5, 60000]]);
});
