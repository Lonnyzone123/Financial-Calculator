'use strict';
/*
 * Ported from the Financial Projection V2.1.2 (post-audit-repair,
 * requalified) Python engine's retirement_model_v2/social_security_benefit.py
 * -- Phase 4 (Social Security optimizer port), first module.
 *
 * Faithful line-by-line translation, verified against Python-generated
 * fixtures in fixtures/ss-benefit.fixtures.json (see
 * tests/ported/social-security-benefit.test.js).
 *
 * The Python source uses exact `Fraction` arithmetic to avoid any rounding
 * drift in benefit-factor math. This port represents each factor as an
 * explicit {numerator, denominator} pair rather than reaching for a
 * bignum/rational library -- every denominator here is one of 180/240/150,
 * so plain integer arithmetic is exact. Python's Fraction ALWAYS normalizes
 * to lowest terms on construction (e.g. Fraction(168, 240) is stored as
 * 7/10, not 168/240) -- discovered via a fixture mismatch, not assumed up
 * front -- so every fraction built here is reduced by gcd to match. Dividing
 * two small integers in JS then produces the identical IEEE-754 double as
 * Python's Fraction.__float__() for every value in this module's domain
 * (verified empirically against the fixtures).
 */

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

function makeFraction(numerator, denominator) {
  if (denominator < 0) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = gcd(numerator, denominator) || 1;
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function claimFactorFraction(claimAgeMonths, fraAgeMonths) {
  if (fraAgeMonths === undefined) fraAgeMonths = 67 * 12;
  const claim = Math.trunc(claimAgeMonths);
  const fra = Math.trunc(fraAgeMonths);
  if (claim < 0 || fra <= 0) {
    throw new Error('Claim age and FRA months must be positive');
  }
  const difference = claim - fra;
  if (difference < 0) {
    const reductionMonths = -difference;
    if (reductionMonths <= 36) {
      return makeFraction(180 - reductionMonths, 180);
    }
    const excess = reductionMonths - 36;
    return makeFraction(192 - excess, 240);
  }
  const delayedMonths = Math.min(difference, 36);
  return makeFraction(150 + delayedMonths, 150);
}

function fractionToFloat(frac) {
  return frac.numerator / frac.denominator;
}

function claimFactorMonths(claimAgeMonths, fraAgeMonths) {
  return fractionToFloat(claimFactorFraction(claimAgeMonths, fraAgeMonths));
}

function fractionsEqual(a, b) {
  // Python's Fraction equality compares in lowest terms; every fraction this
  // module produces is compared only against another produced the same way,
  // so cross-multiplication (a/b == c/d iff a*d == c*b) is exact here since
  // all values are small integers well within safe-integer range.
  return a.numerator * b.denominator === b.numerator * a.denominator;
}

function claimFactorSchedule(options) {
  const opts = options || {};
  const fraAgeMonths = opts.fraAgeMonths === undefined ? 67 * 12 : opts.fraAgeMonths;
  const maximumAgeMonths = opts.maximumAgeMonths === undefined ? 70 * 12 : opts.maximumAgeMonths;
  const claimCycleStartCalendarMonth = opts.claimCycleStartCalendarMonth === undefined ? 1 : opts.claimCycleStartCalendarMonth;

  const claim = Math.trunc(opts.claimAgeMonths);
  const fra = Math.trunc(fraAgeMonths);
  const maximum = Math.trunc(maximumAgeMonths);
  if (Math.trunc(claimCycleStartCalendarMonth) !== 1) {
    throw new Error('Only January-aligned annual claim cycles are supported');
  }
  if (fra % 12) {
    throw new Error('Annual January-aligned DRC timing currently requires an integer FRA age');
  }
  if (claim > maximum) {
    throw new Error('Claim age exceeds the configured maximum');
  }
  const eventual = claimFactorFraction(claim, fra);
  if (claim <= fra || claim >= maximum || claim % 12 === 0) {
    return {
      eventualFactor: eventual,
      initialPayableFactor: eventual,
      pendingEffectiveAgeMonths: null,
    };
  }

  const claimYearStart = claim - (claim % 12);
  const priorYearDrcMonths = Math.max(0, Math.min(36, claimYearStart - fra));
  const initial = makeFraction(150 + priorYearDrcMonths, 150);
  if (fractionsEqual(initial, eventual)) {
    return { eventualFactor: eventual, initialPayableFactor: initial, pendingEffectiveAgeMonths: null };
  }
  return {
    eventualFactor: eventual,
    initialPayableFactor: initial,
    pendingEffectiveAgeMonths: claimYearStart + 12,
  };
}

function scheduleEventual(schedule) {
  return fractionToFloat(schedule.eventualFactor);
}

function scheduleInitialPayable(schedule) {
  return fractionToFloat(schedule.initialPayableFactor);
}

function scheduleHasPendingCredit(schedule) {
  return schedule.pendingEffectiveAgeMonths !== null && schedule.pendingEffectiveAgeMonths !== undefined;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    claimFactorFraction,
    fractionToFloat,
    claimFactorMonths,
    claimFactorSchedule,
    scheduleEventual,
    scheduleInitialPayable,
    scheduleHasPendingCredit,
  };
}
