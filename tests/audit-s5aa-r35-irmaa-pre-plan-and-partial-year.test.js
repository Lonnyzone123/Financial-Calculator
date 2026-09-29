/* S5AA R35 (SA32F-24; Claude's R32F full-model audit STHLTH-04, qualified P3 by ChatGPT's R32V: "Disclose the partial-row/two-row
 * approximation or add dated tax-year history"; the owner's "Follow law everywhere") -- THE IRMAA LOOKBACK'S FIRST YEARS.
 *
 * 20 CFR 418.1135: IRMAA reads the MAGI on the tax return from two years before. A plan has no return before it starts, so plan years
 * 0 and 1 assumed no surcharge (MODEL_ASSUMPTIONS 11), and a plan opening at a fractional age fed its first, partial row's MAGI -- half
 * a year's income -- into plan year 2's lookback. Built:
 *   - the returns before the plan are inputs: `advanced.irmaaMagiTwoYearsBefore` and `irmaaMagiOneYearBefore` (with
 *     `irmaaFilingTwoYearsBefore` / `...OneYearBefore`, defaulting to the plan's status). Entered, plan years 0 and 1 are priced on
 *     them, and the pre-plan disclosure is not given;
 *   - a partial first row is a partial tax year: the rest of that year is completed at the entered last-year MAGI rate, or, with
 *     none entered, at the row's own annual rate -- an approximation, disclosed (IRMAA_PARTIAL_FIRST_YEAR_COMPLETED).
 * Premiums are the rules package's CMS 2026 tables; each tier is read here from the tables, not from the engine. */
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
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

/* The monthly surcharge above the standard premium for a single filer's MAGI, from CMS's tables: the top tier includes its threshold. */
const M = global.RULES.medicare.irmaa;
function surchargeMonthly(magi) {
  const t = M.singleThresholds; let k = 0;
  while (k < t.length && (k === t.length - 1 ? magi >= t[k] : magi > t[k])) k++;
  return (M.partBMonthly[k] + M.partDMonthlySurcharge[k]) - (M.partBMonthly[0] + M.partDMonthlySurcharge[0]);
}

function plan(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: o.age || 66, retireAge: 60, endAge: 71, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 30000, ssBenefit: 0, spouseSS: 0, pension: o.pension || 0, pensionCola: 0,
    stages: [], expenses: [], otherIncomes: [], dividendOn: false });
  Object.assign(p.advanced, { healthOn: true, rmdOn: false, conversionOn: false, transferOn: false, ltcOn: false, otherAssets: [], debts: [] }, o.advanced || {});
  p.accounts = [{ id: 'roth', name: 'Roth', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 5000000, contribution: 0, contributionMode: 'amount',
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0,
    matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  return p;
}
const run = (o) => { const r = engine.runPlan(plan(o)); assert.equal(r.status, 'ok', r.status + ' ' + r.calculationErrorCode); return r; };
const spendRow = (r, k) => r.rows[k].spending;

test('R35 SA32F-24: the two returns before the plan price plan years 0 and 1', () => {
  const base = run({});
  const r = run({ advanced: { irmaaMagiTwoYearsBefore: 150000, irmaaMagiOneYearBefore: 250000 } });
  assert.ok(Math.abs(spendRow(r, 1) - spendRow(base, 1) - surchargeMonthly(150000) * 12) < 0.01, 'plan year 0 reads the return two years before');
  assert.ok(Math.abs(spendRow(r, 2) - spendRow(base, 2) - surchargeMonthly(250000) * 12) < 0.01, 'plan year 1 reads last year\'s');
  assert.ok(Math.abs(spendRow(r, 3) - spendRow(base, 3)) < 0.01, 'plan year 2 reads plan year 0, as before');
  assert.ok(!r.issues.some((i) => i.code === 'IRMAA_PRE_PLAN_MAGI_ASSUMED'), 'nothing is assumed when both are entered');
  assert.ok(base.issues.some((i) => i.code === 'IRMAA_PRE_PLAN_MAGI_ASSUMED'), 'CONTROL: with none entered the assumption stands and is said');
});

test('R35 SA32F-24: a partial first row is completed to a year before it is looked back to', () => {
  /* Opening at 66.5 with a $150,000 pension: the first row holds half a year, $75,000 of MAGI. Plan year 2 read $75,000 (no
     surcharge; R32V's $2,717.80 is the standard premium alone). Completed at the row's own rate: 75,000 + 0.5 x 150,000 = 150,000.
     With last year's return entered at $100,000: 75,000 + 0.5 x 100,000 = 125,000. */
  const k = 3;   /* rows: 66.5-67, 67-68, 68-69 (plan year 2), counted from the opening row at index 0 */
  const none = run({ age: 66.5, pension: 150000, advanced: { irmaaMagiTwoYearsBefore: 0, irmaaMagiOneYearBefore: 0 } });
  const zeroPension = run({ age: 66.5, pension: 0, advanced: { irmaaMagiTwoYearsBefore: 0, irmaaMagiOneYearBefore: 0 } });
  const own = run({ age: 66.5, pension: 150000 });
  const withLast = run({ age: 66.5, pension: 150000, advanced: { irmaaMagiOneYearBefore: 100000 } });
  const premium = (r) => spendRow(r, k) - spendRow(zeroPension, k);
  assert.ok(Math.abs(premium(own) - surchargeMonthly(150000) * 12) < 0.01, 'completed at the row\'s own rate: ' + premium(own));
  assert.ok(Math.abs(premium(withLast) - surchargeMonthly(125000) * 12) < 0.01, 'completed at last year\'s rate: ' + premium(withLast));
  assert.ok(Math.abs(premium(none) - surchargeMonthly(75000 + 0.5 * 0) * 12) < 0.01, 'an entered last year of $0 completes it at $0');
  assert.ok(own.issues.some((i) => i.code === 'IRMAA_PARTIAL_FIRST_YEAR_COMPLETED'), 'the completion is disclosed');
});

test('R35 SA32F-24: the validator bounds the inputs', () => {
  const bad = validateScenario(plan({ advanced: { irmaaMagiTwoYearsBefore: -5, irmaaFilingOneYearBefore: 'married' } }));
  assert.ok(bad.issues.some((i) => i.path === 'advanced.irmaaMagiTwoYearsBefore'));
  assert.ok(bad.issues.some((i) => i.path === 'advanced.irmaaFilingOneYearBefore'));
});
