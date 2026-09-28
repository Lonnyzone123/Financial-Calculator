'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { effectiveRateNow, currentApproachOutcome, consolidatedStrategyOutcome, compareDebtStrategies } = require('../src/debt-strategy-adapter');
const { simulateDebtPayoff } = require('../src/debt-payoff-strategy');

function makeDebt(overrides) {
  return Object.assign({
    id: 'd1', balance: 300000, rate: 6.5, paymentMonthly: 1896.20, extraPrincipalMonthly: 0,
    remainingTermYears: 30, rateType: 'fixed', nextRateResetAge: 75, resetRate: 6.5,
  }, overrides);
}

test('effectiveRateNow: fixed-rate debts always use their current rate, regardless of nextRateResetAge', () => {
  const debt = makeDebt({ rateType: 'fixed', rate: 6.5, resetRate: 9.0, nextRateResetAge: 40 });
  assert.equal(effectiveRateNow(debt, 30), 6.5);
  assert.equal(effectiveRateNow(debt, 50), 6.5);
});

test('effectiveRateNow: adjustable-rate debts switch to resetRate exactly at nextRateResetAge, matching projectDebts()', () => {
  const debt = makeDebt({ rateType: 'adjustable', rate: 5.0, resetRate: 7.5, nextRateResetAge: 45 });
  assert.equal(effectiveRateNow(debt, 44.99), 5.0, 'one tick before reset still uses the current rate');
  assert.equal(effectiveRateNow(debt, 45), 7.5, 'exactly at reset age already uses the post-reset rate');
  assert.equal(effectiveRateNow(debt, 50), 7.5);
});

test('currentApproachOutcome: a single debt matches simulateDebtPayoff() called directly with the same payment and extra principal', () => {
  // paymentMonthly is deliberately the TRUE closed-form amortizing payment
  // here (so this debt actually retires within its stated term) -- the
  // point of this test is confirming the pass-through composition, not
  // re-testing amortization math itself (that's Track F1's own test file).
  const debt = makeDebt({ id: 'd1', balance: 250000, rate: 6.0, paymentMonthly: 1610.75, extraPrincipalMonthly: 100 });
  const outcome = currentApproachOutcome([debt], 40);
  const direct = simulateDebtPayoff([{ id: 'd1', balance: 250000, rate: 6.0, minPayment: 1610.75 }], 100, 'avalanche');
  assert.equal(outcome.monthsUntilDebtFree, direct.months);
  assert.ok(Math.abs(outcome.totalInterest - direct.totalInterest) < 1e-6);
  assert.equal(outcome.perDebt.length, 1);
  assert.equal(outcome.perDebt[0].id, debt.id);
});

test('currentApproachOutcome: multiple debts sum interest but take the MAX payoff month (they run in parallel, not sequentially)', () => {
  const shortDebt = makeDebt({ id: 'car', balance: 20000, rate: 7.0, paymentMonthly: 396 });
  const longDebt = makeDebt({ id: 'mortgage', balance: 300000, rate: 6.5, paymentMonthly: 1896.20 });
  const outcome = currentApproachOutcome([shortDebt, longDebt], 40);
  const carDirect = simulateDebtPayoff([{ id: 'car', balance: 20000, rate: 7.0, minPayment: 396 }], 0, 'avalanche');
  const mortgageDirect = simulateDebtPayoff([{ id: 'mortgage', balance: 300000, rate: 6.5, minPayment: 1896.20 }], 0, 'avalanche');
  assert.ok(Math.abs(outcome.totalInterest - (carDirect.totalInterest + mortgageDirect.totalInterest)) < 1e-6);
  assert.equal(outcome.monthsUntilDebtFree, Math.max(carDirect.months, mortgageDirect.months), 'debt-free date is the LAST debt to clear, not the sum of both terms');
});

test('currentApproachOutcome: a zero-balance (already paid off) debt is excluded entirely', () => {
  const paidOff = makeDebt({ id: 'paid', balance: 0 });
  const active = makeDebt({ id: 'active', balance: 100000, remainingTermYears: 10 });
  const outcome = currentApproachOutcome([paidOff, active], 40);
  assert.equal(outcome.perDebt.length, 1);
  assert.equal(outcome.perDebt[0].id, 'active');
});

test('consolidatedStrategyOutcome: extraMonthlyBudget is the sum of every active debt\'s own extraPrincipalMonthly', () => {
  const a = makeDebt({ id: 'a', balance: 10000, rate: 20, paymentMonthly: 300, extraPrincipalMonthly: 50 });
  const b = makeDebt({ id: 'b', balance: 20000, rate: 8, paymentMonthly: 400, extraPrincipalMonthly: 75 });
  const outcome = consolidatedStrategyOutcome([a, b], 40, 'avalanche');
  const direct = simulateDebtPayoff(
    [{ id: 'a', balance: 10000, rate: 20, minPayment: 300 }, { id: 'b', balance: 20000, rate: 8, minPayment: 400 }],
    125, // 50 + 75
    'avalanche'
  );
  assert.equal(outcome.totalInterest, direct.totalInterest);
  assert.equal(outcome.months, direct.months);
});

test('consolidatedStrategyOutcome: uses paymentMonthly as minPayment, not a recomputed amortizing payment', () => {
  // A user-entered payment that does NOT match the closed-form amortizing
  // figure for this balance/rate/term -- the adapter must respect what the
  // household actually pays, not silently substitute a "correct" one.
  const debt = makeDebt({ balance: 100000, rate: 6.0, paymentMonthly: 2000, remainingTermYears: 30 });
  const outcome = consolidatedStrategyOutcome([debt], 40, 'avalanche');
  const direct = simulateDebtPayoff([{ id: debt.id, balance: 100000, rate: 6.0, minPayment: 2000 }], 0, 'avalanche');
  assert.equal(outcome.totalInterest, direct.totalInterest);
});

test('compareDebtStrategies: with a real extra budget and genuinely different rates, avalanche saves at least as much interest as the current independent-parallel approach', () => {
  // High-rate credit card (small balance) alongside a low-rate mortgage,
  // with the household currently splitting $150/mo extra between them
  // (independently, per the calculator's own model) -- avalanche
  // consolidating that into the credit card first should do strictly
  // better, the same avalanche-optimality property already proven in
  // debt-payoff-strategy.test.js, now proven again through this adapter's
  // own composition rather than assumed to carry over automatically.
  const creditCard = makeDebt({ id: 'cc', balance: 8000, rate: 22.0, paymentMonthly: 200, extraPrincipalMonthly: 100, remainingTermYears: 4 });
  const mortgage = makeDebt({ id: 'mortgage', balance: 300000, rate: 6.5, paymentMonthly: 1896.20, extraPrincipalMonthly: 50, remainingTermYears: 30 });
  const comparison = compareDebtStrategies([creditCard, mortgage], 40);

  assert.ok(comparison.avalancheInterestSaved > 0, `avalanche should save real interest here, got ${comparison.avalancheInterestSaved}`);
  assert.ok(comparison.avalanche.totalInterest < comparison.current.totalInterest, 'avalanche total interest must be strictly lower than the current split approach');
});

test('compareDebtStrategies: a single debt with no extra budget produces identical current/avalanche/snowball outcomes', () => {
  // With only one debt, there is nothing to prioritize between and no
  // shared-pool rolling effect can differ from independent amortization --
  // all three framings must agree exactly.
  const debt = makeDebt({ balance: 50000, rate: 7.0, paymentMonthly: 600, extraPrincipalMonthly: 0, remainingTermYears: 8 });
  const comparison = compareDebtStrategies([debt], 40);
  assert.ok(Math.abs(comparison.avalancheInterestSaved) < 1e-6, 'no extra budget and one debt: nothing for a strategy to change');
  assert.ok(Math.abs(comparison.snowballInterestSaved) < 1e-6);
  assert.equal(comparison.current.monthsUntilDebtFree, comparison.avalanche.months);
});

test('compareDebtStrategies: an empty debt list is a safe no-op, not a crash', () => {
  const comparison = compareDebtStrategies([], 40);
  assert.equal(comparison.current.totalInterest, 0);
  assert.equal(comparison.avalanche.totalInterest, 0);
  assert.equal(comparison.current.monthsUntilDebtFree, 0);
});
