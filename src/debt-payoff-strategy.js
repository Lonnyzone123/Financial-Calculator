'use strict';
/*
 * Track F4 (started) -- multi-debt payoff strategy comparison
 * (avalanche/snowball/custom-priority), built on the same monthly-
 * compounding core as Track F1's amortization module. Genuinely new
 * development (Section 0's "build in JS directly" rule), standalone, not
 * wired into src/engine.js/app-shell.html.
 *
 * Oracle: unlike F1 (which had a closed-form formula to check against),
 * multi-debt strategy comparison's oracle is a well-established financial
 * property rather than a formula -- for a fixed extra-payment budget and a
 * fixed set of debts, ordering extra payments by highest interest rate
 * first (avalanche) minimizes total interest paid across every possible
 * fixed payoff order, including snowball (smallest-balance-first). This
 * module's tests verify that property empirically (avalanche's own output
 * against snowball's, and both against a hand-computed two-debt case)
 * rather than assuming it.
 */

/**
 * Returns debt ids in payoff-priority order (extra payments go to the
 * first id in the list until it's paid off, then the next, and so on).
 * "avalanche" = highest rate first; "snowball" = smallest balance first.
 * Any other value is treated as "custom" -- the caller's own input order
 * is used verbatim (each debt's position in the input array is its
 * priority), so a caller can implement any custom-priority strategy
 * simply by pre-sorting its own debts array before calling this module.
 */
function payoffOrder(debts, strategy) {
  const list = debts.slice();
  if (strategy === 'avalanche') {
    list.sort((a, b) => (Number(b.rate) || 0) - (Number(a.rate) || 0));
  } else if (strategy === 'snowball') {
    list.sort((a, b) => (Number(a.balance) || 0) - (Number(b.balance) || 0));
  }
  return list.map((d) => d.id);
}

/**
 * Simulates paying off a set of debts month by month under a given
 * strategy. `debts`: [{ id, balance, rate (annual %), minPayment }].
 * `extraMonthlyBudget` is on top of every debt's own minPayment, and (the
 * classic "snowball effect") a paid-off debt's own minPayment is folded
 * into the extra-payment pool for every subsequent month, not just the
 * flat extraMonthlyBudget figure.
 *
 * Returns { months, totalInterest, finalBalances }. Does not mutate the
 * input `debts` array or its objects.
 */
/* ST2-05 fallout, and a defect in its own right: the payoff threshold was
   1e-9 DOLLARS -- a billionth of a cent. Over 360 monthly iterations ordinary
   floating-point drift leaves a residual near 7.5e-9, so a loan paid at exactly
   its own amortizing payment was still "owed" nine billionths of a cent at term
   and needed a 361st month.
   
   That was always one ulp from showing: making monthlyPayment() numerically
   stable moved the payment by 1.4e-11 and pushed it across the line. Half a
   cent is the smallest amount a debt can actually owe, so that is the
   threshold. Applied to BALANCE comparisons only -- the payment-pool guard
   below measures a different quantity and keeps its own epsilon. */
const PAID_OFF_EPSILON = 0.005;

function simulateDebtPayoff(debts, extraMonthlyBudget, strategy) {
  const state = debts.map((d) => ({
    id: d.id,
    balance: Math.max(0, Number(d.balance) || 0),
    rate: Math.max(0, Number(d.rate) || 0),
    minPayment: Math.max(0, Number(d.minPayment) || 0),
  }));
  const order = payoffOrder(state, strategy);
  const baseExtra = Math.max(0, Number(extraMonthlyBudget) || 0);

  let totalInterest = 0;
  let month = 0;
  // No closed-form bound exists for an arbitrary multi-debt mix, so a
  // generous but finite safety valve (100 years) prevents a misconfigured
  // input (e.g. minPayment too small to cover even the first month's
  // interest on every debt, with zero extra budget) from looping forever.
  const MAX_MONTHS = 1200;

  while (state.some((d) => d.balance > PAID_OFF_EPSILON) && month < MAX_MONTHS) {
    month++;
    // Every currently-zero-balance debt's own minPayment joins the extra
    // pool this month -- the snowball/avalanche "rolling" effect.
    let pool = baseExtra + state.reduce((sum, d) => sum + (d.balance <= PAID_OFF_EPSILON ? d.minPayment : 0), 0);

    state.forEach((d) => {
      if (d.balance <= PAID_OFF_EPSILON) return;
      const r = d.rate / 100 / 12;
      const interest = d.balance * r;
      totalInterest += interest;
      const grossPay = Math.min(d.balance + interest, d.minPayment);
      d.balance = Math.max(0, d.balance + interest - grossPay);
    });

    for (const id of order) {
      if (pool <= 1e-9) break;
      const d = state.find((x) => x.id === id);
      if (!d || d.balance <= PAID_OFF_EPSILON) continue;
      const pay = Math.min(d.balance, pool);
      d.balance -= pay;
      pool -= pay;
    }
  }

  return {
    months: month,
    totalInterest,
    finalBalances: state.map((d) => ({ id: d.id, balance: d.balance })),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { payoffOrder, simulateDebtPayoff };
}
