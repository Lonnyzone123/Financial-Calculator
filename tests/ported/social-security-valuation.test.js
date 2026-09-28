'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTaxCalculator, taxIncome } = require('../../src/ported/tax-engine');
const { buildMortalityPolicy, createMortalityTable } = require('../../src/ported/social-security-mortality');
const { createPortfolioBridgeProjector } = require('../../src/ported/social-security-bridge');
const {
  createSocialSecurityPlanningState, createPlanningScenario, createValuationEngine,
} = require('../../src/ported/social-security-valuation');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-valuation.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const taxCalculator = createTaxCalculator(fixtures.tax_config);
const BIRTH_YEAR = fixtures.ss_config.birth_year;
const policy = buildMortalityPolicy(BIRTH_YEAR);
const mortalityTable = createMortalityTable(policy, fixtures.ss_config.mortality_central_alternative);
const bridgeProjector = createPortfolioBridgeProjector({
  ssConfig: fixtures.ss_config, optimizerConfig: fixtures.optimizer_config, reserveConfig: fixtures.reserve_config,
  calculator: taxCalculator,
});

const EPS = 1e-4;
function assertClose(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) <= EPS * Math.max(1, Math.abs(expected)), `${msg}: expected ${expected}, got ${actual}`);
}

function makeState(overrides = {}) {
  const base = {
    decisionYear: 2025, decisionAgeMonths: 65 * 12, retirementYear: 1, inflationFactor: 1.2,
    spendingReal: 60000.0, spendingFloorReal: 40000.0,
    vooReal: 400000.0, vooBasisReal: 240000.0, schdReal: 200000.0, schdBasisReal: 120000.0,
    tbillsReal: 150000.0, rothReal: 100000.0, reserveMonths: 12.0, equityDrawdown: 0.0,
    baseIncomeNominal: taxIncome({ ordinaryIncome: 30000.0 }),
    trailingSpendingReal: [], trailingTaxReal: [], trailingRealReturns: [],
    trend15yReal: null, ssClaimAgeMonths: null, fraMonthlyBenefitReal: 1250.0,
  };
  return createSocialSecurityPlanningState(Object.assign(base, overrides));
}

function makeProfile(decisionAgeMonths, throughAge = 120) {
  return mortalityTable.conditionalProfile({ birthYear: BIRTH_YEAR, sex: 'male', valuationAgeMonths: decisionAgeMonths, throughAgeMonths: throughAge * 12 });
}

const state = makeState();

const customScenario = createPlanningScenario({ name: 'custom', realPortfolioReturn: 0.045, realSafeReturn: 0.02, inflationRate: 0.025, taxIncomeRealGrowth: 0.01, weight: 1.0 });
const twoScenarios = [
  createPlanningScenario({ name: 'a', realPortfolioReturn: 0.03, realSafeReturn: 0.01, inflationRate: 0.02, taxIncomeRealGrowth: 0.0, weight: 2.0 }),
  createPlanningScenario({ name: 'b', realPortfolioReturn: 0.05, realSafeReturn: 0.015, inflationRate: 0.03, taxIncomeRealGrowth: 0.0, weight: 3.0 }),
];
const zeroWeightScenarios = [createPlanningScenario({ name: 'z', realPortfolioReturn: 0.03, realSafeReturn: 0.01, inflationRate: 0.02, taxIncomeRealGrowth: 0.0, weight: 0.0 })];
const duplicateNameScenarios = [
  createPlanningScenario({ name: 'dup', realPortfolioReturn: 0.03, realSafeReturn: 0.01, inflationRate: 0.02, taxIncomeRealGrowth: 0.0, weight: 1.0 }),
  createPlanningScenario({ name: 'dup', realPortfolioReturn: 0.05, realSafeReturn: 0.02, inflationRate: 0.02, taxIncomeRealGrowth: 0.0, weight: 1.0 }),
];
const badRateScenarios = [createPlanningScenario({ name: 'bad', realPortfolioReturn: -1.5, realSafeReturn: 0.01, inflationRate: 0.02, taxIncomeRealGrowth: 0.0, weight: 1.0 })];

const engineDefault = createValuationEngine({ config: fixtures.ss_config, calculator: taxCalculator, bridgeProjector });
const engineNoBridge = createValuationEngine({ config: fixtures.ss_config, calculator: taxCalculator, bridgeProjector: null });
const engineNoTax = createValuationEngine({ config: fixtures.ss_config, calculator: null, bridgeProjector });

const CASE_INPUTS = {
  claim_now_default_scenarios: { engine: engineDefault, state, claimAgeMonths: 65 * 12 },
  claim_at_fra_default_scenarios: { engine: engineDefault, state, claimAgeMonths: 67 * 12 },
  claim_at_70_default_scenarios: { engine: engineDefault, state, claimAgeMonths: 70 * 12 },
  claim_at_68_custom_single_scenario: { engine: engineDefault, state, claimAgeMonths: 68 * 12, scenarios: [customScenario] },
  claim_at_66_two_unequal_weight_scenarios: { engine: engineDefault, state, claimAgeMonths: 66 * 12, scenarios: twoScenarios },
  claim_at_69_no_bridge_projector: { engine: engineNoBridge, state, claimAgeMonths: 69 * 12 },
  claim_at_67_no_tax_calculator: { engine: engineNoTax, state, claimAgeMonths: 67 * 12 },
  error_claim_before_eligibility: { engine: engineDefault, state, claimAgeMonths: 60 * 12 },
  error_claim_before_decision_date: { engine: engineDefault, state, claimAgeMonths: 64 * 12 },
  error_claim_exceeds_maximum: { engine: engineDefault, state, claimAgeMonths: 71 * 12 },
  error_misaligned_mortality_profile: { engine: engineDefault, state: makeState({ decisionAgeMonths: 66 * 12 }), claimAgeMonths: 67 * 12, profileOverride: makeProfile(65 * 12) },
  error_empty_scenarios: { engine: engineDefault, state, claimAgeMonths: 67 * 12, scenarios: [] },
  error_zero_weight_scenario: { engine: engineDefault, state, claimAgeMonths: 67 * 12, scenarios: zeroWeightScenarios },
  error_duplicate_scenario_names: { engine: engineDefault, state, claimAgeMonths: 67 * 12, scenarios: duplicateNameScenarios },
  error_scenario_rate_below_negative_one: { engine: engineDefault, state, claimAgeMonths: 67 * 12, scenarios: badRateScenarios },
};

test('social security valuation engine port: scenarios() matches the Python oracle default set', () => {
  const scenarios = engineDefault.scenarios();
  assert.equal(scenarios.length, fixtures.default_scenarios.length);
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    const o = fixtures.default_scenarios[i];
    assert.equal(s.name, o.name, `scenario[${i}].name`);
    assertClose(s.realPortfolioReturn, o.real_portfolio_return, `scenario[${i}].realPortfolioReturn`);
    assertClose(s.realSafeReturn, o.real_safe_return, `scenario[${i}].realSafeReturn`);
    assertClose(s.inflationRate, o.inflation_rate, `scenario[${i}].inflationRate`);
    assertClose(s.taxIncomeRealGrowth, o.tax_income_real_growth, `scenario[${i}].taxIncomeRealGrowth`);
    assertClose(s.weight, o.weight, `scenario[${i}].weight`);
  }
});

test('social security valuation engine port: evaluateCandidate matches the Python oracle on every case', () => {
  for (const c of fixtures.cases) {
    const inputs = CASE_INPUTS[c.name];
    assert.ok(inputs, `missing JS inputs for ${c.name}`);
    const profile = inputs.profileOverride || makeProfile(inputs.state.decisionAgeMonths);
    const call = () => inputs.engine.evaluateCandidate({
      planningState: inputs.state, claimAgeMonths: inputs.claimAgeMonths, mortalityProfile: profile,
      scenarios: inputs.scenarios,
    });
    if (c.expect_error !== undefined) {
      assert.throws(call, new RegExp(c.expect_error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${c.name} must raise the same error as Python`);
      continue;
    }
    const result = call();
    const o = c.output;
    assert.equal(result.claimAgeMonths, o.claim_age_months, `${c.name}.claimAgeMonths`);
    assertClose(result.factor, o.factor, `${c.name}.factor`);
    assertClose(result.firstYearFraction, o.first_year_fraction, `${c.name}.firstYearFraction`);
    assertClose(result.grossBenefitPv, o.gross_benefit_pv, `${c.name}.grossBenefitPv`);
    assertClose(result.afterTaxBenefitPv, o.after_tax_benefit_pv, `${c.name}.afterTaxBenefitPv`);
    assertClose(result.bridgeCostPv, o.bridge_cost_pv, `${c.name}.bridgeCostPv`);
    assertClose(result.netEconomicValue, o.net_economic_value, `${c.name}.netEconomicValue`);
    assertClose(result.taxPv, o.tax_pv, `${c.name}.taxPv`);
    assertClose(result.terminalAssets, o.terminal_assets, `${c.name}.terminalAssets`);
    assert.equal(result.feasible, o.feasible, `${c.name}.feasible`);
    assert.deepEqual(result.validationCodes, o.validation_codes, `${c.name}.validationCodes`);
    assert.equal(result.scenarioResults.length, o.scenario_results.length, `${c.name}.scenarioResults.length`);
    for (let i = 0; i < result.scenarioResults.length; i++) {
      const rs = result.scenarioResults[i];
      const os = o.scenario_results[i];
      assert.equal(rs.scenario, os.scenario, `${c.name}.scenarioResults[${i}].scenario`);
      assertClose(rs.grossBenefitPv, os.gross_benefit_pv, `${c.name}.scenarioResults[${i}].grossBenefitPv`);
      assertClose(rs.afterTaxBenefitPv, os.after_tax_benefit_pv, `${c.name}.scenarioResults[${i}].afterTaxBenefitPv`);
      assertClose(rs.netEconomicValue, os.net_economic_value, `${c.name}.scenarioResults[${i}].netEconomicValue`);
      assert.equal(rs.feasible, os.feasible, `${c.name}.scenarioResults[${i}].feasible`);
    }
  }
});
