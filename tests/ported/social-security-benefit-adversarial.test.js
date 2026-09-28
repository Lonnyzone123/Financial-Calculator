'use strict';

/**
 * Adversarial/boundary-exact stress test for the claim-factor benefit math.
 *
 * The 124 original Phase 4 benefit fixtures all sit in the ordinary claiming
 * range (62-70). This pass deliberately leaves it, because two real code
 * paths in the JS port are never exercised inside that range: makeFraction()'s
 * `gcd(0, n)` branch (reachable only where the factor is exactly zero, at a
 * claim age of exactly 48.0 with an FRA of 67), and its negative-numerator
 * sign normalization (below that age the pre-FRA reduction formula goes
 * negative). Python's Fraction normalizes both; the port must produce the
 * identical numerator/denominator pair, not merely the same float.
 *
 * See fixtures/generate_ss_benefit_adversarial_fixtures.py for the full
 * rationale, including why these values are well-defined even though the
 * real pipeline never reaches them.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  claimFactorFraction, claimFactorMonths, claimFactorSchedule,
  scheduleEventual, scheduleInitialPayable, scheduleHasPendingCredit,
} = require('../../src/ported/social-security-benefit');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-benefit-adversarial.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

test('benefit ADVERSARIAL: every out-of-normal-range claim factor matches the Python oracle exactly, numerator and denominator', () => {
  for (const c of fixtures.fraction_cases) {
    const { claim_age_months, fra_age_months } = c.input;
    if (c.expect_error !== undefined) {
      assert.throws(
        () => claimFactorFraction(claim_age_months, fra_age_months),
        new RegExp(c.expect_error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `${c.name} must raise the same error as Python`
      );
      continue;
    }
    const frac = claimFactorFraction(claim_age_months, fra_age_months);
    // Exact integer equality, not a float tolerance -- the whole point is
    // that Python's Fraction normalization (sign placement and gcd
    // reduction) is reproduced, which a float-only check would hide.
    assert.equal(frac.numerator, c.output.numerator, `${c.name}.numerator`);
    assert.equal(frac.denominator, c.output.denominator, `${c.name}.denominator`);
    assert.equal(frac.numerator / frac.denominator, c.output.float, `${c.name}.float`);
    assert.equal(claimFactorMonths(claim_age_months, fra_age_months), c.output.months_float, `${c.name}.months_float`);
  }
});

test('benefit ADVERSARIAL: the factor crosses zero at exactly age 48, and zero normalizes to 0/1 (the gcd(0, n) path)', () => {
  const FRA = 67 * 12;
  const zero = claimFactorFraction(576, FRA);
  assert.equal(zero.numerator, 0, 'a zero factor must have numerator 0');
  assert.equal(zero.denominator, 1, 'Python normalizes Fraction(0, 240) to 0/1 -- the denominator must reduce all the way to 1');
  assert.equal(zero.numerator / zero.denominator, 0);

  const above = claimFactorFraction(577, FRA);
  const below = claimFactorFraction(575, FRA);
  assert.ok(above.numerator / above.denominator > 0, 'one month later must be strictly positive');
  assert.ok(below.numerator / below.denominator < 0, 'one month earlier must be strictly negative');
  assert.ok(below.numerator < 0, 'Python places the sign on the numerator, not the denominator');
  assert.ok(below.denominator > 0, 'the denominator must stay positive after normalization');
});

test('benefit ADVERSARIAL: the delayed-retirement credit is capped at 36 months and never grows past it', () => {
  const FRA = 67 * 12;
  const atCap = claimFactorMonths(FRA + 36, FRA);
  assert.equal(claimFactorMonths(FRA + 37, FRA), atCap, 'one month past the cap must be identical');
  assert.equal(claimFactorMonths(FRA + 600, FRA), atCap, 'fifty years past the cap must still be identical');
});

test('benefit ADVERSARIAL: claimFactorSchedule boundary and validation cases match the Python oracle', () => {
  for (const c of fixtures.schedule_cases) {
    const opts = {
      claimAgeMonths: c.input.claim_age_months,
      fraAgeMonths: c.input.fra_age_months,
      maximumAgeMonths: c.input.maximum_age_months,
      claimCycleStartCalendarMonth: c.input.claim_cycle_start_calendar_month,
    };
    if (c.expect_error !== undefined) {
      assert.throws(
        () => claimFactorSchedule(opts),
        new RegExp(c.expect_error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `${c.name} must raise the same error as Python`
      );
      continue;
    }
    const sched = claimFactorSchedule(opts);
    assert.equal(sched.eventualFactor.numerator, c.output.eventual_numerator, `${c.name}.eventual.numerator`);
    assert.equal(sched.eventualFactor.denominator, c.output.eventual_denominator, `${c.name}.eventual.denominator`);
    assert.equal(sched.initialPayableFactor.numerator, c.output.initial_numerator, `${c.name}.initial.numerator`);
    assert.equal(sched.initialPayableFactor.denominator, c.output.initial_denominator, `${c.name}.initial.denominator`);
    assert.equal(scheduleEventual(sched), c.output.eventual, `${c.name}.eventual`);
    assert.equal(scheduleInitialPayable(sched), c.output.initial_payable, `${c.name}.initialPayable`);
    assert.equal(sched.pendingEffectiveAgeMonths, c.output.pending_effective_age_months, `${c.name}.pendingEffectiveAgeMonths`);
    assert.equal(scheduleHasPendingCredit(sched), c.output.has_pending_credit, `${c.name}.hasPendingCredit`);
  }
});

test('benefit ADVERSARIAL: a zero eventual factor is what makes the cash-flow module\'s 1e-12 divisor guard reachable', () => {
  // Documents the connection between these two modules explicitly: at a
  // claim age of exactly 48 the schedule's eventual factor is exactly 0,
  // which is the input the cash-flow module's
  // `initialPayable / max(eventual, 1e-12)` guard exists to survive.
  const sched = claimFactorSchedule({ claimAgeMonths: 576, fraAgeMonths: 67 * 12, maximumAgeMonths: 70 * 12 });
  assert.equal(scheduleEventual(sched), 0, 'eventual factor must be exactly 0 at age 48');
  assert.equal(scheduleInitialPayable(sched), 0, 'and initial payable must equal it, since claim <= FRA means no pending credit');
  assert.equal(scheduleHasPendingCredit(sched), false);
});
