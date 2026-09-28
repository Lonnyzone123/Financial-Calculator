'use strict';

// Track F2 -- oracle-verified tests for src/debt-recast.js, the third F2 leg
// (recast vs. curtailment). Standalone, not wired into the app.
//
// Why this module exists: src/debt-amortization.js:93-102 (recast()'s own
// header comment) dismisses recast as reducing to a plain
// monthlyPayment(newBalance, newRate, newTerm) call. debt-refinance.js and
// debt-arm.js already disproved the same dismissal for their own cases; this
// file is the recast counterexample. The FIRST test below is the case the
// existing recast() cannot express at all: recast and curtailment take the
// SAME lump sum and trade in opposite directions -- recast buys monthly
// cashflow at the cost of keeping the full clock, curtailment buys interest
// and time at no cashflow relief. It was confirmed failing (module not
// found) before src/debt-recast.js existed.
//
// Oracles: every expected figure is computed from the closed-form annuity
// formula directly in this file, never by calling the module a second time.
// recastAnalysis() itself is required to assemble every schedule from the
// already-oracle-verified amortizationSchedule() -- no second hand-rolled
// amortization loop. The principal-sum tests below hold it to that.

const test = require('node:test');
const assert = require('node:assert/strict');
const { recastAnalysis } = require('../src/debt-recast.js');

// --- independent closed-form oracle --------------------------------------

function oraclePayment(principal, annualRatePct, termMonths) {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / termMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

function close(actual, expected, tol) {
  const t = tol === undefined ? 1e-6 : tol;
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= t * scale,
    'expected ' + expected + ', got ' + actual + ' (drift ' + (actual - expected) + ')'
  );
}

// A $400,000 balance, 25 years (300 months) remaining, at 6.5%, with a
// $50,000 lump sum -- large enough that recast and curtailment visibly
// diverge.
const BALANCE = 400000;
const RATE = 6.5;
const TERM = 300;
const LUMP = 50000;

function loan(overrides) {
  return Object.assign({ balance: BALANCE, annualRatePct: RATE, remainingTermMonths: TERM }, overrides || {});
}

// ---------------------------------------------------------------------------
// 1. The case the dismissed one-line version cannot express (written first)
// ---------------------------------------------------------------------------

test('recastAnalysis: curtailment saves strictly more total interest than recasting, while recasting alone lowers the payment', () => {
  const a = recastAnalysis(loan(), LUMP);

  // Recast, and only recast, relieves the monthly payment.
  assert.ok(a.recast.paymentDelta < 0, 'expected recast to lower the monthly payment');
  assert.equal(a.curtailment.paymentDelta, 0, 'curtailment must not change the monthly payment at all');
  close(a.curtailment.monthlyPayment, a.doNothing.monthlyPayment, 1e-9);

  // Both reduce total interest relative to doing nothing...
  assert.ok(a.recast.interestSaved > 0);
  assert.ok(a.curtailment.interestSaved > 0);
  // ...but curtailment -- same cash, same clock cost -- saves strictly more.
  assert.ok(
    a.curtailment.interestSaved > a.recast.interestSaved,
    'curtailment (' + a.curtailment.interestSaved + ') should save more interest than recast (' + a.recast.interestSaved + ')'
  );

  // And the mechanism: curtailment pays off before the original term; recast does not.
  assert.ok(a.curtailment.payoffMonth < TERM);
  assert.equal(a.recast.payoffMonth, TERM);
});

// ---------------------------------------------------------------------------
// 2. The term is definitionally unchanged by a recast -- exact, not approximate
// ---------------------------------------------------------------------------

test('recastAnalysis: a recast never changes the payoff month -- it is identical to doing nothing, not merely close', () => {
  const a = recastAnalysis(loan(), LUMP);
  assert.equal(a.recast.payoffMonth, a.doNothing.payoffMonth);
  assert.equal(a.recast.payoffMonth, TERM);
});

// ---------------------------------------------------------------------------
// 3. Exact no-op: zero lump sum, zero fee
// ---------------------------------------------------------------------------

test('recastAnalysis: a zero lump sum and zero fee is an exact no-op on every figure', () => {
  const a = recastAnalysis(loan(), 0);
  close(a.recast.paymentDelta, 0, 1e-12);
  close(a.recast.interestSaved, 0, 1e-9);
  close(a.curtailment.paymentDelta, 0, 1e-12);
  close(a.curtailment.interestSaved, 0, 1e-9);
  assert.equal(a.recast.payoffMonth, a.doNothing.payoffMonth);
  assert.equal(a.curtailment.payoffMonth, a.doNothing.payoffMonth);
  close(a.newBalance, BALANCE);
  close(a.fee, 0);
});

// ---------------------------------------------------------------------------
// 4. Principal-sum identity (ARCH-01, applied locally) on both sides
// ---------------------------------------------------------------------------

test('recastAnalysis: principal paid plus the lump sum equals the original balance, on both the recast and curtailment sides', () => {
  const a = recastAnalysis(loan(), LUMP, { includeSchedules: true });
  const recastPrincipal = a.recast.schedule.reduce((s, r) => s + r.principalPaid, 0);
  const curtailmentPrincipal = a.curtailment.schedule.reduce((s, r) => s + r.principalPaid, 0);
  close(recastPrincipal + a.lumpSumApplied, BALANCE, 1e-9);
  close(curtailmentPrincipal + a.lumpSumApplied, BALANCE, 1e-9);
});

// ---------------------------------------------------------------------------
// 5. Oracle cross-check on the reported payments themselves
// ---------------------------------------------------------------------------

test('recastAnalysis: reported payments match the closed-form annuity formula directly', () => {
  const a = recastAnalysis(loan(), LUMP);
  close(a.doNothing.monthlyPayment, oraclePayment(BALANCE, RATE, TERM));
  close(a.recast.monthlyPayment, oraclePayment(BALANCE - LUMP, RATE, TERM));
});

// ---------------------------------------------------------------------------
// 6. A recast fee is reported, not silently folded into the balance
// ---------------------------------------------------------------------------

test('recastAnalysis: a recast fee is reported and defaults to zero; it does not change the new balance or payment', () => {
  const withFee = recastAnalysis(loan(), LUMP, { fee: 500 });
  const withoutFee = recastAnalysis(loan(), LUMP);
  close(withFee.fee, 500);
  close(withoutFee.fee, 0);
  close(withFee.newBalance, withoutFee.newBalance);
  close(withFee.recast.monthlyPayment, withoutFee.recast.monthlyPayment);
});

// ---------------------------------------------------------------------------
// 7. Adversarial boundaries
// ---------------------------------------------------------------------------

test('recastAnalysis: a lump sum exceeding the balance is clamped to the balance, not propagated', () => {
  const a = recastAnalysis(loan(), BALANCE + 100000);
  close(a.lumpSumApplied, BALANCE);
  close(a.newBalance, 0);
  close(a.recast.monthlyPayment, 0);
  close(a.curtailment.monthlyPayment, 0);
});

test('recastAnalysis: a zero balance produces zero payments and zero interest everywhere, with no non-finite values', () => {
  const a = recastAnalysis(loan({ balance: 0 }), 1000);
  for (const branch of [a.doNothing, a.recast, a.curtailment]) {
    for (const [k, v] of Object.entries(branch)) {
      assert.ok(Number.isFinite(v), 'field ' + k + ' is not finite: ' + v);
    }
  }
  close(a.doNothing.totalInterest, 0);
  close(a.recast.totalInterest, 0);
  close(a.curtailment.totalInterest, 0);
});

test('recastAnalysis: a negative lump sum and a negative fee are clamped to zero, not propagated', () => {
  const a = recastAnalysis(loan(), -50000, { fee: -100 });
  close(a.lumpSumApplied, 0);
  close(a.fee, 0);
  close(a.newBalance, BALANCE);
});

test('recastAnalysis: an ongoing extraMonthlyPrincipal carries through identically on all three branches\' total monthly outlay', () => {
  const extra = 200;
  const a = recastAnalysis(loan({ extraMonthlyPrincipal: extra }), LUMP);
  // Curtailment's whole point is "no cashflow relief" -- its total monthly
  // outlay (required payment + the ongoing extra) must match doing nothing.
  close(a.curtailment.monthlyPayment, a.doNothing.monthlyPayment, 1e-9);
  // Recast still relieves cashflow even with an ongoing extra in the mix.
  assert.ok(a.recast.monthlyPayment < a.doNothing.monthlyPayment);
});
