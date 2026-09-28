'use strict';

/**
 * Adversarial test for the Social Security state boundary, focused on
 * SocialSecurityPlanningState.fingerprint() -- a SHA-256 over CPython's
 * exact `json.dumps(..., sort_keys=True, separators=(",", ":"))` text, which
 * the port therefore has to reproduce byte-for-byte.
 *
 * The cases with values below CPython's exponential-notation switch point
 * (equity_drawdown = 1e-5, trend_15y_real = 1e-7 -- both entirely plausible
 * real values) FAILED before pyFloatRepr() was corrected, because JS renders
 * them "0.00001"/"1e-7" where CPython renders "1e-05"/"1e-07". They are the
 * end-to-end proof of that fix.
 *
 * Also pins the falsy-zero traps in the claim-age reconciliation: a claim
 * age of exactly 0 (months or legacy years) must survive, which a naive
 * truthiness filter would silently drop.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { taxIncome } = require('../../src/ported/tax-engine');
const { account } = require('../../src/ported/lifetime-tax-optimizer');
const { buildSocialSecurityPlanningState } = require('../../src/ported/social-security-state');
const { planningStateFingerprint, planningStateToPythonDict, pythonCompactJson } = require('../../src/ported/social-security-valuation');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-state-adversarial.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

function makePortfolio({ voo = 400000.0, schd = 300000.0, tbills = 100000.0, roth = 200000.0 } = {}) {
  return {
    voo: account('voo', voo, voo * 0.6, true),
    schd: account('schd', schd, schd * 0.6, true),
    tbills: account('tbills', tbills, tbills, false),
    roth: account('roth', roth, roth, false),
  };
}

function makeKnownState(overrides = {}) {
  return Object.assign({
    decisionYear: 2040, age: 65, retirementYear: 1, inflationFactor: 1.3,
    spendingReal: 60000.0, portfolioReal: 1000000.0, taxableValueReal: 600000.0,
    rothValueReal: 200000.0, reserveReal: 100000.0, reserveMonths: 20.0,
    equityDrawdown: 0.0, trailingSpendingReal: [], trailingTaxReal: [],
    trailingRealReturns: [], trend15yReal: null,
    ssClaimAge: null, ssClaimAgeMonths: null,
  }, overrides);
}

// Inputs mirrored exactly from generate_ss_state_adversarial_fixtures.py.
const CASE_INPUTS = {
  fingerprint_tiny_fractions_below_switch_point: { knownState: makeKnownState({ equityDrawdown: 1e-5, trend15yReal: 1e-7 }) },
  fingerprint_very_tiny_fractions: { knownState: makeKnownState({ equityDrawdown: 5e-324, trend15yReal: 1e-12 }) },
  fingerprint_large_value_above_upper_switch_point: { knownState: makeKnownState(), portfolio: makePortfolio({ voo: 1e16 }) },
  fingerprint_negative_zero_drawdown: { knownState: makeKnownState({ equityDrawdown: -0 }) },
  fingerprint_integral_floats_keep_decimal_point: {
    knownState: makeKnownState({ inflationFactor: 2.0, reserveMonths: 12.0, equityDrawdown: 0.0 }),
    spendingReal: 50000.0, spendingFloorReal: 25000.0, fra: 24000.0,
  },
  fingerprint_baseline_for_sensitivity: { knownState: makeKnownState() },
  fingerprint_one_field_changed: { knownState: makeKnownState({ reserveMonths: 20.000000001 }) },
  fingerprint_populated_trailing_arrays: {
    knownState: makeKnownState({
      trailingSpendingReal: [58000.0, 59000.5],
      trailingTaxReal: [8000.0],
      trailingRealReturns: [0.05, -0.02, 1e-6],
    }),
  },
  claim_age_months_exactly_zero: { knownState: makeKnownState(), ssClaimAgeMonths: 0 },
  legacy_claim_age_exactly_zero: { knownState: makeKnownState({ ssClaimAge: 0 }) },
  legacy_zero_agrees_with_precise_zero: { knownState: makeKnownState({ ssClaimAge: 0 }), ssClaimAgeMonths: 0 },
  legacy_zero_disagrees_with_nonzero_precise: { knownState: makeKnownState({ ssClaimAge: 0 }), ssClaimAgeMonths: 67 * 12 },
  legacy_zero_agrees_with_eleven_months: { knownState: makeKnownState({ ssClaimAge: 0 }), ssClaimAgeMonths: 11 },
  spending_real_exactly_zero_allowed: { knownState: makeKnownState(), spendingReal: 0.0 },
  spending_floor_exactly_zero_rejected: { knownState: makeKnownState(), spendingFloorReal: 0.0 },
  fra_benefit_exactly_zero_rejected: { knownState: makeKnownState(), fra: 0.0 },
  inflation_factor_tiny_but_positive: { knownState: makeKnownState({ inflationFactor: 1e-9 }) },
};

function build(inputs) {
  return buildSocialSecurityPlanningState({
    knownState: inputs.knownState,
    portfolio: inputs.portfolio || makePortfolio(),
    baseIncomeNominal: inputs.baseIncome || taxIncome({}),
    spendingReal: inputs.spendingReal === undefined ? 60000.0 : inputs.spendingReal,
    spendingFloorReal: inputs.spendingFloorReal === undefined ? 40000.0 : inputs.spendingFloorReal,
    scheduledFraBenefitNominal: inputs.fra === undefined ? 24000.0 : inputs.fra,
    ssClaimAgeMonths: inputs.ssClaimAgeMonths === undefined ? null : inputs.ssClaimAgeMonths,
  });
}

const built = {};

test('state ADVERSARIAL: every fingerprint matches Python byte-for-byte, including values past CPython\'s float switch points', () => {
  for (const c of fixtures.cases) {
    const inputs = CASE_INPUTS[c.name];
    assert.ok(inputs, `missing JS inputs for ${c.name}`);

    if (c.expect_error !== undefined) {
      assert.throws(() => build(inputs), new RegExp(c.expect_error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), c.name);
      continue;
    }

    const state = build(inputs);
    built[c.name] = state;

    // Compare the canonical JSON text first: if this differs, the fingerprint
    // mismatch below is a rendering problem, not a hashing one -- and the
    // assertion message shows exactly which character diverged.
    assert.equal(
      pythonCompactJson(planningStateToPythonDict(state)), c.canonical_json,
      `${c.name}: canonical JSON text must match CPython's json.dumps output exactly`
    );
    assert.equal(planningStateFingerprint(state), c.fingerprint, `${c.name}: SHA-256 fingerprint`);
    assert.equal(state.ssClaimAgeMonths, c.output.ss_claim_age_months, `${c.name}.ssClaimAgeMonths`);
  }
});

test('state ADVERSARIAL: a tiny fraction below CPython\'s switch point serializes as 1e-05, not 0.00001', () => {
  // The specific regression this pass exists for. Both values are plausible
  // real inputs (a tiny computed drawdown, a near-flat 15-year trend), and
  // before pyFloatRepr() was corrected the JS fingerprint for this state did
  // not match Python's.
  const json = pythonCompactJson(planningStateToPythonDict(built.fingerprint_tiny_fractions_below_switch_point));
  assert.ok(json.includes('"equity_drawdown":1e-05'), `expected CPython's 1e-05 rendering, got: ${json}`);
  assert.ok(json.includes('"trend_15y_real":1e-07'), `expected CPython's 1e-07 rendering, got: ${json}`);
  assert.ok(!json.includes('0.00001'), 'must not fall back to JS decimal rendering');
});

test('state ADVERSARIAL: the fingerprint is sensitive to a change far below the display threshold', () => {
  const baseline = planningStateFingerprint(built.fingerprint_baseline_for_sensitivity);
  const changed = planningStateFingerprint(built.fingerprint_one_field_changed);
  assert.notEqual(baseline, changed, 'a 1e-9 change in reserve_months must change the fingerprint');
  assert.equal(planningStateFingerprint(built.fingerprint_baseline_for_sensitivity), baseline, 'and the fingerprint must be stable across repeated calls');
});

test('state ADVERSARIAL: a claim age of exactly zero survives the falsy-zero trap, in both the months and legacy fields', () => {
  // `0` is falsy in JS, so a naive `.filter(Boolean)` on the precise
  // candidates, or a `ssClaimAge ? ... : null` on the legacy field, would
  // silently drop a genuine zero and fall through to a different branch.
  assert.equal(built.claim_age_months_exactly_zero.ssClaimAgeMonths, 0, 'a precise claim age of 0 months must be preserved');
  assert.equal(built.legacy_claim_age_exactly_zero.ssClaimAgeMonths, 0, 'a legacy claim age of 0 years must convert to 0 months, not be treated as absent');
  assert.equal(built.legacy_zero_agrees_with_precise_zero.ssClaimAgeMonths, 0, 'both present and both zero must agree rather than conflict');
  assert.equal(built.legacy_zero_agrees_with_eleven_months.ssClaimAgeMonths, 11, 'floor(11/12) == 0 agrees with a legacy year of 0');
  assert.throws(
    () => build(CASE_INPUTS.legacy_zero_disagrees_with_nonzero_precise),
    /claim-age state fields disagree/,
    'a legacy 0 against a precise 804 months must still be caught as a disagreement'
  );
});

test('state ADVERSARIAL: spending of exactly zero is allowed but a floor of exactly zero is not', () => {
  // The two validations differ deliberately: `spending_real < 0.0` rejects
  // only negatives, while `spending_floor_real <= 0.0` also rejects zero.
  assert.ok(built.spending_real_exactly_zero_allowed, 'zero spending is a legal input');
  assert.equal(built.spending_real_exactly_zero_allowed.spendingReal, 0);
  assert.throws(() => build(CASE_INPUTS.spending_floor_exactly_zero_rejected), /spending and floor inputs are invalid/);
  assert.throws(() => build(CASE_INPUTS.fra_benefit_exactly_zero_rejected), /FRA benefit must be positive/);
});
