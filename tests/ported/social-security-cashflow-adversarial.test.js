'use strict';

/**
 * Adversarial/boundary-exact stress test for the Social Security cash-flow
 * module. See fixtures/generate_ss_cashflow_adversarial_fixtures.py for why
 * each case exists -- most notably the `initial_payable / max(eventual, 1e-12)`
 * divisor guard, which the benefit-module adversarial pass showed is
 * genuinely reachable through resolve()'s own public API (a claim at exactly
 * age 48 has an eventual factor of exactly 0).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCashFlowManager, createClaimStatus, activatePending, applyCola } = require('../../src/ported/social-security-cashflow');
const { firstYearBenefitFraction } = require('../../src/ported/social-security-valuation');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-cashflow-adversarial.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const manager = createCashFlowManager(fixtures.config);

const EPS = 1e-9;
function assertClose(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) <= EPS * Math.max(1, Math.abs(expected)), `${msg}: expected ${expected}, got ${actual}`);
}

function decisionFor(claimNow, selectedClaimAgeMonths, annualBenefitRealIfClaimed = 24000.0, fractionOverride = null) {
  const frac = selectedClaimAgeMonths !== null && selectedClaimAgeMonths !== undefined
    ? firstYearBenefitFraction(selectedClaimAgeMonths) : 0.0;
  return {
    claimNow, selectedClaimAgeMonths, annualBenefitRealIfClaimed,
    firstYearBenefitFraction: fractionOverride !== null ? fractionOverride : frac,
  };
}

const CLAIM = 67 * 12 + 3;
const EXPECTED_FRACTION = firstYearBenefitFraction(CLAIM);

const RESOLVE_INPUTS = {
  zero_eventual_factor_hits_divisor_guard: { decision: decisionFor(true, 576), currentAgeMonths: 576, inflationFactor: 1.2, priorStatus: null },
  negative_eventual_factor_clamped_to_zero: { decision: decisionFor(true, 570), currentAgeMonths: 570, inflationFactor: 1.2, priorStatus: null },
  fraction_mismatch_exactly_at_tolerance: { decision: decisionFor(true, CLAIM, 24000.0, EXPECTED_FRACTION + 1e-12), currentAgeMonths: 67 * 12, inflationFactor: 1.2, priorStatus: null },
  fraction_mismatch_just_past_tolerance: { decision: decisionFor(true, CLAIM, 24000.0, EXPECTED_FRACTION + 1e-11), currentAgeMonths: 67 * 12, inflationFactor: 1.2, priorStatus: null },
  fraction_matches_exactly_no_code: { decision: decisionFor(true, CLAIM, 24000.0, EXPECTED_FRACTION), currentAgeMonths: 67 * 12, inflationFactor: 1.2, priorStatus: null },
  benefit_exactly_zero_emits_nonpositive_code: { decision: decisionFor(true, 67 * 12, 0.0), currentAgeMonths: 67 * 12, inflationFactor: 1.2, priorStatus: null },
  benefit_one_cent_positive_no_code: { decision: decisionFor(true, 67 * 12, 0.01), currentAgeMonths: 67 * 12, inflationFactor: 1.2, priorStatus: null },
  benefit_negative_emits_nonpositive_code: { decision: decisionFor(true, 67 * 12, -100.0), currentAgeMonths: 67 * 12, inflationFactor: 1.2, priorStatus: null },
  claim_at_last_valid_window_month: { decision: decisionFor(true, 67 * 12 + 11), currentAgeMonths: 67 * 12, inflationFactor: 1.2, priorStatus: null },
  claim_exactly_at_current_age: { decision: decisionFor(true, 67 * 12), currentAgeMonths: 67 * 12, inflationFactor: 1.2, priorStatus: null },
  claim_one_past_window_end: { decision: decisionFor(true, 67 * 12 + 12), currentAgeMonths: 67 * 12, inflationFactor: 1.2, priorStatus: null },
  claim_one_before_window_start: { decision: decisionFor(true, 67 * 12 - 1), currentAgeMonths: 67 * 12, inflationFactor: 1.2, priorStatus: null },
  inflation_factor_exactly_zero_rejected: { decision: decisionFor(true, 67 * 12), currentAgeMonths: 67 * 12, inflationFactor: 0.0, priorStatus: null },
  inflation_factor_tiny_but_positive: { decision: decisionFor(true, 67 * 12), currentAgeMonths: 67 * 12, inflationFactor: 1e-9, priorStatus: null },
};

function assertStatusEqual(actual, expected, msg) {
  if (expected === null) {
    assert.equal(actual, null, `${msg} (expected null)`);
    return;
  }
  assert.ok(actual, `${msg} (expected non-null)`);
  assert.equal(actual.claimAgeMonths, expected.claim_age_months, `${msg}.claimAgeMonths`);
  assertClose(actual.fullAnnualBenefitNominal, expected.full_annual_benefit_nominal, `${msg}.fullAnnualBenefitNominal`);
  if (expected.pending_drc_annual_benefit_nominal === null) {
    assert.equal(actual.pendingDrcAnnualBenefitNominal, null, `${msg}.pendingDrcAnnualBenefitNominal (expected null)`);
  } else {
    assertClose(actual.pendingDrcAnnualBenefitNominal, expected.pending_drc_annual_benefit_nominal, `${msg}.pendingDrcAnnualBenefitNominal`);
  }
  assert.equal(actual.pendingDrcEffectiveAgeMonths, expected.pending_drc_effective_age_months, `${msg}.pendingDrcEffectiveAgeMonths`);
}

const resolved = {};

test('cashflow ADVERSARIAL: every boundary resolve() case matches the Python oracle', () => {
  for (const c of fixtures.resolve_cases) {
    const inputs = RESOLVE_INPUTS[c.name];
    assert.ok(inputs, `missing JS inputs for ${c.name}`);
    const call = () => manager.resolve(inputs);

    if (c.expect_error !== undefined) {
      assert.throws(call, new RegExp(c.expect_error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), c.name);
      continue;
    }

    const cf = call();
    resolved[c.name] = cf;
    assertStatusEqual(cf.status, c.output.status, `${c.name}.status`);
    assertClose(cf.currentYearBenefitNominal, c.output.current_year_benefit_nominal, `${c.name}.currentYearBenefitNominal`);
    assertClose(cf.firstYearFraction, c.output.first_year_fraction, `${c.name}.firstYearFraction`);
    assert.equal(cf.newlyClaimed, c.output.newly_claimed, `${c.name}.newlyClaimed`);
    assert.deepEqual(cf.validationCodes, c.output.validation_codes, `${c.name}.validationCodes`);
  }
});

test('cashflow ADVERSARIAL: a zero (and a negative) eventual factor survives the 1e-12 divisor guard without NaN', () => {
  // The benefit module's own adversarial pass proved a claim at exactly age
  // 48 yields an eventual factor of exactly 0; below it the factor is
  // negative. Both flow into `initial_payable / max(eventual, 1e-12)` here.
  const zero = resolved.zero_eventual_factor_hits_divisor_guard;
  assert.ok(Number.isFinite(zero.currentYearBenefitNominal), 'a zero eventual factor must not produce NaN or Infinity');
  assert.equal(zero.status.fullAnnualBenefitNominal, 0, 'and must resolve to exactly zero benefit');

  const negative = resolved.negative_eventual_factor_clamped_to_zero;
  assert.ok(Number.isFinite(negative.status.fullAnnualBenefitNominal), 'a negative eventual factor must not produce NaN');
  assert.equal(negative.status.fullAnnualBenefitNominal, 0, 'the huge negative product must be clamped by max(0, ...) rather than stored');
});

test('cashflow ADVERSARIAL: the first-year-fraction mismatch tolerance is exactly 1e-12, exclusive', () => {
  // abs(delta) > 1e-12 emits the code, so a delta of exactly 1e-12 must NOT.
  assert.deepEqual(resolved.fraction_matches_exactly_no_code.validationCodes, [], 'an exact match emits no code');
  assert.deepEqual(resolved.fraction_mismatch_exactly_at_tolerance.validationCodes, [], 'a delta AT the tolerance must not emit the code (comparison is strictly greater-than)');
  assert.deepEqual(resolved.fraction_mismatch_just_past_tolerance.validationCodes, ['SS_FIRST_YEAR_FRACTION_MISMATCH'], 'a delta past the tolerance must emit it');
});

test('cashflow ADVERSARIAL: the nonpositive-benefit code fires at exactly zero, not just below it', () => {
  assert.deepEqual(resolved.benefit_exactly_zero_emits_nonpositive_code.validationCodes, ['SS_CLAIM_BENEFIT_NONPOSITIVE'], 'exactly zero is nonpositive');
  assert.deepEqual(resolved.benefit_negative_emits_nonpositive_code.validationCodes, ['SS_CLAIM_BENEFIT_NONPOSITIVE'], 'negative is nonpositive');
  assert.deepEqual(resolved.benefit_one_cent_positive_no_code.validationCodes, [], 'one cent is positive');
});

test('cashflow ADVERSARIAL: the claim window is inclusive at the current month and exclusive twelve months later', () => {
  assert.ok(resolved.claim_exactly_at_current_age, 'claiming in the current month is allowed');
  assert.ok(resolved.claim_at_last_valid_window_month, 'claiming eleven months out is allowed');
  assert.throws(() => manager.resolve(RESOLVE_INPUTS.claim_one_past_window_end), /within the current annual cycle/);
  assert.throws(() => manager.resolve(RESOLVE_INPUTS.claim_one_before_window_start), /within the current annual cycle/);
});

test('cashflow ADVERSARIAL: activatePending and applyCola boundary cases match the Python oracle', () => {
  const pending = createClaimStatus({
    claimAgeMonths: 68 * 12 + 4, fullAnnualBenefitNominal: 28000.0,
    pendingDrcAnnualBenefitNominal: 32000.0, pendingDrcEffectiveAgeMonths: 69 * 12,
  });

  for (const c of fixtures.standalone_cases) {
    if (c.name.startsWith('activate_pending_') && c.current_age_months !== undefined) {
      const actual = activatePending(pending, c.current_age_months);
      assertStatusEqual(actual, c.output, c.name);
      continue;
    }
    if (c.name === 'activate_pending_missing_effective_month_raises') {
      const broken = createClaimStatus({
        claimAgeMonths: 68 * 12, fullAnnualBenefitNominal: 28000.0,
        pendingDrcAnnualBenefitNominal: 32000.0, pendingDrcEffectiveAgeMonths: null,
      });
      assert.throws(() => activatePending(broken, 69 * 12), new RegExp(c.expect_error), c.name);
      continue;
    }
    if (c.name === 'apply_cola_compounds_twice') {
      const twice = applyCola(applyCola(pending, 0.03), 0.03);
      assertStatusEqual(twice, c.output, c.name);
      continue;
    }
    if (c.name.startsWith('apply_cola_')) {
      if (c.expect_error !== undefined) {
        assert.throws(() => applyCola(pending, c.cola, c.cola_floor), new RegExp(c.expect_error), c.name);
      } else {
        assertStatusEqual(applyCola(pending, c.cola, c.cola_floor), c.output, c.name);
      }
    }
  }
});

test('cashflow ADVERSARIAL: COLA rejection is inclusive at -100% and compounds on both the current and pending amounts', () => {
  const pending = createClaimStatus({
    claimAgeMonths: 68 * 12 + 4, fullAnnualBenefitNominal: 28000.0,
    pendingDrcAnnualBenefitNominal: 32000.0, pendingDrcEffectiveAgeMonths: 69 * 12,
  });
  assert.throws(() => applyCola(pending, -1.0, -2.0), /cannot reduce benefits below zero/, 'exactly -100% must be rejected (the comparison is <=)');
  assert.ok(applyCola(pending, -0.999999, -2.0), 'just above -100% must be accepted');

  const twice = applyCola(applyCola(pending, 0.03), 0.03);
  assertClose(twice.fullAnnualBenefitNominal, 28000.0 * 1.03 * 1.03, 'the current amount must compound');
  assertClose(twice.pendingDrcAnnualBenefitNominal, 32000.0 * 1.03 * 1.03, 'the pending delayed-credit amount must compound too, not be left behind');
  assert.equal(twice.pendingDrcEffectiveAgeMonths, 69 * 12, 'and the effective month must survive both applications unchanged');
});
