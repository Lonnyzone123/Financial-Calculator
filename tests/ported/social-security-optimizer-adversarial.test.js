'use strict';

/**
 * Adversarial/boundary-exact stress test for the Social Security optimizer's
 * _compare_candidates()/_select_candidate() tie-breaking hierarchy -- same
 * audit-pass pattern already applied to Phases 5-8 (see
 * MERGE_AUDIT_AND_PLAN.md's "Stress-test/audit pass" sections). Hand-builds
 * minimal CandidateValuation-shaped objects directly, bypassing the
 * expensive full evaluateCandidate() pipeline, matching
 * fixtures/generate_ss_optimizer_adversarial_fixtures.py's own approach.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTaxCalculator } = require('../../src/ported/tax-engine');
const { createCandidateValuation, createCandidateScenarioValuation, createBridgeProjection } = require('../../src/ported/social-security-valuation');
const { createSocialSecurityOptimizer } = require('../../src/ported/social-security-optimizer');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-optimizer-adversarial.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const bridgeFixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'ss-bridge.fixtures.json'), 'utf8'));
const ssConfig = bridgeFixtures.ss_config;
const taxCalculator = createTaxCalculator(bridgeFixtures.tax_config);
const optimizer = createSocialSecurityOptimizer({ config: ssConfig, calculator: taxCalculator });

const EPS = 1e-6;
function assertClose(actual, expected, msg) {
  if (expected === 'Infinity') { assert.equal(actual, Infinity, msg); return; }
  assert.ok(Math.abs(actual - expected) <= EPS * Math.max(1, Math.abs(expected)), `${msg}: expected ${expected}, got ${actual}`);
}

function scenarioResultFor(name, netEconomicValue) {
  return createCandidateScenarioValuation({
    scenario: name, grossBenefitPv: 0.0, afterTaxBenefitPv: 0.0, taxPv: 0.0,
    bridge: createBridgeProjection({}),
    longevity: {
      scenario: name, age85Coverage: 0.0, age90Coverage: 0.0, age95Coverage: 0.0,
      conditionalShortfallPv: 0.0, depletionProtection: 1.0, reserveEquivalentReal: 0.0,
      floorTerminalAssetsReal: 0.0, projectedDepletionAgeMonths: null, survivalAtDepletion: 0.0,
      validationCodes: [],
    },
    netEconomicValue, terminalAssets: 0.0, feasible: true, validationCodes: [],
  });
}

function makeCandidate(claimAgeMonths, {
  centralValue, lowerValue = null, higherValue = null,
  depletionProtection = 0.9, age85 = 0.8, age90 = 0.8, age95 = 0.8, reserveEquivalent = 1000.0,
  shortfallPv = 500.0, taxPv = 100.0, terminalAssets = 200000.0,
  floorDepletionRate = 0.0, feasible = true,
}) {
  const lower = lowerValue === null ? centralValue : lowerValue;
  const higher = higherValue === null ? centralValue : higherValue;
  const scenarioResults = [
    scenarioResultFor('lower_return', lower),
    scenarioResultFor('central', centralValue),
    scenarioResultFor('higher_return', higher),
  ];
  const longevity = {
    age85Coverage: age85, age90Coverage: age90, age95Coverage: age95,
    conditionalShortfallPv: shortfallPv, depletionProtection, reserveEquivalentReal: reserveEquivalent,
    floorDepletionScenarioRate: floorDepletionRate, survivalWeightedDepletionRisk: 0.0,
    earliestDepletionAgeMonths: null, expectedFloorTerminalAssetsReal: 0.0,
    scenarioResults: [], validationCodes: [],
  };
  return createCandidateValuation({
    claimAgeMonths, factor: 1.0, firstYearFraction: 1.0,
    grossBenefitPv: centralValue, afterTaxBenefitPv: centralValue, bridgeCostPv: 0.0,
    netEconomicValue: centralValue, taxPv, terminalAssets, longevity, feasible,
    validationCodes: [], scenarioResults,
  });
}

const closeFraction = fixtures.economic_close_call_fraction;
const bestValue = 100000.0;
const tolerance = Math.max(Math.abs(bestValue), 1.0) * closeFraction;

const CASE_CANDIDATES = {
  full_tie_except_claim_age_picks_highest_age: [
    makeCandidate(66 * 12, { centralValue: 100000.0 }),
    makeCandidate(68 * 12, { centralValue: 100000.0 }),
  ],
  genuine_full_tie_same_claim_age: [
    makeCandidate(67 * 12, { centralValue: 50000.0 }),
    makeCandidate(67 * 12, { centralValue: 50000.0 }),
  ],
  no_depletion_beats_higher_value_with_depletion: [
    makeCandidate(65 * 12, { centralValue: 80000.0, floorDepletionRate: 0.0 }),
    makeCandidate(67 * 12, { centralValue: 120000.0, floorDepletionRate: 0.3 }),
  ],
  all_depleted_narrows_by_rate_then_shortfall_boundary: [
    makeCandidate(65 * 12, { centralValue: 80000.0, floorDepletionRate: 0.5, shortfallPv: 1000.0 }),
    makeCandidate(66 * 12, { centralValue: 90000.0, floorDepletionRate: 0.2, shortfallPv: 2000.0 }),
    makeCandidate(67 * 12, { centralValue: 70000.0, floorDepletionRate: 0.2, shortfallPv: 2000.999999 }),
    makeCandidate(68 * 12, { centralValue: 60000.0, floorDepletionRate: 0.2, shortfallPv: 3001.0 }),
  ],
  robust_candidate_beats_higher_value_fragile_one: [
    makeCandidate(66 * 12, { centralValue: 90000.0, lowerValue: 89000.0, higherValue: 91000.0 }),
    makeCandidate(68 * 12, { centralValue: 200000.0, lowerValue: 1000.0, higherValue: 1000.0 }),
  ],
  exact_close_tolerance_boundary_both_in_pool: [
    makeCandidate(65 * 12, { centralValue: bestValue - tolerance, depletionProtection: 0.99 }),
    makeCandidate(67 * 12, { centralValue: bestValue, depletionProtection: 0.5 }),
  ],
  just_past_close_tolerance_boundary_excluded: [
    makeCandidate(65 * 12, { centralValue: bestValue - tolerance - 1.0, depletionProtection: 0.99 }),
    makeCandidate(67 * 12, { centralValue: bestValue, depletionProtection: 0.5 }),
  ],
  single_candidate_no_runner_up: [
    makeCandidate(67 * 12, { centralValue: 100000.0 }),
  ],
  no_valid_candidates_raises: [
    makeCandidate(65 * 12, { centralValue: 50000.0, feasible: false }),
  ],
};

test('social security optimizer ADVERSARIAL: compareCandidates tie-breaking hierarchy matches the Python oracle exactly', () => {
  for (const c of fixtures.cases) {
    const candidates = CASE_CANDIDATES[c.name];
    assert.ok(candidates, `missing JS candidates for ${c.name}`);
    const call = () => optimizer.compareCandidates(candidates);

    if (c.expect_error !== undefined) {
      assert.throws(call, new RegExp(c.expect_error), `${c.name} must raise the same error as Python`);
      continue;
    }

    const comparison = call();
    const o = c.output;
    assert.equal(comparison.winner.claimAgeMonths, o.winner_claim_age_months, `${c.name}.winner.claimAgeMonths`);
    const runnerMonths = comparison.runnerUp ? comparison.runnerUp.claimAgeMonths : null;
    assert.equal(runnerMonths, o.runner_up_claim_age_months, `${c.name}.runnerUp.claimAgeMonths`);
    assertClose(comparison.economicMargin, o.economic_margin, `${c.name}.economicMargin`);
    assertClose(comparison.scenarioWinRate, o.scenario_win_rate, `${c.name}.scenarioWinRate`);
    assert.equal(comparison.robustnessClass, o.robustness_class, `${c.name}.robustnessClass`);
    assert.deepEqual(comparison.sensitivityFlipAges, o.sensitivity_flip_ages, `${c.name}.sensitivityFlipAges`);
  }
});

test('social security optimizer ADVERSARIAL: the genuine full tie is resolved by first-occurrence-wins, not identity confusion', () => {
  // Confirms winner and runner-up are genuinely two DIFFERENT candidate
  // objects (both happen to share claim_age_months=804), matching Python's
  // `remaining = tuple(c for c in valid if c is not winner)` object-identity
  // exclusion -- a naive JS port using value-equality instead of reference
  // exclusion would either drop both or keep both.
  const candidates = CASE_CANDIDATES.genuine_full_tie_same_claim_age;
  const comparison = optimizer.compareCandidates(candidates);
  assert.equal(comparison.winner, candidates[0], 'winner must be the first candidate object (Python max() first-occurrence-wins)');
  assert.equal(comparison.runnerUp, candidates[1], 'runner-up must be the OTHER candidate object, not the same one back again');
});
