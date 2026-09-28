'use strict';

/**
 * Adversarial/boundary-exact stress test for SocialSecurityValuationEngine
 * -- same audit-pass pattern applied to Phases 5-8, and in this phase to
 * the optimizer's tie-breaking hierarchy and the bridge's source ranking.
 * See fixtures/generate_ss_valuation_adversarial_fixtures.py for why each
 * case exists.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTaxCalculator, taxIncome } = require('../../src/ported/tax-engine');
const { buildMortalityPolicy, createMortalityTable } = require('../../src/ported/social-security-mortality');
const { createSocialSecurityPlanningState, createPlanningScenario, createValuationEngine } = require('../../src/ported/social-security-valuation');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-valuation-adversarial.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const ssConfig = fixtures.ss_config;
const taxCalculator = createTaxCalculator(fixtures.tax_config);
const BIRTH_YEAR = ssConfig.birth_year;
const mortalityTable = createMortalityTable(buildMortalityPolicy(BIRTH_YEAR), ssConfig.mortality_central_alternative);

const EPS = 1e-6;
function assertClose(actual, expected, msg) {
  assert.ok(
    Math.abs(actual - expected) <= EPS * Math.max(1, Math.abs(expected)),
    `${msg}: expected ${expected}, got ${actual}`
  );
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
  return mortalityTable.conditionalProfile({
    birthYear: BIRTH_YEAR, sex: 'male',
    valuationAgeMonths: decisionAgeMonths, throughAgeMonths: throughAge * 12,
  });
}

function makeScenario(overrides = {}) {
  const base = {
    name: 'central', realPortfolioReturn: 0.04, realSafeReturn: 0.023,
    inflationRate: 0.024, taxIncomeRealGrowth: 0.0, weight: 1.0,
  };
  return createPlanningScenario(Object.assign(base, overrides));
}

const defaultState = makeState();
const richState = makeState({ baseIncomeNominal: taxIncome({ ordinaryIncome: 400000.0, qualifiedDividends: 50000.0 }) });
const poorState = makeState({ baseIncomeNominal: taxIncome({}) });
const oneScenario = [makeScenario()];
const zeroBenefitConfig = Object.assign({}, ssConfig, { scheduled_benefit_fraction: fixtures.zero_benefit_scheduled_fraction });
const tinyBenefitConfig = Object.assign({}, ssConfig, { scheduled_benefit_fraction: fixtures.tiny_benefit_scheduled_fraction });

const CASE_INPUTS = {
  safe_rate_exactly_zero: { config: ssConfig, state: defaultState, claimAgeMonths: 67 * 12, scenarios: [makeScenario({ realSafeReturn: 0.0 })] },
  negative_safe_rate_amplifies_pv: { config: ssConfig, state: defaultState, claimAgeMonths: 67 * 12, scenarios: [makeScenario({ realSafeReturn: -0.02 })] },
  zero_scheduled_benefit_fraction_hits_denominator_guard: { config: zeroBenefitConfig, state: defaultState, claimAgeMonths: 67 * 12, scenarios: oneScenario },
  tiny_scheduled_benefit_fraction: { config: tinyBenefitConfig, state: defaultState, claimAgeMonths: 67 * 12, scenarios: oneScenario },
  midyear_claim_after_fra_pending_drc: { config: ssConfig, state: defaultState, claimAgeMonths: 68 * 12 + 5, scenarios: oneScenario },
  midyear_claim_at_drc_cap_boundary: { config: ssConfig, state: defaultState, claimAgeMonths: 67 * 12 + 35, scenarios: oneScenario },
  claim_at_maximum_age_no_pending_drc: { config: ssConfig, state: defaultState, claimAgeMonths: 70 * 12, scenarios: oneScenario },
  claim_at_decision_date_offset_zero: { config: ssConfig, state: defaultState, claimAgeMonths: 65 * 12, scenarios: oneScenario },
  high_base_income_maximum_ss_taxation: { config: ssConfig, state: richState, claimAgeMonths: 67 * 12, scenarios: oneScenario },
  zero_base_income_untaxed_benefit: { config: ssConfig, state: poorState, claimAgeMonths: 67 * 12, scenarios: oneScenario },
  three_scenarios_inexact_thirds_weights: {
    config: ssConfig, state: defaultState, claimAgeMonths: 67 * 12,
    scenarios: [
      makeScenario({ name: 'a', realPortfolioReturn: 0.03, weight: 1.0 / 3.0 }),
      makeScenario({ name: 'central', realPortfolioReturn: 0.04, weight: 1.0 / 3.0 }),
      makeScenario({ name: 'c', realPortfolioReturn: 0.05, weight: 1.0 / 3.0 }),
    ],
  },
};

function evaluate(inputs) {
  const engine = createValuationEngine({ config: inputs.config, calculator: taxCalculator, bridgeProjector: null });
  return engine.evaluateCandidate({
    planningState: inputs.state,
    claimAgeMonths: inputs.claimAgeMonths,
    mortalityProfile: makeProfile(inputs.state.decisionAgeMonths),
    scenarios: inputs.scenarios,
  });
}

test('social security valuation ADVERSARIAL: every boundary case matches the Python oracle', () => {
  for (const c of fixtures.cases) {
    const inputs = CASE_INPUTS[c.name];
    assert.ok(inputs, `missing JS inputs for ${c.name}`);

    if (c.expect_error !== undefined) {
      assert.throws(() => evaluate(inputs), new RegExp(c.expect_error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${c.name}`);
      continue;
    }

    const result = evaluate(inputs);
    const o = c.output;
    assert.equal(result.claimAgeMonths, o.claim_age_months, `${c.name}.claimAgeMonths`);
    assertClose(result.factor, o.factor, `${c.name}.factor`);
    assertClose(result.firstYearFraction, o.first_year_fraction, `${c.name}.firstYearFraction`);
    assertClose(result.grossBenefitPv, o.gross_benefit_pv, `${c.name}.grossBenefitPv`);
    assertClose(result.afterTaxBenefitPv, o.after_tax_benefit_pv, `${c.name}.afterTaxBenefitPv`);
    assertClose(result.taxPv, o.tax_pv, `${c.name}.taxPv`);
    assertClose(result.netEconomicValue, o.net_economic_value, `${c.name}.netEconomicValue`);
    assert.equal(result.feasible, o.feasible, `${c.name}.feasible`);
    assert.deepEqual(result.validationCodes, o.validation_codes, `${c.name}.validationCodes`);
    assert.equal(result.scenarioResults.length, o.scenario_gross_pv.length, `${c.name}.scenarioResults.length`);
    for (let i = 0; i < result.scenarioResults.length; i++) {
      assertClose(result.scenarioResults[i].grossBenefitPv, o.scenario_gross_pv[i], `${c.name}.scenarioResults[${i}].grossBenefitPv`);
      assertClose(result.scenarioResults[i].afterTaxBenefitPv, o.scenario_after_tax_pv[i], `${c.name}.scenarioResults[${i}].afterTaxBenefitPv`);
    }
  }
});

test('social security valuation ADVERSARIAL: a zero scheduled benefit fraction is a clean zero, not a 0/0 NaN', () => {
  // The tax-fraction division is incremental_tax / max(annual_benefit, 1e-12).
  // With every monthly benefit exactly 0 the numerator and the un-guarded
  // denominator would both be 0 -- this proves the guard produces a real
  // zero rather than NaN propagating into every downstream PV.
  const result = evaluate(CASE_INPUTS.zero_scheduled_benefit_fraction_hits_denominator_guard);
  for (const field of ['grossBenefitPv', 'afterTaxBenefitPv', 'taxPv', 'netEconomicValue']) {
    assert.ok(Number.isFinite(result[field]), `${field} must be finite, got ${result[field]}`);
    assert.equal(result[field], 0, `${field} must be exactly 0`);
  }
  assert.deepEqual(result.validationCodes, [], 'a zero benefit is not itself a validation failure');
});

test('social security valuation ADVERSARIAL: a tiny-but-nonzero benefit stays strictly positive (the guard is not swallowing real values)', () => {
  const result = evaluate(CASE_INPUTS.tiny_scheduled_benefit_fraction);
  assert.ok(result.grossBenefitPv > 0, `expected a strictly positive gross PV, got ${result.grossBenefitPv}`);
  assert.ok(result.grossBenefitPv < 1, `expected a tiny gross PV, got ${result.grossBenefitPv}`);
});

test('social security valuation ADVERSARIAL: a zero-tax benefit yields after-tax PV EXACTLY equal to gross PV', () => {
  // With no other income the benefit is entirely untaxed, so every
  // weighted_tax term is exactly 0 and after_tax_pv accumulates the
  // identical float sequence as gross_pv -- an exact equality, not a
  // tolerance check, and one a subtly different accumulation order in the
  // port would break.
  const result = evaluate(CASE_INPUTS.zero_base_income_untaxed_benefit);
  assert.equal(result.taxPv, 0, 'tax PV must be exactly zero');
  assert.equal(result.afterTaxBenefitPv, result.grossBenefitPv, 'after-tax PV must be bit-identical to gross PV when no tax applies');
});

test('social security valuation ADVERSARIAL: discounting direction is correct across zero/positive/negative safe rates', () => {
  // A boundary property rather than a fixture value: a 0% real safe return
  // means no discounting at all, a positive rate shrinks present value, and
  // a NEGATIVE rate (legal -- validation only rejects <= -100%) amplifies
  // it. Getting the exponent's sign backwards in the port would invert this
  // ordering while still matching any single fixture value.
  const zero = evaluate(CASE_INPUTS.safe_rate_exactly_zero).grossBenefitPv;
  const negative = evaluate(CASE_INPUTS.negative_safe_rate_amplifies_pv).grossBenefitPv;
  const positive = evaluate({ ...CASE_INPUTS.safe_rate_exactly_zero, scenarios: [makeScenario({ realSafeReturn: 0.023 })] }).grossBenefitPv;
  assert.ok(negative > zero, `negative safe rate must amplify PV: ${negative} vs ${zero}`);
  assert.ok(zero > positive, `zero safe rate must exceed a positively-discounted PV: ${zero} vs ${positive}`);
});
