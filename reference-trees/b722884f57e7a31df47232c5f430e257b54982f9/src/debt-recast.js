'use strict';
/*
 * Track F2 -- recast vs. curtailment. Standalone, genuinely new development
 * (Section 0's "build in JS directly" rule -- no Python reference exists for
 * this in the project).
 *
 * DELIBERATELY NOT WIRED. Follows the pattern src/debt-refinance.js and
 * src/debt-arm.js established: an oracle-verified building block, proven
 * ahead of any decision about wiring it into the whole-plan engine.
 *
 * WHY THIS EXISTS. src/debt-amortization.js, recast()'s header ("Track F2 (started) -- recast"; the line numbers once cited here were stale -- DeepSeek audit finding 2g/02)
 * dismisses a recast, a refinance and an ARM reset together as all reducing
 * to a plain monthlyPayment(newBalance, newRate, newTerm) call. The sibling
 * modules already disproved that for refinance and ARM; this is the recast
 * case. recast() there returns only { newBalance, newMonthlyPayment,
 * lumpSumApplied } -- it cannot answer the question a household actually
 * asks, which is: given this lump sum, is it better spent lowering the
 * payment (recast) or shortening the loan (curtailment)? Those are the same
 * dollar spent two different ways and they trade in opposite directions:
 * recast buys monthly cashflow at the cost of keeping the full clock;
 * curtailment buys interest and time at no cashflow relief. Nothing else in
 * this repository can express that trade.
 *
 * MECHANISM, WORTH STATING EXPLICITLY. Curtailment is modelled by re-using
 * amortizationSchedule() rather than a second amortization loop: the reduced
 * balance is run with the ORIGINAL scheduled payment held constant, achieved
 * by passing the difference between the original payment and the recast
 * payment as `extraMonthlyPrincipal`. That difference is exactly the amount
 * needed so the schedule's true monthly outlay reproduces the pre-lump
 * payment every month, which is curtailment's whole definition -- "the
 * payment stays put." No interest arithmetic happens in this file; every
 * number here comes from amortizationSchedule()'s own already-oracle-verified
 * loop.
 *
 * NON-GOAL. This module does not modify recast() in src/debt-amortization.js.
 * It supersedes nothing there -- that function is consumed by build.js's
 * bundling (Track F2 task 3) unchanged.
 */

const { monthlyPayment, amortizationSchedule, normalizeTerm } = require('./debt-amortization.js');

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
}

function nonNegative(v) {
  return Math.max(0, num(v, 0));
}

/**
 * Analyses a lump sum against a single loan two ways: recast (lower the
 * payment, keep the term) and curtailment (keep the payment, shorten the
 * term) -- both against the "do nothing" baseline of continuing unchanged.
 *
 * `current` { balance, annualRatePct, remainingTermMonths, extraMonthlyPrincipal? }
 *           The loan as it stands today. Its payment is DERIVED from those
 *           three figures, not taken as an input. `extraMonthlyPrincipal`
 *           (default 0) is an ongoing extra the household already pays,
 *           independent of this lump-sum decision, and carries through
 *           identically onto all three branches below.
 *
 * `lumpSum` The cash amount being applied. Clamped to [0, balance] -- a lump
 *           sum cannot exceed what is owed.
 *
 * `options` { fee?, includeSchedules? }
 *           `fee` (default 0) -- many servicers charge a recast fee. It is
 *           reported as a cash cost only; it does not reduce the lump sum
 *           applied to principal and does not change the new balance or
 *           payment, mirroring how a recast fee is actually billed
 *           (separately, in cash), unlike a refinance's closing costs, which
 *           `debt-refinance.js` explicitly supports financing into the
 *           balance because that IS a real, commonly-chosen option there.
 *           `includeSchedules` (default false) attaches each branch's full
 *           amortizationSchedule() row array; it is what the identity tests
 *           sum.
 *
 * Returns { lumpSumApplied, fee, newBalance, doNothing, recast, curtailment },
 * where each of `doNothing` / `recast` / `curtailment` is
 * { monthlyPayment, paymentDelta, totalInterest, interestSaved, payoffMonth,
 *   schedule? } -- `paymentDelta` and `interestSaved` are relative to
 * `doNothing`.  `doNothing.paymentDelta` and `.interestSaved` are always 0;
 * they are included so all three branches share one shape.
 */
function recastAnalysis(current, lumpSum, options) {
  const cur = current || {};
  const opt = options || {};

  const balance = nonNegative(cur.balance);
  const rate = num(cur.annualRatePct, 0);
  /* B2: ONE term contract, shared. normalizeTerm() lives in debt-amortization.js
     because that is where the allocation happens; importing it here means this
     module cannot drift into its own opinion about what a term is. Before this,
     every consumer wrote Math.max(0, Math.floor(num(x, 0))), and num() maps a
     non-finite value to its fallback -- so Infinity, NaN and a MISSING term all
     silently became 0. That did not crash; it returned a fully-shaped analysis
     reporting no interest, no schedule and no saving, which is a wrong financial
     answer wearing the costume of a right one. Worse than the heap failure the
     report found, because nothing announces it. */
  const term = Math.max(0, normalizeTerm(cur.remainingTermMonths, 'recastAnalysis current.remainingTermMonths'));
  const extra = nonNegative(cur.extraMonthlyPrincipal);
  const fee = nonNegative(opt.fee);
  const includeSchedules = !!opt.includeSchedules;

  const lump = Math.max(0, Math.min(balance, nonNegative(lumpSum)));
  const newBalance = balance - lump;

  const pmtOriginal = monthlyPayment(balance, rate, term);
  const pmtAfterLump = monthlyPayment(newBalance, rate, term);
  // Always >= 0: paying down principal at a fixed rate/term can only hold or
  // lower the required payment, never raise it.
  const curtailmentBonusExtra = Math.max(0, pmtOriginal - pmtAfterLump);

  const doNothingRun = amortizationSchedule(balance, rate, term, extra);
  const recastRun = amortizationSchedule(newBalance, rate, term, extra);
  const curtailmentRun = amortizationSchedule(newBalance, rate, term, extra + curtailmentBonusExtra);

  // The true first-month cash outlay, read off the schedule itself rather
  // than reconstructed from separate pieces. That matters at the boundary
  // where the lump sum alone retires the loan (newBalance === 0): the
  // schedule is then empty and the outlay is genuinely 0, not
  // curtailmentBonusExtra's leftover -- there is nothing left to curtail.
  function outlayOf(run) {
    return run.schedule.length ? run.schedule[0].payment : 0;
  }
  const outlay = {
    doNothing: outlayOf(doNothingRun),
    recast: outlayOf(recastRun),
    curtailment: outlayOf(curtailmentRun),
  };

  function branch(run, outlayAmount) {
    const result = {
      monthlyPayment: outlayAmount,
      paymentDelta: outlayAmount - outlay.doNothing,
      totalInterest: run.totalInterest,
      interestSaved: doNothingRun.totalInterest - run.totalInterest,
      payoffMonth: run.payoffMonth,
    };
    if (includeSchedules) result.schedule = run.schedule;
    return result;
  }

  return {
    lumpSumApplied: lump,
    fee,
    newBalance,
    doNothing: branch(doNothingRun, outlay.doNothing),
    recast: branch(recastRun, outlay.recast),
    curtailment: branch(curtailmentRun, outlay.curtailment),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { recastAnalysis };
}
