'use strict';

/**
 * R2-T07 / RISK-001 (second resolution) -- THE DECISION CLOCK.
 *
 * ROADMAP_EXTERNAL_REVIEW.md section 1 locks this decision:
 *
 *   "Balance-sensitive spending decisions (e.g. constantPercent) use
 *    start-of-period known state only -- no lookahead. Test must fail on
 *    any future-information use."
 *
 * This supersedes the earlier T09 investigation recorded in
 * tests/audit-decision-clock.test.js, which closed RISK-001 as "documented
 * timing, not a bug." The question resurfaced and was re-decided the other
 * way. That file's assertions are about growAccounts() and
 * strategySpending() called DIRECTLY -- the documented mechanics of those
 * two primitives are unchanged and it still passes. THIS file is about
 * what simulatePlan() feeds them, which is the part that changed.
 *
 * The test shape is the counterfactual the decision demands: two runs of
 * one byte-identical scenario whose ONLY difference is the unseen market
 * draw for the period. Every scenario input, every deterministic cash
 * movement (contributions, employer match, transfers, conversions) and the
 * inflation path are identical. If the spending decision for a period can
 * see that period's own realized return, the two runs disagree; if it uses
 * start-of-period known state only, they agree exactly.
 *
 * Covered leak sites (all three were live before this repair):
 *   1. the `balance` argument at the strategySpending() call site, taken
 *      from totalBalance(accounts) AFTER growAccounts() had already applied
 *      preGrowth's share of the period's realized return;
 *   2. the same post-growth total used as the retirement-year anchor when
 *      retireBalance was still null;
 *   3. `retireBalance` itself, latched post-growth and then reused as the
 *      fixedReal / guardrails / guyton baseline for EVERY later period, so
 *      one period's lookahead contaminated the whole remaining horizon.
 *
 * The final test is a deliberate positive control: the repair must remove
 * lookahead WITHOUT freezing the decision. A period's decision is still
 * required to see the PRIOR period's realized return, which is known state.
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

const OPENING_BALANCE = 1000000;

/** A scenario stripped to exactly one moving part: a single taxable
 *  account, already retired, no Social Security / pension / dividends /
 *  RMDs / health / LTC / debts / contributions, no post-down-year
 *  flexibility rule (that one legitimately reads the PRIOR return, which
 *  would otherwise mask what we are measuring). Annual withdrawal timing
 *  applies 100% of the period return before the decision point, which is
 *  the maximum-leak configuration. */
function decisionClockPlan(overrides) {
  overrides = overrides || {};
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.id = 'decision-clock';
  p.accounts = [{
    id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: OPENING_BALANCE, contribution: 0, contributionMode: 'amount', priority: 1,
    basisPct: 100, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
    changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }];
  p.profile.age = 65;
  p.profile.retireAge = 65;
  p.profile.endAge = 69;
  p.profile.spouseOn = false;
  p.employment.salary = 0;
  p.employment.spouseSalary = 0;
  p.assumptions.method = 'monteCarlo';
  p.assumptions.withdrawalTiming = 'annual';
  p.assumptions.volatility = 18.5;
  p.assumptions.returnRate = 6;
  p.assumptions.inflation = 3;
  p.assumptions.fee = 0;
  p.retirement.strategy = 'constantPercent';
  p.retirement.withdrawalRate = 4;
  p.retirement.flexibility = 0;
  p.retirement.ssBenefit = 0;
  p.retirement.spouseSS = 0;
  p.retirement.pension = 0;
  p.retirement.dividendOn = false;
  p.retirement.survivor = false;
  p.retirement.stages = [];
  p.retirement.expenses = [];
  p.retirement.otherIncomes = [];
  p.advanced.rmdOn = false;
  p.advanced.healthOn = false;
  p.advanced.ltcOn = false;
  p.advanced.conversionOn = false;
  p.advanced.transferOn = false;
  p.advanced.reserveOn = false;
  p.advanced.bondTentOn = false;
  p.advanced.assetsOn = false;
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  Object.assign(p.retirement, overrides.retirement || {});
  Object.assign(p.assumptions, overrides.assumptions || {});
  Object.assign(p.profile, overrides.profile || {});
  return p;
}

/** normal() consumes two draws; a constant generator therefore yields one
 *  fixed z-score per period. 0.5 gives about -1.18 sigma, 0.9 about +0.37
 *  sigma. Same scenario, opposite-signed unseen market outcome. */
const DOWN_DRAW = function () { return 0.5; };
const UP_DRAW = function () { return 0.9; };

function spendingByPeriod(plan, random) {
  const result = engine.simulatePlan(plan, random, 0, null, null);
  // rows[0] is the synthetic opening row (age 65, no activity); the
  // decisions start at rows[1].
  return result.rows.slice(1).map(function (r) { return r.spending; });
}

test('decision clock: the unseen z-scores really do produce materially different portfolio paths -- otherwise the tests below would pass vacuously', () => {
  const plan = decisionClockPlan();
  const down = engine.simulatePlan(plan, DOWN_DRAW, 0, null, null);
  const up = engine.simulatePlan(plan, UP_DRAW, 0, null, null);
  const downFirst = down.rows[1].total;
  const upFirst = up.rows[1].total;
  assert.ok(upFirst - downFirst > OPENING_BALANCE * 0.1,
    'the two draws must diverge the portfolio by >10% of opening balance for this to be a real probe; got down=' + downFirst + ', up=' + upFirst);
});

test('decision clock: constantPercent spending for a period must NOT change when only that period\'s unseen return changes (leak site 1 -- the post-growth balance argument)', () => {
  const plan = decisionClockPlan();
  const down = spendingByPeriod(plan, DOWN_DRAW);
  const up = spendingByPeriod(plan, UP_DRAW);
  assert.equal(down[0], up[0],
    'the first retirement period\'s spending decision saw its own period return: down-draw run spent ' + down[0] + ', up-draw run spent ' + up[0]);
  // With no lookahead the decision is exactly 4% of the known opening
  // balance -- an independent value, not merely "the two runs agree."
  assert.ok(Math.abs(down[0] - OPENING_BALANCE * 0.04) < 0.01,
    'expected 4% of the start-of-period known balance (' + (OPENING_BALANCE * 0.04) + '), got ' + down[0]);
});

test('decision clock: fixedReal\'s retirement-year anchor must be start-of-period known state, so EVERY period agrees across the two draws (leak sites 2 and 3 -- the latched retireBalance)', () => {
  const plan = decisionClockPlan({ retirement: { strategy: 'fixedReal' } });
  const down = spendingByPeriod(plan, DOWN_DRAW);
  const up = spendingByPeriod(plan, UP_DRAW);
  // fixedReal after year one is priorSpend * (1 + inflation), and
  // inflation is deterministic here -- so a contaminated anchor shows up
  // in every subsequent period too, not just the first.
  assert.deepEqual(down, up,
    'fixedReal spending path diverged on unseen returns alone: down=' + JSON.stringify(down) + ' up=' + JSON.stringify(up));
  assert.ok(Math.abs(down[0] - OPENING_BALANCE * 0.04) < 0.01,
    'the year-one anchor must be 4% of the known opening balance (' + (OPENING_BALANCE * 0.04) + '), got ' + down[0]);
});

test('decision clock: guardrails reads BOTH the current balance and the retirement anchor, and must agree across the two draws in the first period', () => {
  const plan = decisionClockPlan({ retirement: { strategy: 'guardrails' } });
  const down = spendingByPeriod(plan, DOWN_DRAW);
  const up = spendingByPeriod(plan, UP_DRAW);
  assert.equal(down[0], up[0],
    'guardrails\' first decision saw its own period return: ' + down[0] + ' vs ' + up[0]);
});

test('decision clock: vpw and floorCeiling are balance-sensitive too and must not see the current period\'s return', () => {
  for (const strategy of ['vpw', 'floorCeiling']) {
    const plan = decisionClockPlan({ retirement: { strategy: strategy } });
    const down = spendingByPeriod(plan, DOWN_DRAW);
    const up = spendingByPeriod(plan, UP_DRAW);
    assert.equal(down[0], up[0],
      strategy + '\'s first decision saw its own period return: ' + down[0] + ' vs ' + up[0]);
  }
});

test('decision clock POSITIVE CONTROL: a LATER period\'s decision must still respond to an EARLIER period\'s realized return -- start-of-period known state is not "no state at all"', () => {
  const plan = decisionClockPlan();
  const down = spendingByPeriod(plan, DOWN_DRAW);
  const up = spendingByPeriod(plan, UP_DRAW);
  assert.ok(down.length >= 2, 'need at least two retirement periods for this control');
  assert.notEqual(down[1], up[1],
    'period 2 spending was identical across wildly different period-1 outcomes -- the decision has been frozen, not merely de-leaked');
  assert.ok(up[1] > down[1],
    'after a strong period-1 return the period-2 decision should be larger, got up=' + up[1] + ' down=' + down[1]);
});
