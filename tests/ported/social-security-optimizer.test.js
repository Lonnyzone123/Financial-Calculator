'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTaxCalculator, taxIncome } = require('../../src/ported/tax-engine');
const { buildMortalityPolicy } = require('../../src/ported/social-security-mortality');
const { createSocialSecurityPlanningState } = require('../../src/ported/social-security-valuation');
const { createSocialSecurityOptimizer } = require('../../src/ported/social-security-optimizer');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-optimizer.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const ssConfig = fixtures.ss_config;
const optimizerConfig = fixtures.optimizer_config;
const reserveConfig = fixtures.reserve_config;
const taxCalculator = createTaxCalculator(fixtures.tax_config);
const BIRTH_YEAR = ssConfig.birth_year;
const mortalityData = buildMortalityPolicy(BIRTH_YEAR);

function makeOptimizer() {
  return createSocialSecurityOptimizer({
    config: ssConfig, calculator: taxCalculator, mortalityData, optimizerConfig, reserveConfig,
  });
}

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

const CASE_INPUTS = {
  standard_wait_or_claim: makeState(),
  already_claimed: makeState({ ssClaimAgeMonths: 66 * 12 + 3 }),
  not_eligible_too_young: makeState({ decisionAgeMonths: 60 * 12 }),
  forced_claim_at_maximum: makeState({ decisionAgeMonths: 70 * 12 }),
  thin_portfolio_depletion_risk: makeState({ vooReal: 30000.0, vooBasisReal: 18000.0, schdReal: 0.0, schdBasisReal: 0.0, tbillsReal: 20000.0, rothReal: 10000.0, spendingFloorReal: 45000.0 }),
  near_maximum_age_schedule_or_forced: makeState({ decisionAgeMonths: 69 * 12 + 11 }),
};

test('social security optimizer port: decide() matches the Python oracle on every action branch', { timeout: 60000 }, () => {
  for (const c of fixtures.cases) {
    const state = CASE_INPUTS[c.name];
    assert.ok(state, `missing JS input for ${c.name}`);
    const optimizer = makeOptimizer();
    const decision = optimizer.decide({ planningState: state });
    const o = c.output;

    assert.equal(decision.eligible, o.eligible, `${c.name}.eligible`);
    assert.equal(decision.claimNow, o.claim_now, `${c.name}.claimNow`);
    assert.equal(decision.selectedClaimAge, o.selected_claim_age, `${c.name}.selectedClaimAge`);
    assertClose(decision.annualBenefitRealIfClaimed, o.annual_benefit_real_if_claimed, `${c.name}.annualBenefitRealIfClaimed`);
    assert.equal(decision.action, o.action, `${c.name}.action`);
    assert.equal(decision.selectedClaimAgeMonths, o.selected_claim_age_months, `${c.name}.selectedClaimAgeMonths`);
    assert.equal(decision.selectedClaimMonth, o.selected_claim_month, `${c.name}.selectedClaimMonth`);
    assertClose(decision.firstYearBenefitFraction, o.first_year_benefit_fraction, `${c.name}.firstYearBenefitFraction`);
    assert.equal(decision.candidates.length, o.candidate_count, `${c.name}.candidates.length`);

    if (o.comparison === null) {
      assert.equal(decision.comparison, null, `${c.name}.comparison (expected null)`);
    } else {
      assert.ok(decision.comparison, `${c.name}.comparison (expected non-null)`);
      assert.equal(decision.comparison.winner.claimAgeMonths, o.comparison.winner_claim_age_months, `${c.name}.comparison.winner.claimAgeMonths`);
      const runnerMonths = decision.comparison.runnerUp ? decision.comparison.runnerUp.claimAgeMonths : null;
      assert.equal(runnerMonths, o.comparison.runner_up_claim_age_months, `${c.name}.comparison.runnerUp.claimAgeMonths`);
      assertClose(decision.comparison.economicMargin, o.comparison.economic_margin, `${c.name}.comparison.economicMargin`);
      assertClose(decision.comparison.scenarioWinRate, o.comparison.scenario_win_rate, `${c.name}.comparison.scenarioWinRate`);
      assert.equal(decision.comparison.robustnessClass, o.comparison.robustness_class, `${c.name}.comparison.robustnessClass`);
      assert.equal(decision.comparison.candidates.length, o.comparison.candidate_count, `${c.name}.comparison.candidates.length`);
      assert.deepEqual(decision.comparison.sensitivityFlipAges, o.comparison.sensitivity_flip_ages, `${c.name}.comparison.sensitivityFlipAges`);
    }

    assert.ok(decision.diagnosticSummary, `${c.name}.diagnosticSummary (expected non-null)`);
    if (o.diagnostic_summary.action === undefined) {
      // ALREADY_CLAIMED / NOT_ELIGIBLE: Python's diagnostic_summary is just
      // {"future_market_data_used": False}, not a full compact_record.
      assert.equal(decision.diagnosticSummary.future_market_data_used, false, `${c.name}.diagnosticSummary.future_market_data_used`);
    } else {
      assert.equal(decision.diagnosticSummary.action, o.diagnostic_summary.action, `${c.name}.diagnosticSummary.action`);
      assert.equal(decision.diagnosticSummary.winner_age_months, o.diagnostic_summary.winner_age_months, `${c.name}.diagnosticSummary.winner_age_months`);
      assertClose(decision.diagnosticSummary.economic_margin_real, o.diagnostic_summary.economic_margin_real, `${c.name}.diagnosticSummary.economic_margin_real`);
      assert.equal(decision.diagnosticSummary.robustness_class, o.diagnostic_summary.robustness_class, `${c.name}.diagnosticSummary.robustness_class`);
      assert.equal(decision.diagnosticSummary.input_fingerprint, o.diagnostic_summary.input_fingerprint, `${c.name}.diagnosticSummary.input_fingerprint`);
    }
  }
});

test('social security optimizer port: benefitRealForMonths/annualBenefitReal match the Python oracle', () => {
  const optimizer = makeOptimizer();
  assertClose(optimizer.benefitRealForMonths(67 * 12), fixtures.standalone.benefit_real_for_months_fra_exact, 'benefitRealForMonths(FRA exact)');
  assertClose(optimizer.benefitRealForMonths(68 * 12 + 4, 1500.0), fixtures.standalone.benefit_real_for_months_custom_fra_monthly, 'benefitRealForMonths(custom fra_monthly)');
  assertClose(optimizer.annualBenefitReal(62), fixtures.standalone.annual_benefit_real_age_62, 'annualBenefitReal(62)');
  assertClose(optimizer.annualBenefitReal(70), fixtures.standalone.annual_benefit_real_age_70, 'annualBenefitReal(70)');
});

test('social security optimizer port: evaluateCandidateSet caching is deterministic across repeated calls', () => {
  const optimizer = makeOptimizer();
  const state = makeState();
  const first = optimizer.evaluateCandidateSet({ planningState: state, mortalityAlternative: 'II' });
  const second = optimizer.evaluateCandidateSet({ planningState: state, mortalityAlternative: 'II' });
  assert.equal(first.length, fixtures.cache_case.first_count, 'first.length');
  assert.equal(second.length, fixtures.cache_case.second_count, 'second.length');
  assert.equal(first, second, 'repeated call with identical inputs must return the cached array (===)');
  for (let i = 0; i < 5; i++) {
    assertClose(first[i].netEconomicValue, fixtures.cache_case.first_net_values[i], `first[${i}].netEconomicValue`);
    assertClose(second[i].netEconomicValue, fixtures.cache_case.second_net_values[i], `second[${i}].netEconomicValue`);
  }
});
