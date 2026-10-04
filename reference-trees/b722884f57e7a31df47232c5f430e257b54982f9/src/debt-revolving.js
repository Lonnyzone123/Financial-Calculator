'use strict';
/*
 * S3 task 6 -- revolving (credit-card) debt.
 *
 * A CORRECTNESS GAP, NOT A MISSING FEATURE. DEBT_TYPES in src/app-shell.html
 * already defines creditCard with its own default rate (20%), and the UI
 * already offers it -- but projectDebts() runs EVERY debt through fixed-term
 * amortization regardless of type. A credit card modelled as a fixed-PMT
 * amortizing loan pays off on a schedule real revolving debt does not follow,
 * so a user modelling one today gets a materially optimistic payoff. The
 * difference is not small: see tests/debt-revolving.test.js, where the same
 * balance and rate retire ~4x later under the real mechanic.
 *
 * THE DEFINING MECHANIC. A revolving minimum payment is the GREATER of a
 * percent of the current balance and a dollar floor. Because the percent is
 * taken of a SHRINKING balance, the payment falls every month, which is
 * exactly why the balance decays geometrically instead of amortizing -- and
 * why the dollar floor, not the percent, is what actually retires the card.
 *
 * INTEREST: SIMPLE MONTHLY ACCRUAL on the balance -- balance * APR / 12.
 * Decided, not open (S3 task 6). Two conventions are DELIBERATELY NOT
 * MODELLED, and naming them is the point of saying so:
 *   - average daily balance, which most issuers actually use, and which
 *     differs whenever a payment lands mid-cycle;
 *   - statement-balance / grace-period handling, where a balance paid in full
 *     by the due date accrues nothing at all.
 * Both need a transaction-level model of when money moves within a month.
 * This module works in whole months, so it cannot express either without
 * inventing the timing. Simple monthly accrual is the conservative choice of
 * the three for a household deciding whether to pay a card down.
 *
 * DELIBERATELY NOT WIRED into projectDebts(). Follows the pattern
 * src/debt-refinance.js, src/debt-arm.js and src/debt-recast.js established:
 * an oracle-verified building block, proven ahead of any decision about
 * wiring it into the whole-plan engine. S3's engine budget belongs to task 5.
 *
 * NON-CONVERGENCE IS A RETURN VALUE, NEVER A HANG. A card whose minimum does
 * not exceed its monthly interest never retires. That is a real outcome a
 * real user can be in, so it is reported as `retired: false` with the reason,
 * not hidden behind an infinite loop or a silently truncated schedule.
 */

/** Percent of the current balance, when no explicit minimum is configured.
 *  2% is the common US card minimum; issuers range roughly 1-4%. */
const DEFAULT_MINIMUM_PERCENT = 2;

/** Dollar floor, when none is configured. $25 is a typical US card floor. */
const DEFAULT_MINIMUM_FLOOR = 25;

/** Months simulated before declaring non-payoff. 600 = 50 years, far past any
 *  horizon this app projects, so hitting it means the card genuinely does not
 *  retire rather than that the cap was too tight. */
const DEFAULT_MAX_MONTHS = 600;

/** Balances below this are treated as retired -- float dust, not money.
 *  Also the finite-arithmetic guard's yardstick: see FINITE_LIMIT. */
const EPSILON = 1e-9;

/**
 * S3-16. The HARD bound on schedule allocation, as distinct from
 * DEFAULT_MAX_MONTHS, which is only the default non-convergence cap.
 *
 * Before this existed, `maxMonths` was read with `Math.floor(num(...))` and
 * any finite number survived: a request of 1e12 allocated schedule rows until
 * the process died. A default is not a maximum, and the difference only shows
 * up the one time somebody passes a number nobody expected.
 *
 * 1200 months = 100 years. Derived from what the app can actually express
 * rather than from a round number: `profile.age` starts at 18 and the APP
 * caps `profile.endAge` at 100, so the longest plan the app can hold is 82
 * years = 984 months, and no debt inside a plan outlives the plan. 1200 clears
 * that with headroom. CORRECTED in the S5AA R9 round (DeepSeek audit finding
 * 2g/03): this said the VALIDATOR caps endAge at 100. It does not -- it warns
 * outside 0 to 120 (scenario-validator.js), and debt-amortization.js says 120
 * -- so an imported plan from 18 to 120 spans 1,224 months, beyond this bound.
 * That span does not reach here from a plan: the engine calls only
 * minimumPaymentFor(), one month at a time, never the schedule this bounds. A
 * direct schedule call longer than 1,200 months is refused, as documented. Deliberately NOT 600 -- the existing
 * default is already 50 years, so a bound chosen on the assumption that every
 * model ends within 50 years would reject the module's own default span.
 */
const MAX_SUPPORTED_MONTHS = 1200;

/** Beyond this, monthly compounding is one step from overflowing to Infinity,
 *  and the totals derived from it stop being money. Checked every month
 *  rather than assumed from the opening balance, because a balance that grows
 *  under negative amortization reaches it from a starting value that looked
 *  ordinary. */
const FINITE_LIMIT = 1e300;

/**
 * S3-15. Read one caller-supplied number, keeping four outcomes apart that
 * the previous `num()` collapsed into one:
 *
 *   absent          -> the documented default
 *   valid, in range -> the value, INCLUDING zero
 *   present, corrupt -> invalid, named
 *   present, out of domain -> invalid, named
 *
 * The old helper returned its fallback for anything non-finite, so
 * `balance: NaN` became `balance: 0` and the projection reported
 * `retired: true, payoffMonth: 0` -- a corrupt input rendered as the
 * financial claim "this debt is already paid off". `annualRatePct: "bad"`
 * became a deliberate 0%.
 *
 * Presence is typed strictly: a value that is present must be a finite
 * `number`. Numeric strings, booleans and empty strings are refused rather
 * than coerced, because `Number("")` and `Number(false)` are both 0 and there
 * is no reading under which a caller meant that.
 */
function readNumber(raw, field, spec) {
  if (raw === undefined || raw === null) return { value: spec.def };
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return { invalid: { field, reason: 'must be a finite number; received ' + describeValue(raw) } };
  }
  if (spec.integer && !Number.isInteger(raw)) {
    return { invalid: { field, reason: 'must be a whole number of months; received ' + raw } };
  }
  if (spec.min !== undefined && raw < spec.min) {
    return { invalid: { field, reason: 'must be at least ' + spec.min + '; received ' + raw } };
  }
  if (spec.max !== undefined && raw > spec.max) {
    return { invalid: { field, reason: 'must be at most ' + spec.max + '; received ' + raw } };
  }
  return { value: raw };
}

function describeValue(v) {
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return 'an array';
  return typeof v;
}

/**
 * The refusal shape. Every financial field is null rather than zero, so an
 * invalid run cannot be read as "no interest", "nothing paid", or worst,
 * "retired in month 0". `retired` is false and `payoffMonth` is null: the
 * module declines to make a claim it cannot support.
 */
function invalidResult(status, field, reason) {
  return {
    status,
    invalidField: field,
    invalidReason: reason,
    schedule: [],
    retired: false,
    payoffMonth: null,
    monthsSimulated: 0,
    totalInterest: null,
    totalPrincipal: null,
    totalPaid: null,
    openingBalance: null,
    nonPayoffReason: null,
    cap: null,
  };
}

function nonNegative(v, fallback) {
  const n = Number(v);
  return Math.max(0, Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback));
}

/** The monthly periodic rate. Simple accrual -- see the header. */
function monthlyRate(annualRatePct) {
  return nonNegative(annualRatePct, 0) / 100 / 12;
}

/**
 * The scheduled minimum for one month: the greater of a percent of the
 * current balance and the dollar floor, never more than what would clear the
 * account (balance + this month's interest).
 *
 * Exported because the floor-binding behaviour is the part naive
 * implementations get wrong, and it determines the tail of every payoff --
 * so it is worth being able to assert directly rather than only through a
 * whole schedule.
 */
function minimumPaymentFor(balance, interest, options) {
  const opt = options || {};
  const bal = nonNegative(balance, 0);
  const percent = nonNegative(opt.minimumPercentOfBalance, DEFAULT_MINIMUM_PERCENT);
  const floor = nonNegative(opt.minimumDollarFloor, DEFAULT_MINIMUM_FLOOR);
  const fromPercent = bal * percent / 100;
  const scheduled = Math.max(fromPercent, floor);
  const payoffAmount = bal + nonNegative(interest, 0);
  return {
    amount: Math.min(scheduled, payoffAmount),
    fromPercent,
    floor,
    /* Which term won. The floor binding is what eventually retires the card;
       while the percent binds, the balance only decays geometrically. */
    floorBound: floor > fromPercent,
    clampedToPayoff: scheduled > payoffAmount,
  };
}

/**
 * Month-by-month projection of a revolving balance.
 *
 * `options`
 *   balance                   opening balance
 *   annualRatePct             APR; monthly rate is APR/12 (see header)
 *   minimumPercentOfBalance   default 2. Set 0 to disable the percent term.
 *   minimumDollarFloor        default 25. Set 0 to disable the floor.
 *   additionalMonthlyPayment  default 0. A fixed amount ON TOP of the minimum.
 *   maxMonths                 default 600. The non-convergence cap.
 *
 * Returns
 *   schedule[]      { month, payment, interestPaid, principalPaid, balance,
 *                     minimumPayment, floorBound }
 *   retired         true if the balance reached zero within the cap
 *   payoffMonth     the month it retired, or null if it did not
 *   monthsSimulated how far the loop actually ran
 *   totalInterest / totalPrincipal / totalPaid
 *   nonPayoffReason null, or a stated reason -- see below
 */
function revolvingProjection(options) {
  const opt = options || {};

  /* S3-15 and S3-16: every input is validated BEFORE any default is applied
     and before one schedule row is allocated. The order matters -- the old
     code defaulted first, which is how a corrupt balance became a paid-off
     card, and sized the loop from an unvalidated number, which is how a
     request of 1e12 months became an allocation instruction. */
  const reads = {
    balance: readNumber(opt.balance, 'balance', { def: 0, min: 0 }),
    annualRatePct: readNumber(opt.annualRatePct, 'annualRatePct', { def: 0, min: 0 }),
    minimumPercentOfBalance: readNumber(opt.minimumPercentOfBalance, 'minimumPercentOfBalance',
      { def: DEFAULT_MINIMUM_PERCENT, min: 0 }),
    minimumDollarFloor: readNumber(opt.minimumDollarFloor, 'minimumDollarFloor',
      { def: DEFAULT_MINIMUM_FLOOR, min: 0 }),
    additionalMonthlyPayment: readNumber(opt.additionalMonthlyPayment, 'additionalMonthlyPayment',
      { def: 0, min: 0 }),
    maxMonths: readNumber(opt.maxMonths, 'maxMonths',
      { def: DEFAULT_MAX_MONTHS, min: 1, max: MAX_SUPPORTED_MONTHS, integer: true }),
  };
  for (const key of Object.keys(reads)) {
    const bad = reads[key].invalid;
    if (bad) return invalidResult('invalid_input', bad.field, bad.reason);
  }

  const opening = reads.balance.value;
  /* Through the helper rather than inline, so the simple-accrual convention
     stays documented in one place. Its nonNegative() is a no-op now that the
     value is validated, and that is the right order: validate, then convert. */
  const rate = monthlyRate(reads.annualRatePct.value);
  const additional = reads.additionalMonthlyPayment.value;
  const cap = reads.maxMonths.value;
  /* minimumPaymentFor() reads the two minimum terms off its options argument,
     so hand it the VALIDATED values rather than the caller's raw object --
     otherwise the validation above would be bypassed one frame down. */
  const minimumOpt = {
    minimumPercentOfBalance: reads.minimumPercentOfBalance.value,
    minimumDollarFloor: reads.minimumDollarFloor.value,
  };

  const schedule = [];
  let balance = opening;
  let totalInterest = 0;
  let totalPrincipal = 0;
  let totalPaid = 0;
  let month = 0;

  if (opening <= EPSILON) {
    /* A VALID zero, reached only after validation -- so this really is "no
       debt", not "we could not read the debt". That distinction is the whole
       of S3-15: both used to arrive here. */
    return {
      status: 'ok',
      invalidField: null, invalidReason: null,
      schedule, retired: true, payoffMonth: 0, monthsSimulated: 0,
      totalInterest: 0, totalPrincipal: 0, totalPaid: 0,
      openingBalance: opening, nonPayoffReason: null, cap,
    };
  }

  while (balance > EPSILON && month < cap) {
    month++;
    const interest = balance * rate;
    const minimum = minimumPaymentFor(balance, interest, minimumOpt);
    /* The additional payment is on TOP of the minimum, and the whole thing is
       still clamped to what clears the account -- a household does not send
       the issuer more than the payoff amount. */
    const payment = Math.min(minimum.amount + additional, balance + interest);
    let principalPortion = payment - interest;
    /* A payment smaller than one month's interest does not reduce the
       balance; it grows. Not clamped to zero -- that would silently convert a
       compounding card into a stalled one and hide the very case this module
       exists to report. */
    if (principalPortion > balance) principalPortion = balance;
    balance = balance - principalPortion;
    if (balance < EPSILON && balance > -EPSILON) balance = 0;

    /* S3-15, the arithmetic half. Finite inputs do not guarantee a finite
       projection: under negative amortization the balance compounds, so a
       starting figure that looked ordinary can reach the edge of the double
       range mid-run. Checked per month and BEFORE anything is committed to
       the schedule or the running totals, because once a NaN or an Infinity
       is inside `totalInterest` it is indistinguishable from an answer by the
       time a caller reads it. */
    if (!Number.isFinite(interest) || !Number.isFinite(payment) ||
        !Number.isFinite(principalPortion) || !Number.isFinite(balance) ||
        balance > FINITE_LIMIT ||
        !Number.isFinite(totalInterest + interest) ||
        !Number.isFinite(totalPaid + payment)) {
      return invalidResult('arithmetic_error', 'balance',
        'the balance passed the range this model can represent, in month ' + month +
        '. The inputs are finite but the projection is not, so no total is reported.');
    }

    totalInterest += interest;
    totalPrincipal += principalPortion;
    totalPaid += payment;
    schedule.push({
      month,
      payment,
      interestPaid: interest,
      principalPaid: principalPortion,
      balance,
      minimumPayment: minimum.amount,
      floorBound: minimum.floorBound,
    });
  }

  const retired = balance <= EPSILON;
  let nonPayoffReason = null;
  if (!retired) {
    const first = schedule[0];
    nonPayoffReason = (first && first.principalPaid <= 0)
      ? 'The scheduled payment does not exceed the monthly interest, so the balance never falls.'
      : 'The balance did not reach zero within the ' + cap + '-month cap.';
  }

  return {
    status: 'ok',
    invalidField: null,
    invalidReason: null,
    schedule,
    retired,
    payoffMonth: retired ? month : null,
    monthsSimulated: month,
    totalInterest,
    totalPrincipal,
    totalPaid,
    openingBalance: opening,
    nonPayoffReason,
    cap,
  };
}

/**
 * What a fixed additional payment buys, against the minimum-only baseline.
 *
 * Both branches are the same function on the same inputs, differing only in
 * `additionalMonthlyPayment` -- so a difference here cannot come from anything
 * except the extra payment.
 *
 * `monthsSaved` and `interestSaved` are null when the baseline never retires,
 * because "saved 480 months" against something that never finishes is not a
 * number, it is an artifact of the cap.
 */
function additionalPaymentBenefit(options, additionalMonthlyPayment) {
  const base = Object.assign({}, options, { additionalMonthlyPayment: 0 });
  /* S3-15: pass the caller's figure through UNCOERCED so revolvingProjection()
     can refuse it. `nonNegative()` used to be applied here, which turned a
     corrupt extra payment into zero and then reported "no benefit" -- a
     finding manufactured out of input nobody could read. */
  const withExtra = Object.assign({}, options, {
    additionalMonthlyPayment: additionalMonthlyPayment,
  });
  const minimumOnly = revolvingProjection(base);
  const accelerated = revolvingProjection(withExtra);

  /* Invalidity propagates through BOTH branches. A comparison is only a
     comparison when both sides are real, and a savings figure derived from a
     refusal would be the most misleading number this module could return. */
  const failed = minimumOnly.status !== 'ok' ? minimumOnly
    : accelerated.status !== 'ok' ? accelerated
      : null;
  if (failed) {
    return {
      status: failed.status,
      invalidField: failed.invalidField,
      invalidReason: failed.invalidReason,
      minimumOnly,
      accelerated,
      monthsSaved: null,
      interestSaved: null,
      /* Null, not false. "Does not retire" is a financial claim; this is the
         absence of one. */
      baselineRetires: null,
      acceleratedRetires: null,
    };
  }

  const comparable = minimumOnly.retired && accelerated.retired;
  return {
    status: 'ok',
    invalidField: null,
    invalidReason: null,
    minimumOnly,
    accelerated,
    monthsSaved: comparable ? minimumOnly.payoffMonth - accelerated.payoffMonth : null,
    interestSaved: comparable ? minimumOnly.totalInterest - accelerated.totalInterest : null,
    /* Stated rather than left for the caller to infer from two nulls. */
    baselineRetires: minimumOnly.retired,
    acceleratedRetires: accelerated.retired,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    revolvingProjection,
    additionalPaymentBenefit,
    minimumPaymentFor,
    DEFAULT_MINIMUM_PERCENT,
    DEFAULT_MINIMUM_FLOOR,
    DEFAULT_MAX_MONTHS,
    MAX_SUPPORTED_MONTHS,
  };
}
