'use strict';

// FM-07 (whole-model audit, 2026-09-10) -- P2, and settled by user decision
// D-2: SCALE TO ELAPSED TIME.
//
// THE DEFECT. Two halves of the engine disagree about what a period is:
//
//   accounting : inflationFactor *= (1 + annualInflation) ^ duration   <- duration-aware
//   decision   : amount = priorSpend * (1 + annualInflation)           <- always a FULL year
//
// After a half-year period at 10% annual inflation, prices have risen
// 4.88%. The next spending decision raises spending by the full 10%.
//
// WHY IT IS EASY TO MISS. `fixedReal` stays internally consistent in both
// cases -- real spending is perfectly flat, it just anchors 4.88% too high.
// The bug is not "inflation is applied wrongly every year"; it is one
// mis-sized raise, granted once at the first boundary, then faithfully
// preserved forever because it is baked into priorSpend. Every invariant one
// would naturally write (is real spending constant? does it track inflation?)
// passes.
//
// Measured before the repair, two identical households differing only by a
// half-year start:
//   retires at 65.0 -> real annual spending 36,363.64, flat forever
//   retires at 65.5 -> real annual spending 38,138.50, flat forever
// A permanent 4.88% real windfall for retiring in July instead of January.
//
// SCOPE, verified rather than assumed. `annualInflation` is consumed in
// exactly two places in strategySpending: the `fixedReal` branch and the
// guyton/guardrails branch. `incomeFirst` -- the shipped default -- uses
// `spending * inflationFactor`, which is already duration-aware and is NOT
// affected. Neither are fixedNominal, constantPercent, rmd or vpw.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

function plan(startAge, strategy) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.profile.age = startAge;
  p.profile.retireAge = startAge;
  p.profile.endAge = 72;
  p.profile.spouseOn = false;
  p.profile.filing = 'single';
  p.employment.salary = 0;
  p.employment.spouseSalary = 0;
  p.assumptions.method = 'simple';
  p.assumptions.returnRate = 0;
  p.assumptions.inflation = 10;
  p.assumptions.fee = 0;
  p.retirement.strategy = strategy || 'fixedReal';
  p.retirement.withdrawalRate = 4;
  p.retirement.ssBenefit = 0;
  p.retirement.pension = 0;
  p.retirement.dividendOn = false;
  p.retirement.incomeOffset = false;
  p.retirement.stages = [];
  p.retirement.expenses = [];
  p.retirement.otherIncomes = [];
  p.advanced.rmdOn = false;
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  p.advanced.healthOn = false;
  p.advanced.ltcOn = false;
  p.accounts = [{
    id: 'a1', name: 'Taxable', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 1000000, basisPct: 100, contributionMode: 'dollar', contribution: 0, frequency: 12,
    annualChangeMode: 'percent', annualChange: 0, changeTiming: 'annual', contributionPreset: 'none',
    futureChanges: [], priority: 1, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0,
    vesting: 100, allocation: {},
  }];
  return p;
}

/** Annual spending implied by each row, and its real value. */
function annualSpendSeries(startAge, strategy) {
  const rows = engine.runPlan(plan(startAge, strategy)).rows;
  const out = [];
  let prev = startAge;
  for (const r of rows) {
    const dur = r.age - prev;
    if (dur > 1e-9) out.push({ age: r.age, duration: dur, annual: r.spending / dur, real: (r.spending / dur) / r.inflationFactor });
    prev = r.age;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. The first-failing case
// ---------------------------------------------------------------------------

test('FM-07: after a HALF-year opening period the next annual figure uses half a year of inflation', () => {
  const series = annualSpendSeries(65.5);
  assert.ok(series.length >= 2, 'precondition: need an opening period plus a following one');
  assert.ok(Math.abs(series[0].duration - 0.5) < 1e-9, 'precondition: the opening period is half a year');

  const first = series[0].annual;
  const second = series[1].annual;
  const halfYearFactor = Math.pow(1.10, 0.5); // 1.048808848...

  assert.ok(
    Math.abs(second - first * halfYearFactor) < 0.01,
    'expected ' + (first * halfYearFactor).toFixed(2) + ' (the inflation actually accrued over half a year), got ' +
    second.toFixed(2) + ' -- 44000.00 would be a full year of inflation charged after six months'
  );
});

test('FM-07: the audit\'s exact figures -- 41,952.35 rather than 44,000', () => {
  const series = annualSpendSeries(65.5);
  assert.ok(Math.abs(series[0].annual - 40000) < 0.01, 'the opening annual figure is 4% of $1,000,000');
  assert.ok(
    Math.abs(series[1].annual - 41952.35) < 0.01,
    'expected 41952.35, got ' + series[1].annual.toFixed(2)
  );
});

// ---------------------------------------------------------------------------
// 2. The consequence: no permanent real windfall for a half-year start
// ---------------------------------------------------------------------------

test('FM-07: two households differing only by a half-year start reach the same real spending', () => {
  const whole = annualSpendSeries(65);
  const half = annualSpendSeries(65.5);

  // The OPENING period is compared separately, because its real figure
  // carries a deflator artifact rather than a behavioural difference: both
  // households spend $40,000 annualised, but the half-year household's row
  // is deflated by half a year of inflation (1.0488) and the whole-year
  // household's by a full year (1.10). That is the measurement, not the
  // model. What matters is the SETTLED level from the first full period on.
  const wholeSettled = whole.slice(1);
  const halfSettled = half.slice(1);
  assert.ok(wholeSettled.length >= 2 && halfSettled.length >= 2, 'need settled periods to compare');

  for (const s of [wholeSettled, halfSettled]) {
    for (const row of s) {
      assert.ok(Math.abs(row.real - s[0].real) < 0.01, 'real spending must stay flat once settled');
    }
  }

  // The point of the repair: the settled LEVELS now agree.
  assert.ok(
    Math.abs(wholeSettled[0].real - halfSettled[0].real) < 0.01,
    'the half-year household settles at ' + halfSettled[0].real.toFixed(2) + ' real against ' +
    wholeSettled[0].real.toFixed(2) + ' -- before the repair this gap was a permanent 4.88% windfall ' +
    'for retiring in July rather than January'
  );
});

// ---------------------------------------------------------------------------
// 3. Whole-year control: nothing may move
// ---------------------------------------------------------------------------

test('FM-07: a whole-year opening period is completely unchanged -- (1+r)^1 is 1+r', () => {
  const series = annualSpendSeries(65);
  assert.ok(Math.abs(series[0].annual - 40000) < 0.01);
  assert.ok(Math.abs(series[1].annual - 44000) < 0.01, 'a full year still gets the full 10%, got ' + series[1].annual.toFixed(2));
  assert.ok(Math.abs(series[2].annual - 48400) < 0.01);
});

test('FM-07: zero inflation is unaffected at any period length', () => {
  const p = plan(65.5);
  p.assumptions.inflation = 0;
  const rows = engine.runPlan(p).rows;
  let prev = 65.5;
  const annuals = [];
  for (const r of rows) { const d = r.age - prev; if (d > 1e-9) annuals.push(r.spending / d); prev = r.age; }
  for (const a of annuals) assert.ok(Math.abs(a - 40000) < 0.01, 'zero inflation must hold spending flat, got ' + a);
});

// ---------------------------------------------------------------------------
// 4. The other affected strategy, and the unaffected ones
// ---------------------------------------------------------------------------

test('FM-07: guardrails/guyton share the same decision line and get the same scaling', () => {
  const series = annualSpendSeries(65.5, 'guyton');
  const halfYearFactor = Math.pow(1.10, 0.5);
  assert.ok(
    Math.abs(series[1].annual - series[0].annual * halfYearFactor) < 1.0,
    'guyton\'s inflation step must also scale to elapsed time: expected about ' +
    (series[0].annual * halfYearFactor).toFixed(2) + ', got ' + series[1].annual.toFixed(2)
  );
});

test('FM-07: incomeFirst -- the shipped default -- was never affected and still is not', () => {
  // It uses spending * inflationFactor, which is already duration-aware.
  const half = annualSpendSeries(65.5, 'incomeFirst');
  const whole = annualSpendSeries(65, 'incomeFirst');
  assert.ok(half.length >= 2 && whole.length >= 2);
  // Same deflator caveat as above: compare the settled level, not the
  // opening period.
  assert.ok(
    Math.abs(half[1].real - whole[1].real) < 0.01,
    'incomeFirst should already have been calendar-correct in both households: ' +
    half[1].real.toFixed(2) + ' vs ' + whole[1].real.toFixed(2)
  );
});

// ---------------------------------------------------------------------------
// 5. SA-04 must survive: no lookahead into the upcoming period
// ---------------------------------------------------------------------------

test('FM-07: SA-04 is preserved -- a decision still uses only OBSERVED inflation', () => {
  // strategySpending is called with the prior period's observed figure. If a
  // future period's inflation could reach a decision, changing a later year
  // would move an earlier one. Configured inflation is constant here, so the
  // check is that the decision equals the PRIOR period's accrual exactly --
  // never the upcoming period's.
  const series = annualSpendSeries(65.5);
  const accruedOverFirstPeriod = Math.pow(1.10, 0.5);
  assert.ok(
    Math.abs(series[1].annual / series[0].annual - accruedOverFirstPeriod) < 1e-6,
    'the second decision must reflect exactly the inflation the FIRST period accrued'
  );
});
