/* S5AA R40 (found by Claude reviewing R32F's unconfirmed suspicions; the owner 2026-09-30: "Repair all four now") -- THE LONG-TERM-CARE
 * COST IS INFLATED, AS THE HEALTH COST BESIDE IT IS.
 *
 * The form asks for an "Annual care cost" beside an "Annual pre-Medicare healthcare cost". The health cost grows at the plan's
 * healthcare inflation from the plan's start, so both are entered in today's dollars, but the engine charged the care cost at its
 * entered figure in every year: $100,000 of care twenty years out cost $100,000. Nothing disclosed it. The care cost now grows at
 * `advanced.healthInflation` from the plan's start, like the health cost. The insurance benefit stays at its entered amount: a
 * policy's benefit is a contract figure that does not rise without an inflation rider, which the plan does not model.
 *
 * Witness, by hand: retired at 60 from a plan opening at 60, care of $100,000 a year for two years with probability 100%, healthcare
 * inflation 5%. The deterministic event starts at max(65, round(60 + 10)) = 70 (unchanged). The row 70 to 71 opens ten years in:
 * 100,000 x 1.05^10 = 162,889.46; the row 71 to 72: 100,000 x 1.05^11 = 171,033.94. No other spending, so row `spending` is the care
 * cost. Prediction: audit/S5AA/R40/S5AA_R40_PREDICTION_RECORD_20260930.md section 1. */
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

function careSpending(ltc) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 74, filing: 'single', spouseOn: false });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 60 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false, ltcOn: true, ltcCost: 100000,
    ltcProbability: 100, ltcYears: 2, ltcInsurance: 0, healthInflation: 5 }, ltc);
  p.accounts = [{ id: 'c', name: 'Cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 5000000, basisPct: 100, cashHolding: true,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0, vesting: 100, priority: 1 }];
  assert.ok(validateScenario(p).valid, 'witness must be a valid plan');
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  const at = (age) => +r.rows.find((x) => Math.abs(x.age - age) < 1e-9).spending.toFixed(2);
  return [at(70), at(71), at(72), at(73)];
}

test('R40: the care cost grows at healthcare inflation from the plan\'s start', () => {
  assert.deepStrictEqual(careSpending({}), [0, 162889.46, 171033.94, 0]);   // before: [0, 100000, 100000, 0]
});

test('R40: the insurance benefit stays at its entered amount', () => {
  assert.deepStrictEqual(careSpending({ ltcInsurance: 30000 }), [0, 132889.46, 141033.94, 0]);
});

test('R40: controls -- no healthcare inflation leaves the entered cost, and half probability halves it', () => {
  assert.deepStrictEqual(careSpending({ healthInflation: 0 }), [0, 100000, 100000, 0]);
  assert.deepStrictEqual(careSpending({ ltcProbability: 50 }), [0, 81444.73, 85516.97, 0]);
});
