'use strict';

/**
 * SUPERSEDED CONCLUSION -- READ THIS FIRST (2026-09-09, R2-T07).
 *
 * The closing paragraph of the investigation below ("this closes RISK-001
 * as not a bug") is NO LONGER the project's position. RISK-001 resurfaced,
 * was re-decided the other way, and the new answer is locked in
 * ROADMAP_EXTERNAL_REVIEW.md section 1:
 *
 *   "Balance-sensitive spending decisions (e.g. constantPercent) use
 *    start-of-period known state only -- no lookahead."
 *
 * simulatePlan() no longer hands strategySpending() a post-growth balance;
 * see tests/audit-decision-clock-lookahead.test.js for the repair and its
 * first-failing evidence.
 *
 * THIS FILE IS STILL LIVE AND STILL CORRECT, because everything it asserts
 * is about growAccounts() and strategySpending() invoked DIRECTLY. Those
 * two primitives are unchanged: growAccounts() still applies exactly
 * 100% / 62.5% / 50% of a period's compounding for annual / quarterly /
 * monthly timing, and strategySpending() is still a pure formula over
 * whatever balance it is handed. What changed is only WHICH balance
 * simulatePlan() hands it. Read the mechanics below as documentation of
 * the primitives; do not read the verdict as current policy.
 *
 * --- original 2026-09-08 investigation, preserved verbatim below ---
 *
 * Investigation for RISK-001 (RETIREMENT_ENGINE_AUDIT_CLAUDE_QUEUE_2026-09-08.md,
 * task T09): does a spending decision see investment returns that, in a
 * literal opening-date decision model, shouldn't be known yet?
 *
 * INVESTIGATION FINDING (documented here per the task's own required
 * evidence trail, not a code change): the growth-before-withdrawal timing
 * is a DOCUMENTED, INTENTIONAL design, not accidental leakage.
 * INVESTMENT_CALCULATOR_V2C_HANDOVER.md's own numbered simulation-order
 * list (the source the audit itself cites as "handover §8") states
 * verbatim:
 *
 *   "Withdrawal timing is an annual approximation:
 *    - Annual: all annual growth is applied before the withdrawal.
 *    - Quarterly: 62.5% of annual-period growth is applied before the withdrawal.
 *    - Monthly: 50% is applied before the withdrawal."
 *
 * These exact percentages (100% / 62.5% / 50%) are what `preGrowth` computes
 * in simulatePlan() and what growAccounts() applies before strategySpending()
 * runs. This models how often a household "checks in" and reacts to the
 * CURRENT, already-realized market performance before deciding that year's
 * spending -- annual = checks once a year and sees the whole year's return;
 * monthly = checks continuously, averaging to having seen half the year's
 * growth by the time any given month's decision is made. This is exactly
 * the mechanism dynamic/guardrails-style withdrawal strategies are FOR
 * (reacting to realized performance), not hindsight bias.
 *
 * The tests below are the synthetic counterfactual the audit's own T09 row
 * prescribes: identical known opening state, differing unseen returns,
 * isolated from the full engine loop (direct calls to growAccounts() and
 * strategySpending(), not a full simulatePlan()/historical/Monte Carlo run).
 * They confirm the DOCUMENTED percentages are exactly what's implemented --
 * no more, no less -- and that a zero-return control is identical regardless
 * of withdrawal-timing mode, which is exactly what would be false if some
 * OTHER, undocumented asymmetry were present. Per the task's own acceptance
 * path ("If causal under documented timing, record evidence and close as
 * not a bug"), this closes RISK-001 as not a bug. No engine.js change
 * accompanies this file.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

/** Isolated recreation of simulatePlan()'s pre-spending-decision sequence:
 *  apply preGrowth's documented share of the period's realized return, then
 *  ask strategySpending() how much to withdraw against the resulting
 *  balance -- exactly the two calls simulatePlan() itself makes, with
 *  nothing else in between. */
function spendingDecision(openingBalance, annualReturn, withdrawalTiming, strategyOverrides = {}) {
  const p = {
    assumptions: { withdrawalTiming, fee: 0 },
    retirement: Object.assign({ strategy: 'constantPercent', withdrawalRate: 4 }, strategyOverrides),
  };
  const accounts = [{ balance: openingBalance }];
  const preGrowth = withdrawalTiming === 'annual' ? 1 : withdrawalTiming === 'quarterly' ? 0.625 : 0.5;
  engine.growAccounts(accounts, [annualReturn], preGrowth);
  const balanceAtDecision = accounts[0].balance;
  const amount = engine.strategySpending(p, 65, balanceAtDecision, openingBalance, null, 0, 1, 0);
  return { balanceAtDecision, amount };
}

test('RISK-001 evidence: "annual" timing applies exactly 100% of the realized return before the decision, matching the handover\'s documented percentage', () => {
  const up = spendingDecision(100000, 0.20, 'annual');
  const down = spendingDecision(100000, -0.20, 'annual');
  assert.ok(Math.abs(up.balanceAtDecision - 120000) < 0.01, `expected the full +20% applied, got balance ${up.balanceAtDecision}`);
  assert.ok(Math.abs(down.balanceAtDecision - 80000) < 0.01, `expected the full -20% applied, got balance ${down.balanceAtDecision}`);
  // The audit's own worked example: 4% of a post-return balance.
  assert.ok(Math.abs(up.amount - 4800) < 0.01, `expected $4,800 spending after +20%, got ${up.amount}`);
  assert.ok(Math.abs(down.amount - 3200) < 0.01, `expected $3,200 spending after -20%, got ${down.amount}`);
});

test('RISK-001 evidence: "quarterly" timing applies exactly 62.5% of a year\'s worth of COMPOUND growth before the decision, matching growAccounts()\'s own Math.pow(1+rate,fraction) formula', () => {
  const up = spendingDecision(100000, 0.20, 'quarterly');
  // growAccounts() compounds fractionally (balance*(1+rate)^fraction), not
  // linearly (balance*(1+rate*fraction)) -- the mathematically correct way
  // to apply "62.5% of a year's compounding," confirmed against the actual
  // formula rather than assumed.
  const expectedBalance = 100000 * Math.pow(1.20, 0.625);
  assert.ok(Math.abs(up.balanceAtDecision - expectedBalance) < 0.01, `expected balance ${expectedBalance}, got ${up.balanceAtDecision}`);
  assert.ok(Math.abs(up.amount - expectedBalance * 0.04) < 0.01);
});

test('RISK-001 evidence: "monthly" timing applies exactly 50% of a year\'s worth of compound growth, matching the same formula', () => {
  const up = spendingDecision(100000, 0.20, 'monthly');
  const expectedBalance = 100000 * Math.pow(1.20, 0.5);
  assert.ok(Math.abs(up.balanceAtDecision - expectedBalance) < 0.01, `expected balance ${expectedBalance}, got ${up.balanceAtDecision}`);
  assert.ok(Math.abs(up.amount - expectedBalance * 0.04) < 0.01);
});

test('RISK-001 evidence: a zero-return control is IDENTICAL across every withdrawal-timing mode -- no other hidden asymmetry is present', () => {
  const annual = spendingDecision(100000, 0, 'annual');
  const quarterly = spendingDecision(100000, 0, 'quarterly');
  const monthly = spendingDecision(100000, 0, 'monthly');
  assert.equal(annual.balanceAtDecision, 100000);
  assert.equal(quarterly.balanceAtDecision, 100000);
  assert.equal(monthly.balanceAtDecision, 100000);
  assert.equal(annual.amount, annual.balanceAtDecision * 0.04);
  assert.equal(annual.amount, quarterly.amount);
  assert.equal(quarterly.amount, monthly.amount);
});

test('RISK-001 evidence: the effect scales strictly with |return| and preGrowth fraction, consistent with a single documented mechanism rather than a compounding or duplicated leak', () => {
  const small = spendingDecision(100000, 0.05, 'annual');
  const large = spendingDecision(100000, 0.20, 'annual');
  const smallGain = small.balanceAtDecision - 100000;
  const largeGain = large.balanceAtDecision - 100000;
  assert.ok(Math.abs(largeGain / smallGain - 0.20 / 0.05) < 1e-9, 'the balance shift must scale linearly with the return, as a single 100%-applied growth step would -- not some compounded or duplicated effect');
});
