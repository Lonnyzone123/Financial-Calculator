'use strict';
/*
 * Track F2 -- refinance analysis. Standalone, genuinely new development
 * (Section 0's "build in JS directly" rule -- there is no Python reference
 * implementation for this in the project).
 *
 * DELIBERATELY NOT WIRED. Nothing in src/engine.js, src/app-shell.html or
 * src/debt-strategy-adapter.js calls into this module, and this module calls
 * into none of them. It follows the pattern src/debt-amortization.js
 * established: an oracle-verified building block, built and proven ahead of
 * any decision about how (or whether) it gets wired into the whole-plan
 * engine. Wiring it would change output for existing scenarios and is a
 * separate, watched decision.
 *
 * WHY THIS EXISTS. src/debt-amortization.js's recast() header states that a
 * refinance and an ARM reset "both of those reduce to a plain
 * monthlyPayment(newBalance, newRate, newTerm) call and don't need a
 * dedicated function of their own." That claim is wrong, and this module is
 * the counterexample: the new payment is the LEAST decision-relevant output.
 * Refinancing at year 7 of a 30-year into a fresh 30-year at a modestly
 * lower rate lowers the payment and RAISES lifetime interest, because the
 * clock restarts. A function returning only a payment cannot express that.
 * (That stale comment is left in place rather than edited -- this sprint's
 * defining constraint is that it creates new files only.)
 *
 * ORACLE DISCIPLINE. Both sides of every comparison are assembled from
 * amortizationSchedule() in src/debt-amortization.js, which is itself
 * verified against the closed-form annuity formula. There is no second
 * amortization loop in this file -- no month-by-month interest arithmetic
 * of its own. Everything here is summation, slicing and differencing of
 * schedules that module produced. tests/debt-refinance.test.js holds this
 * to account with a principal-sum identity on each side (ARCH-01's "sources
 * equal uses," applied locally: every dollar of starting balance must be
 * retired by exactly one dollar of scheduled principal).
 */

const { amortizationSchedule, normalizeTerm } = require('./debt-amortization.js');

/*
 * The default common horizon: the LONGER of the two loans' terms.
 *
 * Comparing a 23-year remainder against a fresh 30-year is apples-to-oranges,
 * so the horizon is an explicit, named input rather than an accident of the
 * term lengths. The default is chosen to be the one horizon that smuggles in
 * no judgment at all: at max(remaining term, replacement term) BOTH loans are
 * certainly retired, nothing is truncated, and the horizon comparison is
 * therefore identical to the lifetime comparison. Any shorter horizon is a
 * real analytical choice (it stops the clock while one or both loans still
 * owe money) and so must be stated by the caller, who then also gets the
 * balance each side still owes at that point, so the comparison can be
 * closed rather than silently left open.
 */
const DEFAULT_HORIZON = 'longerTerm';

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
}

function nonNegative(v) {
  return Math.max(0, num(v, 0));
}

/*
 * Expands an amortizationSchedule() result to exactly `months` rows. Months
 * past payoff are real zeros -- no payment, no interest, no principal, no
 * balance -- rather than missing entries, so both sides of a comparison are
 * index-aligned even when they retire at different times.
 */
function padded(result, months) {
  const rows = [];
  for (let m = 1; m <= months; m++) {
    const row = result.schedule[m - 1];
    if (row) {
      rows.push({ payment: row.payment, principal: row.principalPaid, interest: row.interestPaid, balance: row.balance });
    } else {
      rows.push({ payment: 0, principal: 0, interest: 0, balance: 0 });
    }
  }
  return rows;
}

/**
 * Analyses replacing one loan with another.
 *
 * `current`     { balance, annualRatePct, remainingTermMonths, extraMonthlyPrincipal? }
 *               The loan as it stands today. Its payment is DERIVED from
 *               those three figures, not taken as an input -- for a loan
 *               that has amortized normally this reproduces the original
 *               payment exactly. Ongoing extra principal, if any, is carried
 *               onto the stay side via `extraMonthlyPrincipal`.
 *
 * `replacement` { annualRatePct, termMonths, closingCosts?, financeClosingCosts?,
 *                 cashOut?, extraMonthlyPrincipal? }
 *               The proposed loan. Its balance is derived:
 *                 new balance = current balance
 *                             + cash taken out
 *                             + closing costs, if financed rather than paid
 *
 * `options`     { horizonMonths?, includeSeries? }
 *               `horizonMonths` defaults as described at DEFAULT_HORIZON.
 *               `includeSeries` (default false) attaches the full aligned
 *               month-by-month series; it is what the identity tests sum.
 *
 * Returns payment, interest, break-even, clock and cash figures -- see the
 * shape assembled at the bottom of this function.
 */
function refinanceAnalysis(current, replacement, options) {
  const cur = current || {};
  const rep = replacement || {};
  const opt = options || {};

  const currentBalance = nonNegative(cur.balance);
  const currentRate = num(cur.annualRatePct, 0);
  /* B2: both terms validated up front -- see debt-recast.js for why a
     silently-zeroed term is worse than a crash. */
  const currentTerm = Math.max(0, normalizeTerm(cur.remainingTermMonths, 'refinanceAnalysis current.remainingTermMonths'));
  const currentExtra = nonNegative(cur.extraMonthlyPrincipal);

  const replacementRate = num(rep.annualRatePct, 0);
  const replacementTerm = Math.max(0, normalizeTerm(rep.termMonths, 'refinanceAnalysis replacement.termMonths'));
  const replacementExtra = nonNegative(rep.extraMonthlyPrincipal);
  const closingCosts = nonNegative(rep.closingCosts);
  const financeClosingCosts = !!rep.financeClosingCosts;
  const cashOut = nonNegative(rep.cashOut);

  const financedCosts = financeClosingCosts ? closingCosts : 0;
  const cashPaidAtClosing = financeClosingCosts ? 0 : closingCosts;
  const replacementBalance = currentBalance + cashOut + financedCosts;
  // Positive = cash into the borrower's pocket at closing; negative = cash out of it.
  const cashAtClosing = cashOut - cashPaidAtClosing;

  const stay = amortizationSchedule(currentBalance, currentRate, currentTerm, currentExtra);
  const refi = amortizationSchedule(replacementBalance, replacementRate, replacementTerm, replacementExtra);

  /* CR2-06: THE HORIZON IS THE SECOND ALLOCATION BOUND, AND B2 ONLY FIXED THE FIRST.
   *
   * B2 put loan terms through normalizeTerm(). horizonMonths kept the old
   * permissive coercion while driving padded() twice and the series loop below
   * -- so a perfectly valid 120-month loan with horizonMonths: 1e9 passed every
   * term check and went straight into building a billion rows. The audit
   * stopped it with an in-memory sentry at iteration 1,802 rather than letting
   * the heap die, and reported months=1000000000 reaching allocation.
   *
   * THE QUIETER HALF. num() maps a non-finite value to its fallback, so
   * horizonMonths: Infinity silently became the default horizon -- and the
   * result still reported horizonIsDefault: false, because horizonRequested
   * only asks whether the caller passed SOMETHING. The analysis said "you asked
   * for this window" about a window it had substituted. That is the same
   * absence-versus-substitution confusion CR2-01 had between a balance move and
   * a transaction: the wrong answer is not the number, it is the claim about
   * where the number came from.
   *
   * Absence still defaults, and that is not a rejection. An explicitly supplied
   * horizon must be finite and within the shared ceiling; anything else is
   * refused by name rather than quietly replaced. Fractions floor, with the
   * request exposed beside the effective value so the clip is visible. */
  const defaultHorizon = Math.max(currentTerm, replacementTerm);
  const horizonRequested = opt.horizonMonths !== undefined && opt.horizonMonths !== null;
  const horizonMonths = horizonRequested
    ? Math.max(0, normalizeTerm(opt.horizonMonths, 'refinanceAnalysis options.horizonMonths'))
    : defaultHorizon;

  const stayRows = padded(stay, horizonMonths);
  const refiRows = padded(refi, horizonMonths);

  // One pass over the aligned rows produces every cumulative figure, both
  // break-even searches and (optionally) the exported series.
  const series = [];
  let stayPayments = 0, stayInterest = 0;
  let refiPayments = 0, refiInterest = 0;
  let breakEvenMonth = null;
  let cashFlowBreakEvenMonth = null;

  for (let i = 0; i < horizonMonths; i++) {
    const s = stayRows[i];
    const r = refiRows[i];
    stayPayments += s.payment;
    stayInterest += s.interest;
    refiPayments += r.payment;
    refiInterest += r.interest;

    /*
     * NET POSITION: total cash gone plus debt still owed. Both sides are
     * measured the same way, so they are directly comparable, and because
     * the outstanding balance is inside the measure it charges the
     * refinance for slower principal repayment -- which is exactly the cost
     * a payment-only view misses.
     */
    const stayNet = stayPayments + s.balance;
    const refiNet = cashPaidAtClosing - cashOut + refiPayments + r.balance;

    if (breakEvenMonth === null) {
      const tolerance = 1e-9 * Math.max(1, Math.abs(stayNet));
      // Strictly ahead, not merely level: an exact no-op must report no
      // break-even at all rather than "month 1".
      if (refiNet < stayNet - tolerance) breakEvenMonth = i + 1;
    }
    if (cashFlowBreakEvenMonth === null) {
      /*
       * CASH-FLOW BREAK-EVEN: the conventional "months to recoup the closing
       * costs out of the lower payment." Reported alongside the net-position
       * figure rather than instead of it, because the two answer different
       * questions and can differ by years. Cash taken out is deliberately
       * NOT credited here -- it is loan proceeds, not a cost recovered, and
       * crediting it would collapse every cash-out refinance to month 1. The
       * net-position measure above is the one that accounts for it.
       */
      const cumulativeSaving = stayPayments - refiPayments;
      const tolerance = 1e-9 * Math.max(1, cashPaidAtClosing);
      if (cumulativeSaving > cashPaidAtClosing + tolerance) cashFlowBreakEvenMonth = i + 1;
    }

    if (opt.includeSeries) {
      series.push({
        month: i + 1,
        stayPayment: s.payment, stayPrincipal: s.principal, stayInterest: s.interest,
        stayBalance: s.balance, stayCumulativePayments: stayPayments, stayNetPosition: stayNet,
        refinancePayment: r.payment, refinancePrincipal: r.principal, refinanceInterest: r.interest,
        refinanceBalance: r.balance, refinanceCumulativePayments: refiPayments, refinanceNetPosition: refiNet,
      });
    }
  }

  const stayBalanceAtHorizon = horizonMonths > 0 ? stayRows[horizonMonths - 1].balance : currentBalance;
  const refiBalanceAtHorizon = horizonMonths > 0 ? refiRows[horizonMonths - 1].balance : replacementBalance;

  const analysis = {
    horizonMonths,
    horizonIsDefault: !horizonRequested,
    /* CR2-06: what the caller ASKED for, beside what was used. Null when the
       default applied, so absence and substitution are distinguishable without
       re-deriving either. A fractional request floors, and this is where that
       shows. */
    horizonRequestedMonths: horizonRequested ? Number(opt.horizonMonths) : null,

    current: {
      balance: currentBalance,
      annualRatePct: currentRate,
      termMonths: currentTerm,
      monthlyPayment: stay.monthlyPayment,
      extraMonthlyPrincipal: currentExtra,
      totalInterest: stay.totalInterest,
      payoffMonth: stay.payoffMonth,
    },

    replacement: {
      balance: replacementBalance,
      annualRatePct: replacementRate,
      termMonths: replacementTerm,
      monthlyPayment: refi.monthlyPayment,
      extraMonthlyPrincipal: replacementExtra,
      totalInterest: refi.totalInterest,
      payoffMonth: refi.payoffMonth,
      closingCosts,
      closingCostsFinanced: financeClosingCosts,
      cashOut,
      cashAtClosing,
    },

    // Negative = the payment falls. On its own this figure is the one that
    // misleads; it is reported next to the interest and clock figures on
    // purpose.
    monthlyPaymentDelta: refi.monthlyPayment - stay.monthlyPayment,

    // Positive = the payoff clock got LONGER.
    clockExtensionMonths: replacementTerm - currentTerm,

    // Each loan run all the way to its own payoff, regardless of horizon.
    lifetime: {
      interestIfStay: stay.totalInterest,
      interestIfRefinance: refi.totalInterest,
      interestDelta: refi.totalInterest - stay.totalInterest,
      payoffMonthIfStay: stay.payoffMonth,
      payoffMonthIfRefinance: refi.payoffMonth,
    },

    // Both loans stopped at the same stated month, with what each still owes.
    horizon: {
      months: horizonMonths,
      interestIfStay: stayInterest,
      interestIfRefinance: refiInterest,
      interestDelta: refiInterest - stayInterest,
      paymentsIfStay: stayPayments,
      paymentsIfRefinance: refiPayments,
      paymentsDelta: refiPayments - stayPayments,
      balanceIfStay: stayBalanceAtHorizon,
      balanceIfRefinance: refiBalanceAtHorizon,
      balanceDelta: refiBalanceAtHorizon - stayBalanceAtHorizon,
      netPositionIfStay: stayPayments + stayBalanceAtHorizon,
      netPositionIfRefinance: cashPaidAtClosing - cashOut + refiPayments + refiBalanceAtHorizon,
    },

    // null means "never" -- an honest absence, not month 0 and not the horizon.
    breakEvenMonth,
    cashFlowBreakEvenMonth,
  };

  analysis.horizon.netPositionDelta =
    analysis.horizon.netPositionIfRefinance - analysis.horizon.netPositionIfStay;

  if (opt.includeSeries) analysis.series = series;

  return analysis;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { refinanceAnalysis, DEFAULT_HORIZON };
}
