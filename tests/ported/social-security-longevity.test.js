'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildMortalityPolicy, createMortalityTable } = require('../../src/ported/social-security-mortality');
const { createLongevityAnalyzer } = require('../../src/ported/social-security-longevity');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-longevity.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const SS_CONFIG = { longevity_start_age: 85, longevity_checkpoint_ages: [85, 90, 95] };
const analyzer = createLongevityAnalyzer(SS_CONFIG);
const policy1960 = buildMortalityPolicy(1960);
const table = createMortalityTable(policy1960, 'II');

const EPS = 1e-6;
function assertClose(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) <= EPS * Math.max(1, Math.abs(expected)), `${msg}: expected ${expected}, got ${actual}`);
}

function makeProfile({ decisionAgeMonths = 65 * 12, throughAge = 120 } = {}) {
  return table.conditionalProfile({
    birthYear: 1960, sex: 'male', valuationAgeMonths: decisionAgeMonths, throughAgeMonths: throughAge * 12,
  });
}

// planningStatePortfolioReal() (used internally by evaluateScenario) sums
// state.vooReal+schdReal+tbillsReal+rothReal -- the fixture generator's fake
// planning state exposed a single portfolio_real field instead, so route
// the whole balance through vooReal here to produce the same total via the
// real, unmodified helper.
function makeStateForReal({ floor = 40000.0, decisionAgeMonths = 65 * 12, portfolioReal = 800000.0 } = {}) {
  return {
    spendingFloorReal: floor,
    decisionAgeMonths,
    vooReal: portfolioReal, schdReal: 0, tbillsReal: 0, rothReal: 0,
  };
}

function benefitsFlat(monthlyAmount, startMonth, endMonthExclusive) {
  const out = {};
  for (let m = startMonth; m < endMonthExclusive; m++) out[m] = monthlyAmount;
  return out;
}

const state = makeStateForReal();
const profile = makeProfile();
const misalignedProfile = makeProfile({ decisionAgeMonths: 66 * 12 });

const SCENARIO_INPUTS = {
  generous_full_coverage: { state, profile, scenarioName: 'claim_early', realPortfolioReturn: 0.03, realSafeReturn: 0.01, benefits: benefitsFlat(40000.0 / 12.0, 65 * 12, 121 * 12) },
  never_claimed_zero_benefit: { state, profile, scenarioName: 'never_claim', realPortfolioReturn: 0.02, realSafeReturn: 0.01, benefits: {} },
  partial_benefit_half_floor: { state, profile, scenarioName: 'claim_mid', realPortfolioReturn: 0.025, realSafeReturn: 0.01, benefits: benefitsFlat(20000.0 / 12.0, 65 * 12, 121 * 12) },
  adverse_return_modest_benefit: { state, profile, scenarioName: 'adverse', realPortfolioReturn: -0.02, realSafeReturn: 0.005, benefits: benefitsFlat(15000.0 / 12.0, 65 * 12, 121 * 12) },
  deferred_claim_to_70: { state, profile, scenarioName: 'claim_70', realPortfolioReturn: 0.025, realSafeReturn: 0.01, benefits: benefitsFlat(35000.0 / 12.0, 70 * 12, 121 * 12) },
  error_zero_floor: { state: makeStateForReal({ floor: 0.0 }), profile, scenarioName: 'x', realPortfolioReturn: 0.02, realSafeReturn: 0.01, benefits: {} },
  error_bad_portfolio_return: { state, profile, scenarioName: 'x', realPortfolioReturn: -1.0, realSafeReturn: 0.01, benefits: {} },
  error_bad_safe_return: { state, profile, scenarioName: 'x', realPortfolioReturn: 0.02, realSafeReturn: -1.5, benefits: {} },
  error_misaligned_profile: { state, profile: misalignedProfile, scenarioName: 'x', realPortfolioReturn: 0.02, realSafeReturn: 0.01, benefits: {} },
  error_negative_benefit: { state, profile, scenarioName: 'x', realPortfolioReturn: 0.02, realSafeReturn: 0.01, benefits: { [65 * 12]: -100.0 } },
};

test('social security longevity port: evaluateScenario matches the Python oracle on every case', () => {
  const results = {};
  for (const c of fixtures.scenario_cases) {
    const inputs = SCENARIO_INPUTS[c.name];
    assert.ok(inputs, `missing JS inputs for ${c.name}`);
    const call = () => analyzer.evaluateScenario({
      planningState: inputs.state, mortalityProfile: inputs.profile, scenarioName: inputs.scenarioName,
      realPortfolioReturn: inputs.realPortfolioReturn, realSafeReturn: inputs.realSafeReturn,
      afterTaxBenefitByAgeMonth: inputs.benefits,
    });
    if (c.expect_error !== undefined) {
      assert.throws(call, new RegExp(c.expect_error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${c.name} must raise the same error as Python`);
      continue;
    }
    const result = call();
    results[c.name] = result;
    const o = c.output;
    assert.equal(result.scenario, o.scenario, `${c.name}.scenario`);
    assertClose(result.age85Coverage, o.age85_coverage, `${c.name}.age85Coverage`);
    assertClose(result.age90Coverage, o.age90_coverage, `${c.name}.age90Coverage`);
    assertClose(result.age95Coverage, o.age95_coverage, `${c.name}.age95Coverage`);
    assertClose(result.conditionalShortfallPv, o.conditional_shortfall_pv, `${c.name}.conditionalShortfallPv`);
    assertClose(result.depletionProtection, o.depletion_protection, `${c.name}.depletionProtection`);
    assertClose(result.reserveEquivalentReal, o.reserve_equivalent_real, `${c.name}.reserveEquivalentReal`);
    assertClose(result.floorTerminalAssetsReal, o.floor_terminal_assets_real, `${c.name}.floorTerminalAssetsReal`);
    assert.equal(result.projectedDepletionAgeMonths, o.projected_depletion_age_months, `${c.name}.projectedDepletionAgeMonths`);
    assertClose(result.survivalAtDepletion, o.survival_at_depletion, `${c.name}.survivalAtDepletion`);
    assert.deepEqual(result.validationCodes, o.validation_codes, `${c.name}.validationCodes`);
  }

  // aggregate() across the 5 successful scenarios, matching the fixture's
  // own weight vector and scenario order exactly.
  const successNames = ['generous_full_coverage', 'never_claimed_zero_benefit', 'partial_benefit_half_floor', 'adverse_return_modest_benefit', 'deferred_claim_to_70'];
  const scenarioObjs = successNames.map((n) => results[n]);
  const weights = fixtures.aggregate_case.weights;
  const aggregated = analyzer.aggregate(scenarioObjs, weights);
  const ao = fixtures.aggregate_case.output;
  assertClose(aggregated.age85Coverage, ao.age85_coverage, 'aggregate.age85Coverage');
  assertClose(aggregated.age90Coverage, ao.age90_coverage, 'aggregate.age90Coverage');
  assertClose(aggregated.age95Coverage, ao.age95_coverage, 'aggregate.age95Coverage');
  assertClose(aggregated.conditionalShortfallPv, ao.conditional_shortfall_pv, 'aggregate.conditionalShortfallPv');
  assertClose(aggregated.depletionProtection, ao.depletion_protection, 'aggregate.depletionProtection');
  assertClose(aggregated.reserveEquivalentReal, ao.reserve_equivalent_real, 'aggregate.reserveEquivalentReal');
  assertClose(aggregated.floorDepletionScenarioRate, ao.floor_depletion_scenario_rate, 'aggregate.floorDepletionScenarioRate');
  assertClose(aggregated.survivalWeightedDepletionRisk, ao.survival_weighted_depletion_risk, 'aggregate.survivalWeightedDepletionRisk');
  assert.equal(aggregated.earliestDepletionAgeMonths, ao.earliest_depletion_age_months, 'aggregate.earliestDepletionAgeMonths');
  assertClose(aggregated.expectedFloorTerminalAssetsReal, ao.expected_floor_terminal_assets_real, 'aggregate.expectedFloorTerminalAssetsReal');
  assert.deepEqual(aggregated.validationCodes, ao.validation_codes, 'aggregate.validationCodes');

  for (const errCase of fixtures.aggregate_error_cases) {
    const badWeights = errCase.name === 'aggregate_error_mismatched_length' ? [1.0, 2.0] : [0.0, 0.0, 0.0, 0.0, 0.0];
    assert.throws(
      () => analyzer.aggregate(scenarioObjs, badWeights),
      new RegExp(errCase.expect_error),
      errCase.name
    );
  }
});
