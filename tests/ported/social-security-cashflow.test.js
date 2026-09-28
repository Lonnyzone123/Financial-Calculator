'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createClaimStatus, createCashFlowManager, activatePending, applyCola } = require('../../src/ported/social-security-cashflow');
const { firstYearBenefitFraction } = require('../../src/ported/social-security-valuation');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-cashflow.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const CONFIG = { fra_age: 67, claim_max_age_months: 70 * 12, claim_cycle_start_calendar_month: 1 };
const manager = createCashFlowManager(CONFIG);

const EPS = 1e-9;
function assertClose(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) <= EPS, `${msg}: expected ${expected}, got ${actual}`);
}

function decisionFor(claimNow, selectedClaimAgeMonths, annualBenefitRealIfClaimed = 24000.0, firstYearFractionOverride = null) {
  const frac = selectedClaimAgeMonths !== null && selectedClaimAgeMonths !== undefined
    ? firstYearBenefitFraction(selectedClaimAgeMonths) : 0.0;
  return {
    claimNow,
    selectedClaimAgeMonths,
    annualBenefitRealIfClaimed,
    firstYearBenefitFraction: firstYearFractionOverride !== null ? firstYearFractionOverride : frac,
  };
}

function assertStatusEqual(actual, expected, msg) {
  if (expected === null) {
    assert.equal(actual, null, `${msg} (expected null)`);
    return;
  }
  assert.ok(actual, `${msg} (expected non-null status)`);
  assert.equal(actual.claimAgeMonths, expected.claim_age_months, `${msg}.claimAgeMonths`);
  assertClose(actual.fullAnnualBenefitNominal, expected.full_annual_benefit_nominal, `${msg}.fullAnnualBenefitNominal`);
  if (expected.pending_drc_annual_benefit_nominal === null) {
    assert.equal(actual.pendingDrcAnnualBenefitNominal, null, `${msg}.pendingDrcAnnualBenefitNominal (expected null)`);
  } else {
    assertClose(actual.pendingDrcAnnualBenefitNominal, expected.pending_drc_annual_benefit_nominal, `${msg}.pendingDrcAnnualBenefitNominal`);
  }
  assert.equal(actual.pendingDrcEffectiveAgeMonths, expected.pending_drc_effective_age_months, `${msg}.pendingDrcEffectiveAgeMonths`);
}

// Inputs mirrored exactly from generate_ss_cashflow_fixtures.py.
const priorPending = createClaimStatus({
  claimAgeMonths: 68 * 12 + 4, fullAnnualBenefitNominal: 28000.0,
  pendingDrcAnnualBenefitNominal: 32000.0, pendingDrcEffectiveAgeMonths: 69 * 12,
});
const priorSimple = createClaimStatus({ claimAgeMonths: 65 * 12, fullAnnualBenefitNominal: 20000.0 });

const RESOLVE_INPUTS = {
  not_claiming: { decision: decisionFor(false, null), currentAgeMonths: 65 * 12, inflationFactor: 1.3, priorStatus: null },
  claim_now_january_whole_year: { decision: decisionFor(true, 67 * 12, 24000.0), currentAgeMonths: 67 * 12, inflationFactor: 1.3, priorStatus: null },
  claim_now_midyear_before_fra: { decision: decisionFor(true, 65 * 12 + 5, 18000.0), currentAgeMonths: 65 * 12, inflationFactor: 1.25, priorStatus: null },
  claim_now_midyear_after_fra_pending_drc: { decision: decisionFor(true, 68 * 12 + 4, 30000.0), currentAgeMonths: 68 * 12, inflationFactor: 1.4, priorStatus: null },
  claim_now_at_maximum_age: { decision: decisionFor(true, 70 * 12, 40000.0), currentAgeMonths: 70 * 12, inflationFactor: 1.5, priorStatus: null },
  prior_status_drc_not_yet_effective: { decision: decisionFor(false, null), currentAgeMonths: 68 * 12 + 8, inflationFactor: 1.4, priorStatus: priorPending },
  prior_status_drc_effective_exact_month: { decision: decisionFor(false, null), currentAgeMonths: 69 * 12, inflationFactor: 1.4, priorStatus: priorPending },
  prior_status_drc_effective_past: { decision: decisionFor(false, null), currentAgeMonths: 69 * 12 + 6, inflationFactor: 1.4, priorStatus: priorPending },
  prior_status_no_pending_drc: { decision: decisionFor(false, null), currentAgeMonths: 66 * 12, inflationFactor: 1.35, priorStatus: priorSimple },
  error_nonpositive_inflation_factor: { decision: decisionFor(true, 67 * 12), currentAgeMonths: 67 * 12, inflationFactor: 0.0, priorStatus: null },
  error_claim_now_missing_month: { decision: decisionFor(true, null), currentAgeMonths: 67 * 12, inflationFactor: 1.3, priorStatus: null },
  error_claim_month_outside_cycle_before: { decision: decisionFor(true, 66 * 12 + 11), currentAgeMonths: 67 * 12, inflationFactor: 1.3, priorStatus: null },
  error_claim_month_outside_cycle_after: { decision: decisionFor(true, 68 * 12), currentAgeMonths: 67 * 12, inflationFactor: 1.3, priorStatus: null },
  validation_code_fraction_mismatch_and_nonpositive_benefit: { decision: decisionFor(true, 67 * 12 + 3, 0.0, 0.99), currentAgeMonths: 67 * 12, inflationFactor: 1.3, priorStatus: null },
};

test('social security cashflow port: resolve() matches the Python oracle on every case', () => {
  for (const c of fixtures.resolve_cases) {
    const inputs = RESOLVE_INPUTS[c.name];
    assert.ok(inputs, `missing JS inputs for ${c.name}`);
    const call = () => manager.resolve(inputs);
    if (c.expect_error !== undefined) {
      assert.throws(call, new RegExp(c.expect_error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${c.name} must raise the same error as Python`);
      continue;
    }
    const cf = call();
    assertStatusEqual(cf.status, c.output.status, `${c.name}.status`);
    assertClose(cf.currentYearBenefitNominal, c.output.current_year_benefit_nominal, `${c.name}.currentYearBenefitNominal`);
    assertClose(cf.firstYearFraction, c.output.first_year_fraction, `${c.name}.firstYearFraction`);
    assert.equal(cf.newlyClaimed, c.output.newly_claimed, `${c.name}.newlyClaimed`);
    assert.deepEqual(cf.validationCodes, c.output.validation_codes, `${c.name}.validationCodes`);
    if (c.output.eventual_factor === null) {
      assert.equal(cf.eventualFactor, null, `${c.name}.eventualFactor (expected null)`);
    } else {
      assertClose(cf.eventualFactor, c.output.eventual_factor, `${c.name}.eventualFactor`);
    }
    if (c.output.initial_payable_factor === null) {
      assert.equal(cf.initialPayableFactor, null, `${c.name}.initialPayableFactor (expected null)`);
    } else {
      assertClose(cf.initialPayableFactor, c.output.initial_payable_factor, `${c.name}.initialPayableFactor`);
    }
    assert.equal(cf.pendingDrcEffectiveAgeMonths, c.output.pending_drc_effective_age_months, `${c.name}.pendingDrcEffectiveAgeMonths`);
  }
});

test('social security cashflow port: activate_pending/apply_cola standalone functions match the Python oracle', () => {
  const get = (name) => fixtures.standalone_cases.find((x) => x.name === name);

  assertStatusEqual(activatePending(priorPending, 68 * 12 + 11), get('activate_pending_not_yet').output, 'activate_pending_not_yet');
  assertStatusEqual(activatePending(priorPending, 69 * 12), get('activate_pending_now').output, 'activate_pending_now');
  assertStatusEqual(activatePending(null, 69 * 12), get('activate_pending_none_status').output, 'activate_pending_none_status');

  assertStatusEqual(applyCola(priorPending, 0.03), get('apply_cola_normal').output, 'apply_cola_normal');
  assertStatusEqual(applyCola(priorSimple, -0.01, 0.0), get('apply_cola_floored').output, 'apply_cola_floored');
  assert.throws(
    () => applyCola(priorSimple, -1.5, -2.0),
    new RegExp(get('apply_cola_error_below_negative_one').expect_error),
    'apply_cola_error_below_negative_one'
  );
  assertStatusEqual(applyCola(null, 0.03), get('apply_cola_none_status').output, 'apply_cola_none_status');
});
