'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  claimFactorFraction,
  claimFactorMonths,
  claimFactorSchedule,
  scheduleEventual,
  scheduleInitialPayable,
  scheduleHasPendingCredit,
} = require('../../src/ported/social-security-benefit');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-benefit.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

test('social security benefit port: claimFactorFraction/claimFactorMonths match the Python oracle on every fraction case', () => {
  for (const c of fixtures.fraction_cases) {
    if (c.expect_error !== undefined) {
      assert.throws(
        () => claimFactorFraction(c.input.claim_age_months, c.input.fra_age_months),
        new RegExp(c.expect_error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `${c.name} must raise the same error as Python`
      );
      continue;
    }
    const frac = claimFactorFraction(c.input.claim_age_months, c.input.fra_age_months);
    assert.equal(frac.numerator, c.output.fraction.numerator, `${c.name}.numerator`);
    assert.equal(frac.denominator, c.output.fraction.denominator, `${c.name}.denominator`);
    assert.equal(frac.numerator / frac.denominator, c.output.fraction.float, `${c.name}.float`);
    assert.equal(
      claimFactorMonths(c.input.claim_age_months, c.input.fra_age_months),
      c.output.months_float,
      `${c.name}.months_float`
    );
  }
});

test('social security benefit port: claimFactorSchedule matches the Python oracle on every schedule case', () => {
  for (const c of fixtures.schedule_cases) {
    const opts = {
      claimAgeMonths: c.input.claim_age_months,
      fraAgeMonths: c.input.fra_age_months,
      maximumAgeMonths: c.input.maximum_age_months,
    };
    if (c.input.claim_cycle_start_calendar_month !== undefined) {
      opts.claimCycleStartCalendarMonth = c.input.claim_cycle_start_calendar_month;
    }
    if (c.expect_error !== undefined) {
      assert.throws(
        () => claimFactorSchedule(opts),
        new RegExp(c.expect_error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `${c.name} must raise the same error as Python`
      );
      continue;
    }
    const sched = claimFactorSchedule(opts);
    assert.equal(sched.eventualFactor.numerator, c.output.eventual_factor.numerator, `${c.name}.eventual_factor.numerator`);
    assert.equal(sched.eventualFactor.denominator, c.output.eventual_factor.denominator, `${c.name}.eventual_factor.denominator`);
    assert.equal(sched.initialPayableFactor.numerator, c.output.initial_payable_factor.numerator, `${c.name}.initial_payable_factor.numerator`);
    assert.equal(sched.initialPayableFactor.denominator, c.output.initial_payable_factor.denominator, `${c.name}.initial_payable_factor.denominator`);
    assert.equal(sched.pendingEffectiveAgeMonths, c.output.pending_effective_age_months, `${c.name}.pending_effective_age_months`);
    assert.equal(scheduleEventual(sched), c.output.eventual, `${c.name}.eventual`);
    assert.equal(scheduleInitialPayable(sched), c.output.initial_payable, `${c.name}.initial_payable`);
    assert.equal(scheduleHasPendingCredit(sched), c.output.has_pending_credit, `${c.name}.has_pending_credit`);
  }
});
