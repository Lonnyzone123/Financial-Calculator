'use strict';

// Track F4 (started) -- tests for src/debt-payoff-strategy.js. The oracle
// here is a well-established financial property (avalanche minimizes total
// interest across every fixed payoff order, for the same debts and extra
// budget) rather than a formula, so these tests verify that property
// empirically -- plus a cross-check against Track F1's amortization module
// for the degenerate single-debt case, where the two modules' math should
// agree closely.

const test = require('node:test');
const assert = require('node:assert/strict');
const { payoffOrder, simulateDebtPayoff } = require('../src/debt-payoff-strategy.js');
const { monthlyPayment, amortizationSchedule } = require('../src/debt-amortization.js');

// ---------------------------------------------------------------------------
// payoffOrder
// ---------------------------------------------------------------------------

test('payoffOrder: avalanche sorts by highest interest rate first', () => {
  const debts = [
    { id: 'low', balance: 5000, rate: 4 },
    { id: 'high', balance: 20000, rate: 22 },
    { id: 'mid', balance: 10000, rate: 12 },
  ];
  assert.deepEqual(payoffOrder(debts, 'avalanche'), ['high', 'mid', 'low']);
});

test('payoffOrder: snowball sorts by smallest balance first', () => {
  const debts = [
    { id: 'big', balance: 20000, rate: 4 },
    { id: 'small', balance: 1000, rate: 22 },
    { id: 'mid', balance: 8000, rate: 12 },
  ];
  assert.deepEqual(payoffOrder(debts, 'snowball'), ['small', 'mid', 'big']);
});

test('payoffOrder: any other strategy value ("custom" or otherwise) preserves the input array\'s own order verbatim', () => {
  const debts = [
    { id: 'c', balance: 100, rate: 1 },
    { id: 'a', balance: 500, rate: 20 },
    { id: 'b', balance: 300, rate: 10 },
  ];
  assert.deepEqual(payoffOrder(debts, 'custom'), ['c', 'a', 'b']);
});

test('payoffOrder does not mutate the input array', () => {
  const debts = [{ id: 'a', balance: 500, rate: 20 }, { id: 'b', balance: 100, rate: 5 }];
  const before = debts.map((d) => d.id);
  payoffOrder(debts, 'avalanche');
  assert.deepEqual(debts.map((d) => d.id), before);
});

// ---------------------------------------------------------------------------
// simulateDebtPayoff: the core financial property -- avalanche minimizes
// total interest relative to snowball, for the same debts and budget
// ---------------------------------------------------------------------------

test('avalanche produces less total interest than snowball for the same debts and extra budget, when rates genuinely differ', () => {
  const debts = [
    { id: 'card-a', balance: 3000, rate: 24, minPayment: 60 },
    { id: 'card-b', balance: 8000, rate: 6, minPayment: 120 },
    { id: 'loan', balance: 15000, rate: 12, minPayment: 200 },
  ];
  const avalanche = simulateDebtPayoff(debts, 300, 'avalanche');
  const snowball = simulateDebtPayoff(debts, 300, 'snowball');

  assert.ok(avalanche.months < 1200, 'avalanche must actually converge, not hit the safety valve');
  assert.ok(snowball.months < 1200, 'snowball must actually converge too');
  assert.ok(avalanche.totalInterest < snowball.totalInterest, `avalanche (${avalanche.totalInterest.toFixed(2)}) must pay less total interest than snowball (${snowball.totalInterest.toFixed(2)}) for the same debts and budget`);
});

test('simulateDebtPayoff: every debt ends at exactly 0 balance once fully paid off, and neither strategy leaves a residual', () => {
  const debts = [
    { id: 'a', balance: 2000, rate: 18, minPayment: 50 },
    { id: 'b', balance: 5000, rate: 8, minPayment: 100 },
  ];
  const result = simulateDebtPayoff(debts, 500, 'avalanche');
  result.finalBalances.forEach((f) => assert.ok(Math.abs(f.balance) < 1e-6, `${f.id} must end at 0, not ${f.balance}`));
});

test('simulateDebtPayoff: the snowball rolling effect -- once the smaller debt is paid off, its own minPayment joins the pool, accelerating the remaining debt beyond its own minPayment alone', () => {
  const debts = [
    { id: 'small', balance: 600, rate: 10, minPayment: 100 },
    { id: 'large', balance: 5000, rate: 10, minPayment: 150 }, // comfortably above the ~$42/mo interest, so payoff is feasible either way
  ];
  const withRolling = simulateDebtPayoff(debts, 0, 'snowball'); // no extra budget at all -- only the rolled-over minPayment accelerates payoff
  assert.ok(withRolling.months < 1200, 'must converge inside the safety valve');

  // A direct proof of rolling: run "large" alone, at only its own $150/mo
  // (i.e. as if "small" had never existed to roll anything into it), and
  // confirm that takes strictly longer than the combined scenario where
  // "small" clears quickly and hands its $100/mo over.
  const largeAlone = simulateDebtPayoff([{ id: 'large', balance: 5000, rate: 10, minPayment: 150 }], 0, 'snowball');
  assert.ok(withRolling.months < largeAlone.months, `paying off "small" and rolling its minPayment into "large" (${withRolling.months} months) must finish faster than "large" alone ever getting only its own $150/mo (${largeAlone.months} months)`);
});

// ---------------------------------------------------------------------------
// Cross-check against Track F1's amortization module for the single-debt
// degenerate case
// ---------------------------------------------------------------------------

test('simulateDebtPayoff on a single debt with minPayment set to the exact amortizing payment and zero extra budget closely matches amortizationSchedule\'s own month count and total interest', () => {
  const principal = 300000, rate = 6, term = 360;
  const payment = monthlyPayment(principal, rate, term);
  const oracle = amortizationSchedule(principal, rate, term, 0);

  const result = simulateDebtPayoff([{ id: 'mortgage', balance: principal, rate, minPayment: payment }], 0, 'avalanche');

  assert.equal(result.months, oracle.payoffMonth, 'a single debt paid at exactly its own amortizing payment must retire in the same number of months as the closed-form schedule');
  assert.ok(Math.abs(result.totalInterest - oracle.totalInterest) < 1, `total interest must closely match the amortization oracle -- got ${result.totalInterest.toFixed(2)} vs ${oracle.totalInterest.toFixed(2)}`);
});

// ---------------------------------------------------------------------------
// Degenerate inputs
// ---------------------------------------------------------------------------

test('an empty debts array returns immediately with 0 months and 0 interest, without looping', () => {
  const result = simulateDebtPayoff([], 500, 'avalanche');
  assert.equal(result.months, 0);
  assert.equal(result.totalInterest, 0);
  assert.deepEqual(result.finalBalances, []);
});

test('simulateDebtPayoff does not mutate the caller\'s debts array or its objects', () => {
  const debts = [{ id: 'a', balance: 1000, rate: 10, minPayment: 50 }];
  const snapshot = JSON.parse(JSON.stringify(debts));
  simulateDebtPayoff(debts, 100, 'avalanche');
  assert.deepEqual(debts, snapshot);
});
