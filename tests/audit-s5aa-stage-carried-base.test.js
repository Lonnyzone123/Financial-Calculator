/* S5AA task 2.1, Q108 -- a spending stage adjusts the year it applies to, and does not become next year's
 * starting point.
 *
 * strategySpending() carries a base forward for `fixedReal`, which computes each year as
 * `priorSpend * inflationStep`. The carried base was built by running applyStage() over the amount:
 *
 *     var spend=applyStage(r,age,amount*survivorFactor,inflationFactor),
 *         base=survivorFactor===1?spend:applyStage(r,age,amount,inflationFactor);
 *
 * applyStage() is inside BOTH branches, so the adjusted figure became the next year's starting point and the
 * adjustment re-applied to its own output, for ever. Measured at the start commit: a 50% stage over ages 70-75
 * halves EVERY year -- 2,000,000 -> 1,000,000 -> 500,000 -> 250,000 -> 125,000 -> 62,500 -> 31,250 -- and then
 * stays at 31,250 after the window has ended.
 *
 * RC-02 ALREADY MADE THIS EXACT CORRECTION ONCE, for the survivor reduction: that is why `base` excludes
 * survivorFactor. The stage was left inside it. This task applies the same correction to the other adjustment,
 * which is what the checklist means by "build the carried base from the unadjusted amount in BOTH branches".
 *
 * A SECOND SYMPTOM, NOT NAMED IN THE ORIGINAL FINDING. H-04 was reported as percent-stage compounding. The same
 * carried base also makes a `set` stage PERMANENT: the set value is written into the base, so spending never
 * returns after the window. One repair covers both, and both are pinned below.
 *
 * WHY THE EXPECTED VALUES ARE NOT WRITTEN AS NUMBERS. Every assertion here compares against a CONTROL RUN with no
 * stage, so the expectation is an independently produced unadjusted trajectory rather than a figure copied out of
 * the engine. A hard-coded 40,000 would pass just as well against an engine that had stopped applying stages at
 * all; a ratio against the control cannot.
 */
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

const STAGE_START = 70;
const STAGE_END = 75;

/* THE WINDOW IN ROW TERMS, established by measurement rather than assumed. applyStage() is called with the row's
 * START age, so a stage declared [70, 75] adjusts the rows that END at 71 through 76 -- the row ending at 76
 * covers the year that began at 75, which is inside the stage. The first draft of this file used `age <= 75` and
 * the fixedNominal control caught it: fixedNominal already behaves correctly, so a control failing there could
 * only mean the expectation was wrong, not the engine. */
const inWindow = (age) => age > STAGE_START && age <= STAGE_END + 1;
const afterWindow = (age) => age > STAGE_END + 1;

/* Deterministic and never shortfall-limited: a 0% return and 0% inflation make the unadjusted `fixedReal`
 * trajectory flat, so "returns to the unreduced level" is a statement about a number that cannot drift for any
 * other reason. The portfolio is large enough that every requested dollar is funded. */
function fixture(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 65, retireAge: 65, endAge: 80, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, seed: 42791 });
  Object.assign(p.retirement, {
    strategy: 'fixedReal', spending: 80000, withdrawalRate: 4, flexibility: 0, dividendOn: false,
    stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false, survivorSpendingReduction: 0,
  });
  p.accounts = [{ id: 'a1', name: 'Taxable', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 2000000, basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  if (edit) edit(p);
  return p;
}
function run(p) {
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  return r;
}
const byAge = (r, field) => {
  const out = {};
  r.rows.forEach((row) => { out[row.age] = row[field]; });
  return out;
};
const near = (a, b) => Math.abs(a - b) < 0.01;
const stage = (over) => [Object.assign({ start: STAGE_START, end: STAGE_END, mode: 'percent', value: 50 }, over)];

const control = run(fixture());
const controlSpend = byAge(control, 'spending');

test('S5AA 2.1: a percent stage holds at its level through the window instead of compounding each year', () => {
  const staged = byAge(run(fixture((p) => { p.retirement.stages = stage(); })), 'spending');
  const wrong = [];
  for (const age of Object.keys(controlSpend).map(Number)) {
    if (!inWindow(age)) continue;
    const expected = controlSpend[age] * 0.5;
    if (!near(staged[age], expected)) {
      wrong.push('age ' + age + ': got ' + Math.round(staged[age]) + ', expected half the unstaged ' + Math.round(controlSpend[age]) + ' = ' + Math.round(expected));
    }
  }
  assert.deepStrictEqual(wrong, [], 'every year in the window is 50% of the unstaged level, not 50% of last year');
});

test('S5AA 2.1: spending returns to the unreduced level after the window ends', () => {
  const staged = byAge(run(fixture((p) => { p.retirement.stages = stage(); })), 'spending');
  const wrong = [];
  for (const age of Object.keys(controlSpend).map(Number)) {
    if (!afterWindow(age)) continue;
    if (!near(staged[age], controlSpend[age])) {
      wrong.push('age ' + age + ': got ' + Math.round(staged[age]) + ', expected the unstaged ' + Math.round(controlSpend[age]));
    }
  }
  assert.deepStrictEqual(wrong, [], 'a stage is a window, not a permanent step down');
});

test('S5AA 2.1: a "set" stage is also a window -- it does not become the permanent level', () => {
  const SET = 50000;
  const staged = byAge(run(fixture((p) => { p.retirement.stages = stage({ mode: 'amount', value: SET, growthMode: 'none' }); })), 'spending');   // S5AA R43: 'set' is not a stage mode; the engine read it as 'amount'
  const wrong = [];
  for (const age of Object.keys(controlSpend).map(Number)) {
    if (inWindow(age)) {
      if (!near(staged[age], SET)) wrong.push('age ' + age + ' (in the window): got ' + Math.round(staged[age]) + ', expected ' + SET);
    } else if (afterWindow(age)) {
      if (!near(staged[age], controlSpend[age])) wrong.push('age ' + age + ' (after): got ' + Math.round(staged[age]) + ', expected the unstaged ' + Math.round(controlSpend[age]));
    }
  }
  assert.deepStrictEqual(wrong, [], 'the set value applies during the window and is not carried past it');
});

test('S5AA 2.1: the ACCOUNT effect follows the displayed amount -- the cash identity holds every year', () => {
  /* The checklist asks for the actual cash and account effect, not only the displayed figure: a repair that fixed
   * the number on the row while still drawing the compounded amount from the portfolio would pass a
   * spending-only test and be worthless.
   *
   * THE IDENTITY IS withdrawals = spending + taxes, not withdrawals = spending. The first draft asserted the
   * latter and failed by about $130 a year -- which was the tax on the imputed dividend, funded from the same
   * withdrawal. Tying the assertion to the row's OWN tax figure is the stronger test anyway: it holds whatever
   * the tax happens to be, instead of only in a fixture contrived to have none. */
  const stagedRun = run(fixture((p) => { p.retirement.stages = stage(); }));
  const staged = byAge(stagedRun, 'spending');
  const withdrawals = byAge(stagedRun, 'withdrawals');
  const taxes = byAge(stagedRun, 'taxes');
  const wrong = [];
  for (const age of Object.keys(staged).map(Number)) {
    if (age <= STAGE_START) continue;
    if (!near(withdrawals[age], staged[age] + taxes[age])) {
      wrong.push('age ' + age + ': withdrew ' + Math.round(withdrawals[age])
        + ' but spending ' + Math.round(staged[age]) + ' + taxes ' + Math.round(taxes[age])
        + ' = ' + Math.round(staged[age] + taxes[age]));
    }
  }
  assert.deepStrictEqual(wrong, [], 'every withdrawn dollar is spending or the tax on funding it');
});

test('S5AA 2.1: the portfolio keeps exactly what the reduced window did not spend', () => {
  /* The account-level consequence, derived from the two runs rather than written as a number. A compounding stage
   * spends far less than a held one, so it would leave far MORE behind -- this is the assertion that would have
   * caught the old behaviour even if the displayed figures had somehow looked right. */
  const stagedRun = run(fixture((p) => { p.retirement.stages = stage(); }));
  const staged = byAge(stagedRun, 'spending');
  let saved = 0;
  for (const age of Object.keys(controlSpend).map(Number)) saved += controlSpend[age] - (staged[age] || 0);

  const endStaged = stagedRun.rows[stagedRun.rows.length - 1].total;
  const endControl = control.rows[control.rows.length - 1].total;
  const kept = endStaged - endControl;

  assert.ok(kept > 0, 'a reduced-spending window must end with more than the unstaged plan');
  /* Allowance for the tax that was not paid on the money that was not withdrawn. */
  assert.ok(Math.abs(kept - saved) < saved * 0.02,
    'the portfolio should keep what the window did not spend: kept ' + Math.round(kept) + ' against ' + Math.round(saved) + ' unspent');
});

test('S5AA 2.1 control: a stage of 100% changes nothing, and no stage at all changes nothing', () => {
  const unchanged = byAge(run(fixture((p) => { p.retirement.stages = stage({ value: 100 }); })), 'spending');
  const wrong = [];
  for (const age of Object.keys(controlSpend).map(Number)) {
    if (!near(unchanged[age], controlSpend[age])) {
      wrong.push('age ' + age + ': a 100% stage moved spending from ' + Math.round(controlSpend[age]) + ' to ' + Math.round(unchanged[age]));
    }
  }
  assert.deepStrictEqual(wrong, [], 'CONTROL: a stage that adjusts by nothing must be indistinguishable from no stage');
});

test('S5AA 2.1 control: a strategy that does not carry a base forward is untouched by this repair', () => {
  /* Only fixedReal reads priorSpend forward. fixedNominal recomputes from r.spending every year, so a stage under
   * it could never compound -- and must not change here. */
  const nominalControl = byAge(run(fixture((p) => { p.retirement.strategy = 'fixedNominal'; })), 'spending');
  const nominalStaged = byAge(run(fixture((p) => { p.retirement.strategy = 'fixedNominal'; p.retirement.stages = stage(); })), 'spending');
  const wrong = [];
  for (const age of Object.keys(nominalControl).map(Number)) {
    const expected = inWindow(age) ? nominalControl[age] * 0.5 : nominalControl[age];
    if (!near(nominalStaged[age], expected)) {
      wrong.push('age ' + age + ': got ' + Math.round(nominalStaged[age]) + ', expected ' + Math.round(expected));
    }
  }
  assert.deepStrictEqual(wrong, [], 'CONTROL: fixedNominal already behaved correctly and must be unchanged');
});

test('S5AA 2.1 control: the survivor reduction stays out of the carried base, as RC-02 decided', () => {
  /* RC-02 removed survivorFactor from the carried base so a survivor reduction would not compound. This repair
   * touches the same expression, so that property is pinned here rather than assumed to have survived. */
  const survivorRun = run(fixture((p) => {
    p.profile.spouseOn = true; p.profile.spouseAge = 67;
    p.retirement.survivor = true; p.retirement.spouseLife = 70; p.retirement.selfLife = 95;
    p.retirement.survivorSpendingReduction = 20;
  }));
  const spend = byAge(survivorRun, 'spending');
  const ages = Object.keys(spend).map(Number).filter((a) => a >= 74).sort((x, y) => x - y);
  const wrong = [];
  for (let i = 1; i < ages.length; i++) {
    if (spend[ages[i]] < spend[ages[i - 1]] - 0.01) {
      wrong.push('age ' + ages[i] + ': ' + Math.round(spend[ages[i]]) + ' is below age ' + ages[i - 1] + "'s " + Math.round(spend[ages[i - 1]]));
    }
  }
  assert.deepStrictEqual(wrong, [], 'CONTROL: a survivor reduction is applied once, never compounded year on year');
});
