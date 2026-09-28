'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTaxCalculator, taxIncome } = require('../../src/ported/tax-engine');
const { buildMortalityPolicy, createMortalityTable } = require('../../src/ported/social-security-mortality');
const { createPortfolioBridgeProjector } = require('../../src/ported/social-security-bridge');
const { createSocialSecurityPlanningState, createValuationEngine, planningStateFingerprint } = require('../../src/ported/social-security-valuation');
const { createDiagnosticBuilder } = require('../../src/ported/social-security-diagnostics');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-diagnostics.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

// Reconstruct the same ss_config used to generate the fixtures via the
// already-verified bridge fixture's config (identical config section, same
// snapshot) -- avoids re-embedding the whole config a third time.
const bridgeFixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'ss-bridge.fixtures.json'), 'utf8'));
const ssConfig = bridgeFixtures.ss_config;
const optimizerConfig = bridgeFixtures.optimizer_config;
const reserveConfig = bridgeFixtures.reserve_config;
const taxCalculator = createTaxCalculator(bridgeFixtures.tax_config);
const BIRTH_YEAR = ssConfig.birth_year;
const policy = buildMortalityPolicy(BIRTH_YEAR);
const mortalityTable = createMortalityTable(policy, ssConfig.mortality_central_alternative);
const bridgeProjector = createPortfolioBridgeProjector({ ssConfig, optimizerConfig, reserveConfig, calculator: taxCalculator });
const engine = createValuationEngine({ config: ssConfig, calculator: taxCalculator, bridgeProjector });
const builder = createDiagnosticBuilder(ssConfig);

const state = createSocialSecurityPlanningState({
  decisionYear: 2025, decisionAgeMonths: 65 * 12, retirementYear: 1, inflationFactor: 1.2,
  spendingReal: 60000.0, spendingFloorReal: 40000.0,
  vooReal: 400000.0, vooBasisReal: 240000.0, schdReal: 200000.0, schdBasisReal: 120000.0,
  tbillsReal: 150000.0, rothReal: 100000.0, reserveMonths: 12.0, equityDrawdown: 0.0,
  baseIncomeNominal: taxIncome({ ordinaryIncome: 30000.0 }),
  fraMonthlyBenefitReal: 1250.0,
});
const profile = mortalityTable.conditionalProfile({ birthYear: BIRTH_YEAR, sex: 'male', valuationAgeMonths: 65 * 12, throughAgeMonths: 120 * 12 });

const candidate65 = engine.evaluateCandidate({ planningState: state, claimAgeMonths: 65 * 12, mortalityProfile: profile });
const candidate67 = engine.evaluateCandidate({ planningState: state, claimAgeMonths: 67 * 12, mortalityProfile: profile });
const candidate70 = engine.evaluateCandidate({ planningState: state, claimAgeMonths: 70 * 12, mortalityProfile: profile });

const EPS = 1e-4;
function assertClose(actual, expected, msg) {
  if (expected === 'Infinity') { assert.equal(actual, Infinity, msg); return; }
  assert.ok(Math.abs(actual - expected) <= EPS * Math.max(1, Math.abs(expected)), `${msg}: expected ${expected}, got ${actual}`);
}

function makeComparison(fields) {
  return {
    winner: fields.winner,
    runnerUp: fields.runnerUp === undefined ? null : fields.runnerUp,
    economicMargin: fields.economicMargin,
    scenarioWinRate: fields.scenarioWinRate,
    sensitivityFlipAges: fields.sensitivityFlipAges,
    robustnessClass: fields.robustnessClass,
    candidates: fields.candidates,
  };
}

const COMPARISONS = {
  clear_winner_robust: makeComparison({
    winner: candidate70, runnerUp: candidate67,
    economicMargin: candidate70.netEconomicValue - candidate67.netEconomicValue,
    scenarioWinRate: 1.0, sensitivityFlipAges: { lower_return: 70 * 12, higher_return: 70 * 12 },
    robustnessClass: 'ROBUST', candidates: [candidate65, candidate67, candidate70],
  }),
  no_runner_up: makeComparison({
    winner: candidate67, runnerUp: null, economicMargin: 0.0, scenarioWinRate: 1.0,
    sensitivityFlipAges: {}, robustnessClass: 'ROBUST', candidates: [candidate67],
  }),
  sensitivity_flip_present: makeComparison({
    winner: candidate67, runnerUp: candidate65,
    economicMargin: candidate67.netEconomicValue - candidate65.netEconomicValue,
    scenarioWinRate: 0.5, sensitivityFlipAges: { lower_return: 65 * 12, higher_return: 70 * 12 },
    robustnessClass: 'SENSITIVE', candidates: [candidate65, candidate67, candidate70],
  }),
  negative_margin_tiebreak: makeComparison({
    winner: candidate65, runnerUp: candidate67, economicMargin: -500.0,
    scenarioWinRate: 0.6, sensitivityFlipAges: { lower_return: 65 * 12 },
    robustnessClass: 'FRAGILE', candidates: [candidate65, candidate67],
  }),
  exact_tie: makeComparison({
    winner: candidate67, runnerUp: candidate70, economicMargin: 0.0,
    scenarioWinRate: 1.0, sensitivityFlipAges: {}, robustnessClass: 'ROBUST',
    candidates: [candidate67, candidate70],
  }),
  invalid_candidate_present: makeComparison({
    winner: candidate70, runnerUp: candidate67, economicMargin: 1000.0,
    scenarioWinRate: 1.0, sensitivityFlipAges: {}, robustnessClass: 'ROBUST',
    candidates: [Object.assign({}, candidate65, { feasible: false, validationCodes: ['SS_BRIDGE_INFEASIBLE'] }), candidate67, candidate70],
  }),
};

function assertCandidateSummaryEqual(actual, expected, msg) {
  if (expected === null) {
    assert.equal(actual, null, `${msg} (expected null)`);
    return;
  }
  assert.equal(actual.claim_age_months, expected.claim_age_months, `${msg}.claim_age_months`);
  assertClose(actual.claim_factor, expected.claim_factor, `${msg}.claim_factor`);
  assertClose(actual.gross_benefit_pv_real, expected.gross_benefit_pv_real, `${msg}.gross_benefit_pv_real`);
  assertClose(actual.net_economic_value_real, expected.net_economic_value_real, `${msg}.net_economic_value_real`);
  assertClose(actual.bridge.opportunity_cost_pv_real, expected.bridge.opportunity_cost_pv_real, `${msg}.bridge.opportunity_cost_pv_real`);
  assertClose(actual.bridge.incremental_tax_pv_real, expected.bridge.incremental_tax_pv_real, `${msg}.bridge.incremental_tax_pv_real`);
  assert.equal(actual.bridge.feasible, expected.bridge.feasible, `${msg}.bridge.feasible`);
  assert.deepEqual(actual.bridge.validation_codes, expected.bridge.validation_codes, `${msg}.bridge.validation_codes`);
  assertClose(actual.longevity.minimum_checkpoint_coverage, expected.longevity.minimum_checkpoint_coverage, `${msg}.longevity.minimum_checkpoint_coverage`);
  assert.equal(actual.feasible, expected.feasible, `${msg}.feasible`);
}

test('social security diagnostics port: compactRecord matches the Python oracle on every case', () => {
  for (const c of fixtures.cases) {
    const comparison = COMPARISONS[c.name];
    assert.ok(comparison, `missing JS comparison for ${c.name}`);
    const record = builder.compactRecord({ planningState: state, comparison, action: c.compact_record.action });
    const expected = c.compact_record;

    assert.equal(record.input_fingerprint, planningStateFingerprint(state), `${c.name}.input_fingerprint self-consistency`);
    assert.equal(record.input_fingerprint, expected.input_fingerprint, `${c.name}.input_fingerprint matches Python`);
    assert.equal(record.decision_year, expected.decision_year, `${c.name}.decision_year`);
    assert.equal(record.action, expected.action, `${c.name}.action`);
    assert.equal(record.winner_age_months, expected.winner_age_months, `${c.name}.winner_age_months`);
    assert.equal(record.runner_up_age_months, expected.runner_up_age_months, `${c.name}.runner_up_age_months`);
    assertClose(record.economic_margin_real, expected.economic_margin_real, `${c.name}.economic_margin_real`);
    assert.equal(record.economic_margin_direction, expected.economic_margin_direction, `${c.name}.economic_margin_direction`);
    assert.equal(record.robustness_class, expected.robustness_class, `${c.name}.robustness_class`);
    assert.equal(record.candidate_count, expected.candidate_count, `${c.name}.candidate_count`);
    assert.equal(record.valid_candidate_count, expected.valid_candidate_count, `${c.name}.valid_candidate_count`);
    assert.equal(record.invalid_candidate_count, expected.invalid_candidate_count, `${c.name}.invalid_candidate_count`);
    assert.equal(record.sensitivity_flip_count, expected.sensitivity_flip_count, `${c.name}.sensitivity_flip_count`);
    assert.deepEqual(record.state_boundary_categories, expected.state_boundary_categories, `${c.name}.state_boundary_categories`);
    assert.deepEqual(Object.keys(record.sensitivity).sort(), Object.keys(expected.sensitivity).sort(), `${c.name}.sensitivity keys`);
    for (const label of Object.keys(expected.sensitivity)) {
      assert.deepEqual(record.sensitivity[label], expected.sensitivity[label], `${c.name}.sensitivity.${label}`);
    }
    assertCandidateSummaryEqual(record.winner, expected.winner, `${c.name}.winner`);
    assertCandidateSummaryEqual(record.runner_up, expected.runner_up, `${c.name}.runner_up`);

    const detailed = builder.detailedCandidates(comparison);
    assert.equal(detailed.length, c.detailed_candidates.length, `${c.name}.detailedCandidates.length`);
    for (let i = 0; i < detailed.length; i++) {
      assert.equal(detailed[i].scenarios.length, c.detailed_candidates[i].scenarios.length, `${c.name}.detailedCandidates[${i}].scenarios.length`);
      assertClose(detailed[i].net_economic_value_real, c.detailed_candidates[i].net_economic_value_real, `${c.name}.detailedCandidates[${i}].net_economic_value_real`);
    }

    const reasons = builder.traceReasons(comparison);
    assert.deepEqual(reasons, c.trace_reasons, `${c.name}.traceReasons`);
  }
});
