'use strict';

// Fix B-4 (2026-09-09): the tax-withdrawal gross-up loop that previously
// hard-capped at exactly 2 convergence passes -- leaving any uncovered
// residual reported as a plan-failing "shortfall" regardless of portfolio
// size -- has been replaced with a one-shot analytical formula, per
// explicit direction ("no loops, one-shot formula should be the
// solution"). See PLATFORM_DEVELOPMENT_ROADMAP.md's finding B-4 for the
// original discovery.
//
// New helpers: marginalRateAt()/capitalGainsMarginalRateAt() (bracket-rate
// lookups, mirroring marginalTax()/capitalGainsTax()'s own bracket walks
// but returning the RATE at a given income level instead of the
// accumulated tax) and taxWithdrawalGrossRate() (the per-tax-class
// effective marginal rate a gross-up withdrawal is taxed at -- ordinary
// rate + Arizona + NIIT + early-withdrawal penalty for preTax; a realized-
// gains share times (capital-gains rate + Arizona + NIIT) for taxable;
// exactly 0 for roth/hsa). simulatePlan()'s gross-up cascade now computes
// W = remainingNeed/(1-grossRate) directly per class in a single pass
// through the withdrawal order, instead of withdrawing a guess,
// recomputing tax, and repeating.
//
// Corrected again 2026-09-08 (external audit finding AUD-001, task T02):
// the taxable branch originally used the CLASS-WIDE balance-weighted
// average basis to estimate gainsShare, even though withdrawFromClass()
// actually drains one specific account (in priority/optimized order) at a
// time -- undertaxing a low-basis account drained first, overtaxing a
// high-basis one. It now uses the actual basis of the account that will
// really be sold next (nextWithdrawAccount(), mirroring
// withdrawFromClass()'s own selection). Arizona's flat rate was also
// applied to the FULL sale proceeds including returned basis, although
// estimateTaxes() only ever taxes Arizona on realized gains -- Arizona is
// now scaled by gainsShare too. See RETIREMENT_ENGINE_AUDIT_CLAUDE_QUEUE_
// 2026-09-08.md and tests/audit-tax-transactions.test.js for the audit's
// own reproduction and the integration-level acceptance tests. This is a
// per-transaction rate fix only; T03 closes the actual cash settlement.
//
// S5 (the owner's question 1, answer C, 2026-09-14): taxWithdrawalGrossRate() had no caller once R2-T01's exact solver
// replaced the cascade, and it was deleted with its eight unit tests. The bracket-rate helpers and B-4 remain.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);
const RULES = global.RULES;

const engine = require('../src/engine.js');

// ---------------------------------------------------------------------------
// marginalRateAt
// ---------------------------------------------------------------------------

test('marginalRateAt: returns the lowest bracket\'s rate for income within it, and the top bracket\'s rate for very high income', () => {
  const brackets = RULES.federal.ordinaryBrackets.single;
  assert.equal(engine.marginalRateAt(1000, 'single'), brackets[0][1]);
  assert.equal(engine.marginalRateAt(1e9, 'single'), brackets[brackets.length - 1][1]);
});

test('marginalRateAt: exactly at a bracket cap returns THAT bracket\'s rate; one dollar over returns the next bracket\'s rate', () => {
  const brackets = RULES.federal.ordinaryBrackets.single;
  const cap = brackets[0][0];
  assert.equal(engine.marginalRateAt(cap, 'single'), brackets[0][1], 'the loop\'s own "income<=cap" condition means the cap itself still belongs to this bracket');
  assert.equal(engine.marginalRateAt(cap + 1, 'single'), brackets[1][1]);
});

test('marginalRateAt: filing status changes the bracket table used', () => {
  const singleBrackets = RULES.federal.ordinaryBrackets.single;
  const mfjBrackets = RULES.federal.ordinaryBrackets.mfj;
  const incomeBetween = singleBrackets[0][0] + 1; // past single's first cap
  assert.notEqual(engine.marginalRateAt(incomeBetween, 'single'), engine.marginalRateAt(incomeBetween, 'mfj'), 'test assumption: mfj\'s wider first bracket must still be in its first bracket here');
});

// ---------------------------------------------------------------------------
// capitalGainsMarginalRateAt
// ---------------------------------------------------------------------------

test('capitalGainsMarginalRateAt: below the first threshold is the 0% bracket; above the last is the top rate', () => {
  const brackets = RULES.federal.capitalGains.single;
  assert.equal(engine.capitalGainsMarginalRateAt(0, 'single'), brackets[0][1]);
  assert.equal(engine.capitalGainsMarginalRateAt(1e9, 'single'), brackets[brackets.length - 1][1]);
});

test('capitalGainsMarginalRateAt: exactly at a threshold returns that bracket\'s rate; one dollar over advances one bracket', () => {
  const brackets = RULES.federal.capitalGains.single;
  const cap = brackets[0][0];
  assert.equal(engine.capitalGainsMarginalRateAt(cap, 'single'), brackets[0][1]);
  assert.equal(engine.capitalGainsMarginalRateAt(cap + 1, 'single'), brackets[1][1]);
});

// ---------------------------------------------------------------------------
// Integration: the original B-4 reproduction no longer fails
// ---------------------------------------------------------------------------

test('B-4 fixed: the exact original reproduction plan ($145k salary, $740k across three accounts) no longer shows a false shortfall anywhere in a 71-year projection', () => {
  const defaultPlanMatch = shell.match(/var defaultPlan=(\{.*?\});/);
  // eslint-disable-next-line no-eval
  const defaultPlan = eval('(' + defaultPlanMatch[1] + ')');
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.accounts = [
    { id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 250000, contribution: 12000, contributionMode: 'amount', priority: 1, basisPct: 70, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 },
    { id: 'a2', name: '401k', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 400000, contribution: 15000, contributionMode: 'amount', priority: 2, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: true, matchCap: 5, matchRate: 100, profitShare: 0, vesting: 100 },
    { id: 'a3', name: 'Roth IRA', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 90000, contribution: 7000, contributionMode: 'amount', priority: 3, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 },
  ];
  p.employment.salary = 145000;

  const result = engine.runPlan(p);
  assert.equal(result.failed, false, 'the plan must no longer be marked failed');
  assert.equal(result.successRate, 100);
  assert.equal(result.firstShortfallAge, null);
  result.rows.forEach((row) => {
    assert.ok(row.shortfall < 0.01, `age ${row.age}: expected no meaningful shortfall, got ${row.shortfall}`);
  });
});
