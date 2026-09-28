'use strict';

/**
 * SA-03 (SPRINT_EXTERNAL_AUDIT_20260909.md) -- REGRESSION INTRODUCED BY THIS
 * PROJECT'S OWN R2-T06 REPAIR. Recorded here rather than folded quietly into
 * the HR-02 test file, because a self-inflicted regression is exactly the
 * thing a future reader most needs to find.
 *
 * R2-T06 fixed a real defect: a synthetic RMD-cash holding appended to
 * `accounts` mid-period had no entry in the index-aligned `rates` array, so
 * `growAccounts()`'s `rates[i]===undefined` guard silently skipped its
 * remaining-period growth. The repair registers the source account's own
 * realized rate at the new index.
 *
 * What that repair missed is that `rates` serves TWO purposes:
 *
 *   1. per-account growth -- which legitimately needs an entry for the new
 *      holding; and
 *   2. the Monte Carlo branch's policy return signal, computed at the end of
 *      the period as `sum(rates) / rates.length` and carried into the next
 *      period as `priorReturn`, where it drives the post-down-year
 *      flexibility cut and `optimizedAccountScore()`'s ordering.
 *
 * Appending to `rates` gives the source account's rate a SECOND vote in that
 * mean. The new holding had no independent market exposure for the period --
 * it did not exist for most of it -- so its bookkeeping existence must not
 * retroactively redefine the period's return signal.
 *
 * The audit's reproduction, asserted below: two $2,000,000 pre-tax accounts
 * returning -10% and +15%. The true period mean is +2.5%, a NON-down year.
 * After the append the mean becomes (-10 + 15 + -10) / 3 = -1.667%, a false
 * down year, and the next period's spending is cut by the configured 10%
 * flexibility -- $18,000 instead of $20,000. The portfolio actually GREW
 * over the period, from $4,000,000 to roughly $4,053,000-$4,062,000, so the
 * cut is not merely mistimed, it is contradicted by the period's own result.
 *
 * Fix boundary, per the audit: retain the existing arithmetic-mean policy.
 * Moving to a portfolio-weighted signal may be worthwhile but is a separate
 * policy change and is NOT required to repair this regression. The holding
 * must keep its remaining-period growth -- removing that to make this test
 * pass would simply reinstate the R2-T06 defect.
 */

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

function account(overrides) {
  return Object.assign({
    id: 'a1', name: 'A', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 0,
    contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0,
    annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }, overrides);
}

/** Two pre-tax accounts with deterministic, opposite-signed returns and zero
 *  volatility, so the Monte Carlo branch runs with every path the same
 *  and the period mean is exactly (down + up) / 2. No taxable account
 *  exists, so surplus RMD cash must synthesize the holding. */
function twoAssetPlan(downRate, upRate) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.id = 'sa03';
  p.profile.age = 75;
  p.profile.retireAge = 65;
  p.profile.endAge = 77;
  p.profile.spouseOn = false;
  p.employment.salary = 0;
  p.employment.spouseSalary = 0;
  p.assumptions.method = 'monteCarlo';
  p.assumptions.volatility = 0;
  p.assumptions.inflation = 0;
  p.assumptions.fee = 0;
  p.assumptions.withdrawalTiming = 'monthly';
  p.retirement.strategy = 'fixedNominal';
  p.retirement.spending = 20000;
  p.retirement.flexibility = 10;
  p.retirement.ssBenefit = 0;
  p.retirement.spouseSS = 0;
  p.retirement.pension = 0;
  p.retirement.dividendOn = false;
  p.retirement.survivor = false;
  p.retirement.stages = [];
  p.retirement.expenses = [];
  p.retirement.otherIncomes = [];
  p.advanced.rmdOn = true;
  p.advanced.qcd = 0;
  p.advanced.healthOn = false;
  p.advanced.ltcOn = false;
  p.advanced.conversionOn = false;
  p.advanced.transferOn = false;
  p.advanced.reserveOn = false;
  p.advanced.bondTentOn = false;
  p.advanced.assetsOn = true;
  p.advanced.correlation = 0;
  p.advanced.assetClasses = [
    { id: 'down', name: 'Down', returnRate: downRate, volatility: 0 },
    { id: 'up', name: 'Up', returnRate: upRate, volatility: 0 },
  ];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  p.accounts = [
    account({ id: 'p1', name: '401k-down', type: 'traditional401k', taxClass: 'preTax', balance: 2000000, basisPct: 0, priority: 1, allocation: { down: 100 } }),
    account({ id: 'p2', name: '401k-up', type: 'traditional401k', taxClass: 'preTax', balance: 2000000, basisPct: 0, priority: 2, allocation: { up: 100 } }),
  ];
  return p;
}

/* Through runPlan(), the public entry point. Every volatility in the fixture is 0, so every Monte Carlo path is the
   same one; measured before this was re-routed, runPlan()'s rows agreed with the single path on every field both
   report, on every fixture in this file. */
function run(plan) {
  return engine.runPlan(plan);
}

test('SA-03 (setup): the fixture really does synthesize an RMD holding and really does end the period UP -- otherwise the assertions below prove nothing', () => {
  const result = run(twoAssetPlan(-10, 15));
  assert.ok(result.rows[1].taxable > 0,
    'the period must retain surplus RMD cash into a synthesized taxable holding; got ' + result.rows[1].taxable);
  assert.ok(result.rows[1].total > 4000000,
    'the portfolio must actually GROW over the period, so a down-year cut is contradicted by the period itself; opened at 4000000, closed at ' + result.rows[1].total);
});

test('SA-03: creating the RMD holding must not turn a +2.5% period into a false down year and cut the next period\'s spending', () => {
  const result = run(twoAssetPlan(-10, 15));
  assert.equal(result.rows[1].spending, 20000, 'period 1 is the control and must be unaffected');
  assert.equal(result.rows[2].spending, 20000,
    'period 2 spending was cut to $' + result.rows[2].spending + '. The true period mean is +2.5%, ' +
    'but appending the source account\'s rate a second time makes it (-10 + 15 + -10) / 3 = -1.667%, ' +
    'triggering the 10% post-down-year flexibility cut.');
});

test('SA-03: the same fixture with NO synthesized holding is unchanged -- isolating the append as the cause', () => {
  // A taxable account already exists, so retainExcessRmdCash() uses it and
  // appends nothing. Same returns, same mean, same expected spending.
  const plan = twoAssetPlan(-10, 15);
  plan.accounts.push(account({ id: 't1', name: 'Brokerage', balance: 0, priority: 3, allocation: { up: 100 } }));
  const result = run(plan);
  assert.equal(result.rows[2].spending, 20000,
    'with an existing taxable destination there is no append, so this path was always correct');
});

test('SA-03: a GENUINE down year still cuts spending -- the repair must not disable the flexibility rule', () => {
  // Both sleeves negative: the true mean is -12.5%, a real down year.
  const result = run(twoAssetPlan(-10, -15));
  assert.equal(result.rows[2].spending, 18000,
    'a real down year must still trigger the 10% flexibility cut; got ' + result.rows[2].spending);
});

test('SA-03: the signal must not be flippable in either direction by holding creation', () => {
  // CONTROL, not first-failing: it passed before the repair too, because
  // appending +15% raises the mean rather than flipping its sign. Kept
  // because the reversed-priority path deserves its own assertion.
  // Mean +2.5% with the POSITIVE sleeve drained first: appending +15% a
  // second time raises the mean rather than lowering it. Either way the
  // policy signal must be the period's own unpolluted mean.
  const plan = twoAssetPlan(-10, 15);
  plan.accounts[0].priority = 2;
  plan.accounts[1].priority = 1;
  const result = run(plan);
  assert.equal(result.rows[2].spending, 20000,
    'a positive-sleeve append must not change the decision either; got ' + result.rows[2].spending);
});

test('SA-03: the holding still receives its remaining-period growth -- the R2-T06 repair is retained, not undone', () => {
  // Identical fixture at a 0% and a 10% flat return. The RMD is sized off
  // openingPreTax, spending is fixedNominal with zero inflation, and pre-tax
  // withdrawals realize no capital gains, so the retained cash is the same
  // in both runs and only the late growth can separate the holdings.
  function flat(rate) {
    const plan = twoAssetPlan(rate, rate);
    plan.retirement.flexibility = 0; // isolate growth from the down-year rule
    return run(plan).rows[1];
  }
  const grown = flat(10), still = flat(0);
  assert.ok(still.taxable > 0, 'the control must actually retain cash');
  const lateGrowthFactor = Math.pow(1.10, 0.5); // 'monthly' timing leaves half the period after the decision
  assert.ok(Math.abs(grown.taxable - still.taxable * lateGrowthFactor) < 1e-6,
    'the synthesized holding lost its remaining-period growth -- that would reinstate the original HR-02 defect. ' +
    'Expected ' + (still.taxable * lateGrowthFactor) + ', got ' + grown.taxable);
});
