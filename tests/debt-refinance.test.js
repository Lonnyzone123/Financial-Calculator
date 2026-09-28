'use strict';

// Track F2 -- oracle-verified tests for src/debt-refinance.js, a new
// standalone refinance-analysis module (not wired into the app).
//
// Why this module exists at all: src/debt-amortization.js:93-102 (recast()'s
// header) claims a refinance "reduces to a plain monthlyPayment(newBalance,
// newRate, newTerm) call and doesn't need a dedicated function of its own."
// The FIRST test below is the counterexample -- refinancing at year 7 of a
// 30-year into a fresh 30-year at a LOWER rate increases lifetime interest.
// A function that returns only a payment cannot express that, because the
// payment goes down while the thing that matters goes up. It was confirmed
// failing before the module existed.
//
// Oracles: every expected figure here is computed from the closed-form
// annuity formula directly in this file -- payment, balance after n
// payments, and total interest -- never by calling the module a second
// time. The module itself is required to assemble both sides from the
// already-oracle-verified amortizationSchedule() rather than from a second
// hand-rolled amortization loop; the principal-sum identity tests below are
// what hold it to that.

const test = require('node:test');
const assert = require('node:assert/strict');
const { refinanceAnalysis, DEFAULT_HORIZON } = require('../src/debt-refinance.js');

// --- independent closed-form oracles -------------------------------------

function oraclePayment(principal, annualRatePct, termMonths) {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / termMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

// Balance remaining after n scheduled payments:
//   B = P(1+r)^n - PMT*((1+r)^n - 1)/r
function oracleBalanceAfter(principal, annualRatePct, termMonths, n) {
  const r = annualRatePct / 100 / 12;
  const pmt = oraclePayment(principal, annualRatePct, termMonths);
  if (r === 0) return principal - pmt * n;
  const g = Math.pow(1 + r, n);
  return principal * g - pmt * (g - 1) / r;
}

function oracleTotalInterest(principal, annualRatePct, termMonths) {
  return oraclePayment(principal, annualRatePct, termMonths) * termMonths - principal;
}

function close(actual, expected, tol) {
  const t = tol === undefined ? 1e-6 : tol;
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= t * scale,
    'expected ' + expected + ', got ' + actual + ' (drift ' + (actual - expected) + ')'
  );
}

// The headline case, shared by several tests below: a $400,000 30-year at
// 6.5%, refinanced after exactly 7 years (84 payments) into a fresh 30-year
// at 5.75%.
const ORIGINAL_PRINCIPAL = 400000;
const ORIGINAL_RATE = 6.5;
const ORIGINAL_TERM = 360;
const MONTHS_ELAPSED = 84;
const BALANCE_AT_YEAR_7 = oracleBalanceAfter(ORIGINAL_PRINCIPAL, ORIGINAL_RATE, ORIGINAL_TERM, MONTHS_ELAPSED);
const REMAINING_TERM = ORIGINAL_TERM - MONTHS_ELAPSED; // 276

function yearSevenCurrent() {
  return { balance: BALANCE_AT_YEAR_7, annualRatePct: ORIGINAL_RATE, remainingTermMonths: REMAINING_TERM };
}

// ---------------------------------------------------------------------------
// 1. The case the dismissed one-line version cannot express (written first)
// ---------------------------------------------------------------------------

test('refinanceAnalysis: a year-7 refi into a fresh 30-year at a LOWER rate raises lifetime interest even though the payment falls', () => {
  const a = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 5.75, termMonths: 360, closingCosts: 0 }
  );

  // The payment genuinely falls -- this is what makes the naive view wrong.
  assert.ok(a.monthlyPaymentDelta < 0, 'expected the monthly payment to fall');
  close(a.current.monthlyPayment, oraclePayment(ORIGINAL_PRINCIPAL, ORIGINAL_RATE, ORIGINAL_TERM));
  close(a.replacement.monthlyPayment, oraclePayment(BALANCE_AT_YEAR_7, 5.75, 360));

  // ...and lifetime interest from the decision point forward nonetheless RISES.
  const stayInterest = oraclePayment(ORIGINAL_PRINCIPAL, ORIGINAL_RATE, ORIGINAL_TERM) * REMAINING_TERM - BALANCE_AT_YEAR_7;
  const refiInterest = oracleTotalInterest(BALANCE_AT_YEAR_7, 5.75, 360);
  close(a.lifetime.interestIfStay, stayInterest);
  close(a.lifetime.interestIfRefinance, refiInterest);
  close(a.lifetime.interestDelta, refiInterest - stayInterest);
  assert.ok(a.lifetime.interestDelta > 0, 'expected lifetime interest to INCREASE');

  // And the mechanism is named explicitly, not left for the reader to infer.
  assert.equal(a.clockExtensionMonths, 360 - REMAINING_TERM);
  assert.ok(a.clockExtensionMonths > 0);
});

// ---------------------------------------------------------------------------
// 2. Exact no-op
// ---------------------------------------------------------------------------

test('refinanceAnalysis: a zero-cost, same-rate, same-term refinance is an exact no-op with no break-even', () => {
  const a = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: ORIGINAL_RATE, termMonths: REMAINING_TERM, closingCosts: 0 }
  );
  close(a.monthlyPaymentDelta, 0, 1e-12);
  close(a.lifetime.interestDelta, 0, 1e-12);
  close(a.horizon.interestDelta, 0, 1e-12);
  assert.equal(a.clockExtensionMonths, 0);
  assert.equal(a.breakEvenMonth, null, 'an exact no-op must never report a break-even');
  assert.equal(a.cashFlowBreakEvenMonth, null);
});

// ---------------------------------------------------------------------------
// 3. Principal-sum identity (ARCH-01, applied locally) on BOTH sides
// ---------------------------------------------------------------------------

test('refinanceAnalysis: principal paid sums to exactly the starting balance on each side', () => {
  const a = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 5.75, termMonths: 360, closingCosts: 6000, financeClosingCosts: true },
    { includeSeries: true }
  );
  const stayPrincipal = a.series.reduce(function (s, r) { return s + r.stayPrincipal; }, 0);
  const refiPrincipal = a.series.reduce(function (s, r) { return s + r.refinancePrincipal; }, 0);
  close(stayPrincipal, a.current.balance, 1e-9);
  close(refiPrincipal, a.replacement.balance, 1e-9);
});

test('refinanceAnalysis: interest paid sums to the reported lifetime interest on each side', () => {
  const a = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 5.75, termMonths: 360, closingCosts: 0 },
    { includeSeries: true }
  );
  const stayInterest = a.series.reduce(function (s, r) { return s + r.stayInterest; }, 0);
  const refiInterest = a.series.reduce(function (s, r) { return s + r.refinanceInterest; }, 0);
  close(stayInterest, a.lifetime.interestIfStay, 1e-9);
  close(refiInterest, a.lifetime.interestIfRefinance, 1e-9);
});

// ---------------------------------------------------------------------------
// 4. Closing costs: financed into the balance vs paid out of pocket
// ---------------------------------------------------------------------------

test('refinanceAnalysis: financed closing costs raise the new balance and payment; paid costs leave the balance alone', () => {
  const financed = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 5.75, termMonths: 360, closingCosts: 6000, financeClosingCosts: true }
  );
  const paid = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 5.75, termMonths: 360, closingCosts: 6000, financeClosingCosts: false }
  );

  close(financed.replacement.balance, BALANCE_AT_YEAR_7 + 6000);
  close(paid.replacement.balance, BALANCE_AT_YEAR_7);
  close(financed.replacement.monthlyPayment, oraclePayment(BALANCE_AT_YEAR_7 + 6000, 5.75, 360));
  close(paid.replacement.monthlyPayment, oraclePayment(BALANCE_AT_YEAR_7, 5.75, 360));

  // The cash consequence at closing is the mirror image of the balance one.
  close(financed.replacement.cashAtClosing, 0);
  close(paid.replacement.cashAtClosing, -6000);
  assert.equal(financed.replacement.closingCostsFinanced, true);
  assert.equal(paid.replacement.closingCostsFinanced, false);

  // Financing costs money: more interest than paying the same costs in cash.
  assert.ok(financed.lifetime.interestIfRefinance > paid.lifetime.interestIfRefinance);
});

// ---------------------------------------------------------------------------
// 5. Cash-out
// ---------------------------------------------------------------------------

test('refinanceAnalysis: cash-out raises the new balance by exactly the cash taken and is reported as cash received', () => {
  const a = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 5.75, termMonths: 360, closingCosts: 4000, financeClosingCosts: false, cashOut: 50000 }
  );
  close(a.replacement.balance, BALANCE_AT_YEAR_7 + 50000);
  close(a.replacement.cashOut, 50000);
  close(a.replacement.cashAtClosing, 50000 - 4000);
  close(a.replacement.monthlyPayment, oraclePayment(BALANCE_AT_YEAR_7 + 50000, 5.75, 360));
});

test('refinanceAnalysis: cash-out and financed closing costs stack onto the new balance together', () => {
  const a = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 5.75, termMonths: 360, closingCosts: 4000, financeClosingCosts: true, cashOut: 50000 }
  );
  close(a.replacement.balance, BALANCE_AT_YEAR_7 + 50000 + 4000);
  close(a.replacement.cashAtClosing, 50000);
});

// ---------------------------------------------------------------------------
// 6. The stated common horizon
// ---------------------------------------------------------------------------

test('refinanceAnalysis: the default horizon is the longer of the two terms, and both loans are retired inside it', () => {
  const a = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 5.75, termMonths: 360, closingCosts: 0 }
  );
  assert.equal(a.horizonMonths, Math.max(REMAINING_TERM, 360));
  assert.equal(a.horizonIsDefault, true);
  assert.equal(DEFAULT_HORIZON, 'longerTerm');
  // Nothing is truncated at the default horizon, so horizon == lifetime.
  close(a.horizon.interestIfStay, a.lifetime.interestIfStay, 1e-9);
  close(a.horizon.interestIfRefinance, a.lifetime.interestIfRefinance, 1e-9);
  // "Retired" means retired to below a cent, not to an exact binary zero.
  // amortizationSchedule()'s loop exits on `balance > 1e-9 && month < n`, so
  // the last scheduled month can leave a float residue -- ~1.3e-8 on a
  // $361,665 balance, about one part in 3e13. Sub-cent is the same bar the
  // engine itself applies to balances (checkRowInvariants' -0.005).
  assert.ok(a.horizon.balanceIfStay < 0.005, 'stay side not retired: ' + a.horizon.balanceIfStay);
  assert.ok(a.horizon.balanceIfRefinance < 0.005, 'refi side not retired: ' + a.horizon.balanceIfRefinance);
});

test('refinanceAnalysis: an explicit shorter horizon truncates both sides and states the balance each still owes', () => {
  const H = 60;
  const a = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 5.75, termMonths: 360, closingCosts: 0 },
    { horizonMonths: H }
  );
  assert.equal(a.horizonMonths, H);
  assert.equal(a.horizonIsDefault, false);

  close(a.horizon.balanceIfStay, oracleBalanceAfter(ORIGINAL_PRINCIPAL, ORIGINAL_RATE, ORIGINAL_TERM, MONTHS_ELAPSED + H));
  close(a.horizon.balanceIfRefinance, oracleBalanceAfter(BALANCE_AT_YEAR_7, 5.75, 360, H));

  close(a.horizon.paymentsIfStay, oraclePayment(ORIGINAL_PRINCIPAL, ORIGINAL_RATE, ORIGINAL_TERM) * H);
  close(a.horizon.paymentsIfRefinance, oraclePayment(BALANCE_AT_YEAR_7, 5.75, 360) * H);

  // Truncated interest is payments made minus principal actually retired.
  close(a.horizon.interestIfStay, a.horizon.paymentsIfStay - (BALANCE_AT_YEAR_7 - a.horizon.balanceIfStay));
  close(a.horizon.interestIfRefinance, a.horizon.paymentsIfRefinance - (a.replacement.balance - a.horizon.balanceIfRefinance));

  // Lifetime figures are unaffected by the horizon -- each loan still runs to
  // its own payoff.
  const full = refinanceAnalysis(yearSevenCurrent(), { annualRatePct: 5.75, termMonths: 360, closingCosts: 0 });
  close(a.lifetime.interestIfStay, full.lifetime.interestIfStay, 1e-9);
  close(a.lifetime.interestIfRefinance, full.lifetime.interestIfRefinance, 1e-9);
});

// ---------------------------------------------------------------------------
// 7. Break-even -- both definitions, and the boundary month
// ---------------------------------------------------------------------------

test('refinanceAnalysis: the net-position break-even is the FIRST month the refinance is strictly ahead, and the month before it is not', () => {
  const a = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 5.5, termMonths: REMAINING_TERM, closingCosts: 9000, financeClosingCosts: false },
    { includeSeries: true }
  );
  const m = a.breakEvenMonth;
  assert.ok(typeof m === 'number' && m >= 2, 'expected a break-even month past the first');
  const at = a.series[m - 1];
  const before = a.series[m - 2];
  assert.ok(at.refinanceNetPosition < at.stayNetPosition, 'break-even month must be strictly ahead');
  assert.ok(before.refinanceNetPosition >= before.stayNetPosition, 'the month before must NOT be ahead');
});

test('refinanceAnalysis: the cash-flow break-even recovers out-of-pocket costs from payment savings, and differs from the net-position one', () => {
  const closing = 9000;
  const a = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 5.75, termMonths: 360, closingCosts: closing, financeClosingCosts: false }
  );
  const savingPerMonth = a.current.monthlyPayment - a.replacement.monthlyPayment;
  assert.ok(savingPerMonth > 0);
  // First integer month whose cumulative saving strictly exceeds the cash paid.
  const expected = Math.floor(closing / savingPerMonth) + 1;
  assert.equal(a.cashFlowBreakEvenMonth, expected);
  // The two definitions are not the same number -- extending the clock is a
  // cost the cash-flow view cannot see.
  assert.notEqual(a.cashFlowBreakEvenMonth, a.breakEvenMonth);
});

test('refinanceAnalysis: a refinance that is never ahead reports a null break-even rather than a fabricated one', () => {
  const a = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 9.5, termMonths: 360, closingCosts: 12000, financeClosingCosts: false }
  );
  assert.equal(a.breakEvenMonth, null);
  assert.equal(a.cashFlowBreakEvenMonth, null);
  assert.ok(a.lifetime.interestDelta > 0);
});

// ---------------------------------------------------------------------------
// 8. Clock extension in both directions
// ---------------------------------------------------------------------------

test('refinanceAnalysis: refinancing into a SHORTER term reports a negative clock extension and cuts lifetime interest', () => {
  const a = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 5.75, termMonths: 180, closingCosts: 0 }
  );
  assert.equal(a.clockExtensionMonths, 180 - REMAINING_TERM);
  assert.ok(a.clockExtensionMonths < 0);
  assert.ok(a.lifetime.interestDelta < 0, 'a shorter term at a lower rate must reduce lifetime interest');
  assert.ok(a.monthlyPaymentDelta > 0, 'but the payment goes UP');
});

// ---------------------------------------------------------------------------
// 9. Adversarial boundaries
// ---------------------------------------------------------------------------

test('refinanceAnalysis: a 0% replacement rate charges exactly zero interest and pays straight-line principal', () => {
  const a = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 0, termMonths: REMAINING_TERM, closingCosts: 0 }
  );
  close(a.lifetime.interestIfRefinance, 0, 1e-9);
  close(a.replacement.monthlyPayment, BALANCE_AT_YEAR_7 / REMAINING_TERM);
});

test('refinanceAnalysis: a zero balance produces zero payments, zero interest and no break-even on either side', () => {
  const a = refinanceAnalysis(
    { balance: 0, annualRatePct: 6.5, remainingTermMonths: 276 },
    { annualRatePct: 5.75, termMonths: 360, closingCosts: 0 }
  );
  close(a.current.monthlyPayment, 0);
  close(a.replacement.monthlyPayment, 0);
  close(a.lifetime.interestIfStay, 0);
  close(a.lifetime.interestIfRefinance, 0);
  assert.equal(a.breakEvenMonth, null);
});

test('refinanceAnalysis: a one-month horizon reports one month of each side and no non-finite values anywhere', () => {
  const a = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 5.75, termMonths: 360, closingCosts: 3000, financeClosingCosts: false },
    { horizonMonths: 1, includeSeries: true }
  );
  assert.equal(a.series.length, 1);
  close(a.horizon.paymentsIfStay, a.current.monthlyPayment);
  close(a.horizon.paymentsIfRefinance, a.replacement.monthlyPayment);
  for (const row of a.series) {
    for (const [k, v] of Object.entries(row)) {
      assert.ok(Number.isFinite(v), 'series row field ' + k + ' is not finite: ' + v);
    }
  }
});

test('refinanceAnalysis: negative closing costs, negative cash-out and a negative term are clamped, not propagated', () => {
  const a = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 5.75, termMonths: 360, closingCosts: -5000, cashOut: -1000 }
  );
  close(a.replacement.closingCosts, 0);
  close(a.replacement.cashOut, 0);
  close(a.replacement.balance, BALANCE_AT_YEAR_7);

  const b = refinanceAnalysis(
    yearSevenCurrent(),
    { annualRatePct: 5.75, termMonths: -12, closingCosts: 0 }
  );
  close(b.replacement.monthlyPayment, 0);
  close(b.lifetime.interestIfRefinance, 0);
});
