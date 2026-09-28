'use strict';

/**
 * Adversarial test for the diagnostics formatter -- the last Phase 4 module
 * to get an audit pass. It carries no numerical model of its own, so the
 * risk here is branch coverage rather than drift, and the original six
 * fixtures all used well-formed comparisons whose scenario names matched
 * the configured planning scenarios.
 *
 * The headline case is `_aggregate_bridge`'s equal-weight fallback: it looks
 * each scenario's weight up with `configured_weights.get(name, 0.0)`, so a
 * candidate whose scenario names are all absent from config sums to a total
 * weight of zero and must fall back to 1/n rather than dividing by it. That
 * branch is unreachable with any well-formed comparison.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDiagnosticBuilder } = require('../../src/ported/social-security-diagnostics');
const { createSocialSecurityPlanningState, createCandidateValuation, createCandidateScenarioValuation, createBridgeProjection } = require('../../src/ported/social-security-valuation');
const { taxIncome } = require('../../src/ported/tax-engine');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-diagnostics-adversarial.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const ssConfig = fixtures.ss_config;
const CONFIGURED = fixtures.configured_scenario_names;
const builder = createDiagnosticBuilder(ssConfig);

const EPS = 1e-9;
function assertClose(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) <= EPS * Math.max(1, Math.abs(expected)), `${msg}: expected ${expected}, got ${actual}`);
}

const state = createSocialSecurityPlanningState({
  decisionYear: 2025, decisionAgeMonths: 65 * 12, retirementYear: 1, inflationFactor: 1.2,
  spendingReal: 60000.0, spendingFloorReal: 40000.0,
  vooReal: 400000.0, vooBasisReal: 240000.0, schdReal: 200000.0, schdBasisReal: 120000.0,
  tbillsReal: 150000.0, rothReal: 100000.0, reserveMonths: 12.0, equityDrawdown: 0.0,
  baseIncomeNominal: taxIncome({ ordinaryIncome: 30000.0 }), fraMonthlyBenefitReal: 1250.0,
});

function bridge() {
  return createBridgeProjection({
    opportunityCostPv: 1000.0, incrementalTaxPv: 200.0, terminalAssetDifference: 500.0,
    terminalAssetsReal: 750000.0, feasible: true,
    sourceWithdrawalsReal: { tbills: 10.0, voo: 20.0, roth: 30.0, schd: 40.0 },
    annualRecords: [], validationCodes: [],
  });
}

function scenarioResult(name, netValue) {
  return createCandidateScenarioValuation({
    scenario: name, grossBenefitPv: netValue + 100.0, afterTaxBenefitPv: netValue + 50.0,
    taxPv: 50.0, bridge: bridge(),
    longevity: {
      scenario: name, age85Coverage: 0.8, age90Coverage: 0.8, age95Coverage: 0.8,
      conditionalShortfallPv: 100.0, depletionProtection: 0.9, reserveEquivalentReal: 1000.0,
      floorTerminalAssetsReal: 500.0, projectedDepletionAgeMonths: null, survivalAtDepletion: 0.0,
      validationCodes: [],
    },
    netEconomicValue: netValue, terminalAssets: 750000.0, feasible: true, validationCodes: [],
  });
}

function candidate(claimAgeMonths, scenarioNames, netValue = 100000.0) {
  return createCandidateValuation({
    claimAgeMonths, factor: 1.0, firstYearFraction: 1.0,
    grossBenefitPv: netValue + 100.0, afterTaxBenefitPv: netValue + 50.0, bridgeCostPv: 1000.0,
    netEconomicValue: netValue, taxPv: 50.0, terminalAssets: 750000.0,
    longevity: {
      age85Coverage: 0.8, age90Coverage: 0.85, age95Coverage: 0.75,
      conditionalShortfallPv: 100.0, depletionProtection: 0.9, reserveEquivalentReal: 1000.0,
      floorDepletionScenarioRate: 0.0, survivalWeightedDepletionRisk: 0.0,
      earliestDepletionAgeMonths: null, expectedFloorTerminalAssetsReal: 500.0,
      scenarioResults: [], validationCodes: [],
    },
    feasible: true, validationCodes: [],
    scenarioResults: scenarioNames.map((name, i) => scenarioResult(name, netValue + i * 10.0)),
  });
}

const known = candidate(67 * 12, CONFIGURED);
const knownRunner = candidate(68 * 12, CONFIGURED, 99000.0);
const unknown = candidate(67 * 12, ['mystery_a', 'mystery_b', 'mystery_c']);
const partial = candidate(67 * 12, [CONFIGURED[1], 'mystery_a', 'mystery_b']);

function comparison(fields) {
  return Object.assign({
    winner: known, runnerUp: null, economicMargin: 0.0, scenarioWinRate: 1.0,
    sensitivityFlipAges: {}, robustnessClass: 'ROBUST', candidates: [known],
  }, fields);
}

const closeFraction = Number(ssConfig.economic_close_call_fraction);
const threshold = Math.max(Math.abs(known.netEconomicValue), 1.0) * closeFraction;

const CASE_COMPARISONS = {
  all_scenario_names_configured: comparison({ runnerUp: knownRunner, economicMargin: 1000.0, candidates: [known, knownRunner] }),
  no_scenario_names_configured_equal_weight_fallback: comparison({ winner: unknown, candidates: [unknown] }),
  partial_scenario_name_match: comparison({ winner: partial, candidates: [partial] }),
  direction_margin_exactly_positive_epsilon: comparison({ runnerUp: knownRunner, economicMargin: 1e-9, candidates: [known, knownRunner] }),
  direction_margin_exactly_negative_epsilon: comparison({ runnerUp: knownRunner, economicMargin: -1e-9, candidates: [known, knownRunner] }),
  direction_margin_just_past_positive_epsilon: comparison({ runnerUp: knownRunner, economicMargin: 1.0000001e-9, candidates: [known, knownRunner] }),
  direction_margin_just_past_negative_epsilon: comparison({ runnerUp: knownRunner, economicMargin: -1.0000001e-9, candidates: [known, knownRunner] }),
  direction_margin_exactly_zero: comparison({ runnerUp: knownRunner, economicMargin: 0.0, candidates: [known, knownRunner] }),
  close_call_exactly_at_threshold: comparison({ runnerUp: knownRunner, economicMargin: threshold, candidates: [known, knownRunner] }),
  close_call_just_past_threshold: comparison({ runnerUp: knownRunner, economicMargin: threshold * 1.0000001, candidates: [known, knownRunner] }),
  partial_sensitivity_flips: comparison({
    runnerUp: knownRunner, economicMargin: 5000.0, candidates: [known, knownRunner],
    sensitivityFlipAges: { a: 67 * 12, b: 68 * 12, c: 67 * 12, d: 70 * 12 },
  }),
};

const records = {};

test('diagnostics ADVERSARIAL: every branch and boundary case matches the Python oracle', () => {
  for (const c of fixtures.cases) {
    const cmp = CASE_COMPARISONS[c.name];
    assert.ok(cmp, `missing JS comparison for ${c.name}`);
    const record = builder.compactRecord({ planningState: state, comparison: cmp, action: c.compact_record.action });
    records[c.name] = record;
    const o = c.compact_record;

    assert.equal(record.economic_margin_direction, o.economic_margin_direction, `${c.name}.economic_margin_direction`);
    assert.equal(record.sensitivity_flip_count, o.sensitivity_flip_count, `${c.name}.sensitivity_flip_count`);
    assert.equal(record.candidate_count, o.candidate_count, `${c.name}.candidate_count`);
    assert.equal(record.valid_candidate_count, o.valid_candidate_count, `${c.name}.valid_candidate_count`);
    assert.equal(record.input_fingerprint, o.input_fingerprint, `${c.name}.input_fingerprint`);
    assertClose(record.winner.bridge.incremental_tax_pv_real, o.winner.bridge.incremental_tax_pv_real, `${c.name}.winner.bridge.incremental_tax_pv_real`);
    assertClose(record.winner.bridge.terminal_assets_real, o.winner.bridge.terminal_assets_real, `${c.name}.winner.bridge.terminal_assets_real`);
    for (const source of ['tbills', 'voo', 'roth', 'schd']) {
      assertClose(record.winner.bridge.source_withdrawals_real[source], o.winner.bridge.source_withdrawals_real[source], `${c.name}.winner.bridge.source_withdrawals_real.${source}`);
    }
    assertClose(record.winner.longevity.minimum_checkpoint_coverage, o.winner.longevity.minimum_checkpoint_coverage, `${c.name}.winner.longevity.minimum_checkpoint_coverage`);

    assert.deepEqual(builder.traceReasons(cmp), c.trace_reasons, `${c.name}.traceReasons`);
  }
});

test('diagnostics ADVERSARIAL: unmatched scenario names fall back to equal weights instead of dividing by zero', () => {
  // Every configured-weight lookup returns 0.0 here, so the total is 0 and
  // the aggregate must weight all three scenarios at 1/3 rather than
  // producing NaN or Infinity.
  const record = records.no_scenario_names_configured_equal_weight_fallback;
  for (const field of ['incremental_tax_pv_real', 'terminal_asset_difference_real', 'terminal_assets_real']) {
    assert.ok(Number.isFinite(record.winner.bridge[field]), `${field} must be finite under the equal-weight fallback, got ${record.winner.bridge[field]}`);
  }
  // Every scenario carries the same bridge here, so the equal-weighted mean
  // must equal that shared value exactly rather than being scaled by the
  // zero total.
  assertClose(record.winner.bridge.incremental_tax_pv_real, 200.0, 'equal-weighted incremental tax');
  assertClose(record.winner.bridge.terminal_assets_real, 750000.0, 'equal-weighted terminal assets');
});

test('diagnostics ADVERSARIAL: a partial scenario-name match normalizes over the matched scenarios only', () => {
  const record = records.partial_scenario_name_match;
  for (const field of ['incremental_tax_pv_real', 'terminal_assets_real']) {
    assert.ok(Number.isFinite(record.winner.bridge[field]), `${field} must be finite`);
  }
  assertClose(record.winner.bridge.incremental_tax_pv_real, 200.0, 'one matched scenario normalizes to weight 1.0');
});

test('diagnostics ADVERSARIAL: the economic-margin direction band is strict at exactly +/-1e-9', () => {
  assert.equal(records.direction_margin_exactly_positive_epsilon.economic_margin_direction, 'tied', 'exactly +1e-9 is NOT greater than 1e-9');
  assert.equal(records.direction_margin_exactly_negative_epsilon.economic_margin_direction, 'tied', 'exactly -1e-9 is NOT less than -1e-9');
  assert.equal(records.direction_margin_exactly_zero.economic_margin_direction, 'tied');
  assert.equal(records.direction_margin_just_past_positive_epsilon.economic_margin_direction, 'winner_higher');
  assert.equal(records.direction_margin_just_past_negative_epsilon.economic_margin_direction, 'winner_lower_for_higher_priority_tiebreak');
});

test('diagnostics ADVERSARIAL: the ECONOMIC_CLOSE_CALL threshold is inclusive at exactly the tolerance', () => {
  assert.ok(
    builder.traceReasons(CASE_COMPARISONS.close_call_exactly_at_threshold).includes('ECONOMIC_CLOSE_CALL'),
    'a margin exactly at the threshold must still count as close (the comparison is <=)'
  );
  assert.ok(
    !builder.traceReasons(CASE_COMPARISONS.close_call_just_past_threshold).includes('ECONOMIC_CLOSE_CALL'),
    'a margin just past it must not'
  );
});

test('diagnostics ADVERSARIAL: sensitivity_flip_count is a partial sum, not all-or-nothing', () => {
  // Two of the four labels differ from the winner's claim age.
  const record = records.partial_sensitivity_flips;
  assert.equal(record.sensitivity_flip_count, 2);
  assert.equal(record.sensitivity.a.flipped, false);
  assert.equal(record.sensitivity.b.flipped, true);
  assert.equal(record.sensitivity.b.delta_months, 12, 'delta is measured against the winner\'s claim month');
  assert.equal(record.sensitivity.d.delta_months, 36);
});
