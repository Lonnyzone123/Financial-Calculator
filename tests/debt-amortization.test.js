'use strict';

// Track F1 -- oracle-verified tests for src/debt-amortization.js, a new
// standalone amortization module (not yet wired into the app). The
// closed-form fixed-payment annuity formula (PMT = P*r/(1-(1+r)^-n)) is
// used both as monthlyPayment()'s own implementation and, independently, as
// an oracle in these tests: a full no-extra-principal schedule must retire
// the loan in exactly n months and its total interest must equal
// payment*n - principal (the sum of all payments minus the principal
// itself), computed here from the formula directly, not by calling the
// module a second time.

const test = require('node:test');
const assert = require('node:assert/strict');
const { monthlyPayment, amortizationSchedule, recast } = require('../src/debt-amortization.js');

function closedFormPayment(principal, annualRatePct, termMonths) {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / termMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

// ---------------------------------------------------------------------------
// monthlyPayment
// ---------------------------------------------------------------------------

test('monthlyPayment: matches the closed-form annuity formula for a standard 30-year mortgage', () => {
  const expected = closedFormPayment(300000, 6, 360);
  assert.ok(Math.abs(monthlyPayment(300000, 6, 360) - expected) < 1e-9);
});

test('monthlyPayment: a 0% rate falls back to straight-line principal/n (the closed-form formula\'s removable singularity at r=0)', () => {
  assert.ok(Math.abs(monthlyPayment(120000, 0, 120) - 1000) < 1e-9);
});

test('monthlyPayment: a non-positive principal or term returns exactly 0', () => {
  assert.equal(monthlyPayment(0, 6, 360), 0);
  assert.equal(monthlyPayment(-5000, 6, 360), 0);
  assert.equal(monthlyPayment(300000, 6, 0), 0);
  assert.equal(monthlyPayment(300000, 6, -12), 0);
});

test('monthlyPayment: a negative rate is clamped to 0, not treated as negative interest', () => {
  assert.equal(monthlyPayment(120000, -5, 120), monthlyPayment(120000, 0, 120));
});

// ---------------------------------------------------------------------------
// amortizationSchedule: the closed-form oracle cross-check
// ---------------------------------------------------------------------------

test('amortizationSchedule: with no extra principal, a schedule retires the loan in EXACTLY n months', () => {
  const { schedule, payoffMonth } = amortizationSchedule(300000, 6, 360, 0);
  assert.equal(schedule.length, 360);
  assert.equal(payoffMonth, 360);
  assert.ok(Math.abs(schedule[359].balance) < 1e-6, 'the final balance must be (numerically) exactly 0');
});

test('amortizationSchedule: total interest matches the closed-form oracle (payment*n - principal), computed independently here', () => {
  const principal = 300000, rate = 6, term = 360;
  const { totalInterest, monthlyPayment: payment } = amortizationSchedule(principal, rate, term, 0);
  const oracleTotalInterest = closedFormPayment(principal, rate, term) * term - principal;
  assert.ok(Math.abs(totalInterest - oracleTotalInterest) < 1e-3, `schedule totalInterest (${totalInterest}) must match the closed-form oracle (${oracleTotalInterest})`);
  assert.ok(Math.abs(payment - closedFormPayment(principal, rate, term)) < 1e-9);
});

test('amortizationSchedule: sum of every month\'s principalPaid equals the original principal exactly (a reconciliation invariant)', () => {
  const { schedule } = amortizationSchedule(250000, 4.5, 180, 0);
  const totalPrincipalPaid = schedule.reduce((sum, row) => sum + row.principalPaid, 0);
  assert.ok(Math.abs(totalPrincipalPaid - 250000) < 1e-6);
});

test('amortizationSchedule: the first month\'s interest/principal split matches balance*rate exactly', () => {
  const principal = 300000, rate = 6, term = 360;
  const { schedule, monthlyPayment: payment } = amortizationSchedule(principal, rate, term, 0);
  const r = rate / 100 / 12;
  const expectedInterest = principal * r;
  assert.ok(Math.abs(schedule[0].interestPaid - expectedInterest) < 1e-9);
  assert.ok(Math.abs(schedule[0].principalPaid - (payment - expectedInterest)) < 1e-9);
});

// ---------------------------------------------------------------------------
// Zero-rate degenerate case
// ---------------------------------------------------------------------------

test('amortizationSchedule: a 0% rate produces a purely linear schedule -- equal principal every month, zero interest throughout', () => {
  const { schedule, totalInterest } = amortizationSchedule(120000, 0, 120, 0);
  assert.equal(schedule.length, 120);
  assert.equal(totalInterest, 0);
  schedule.forEach((row) => {
    assert.equal(row.interestPaid, 0);
    assert.ok(Math.abs(row.principalPaid - 1000) < 1e-9);
  });
});

// ---------------------------------------------------------------------------
// Extra principal: accelerates payoff, reduces total interest, and never
// overshoots the remaining balance on the final month
// ---------------------------------------------------------------------------

test('extra monthly principal shortens the payoff month and reduces total interest relative to the same loan with no extra principal', () => {
  const withoutExtra = amortizationSchedule(300000, 6, 360, 0);
  const withExtra = amortizationSchedule(300000, 6, 360, 500);
  assert.ok(withExtra.payoffMonth < withoutExtra.payoffMonth, 'extra principal must pay the loan off sooner');
  assert.ok(withExtra.totalInterest < withoutExtra.totalInterest, 'extra principal must reduce total interest paid');
});

test('the final month\'s principal payment never exceeds the remaining balance, even with a large extra principal', () => {
  const { schedule } = amortizationSchedule(10000, 6, 60, 5000); // large extra relative to balance
  const last = schedule[schedule.length - 1];
  assert.ok(last.balance >= 0, 'balance must never go negative');
  const totalPrincipalPaid = schedule.reduce((sum, row) => sum + row.principalPaid, 0);
  assert.ok(Math.abs(totalPrincipalPaid - 10000) < 1e-6, 'even with overshoot-prone extra principal, total principal paid must equal exactly the original balance, not more');
});

test('an extra principal large enough to pay off the loan in month 1 produces a one-row schedule', () => {
  const { schedule, payoffMonth } = amortizationSchedule(1000, 6, 360, 1000000);
  assert.equal(schedule.length, 1);
  assert.equal(payoffMonth, 1);
  assert.equal(schedule[0].balance, 0);
});

// ---------------------------------------------------------------------------
// Degenerate inputs
// ---------------------------------------------------------------------------

test('a non-positive principal or term produces an empty schedule and a payoffMonth of 0, without throwing', () => {
  assert.deepEqual(amortizationSchedule(0, 6, 360, 0).schedule, []);
  assert.equal(amortizationSchedule(0, 6, 360, 0).payoffMonth, 0);
  assert.deepEqual(amortizationSchedule(300000, 6, 0, 0).schedule, []);
  assert.doesNotThrow(() => amortizationSchedule(-5000, 6, 360, 0));
});

// ---------------------------------------------------------------------------
// recast (Track F2, started): lump-sum principal reduction, same rate and
// remaining term, lower resulting payment -- oracle-cross-checked by
// feeding the recast's own output balance/payment back into a fresh
// amortizationSchedule and confirming it retires in exactly the same
// remaining term.
// ---------------------------------------------------------------------------

test('recast: a lump sum reduces the balance and lowers the monthly payment, while a fresh schedule at the new balance/payment still retires in exactly the same remaining term', () => {
  const remainingTerm = 300; // 25 years remaining on an original 30-year loan
  const currentBalance = 280000, rate = 6, lumpSum = 50000;
  const { newBalance, newMonthlyPayment, lumpSumApplied } = recast(currentBalance, rate, remainingTerm, lumpSum);

  assert.equal(newBalance, 230000);
  assert.equal(lumpSumApplied, 50000);
  assert.ok(newMonthlyPayment < monthlyPayment(currentBalance, rate, remainingTerm), 'the recast payment must be lower than the pre-recast payment');

  // Oracle cross-check: an amortizationSchedule built from the recast's own
  // output must retire in exactly `remainingTerm` months, confirming the
  // new payment genuinely fully amortizes the reduced balance over that
  // term (not just "a lower number", but the *correct* lower number).
  const { payoffMonth, schedule } = amortizationSchedule(newBalance, rate, remainingTerm, 0);
  assert.equal(payoffMonth, remainingTerm);
  assert.ok(Math.abs(schedule[schedule.length - 1].balance) < 1e-6);
  assert.ok(Math.abs(schedule[0].payment - newMonthlyPayment) < 1e-6, 'the schedule\'s own computed payment must match recast\'s reported newMonthlyPayment exactly');
});

test('recast: a lump sum larger than the current balance is capped at the balance -- it cannot recast to a negative balance', () => {
  const { newBalance, lumpSumApplied } = recast(10000, 6, 120, 50000);
  assert.equal(newBalance, 0);
  assert.equal(lumpSumApplied, 10000, 'only the actual balance can be "applied", not the requested 50000');
});

test('recast: a zero or negative lump sum leaves the balance and payment unchanged from a plain re-amortization at the same terms', () => {
  const { newBalance, newMonthlyPayment } = recast(200000, 6, 240, 0);
  assert.equal(newBalance, 200000);
  assert.ok(Math.abs(newMonthlyPayment - monthlyPayment(200000, 6, 240)) < 1e-9);

  const withNegative = recast(200000, 6, 240, -1000);
  assert.equal(withNegative.newBalance, 200000, 'a negative lump sum must be clamped to 0, not treated as adding to the balance');
});
