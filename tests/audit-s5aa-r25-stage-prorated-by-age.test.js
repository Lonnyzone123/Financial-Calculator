/* S5AA R25 round: R24F-01 -- A SPENDING STAGE THAT STARTS OR ENDS INSIDE A YEAR IS PRORATED ACROSS IT (ChatGPT's R24F
 * deep full-model audit, 2026-09-25, priority 2; repair chosen by the owner 2026-09-25: "Repair: prorate the stage", with a
 * stage's end age meaning "the last year covered").
 *
 * The app takes a stage's start and end ages in half-year steps, but applyStage() tested one age, the one the retired
 * part of the year opened at, and applied the result to the whole year. Measured at s5aa-r24-source (d67b618): a 50%
 * stage from 65.5 to 66.5 on a $100,000 plan spent $100,000 in the year opening at 65 and $50,000 in the one at 66.
 *
 * THE END AGE (the owner, 2026-09-25): the last year the stage covers, as whole-year plans have always read it -- a stage from
 * 65 to 66 covers the years opening at 65 and 66, so ages 65 up to 67. A stage therefore covers [start, end + 1) in
 * continuous age, and a year a boundary splits spends the time-weighted average: "65.5 to 66.5" covers 65.5 up to 67.5,
 * so $75,000, then $50,000, then $75,000. ChatGPT's own expectation ($75,000 and $75,000) read the end age as the
 * moment the stage ends; the owner chose the reading that leaves every whole-year stage exactly as it was.
 *
 * All through runPlan() on validator-valid plans: $1,000,000 taxable at full basis, 0% return, no dividend income, so
 * every figure is hand arithmetic.
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
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

function spendingRows(stages, o = {}) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const age = o.age || 65;
  Object.assign(p.profile, { age, retireAge: age, endAge: o.endAge || 68, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 100000, dividendOn: true, dividendYield: 0, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages, expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { assetsOn: false, rmdOn: false, transferOn: false, conversionOn: false, healthOn: false,
    networthOn: true, otherAssets: [], debts: [] });
  p.accounts = [{ id: 'cash', name: 'Cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1000000,
    basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
    changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0,
    vesting: 100, priority: 1 }];
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r.rows;
}
const near = (actual, expected, what) => {
  assert.equal(actual.length, expected.length, what + ': row count');
  expected.forEach((e, i) => assert.ok(Math.abs(actual[i] - e) < 0.005, what + ' row ' + i + ': ' + actual[i] + ' against ' + e));
};
const pct = (start, end, value) => ({ name: 's', start, end, mode: 'percent', value });

test('R24F-01: a 50% stage from 65.5 to 66.5 covers 65.5 up to 67.5 -- $75,000, $50,000, $75,000 (was $100,000, $50,000, $100,000)', () => {
  const rows = spendingRows([pct(65.5, 66.5, 50)]);
  near(rows.slice(1).map((r) => r.spending), [75000, 50000, 75000], 'spending');
  near(rows.map((r) => r.total), [1000000, 925000, 875000, 800000], 'portfolio');
});

test('R24F-01: an amount stage of $60,000 covering one year from 65.5 splits two years -- $80,000 and $80,000', () => {
  /* start 65.5, end 65.5: the one year opening at 65.5, so ages 65.5 up to 66.5. Each year is half $100,000, half $60,000. */
  const rows = spendingRows([{ name: 's', start: 65.5, end: 65.5, mode: 'amount', value: 60000, growthMode: 'none' }], { endAge: 67 });
  near(rows.slice(1).map((r) => r.spending), [80000, 80000], 'spending');
});

test('R24F-01 CONTROL: a whole-year stage from 65 to 66 covers the years at 65 and 66, exactly as before -- $50,000, $50,000, $100,000', () => {
  const rows = spendingRows([pct(65, 66, 50)]);
  near(rows.slice(1).map((r) => r.spending), [50000, 50000, 100000], 'spending');
});

test('R24F-01 CONTROL: a whole-year stage whose last year is 65 covers the year at 65 and not the year at 66, as before', () => {
  const rows = spendingRows([pct(60, 65, 50)]);
  near(rows.slice(1).map((r) => r.spending), [50000, 100000, 100000], 'spending');
});

test('R24F-01: on a plan that starts at 65.5, a stage whose last year is 65 covers its first half-year (was not applied)', () => {
  /* The first year runs 65.5 to 66, half a year. A 50% stage from 60 to 65 covers ages 60 up to 66, so all of it:
     half a year at $50,000 a year is $25,000. The next year, 66 to 67, is outside it: $100,000. */
  const rows = spendingRows([pct(60, 65, 50)], { age: 65.5, endAge: 67 });
  near(rows.slice(1).map((r) => r.spending), [25000, 100000], 'spending');
});
