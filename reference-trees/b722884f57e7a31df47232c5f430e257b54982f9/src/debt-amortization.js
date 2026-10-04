'use strict';
/*
 * Track F1 -- a real, standalone mortgage/loan amortization schedule.
 *
 * Genuinely new development (Section 0's "build in JS directly" rule --
 * there is no existing reference implementation, Python or otherwise, for
 * amortization in this project), not a port. Deliberately standalone: not
 * called from src/engine.js, app-shell.html, or the generated Worker
 * source. `projectDebts()` in engine.js already models debt payoff for the
 * whole-plan simulation using a closed-form compound-interest approximation
 * over each simulated period (which can span multiple years at once); this
 * module is a genuine month-by-month amortization schedule instead, built
 * as its own oracle-verified building block per this project's usual
 * per-feature discipline (spec -> oracle -> unit tests -> adversarial),
 * ahead of deciding how (or whether) to wire it into the whole-plan engine.
 *
 * Oracle: the closed-form fixed-payment annuity formula,
 *   PMT = P * r / (1 - (1+r)^-n)
 * is used both to compute the scheduled payment AND as an independent
 * cross-check in this module's own tests (an amortization schedule with no
 * extra principal must fully retire the loan in exactly n months and match
 * the closed-form total-interest figure).
 */

function monthlyRate(annualRatePct) {
  return Math.max(0, Number(annualRatePct) || 0) / 100 / 12;
}

/* B2 / EXT-03: THE TERM CONTRACT, DEFINED ONCE AND STATED OUT LOUD.
 *
 * `Math.floor(Number(termMonths) || 0)` accepted anything. Measured on this
 * tree, amortizationSchedule(100000, 6, ...):
 *
 *   termMonths = Infinity  ->  V8 fatal heap allocation failure
 *   termMonths = 1e9       ->  V8 fatal heap allocation failure
 *   termMonths = NaN       ->  0 rows, payment 0, no error   (a loan that
 *                              costs nothing, reported as a valid schedule)
 *   termMonths = 240.9     ->  240 rows, and nothing said the term was clipped
 *
 * The loop bound IS the requested term, so the term is an allocation
 * instruction. Handing an unvalidated number straight to it means a caller's
 * bad input becomes a process death rather than a rejected argument -- and a
 * process death cannot be caught, reported, or attributed. The queue's phrase
 * for the fix is exactly right: validate at the first boundary that can
 * ALLOCATE, not after three schedules have been built.
 *
 * MAX_TERM_MONTHS = 1800 (150 years). Chosen against what this codebase can
 * actually ask for rather than picked round: the validator caps profile.endAge
 * at 120 (scenario-validator.js), so the longest term any age-derived
 * computation can produce is 120 * 12 = 1440 months. 1800 clears that with
 * room and still bounds the allocation to something trivial. A term above it
 * is refused rather than clipped.
 *
 * FRACTIONAL TERMS ARE FLOORED, DELIBERATELY AND VISIBLY. A schedule has whole
 * months; there is no half row. Flooring is the existing arithmetic and is
 * kept so no current figure moves -- but amortizationSchedule() now reports
 * `requestedTermMonths` alongside `termMonths`, because the queue's standing
 * rule is not to clip a requested term while reporting it unchanged.
 *
 * NON-POSITIVE TERMS KEEP THEIR DOCUMENTED CONTRACT: an empty schedule and a
 * zero payment, which is the honest answer to "amortize nothing". That is a
 * stated behaviour with tests behind it, not an oversight, so it is not
 * converted into a throw here.
 */
const MAX_TERM_MONTHS = 1800;

function normalizeTerm(termMonths, context) {
  /* null, '' and [] all coerce to 0 through Number(), so without this a caller
     that MEANT "I have no term" would get a silent zero-month loan -- an empty
     schedule and a zero payment reported as a valid answer, which is the very
     confident-wrong-answer failure this whole contract exists to stop. A
     missing term is missing, not zero. Booleans are rejected for the same
     reason: `true` is not one month. */
  /* S5AA R9 round, DeepSeek audit finding 2g/01: a WHITESPACE-ONLY string is missing too -- Number('   ') is 0 as well,
     and it was the one spelling of "no term" this list did not name. */
  const missing = termMonths === null || termMonths === undefined || termMonths === '' ||
    (typeof termMonths === 'string' && termMonths.trim() === '') ||
    typeof termMonths === 'boolean' || Array.isArray(termMonths);
  const raw = missing ? NaN : Number(termMonths);
  if (!Number.isFinite(raw)) {
    throw new RangeError(
      'debt-amortization: ' + context + ' requires a finite term in months, got ' +
      (typeof termMonths === 'number' ? String(termMonths) : JSON.stringify(termMonths)) +
      '. The term is the schedule loop bound, so an unbounded one is an unbounded ' +
      'allocation -- it killed the process instead of returning an error.'
    );
  }
  if (raw > MAX_TERM_MONTHS) {
    throw new RangeError(
      'debt-amortization: ' + context + ' requires a term of at most ' + MAX_TERM_MONTHS +
      ' months (' + (MAX_TERM_MONTHS / 12) + ' years), got ' + raw +
      '. Refused rather than clipped: silently amortizing a different loan than the ' +
      'one asked about is worse than declining to amortize this one.'
    );
  }
  return Math.floor(raw);
}

/**
 * The fixed monthly payment for a fully-amortizing loan. Returns 0 for a
 * non-positive principal or term (nothing to pay). A 0% rate falls back to
 * straight-line principal-only payments (the closed-form formula has a
 * removable singularity at r=0 -- PMT = P/n in the limit).
 */
function monthlyPayment(principal, annualRatePct, termMonths) {
  const p = Math.max(0, Number(principal) || 0);
  const n = normalizeTerm(termMonths, 'monthlyPayment');
  if (p <= 0 || n <= 0) return 0;
  const r = monthlyRate(annualRatePct);
  if (r === 0) return p / n;
  /* ST2-05: NUMERICALLY STABLE at small positive rates.
  
     This read `(p * r) / (1 - Math.pow(1 + r, -n))`. At a tiny positive rate
     `Math.pow(1 + r, -n)` rounds to exactly 1, the denominator becomes 0, and a
     $90,000 20-year loan returned **Infinity** at an APR of 1e-14 or below --
     from finite, ordinary inputs. Just above that the cancellation is partial
     rather than total, so 1e-12 returned $351.84 and 1e-10 returned $375.30
     against a true $375: wrong, finite, and therefore silent.
  
     `-expm1(-n * log1p(r))` computes the same quantity without ever forming
     `1 + r` or subtracting two nearly equal numbers. As r approaches zero it
     tends to n*r, so the payment tends smoothly to p/n -- continuous with the
     exact zero-rate branch above rather than diverging next to it.
  
     Reached by the live engine: projectDebts() calls this for an ARM recast
     payment, so it is not confined to the excluded comparison modules. */
  const payment = (p * r) / -Math.expm1(-n * Math.log1p(r));
  /* And validate before anyone builds a schedule from it. A non-finite payment
     used to flow into schedule construction, where principal capping made it
     look like an ordinary early payoff instead of failed arithmetic. */
  if (!Number.isFinite(payment)) {
    throw new RangeError('debt-amortization: monthlyPayment is not finite for principal=' +
      p + ', annualRatePct=' + annualRatePct + ', termMonths=' + n +
      '. Refusing to build a schedule from it.');
  }
  return payment;
}

/**
 * Builds a full month-by-month amortization schedule. `extraMonthlyPrincipal`
 * (default 0) is applied on top of the scheduled payment's own principal
 * portion every month, so it can only shorten the payoff relative to the
 * original term -- never lengthen it -- which is what makes `termMonths`
 * itself a safe iteration ceiling (see the loop bound below).
 *
 * Returns { schedule, monthlyPayment, totalInterest, payoffMonth }.
 * `schedule` is empty for a non-positive principal or term.
 */
function amortizationSchedule(principal, annualRatePct, termMonths, extraMonthlyPrincipal) {
  const p = Math.max(0, Number(principal) || 0);
  /* B2: BEFORE the payment is computed and long before the row array grows. */
  const n = normalizeTerm(termMonths, 'amortizationSchedule');
  const extra = Math.max(0, Number(extraMonthlyPrincipal) || 0);
  const payment = monthlyPayment(p, annualRatePct, n);
  const r = monthlyRate(annualRatePct);

  /* B2: the effective term and the REQUESTED term are both reported, so a
     fractional request that was floored is visible in the result rather than
     inferable only by re-doing the arithmetic. */
  const requestedTermMonths = Number(termMonths);

  const schedule = [];
  if (p <= 0 || n <= 0) {
    return { schedule, monthlyPayment: payment, totalInterest: 0, payoffMonth: 0, termMonths: n, requestedTermMonths };
  }

  let balance = p;
  let totalInterest = 0;
  let month = 0;
  // Extra principal only ever accelerates payoff relative to the original
  // schedule, so the original term is always a safe upper bound -- no
  // separate safety-valve counter is needed.
  while (balance > 1e-9 && month < n) {
    month++;
    const interest = balance * r;
    let principalPortion = payment - interest + extra;
    if (principalPortion > balance) principalPortion = balance;
    if (principalPortion < 0) principalPortion = 0; // a payment smaller than one month's interest never reduces balance
    balance = Math.max(0, balance - principalPortion);
    totalInterest += interest;
    schedule.push({
      month,
      payment: interest + principalPortion,
      principalPaid: principalPortion,
      interestPaid: interest,
      balance,
    });
    if (balance <= 1e-9) break;
  }

  return { schedule, monthlyPayment: payment, totalInterest, payoffMonth: month, termMonths: n, requestedTermMonths };
}

/*
 * Track F2 (started) -- recast: apply a lump-sum principal payment and
 * re-amortize the reduced balance over the SAME remaining term, producing
 * a lower monthly payment. Distinct from an early extra-principal payment
 * (which shortens the term at the same payment, already covered by
 * amortizationSchedule's own extraMonthlyPrincipal) and from a refinance
 * or ARM reset (which change the rate and/or term, not just the balance --
 * both of those reduce to a plain monthlyPayment(newBalance, newRate,
 * newTerm) call and don't need a dedicated function of their own).
 */
function recast(currentBalance, annualRatePct, remainingTermMonths, lumpSumPayment) {
  const balance = Math.max(0, Number(currentBalance) || 0);
  const lump = Math.max(0, Math.min(balance, Number(lumpSumPayment) || 0));
  const newBalance = balance - lump;
  const newMonthlyPayment = monthlyPayment(newBalance, annualRatePct, remainingTermMonths);
  return { newBalance, newMonthlyPayment, lumpSumApplied: lump };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { monthlyPayment, amortizationSchedule, recast, normalizeTerm, MAX_TERM_MONTHS };
}
