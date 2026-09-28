'use strict';
/*
 * Track F4 continuation -- adapts the calculator's own `advanced.debts`
 * shape (from app-shell.html's `normalizeDebt()`) onto Track F1's
 * `amortizationSchedule()` and Track F4's `simulateDebtPayoff()`, closing
 * the gap PLATFORM_DEVELOPMENT_ROADMAP.md's Track C3/F4 notes flagged:
 * "does not yet integrate with the whole-plan engine's actual advanced.debts
 * shape." Genuinely new development (composition of two already-built,
 * already-oracle-verified modules -- no new core amortization/strategy
 * math here), standalone, not wired into src/engine.js or app-shell.html.
 *
 * MODELING NOTE -- why this needs real composition, not just a field
 * rename: the calculator's own live engine (`projectDebts()` in
 * src/engine.js) pays every debt's own `paymentMonthly + extraPrincipalMonthly`
 * SIMULTANEOUSLY and INDEPENDENTLY -- there is no shared "extra payment
 * pool" concept in the live engine at all. Track F4's `simulateDebtPayoff()`
 * models a genuinely different strategy: ONE shared extra-payment pool,
 * applied by priority order (avalanche/snowball) to a single targeted debt
 * at a time, with paid-off debts' own minimums rolling into that pool for
 * every subsequent month. These are two different real strategies, not two
 * representations of the same one -- so "current approach" is modeled here
 * via F1 (each debt amortized independently, its own extra principal
 * applied throughout, exactly like the live engine), and "consolidated
 * avalanche/snowball" is modeled via F4 (every debt's own extra principal
 * pooled into one shared budget instead). The comparison this module builds
 * answers: "if you redirected everything you're currently putting toward
 * extra debt payments into one prioritized pool instead, how much would you
 * save?"
 */

const { simulateDebtPayoff } = require('./debt-payoff-strategy');

/**
 * The rate actually in effect right now for a calculator debt, mirroring
 * projectDebts()'s own ARM logic exactly: an adjustable-rate debt uses its
 * modeled post-reset rate once `currentAge` reaches `nextRateResetAge`,
 * otherwise its current rate.
 */
function effectiveRateNow(debt, currentAge) {
  if (debt.rateType === 'adjustable' && Number(currentAge) >= Number(debt.nextRateResetAge)) {
    return Number(debt.resetRate) || 0;
  }
  return Number(debt.rate) || 0;
}

function activeDebts(debts) {
  return (debts || []).filter((d) => Number(d.balance) > 0);
}

/**
 * Models the household's CURRENT approach: every debt paid down
 * independently and simultaneously, each with its own actual scheduled
 * payment plus its own extra principal, exactly matching the live engine's
 * projectDebts() strategy. "Debt-free" is when the LAST debt clears, since
 * they're all being paid down in parallel, not sequentially.
 *
 * Deliberately uses simulateDebtPayoff() (one debt at a time, zero pooled
 * budget) rather than amortizationSchedule() here, even though this is
 * conceptually "just amortize each debt" -- amortizationSchedule() always
 * recomputes its OWN closed-form payment internally and has no way to
 * accept the debt's actual entered paymentMonthly, whereas a real user's
 * entered payment need not match the closed-form amortizing figure for
 * their stated balance/rate/remainingTermYears (rounding, an imported
 * legacy loan, an estimate). Using the same payment-driven engine
 * (simulateDebtPayoff) for both this and consolidatedStrategyOutcome()
 * below is what makes the two comparable at all -- this was caught by a
 * failing test (a single-debt, zero-extra-budget case that should trivially
 * produce identical current/avalanche outcomes but didn't, because an
 * earlier draft ran this function through amortizationSchedule() instead
 * and silently compared two different payment amounts).
 *
 * Returns { totalInterest, monthsUntilDebtFree, perDebt: [{id, months, interest}] }.
 */
function currentApproachOutcome(debts, currentAge) {
  const perDebt = activeDebts(debts).map((debt) => {
    const rate = effectiveRateNow(debt, currentAge);
    const result = simulateDebtPayoff(
      [{ id: debt.id, balance: debt.balance, rate, minPayment: debt.paymentMonthly }],
      Math.max(0, Number(debt.extraPrincipalMonthly)) || 0,
      'avalanche' // irrelevant with a single debt -- no priority order to apply
    );
    return { id: debt.id, months: result.months, interest: result.totalInterest };
  });
  return {
    totalInterest: perDebt.reduce((sum, d) => sum + d.interest, 0),
    monthsUntilDebtFree: perDebt.reduce((max, d) => Math.max(max, d.months), 0),
    perDebt,
  };
}

/**
 * Models a CONSOLIDATED strategy: every debt's own extra principal is
 * pooled into one shared monthly budget instead, applied by priority order
 * (avalanche/snowball/custom) via Track F4's simulateDebtPayoff(), with the
 * classic paid-off-debt-minimum-rolls-into-the-pool effect.
 *
 * `minPayment` uses each debt's own `paymentMonthly` (the calculator's own
 * scheduled-payment field, matching what projectDebts() itself pays before
 * any extra) -- NOT a recomputed amortizing payment, since a real user's
 * entered payment may not exactly match the closed-form amortizing figure
 * for their own balance/rate/term (e.g. they rounded up, or the loan isn't
 * a plain fixed-payment mortgage), and this module should compare against
 * what the household is actually paying, not a hypothetical.
 *
 * Returns { totalInterest, months }.
 */
function consolidatedStrategyOutcome(debts, currentAge, strategy) {
  const active = activeDebts(debts);
  const pooled = active.map((debt) => ({
    id: debt.id,
    balance: debt.balance,
    rate: effectiveRateNow(debt, currentAge),
    minPayment: debt.paymentMonthly,
  }));
  const extraMonthlyBudget = active.reduce((sum, d) => sum + (Math.max(0, Number(d.extraPrincipalMonthly)) || 0), 0);
  const result = simulateDebtPayoff(pooled, extraMonthlyBudget, strategy);
  return { totalInterest: result.totalInterest, months: result.months };
}

/**
 * Full comparison: current (independent, parallel) vs. avalanche vs.
 * snowball, all using the same total monthly extra-payment budget the
 * household already allocates across its debts today.
 */
function compareDebtStrategies(debts, currentAge) {
  const current = currentApproachOutcome(debts, currentAge);
  const avalanche = consolidatedStrategyOutcome(debts, currentAge, 'avalanche');
  const snowball = consolidatedStrategyOutcome(debts, currentAge, 'snowball');
  return {
    current,
    avalanche,
    snowball,
    avalancheInterestSaved: current.totalInterest - avalanche.totalInterest,
    avalancheMonthsSaved: current.monthsUntilDebtFree - avalanche.months,
    snowballInterestSaved: current.totalInterest - snowball.totalInterest,
    snowballMonthsSaved: current.monthsUntilDebtFree - snowball.months,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    effectiveRateNow,
    currentApproachOutcome,
    consolidatedStrategyOutcome,
    compareDebtStrategies,
  };
}
