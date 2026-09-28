'use strict';

/**
 * Adversarial/boundary-exact stress test for the longevity analyzer -- same
 * audit-pass pattern applied to Phases 5-8 and, in this phase, to the
 * optimizer, bridge, and valuation engine. See
 * fixtures/generate_ss_longevity_adversarial_fixtures.py for why each case
 * exists.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildMortalityPolicy, createMortalityTable } = require('../../src/ported/social-security-mortality');
const { createLongevityAnalyzer } = require('../../src/ported/social-security-longevity');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'ss-longevity-adversarial.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const BIRTH_YEAR = 1960;
const FLOOR = fixtures.floor;
const analyzer = createLongevityAnalyzer(fixtures.ss_config);
const table = createMortalityTable(buildMortalityPolicy(BIRTH_YEAR), 'II');

const EPS = 1e-6;
function assertClose(actual, expected, msg) {
  assert.ok(
    Math.abs(actual - expected) <= EPS * Math.max(1, Math.abs(expected)),
    `${msg}: expected ${expected}, got ${actual}`
  );
}

// planningStatePortfolioReal() sums vooReal+schdReal+tbillsReal+rothReal;
// the Python fixture's fake state exposes a single portfolio_real, so route
// the whole balance through vooReal to reach the same total via the real,
// unmodified helper.
function makeState(floor, decisionAgeMonths, portfolioReal) {
  return { spendingFloorReal: floor, decisionAgeMonths, vooReal: portfolioReal, schdReal: 0, tbillsReal: 0, rothReal: 0 };
}

function makeProfile(decisionAgeMonths, throughAge = 120) {
  return table.conditionalProfile({
    birthYear: BIRTH_YEAR, sex: 'male',
    valuationAgeMonths: decisionAgeMonths, throughAgeMonths: throughAge * 12,
  });
}

function flat(monthlyAmount, startMonth, endMonthExclusive) {
  const out = {};
  for (let m = startMonth; m < endMonthExclusive; m++) out[m] = monthlyAmount;
  return out;
}

const state90 = makeState(FLOOR, 90 * 12, 500000.0);
const state65 = makeState(FLOOR, 65 * 12, 800000.0);
const rich = makeState(FLOOR, 65 * 12, 50000000.0);
const broke = makeState(FLOOR, 65 * 12, 0.0);

const CASE_INPUTS = {
  decision_age_past_longevity_start: { state: state90, profile: makeProfile(90 * 12), scenarioName: 'late_decision', portfolioReturn: 0.03, safeReturn: 0.01, benefits: flat(FLOOR / 12.0, 90 * 12, 121 * 12) },
  coverage_exactly_one: { state: state65, profile: makeProfile(65 * 12), scenarioName: 'exact_coverage', portfolioReturn: 0.03, safeReturn: 0.01, benefits: flat(FLOOR / 12.0, 65 * 12, 121 * 12) },
  coverage_just_below_one: { state: state65, profile: makeProfile(65 * 12), scenarioName: 'just_below', portfolioReturn: 0.03, safeReturn: 0.01, benefits: flat((FLOOR - 0.12) / 12.0, 65 * 12, 121 * 12) },
  zero_portfolio_return: { state: state65, profile: makeProfile(65 * 12), scenarioName: 'no_growth', portfolioReturn: 0.0, safeReturn: 0.01, benefits: flat(15000.0 / 12.0, 65 * 12, 121 * 12) },
  zero_safe_return_no_discounting: { state: state65, profile: makeProfile(65 * 12), scenarioName: 'no_discount', portfolioReturn: 0.03, safeReturn: 0.0, benefits: flat(15000.0 / 12.0, 65 * 12, 121 * 12) },
  negative_safe_return_amplifies_shortfall: { state: state65, profile: makeProfile(65 * 12), scenarioName: 'negative_discount', portfolioReturn: 0.03, safeReturn: -0.02, benefits: flat(15000.0 / 12.0, 65 * 12, 121 * 12) },
  never_depletes_huge_portfolio: { state: rich, profile: makeProfile(65 * 12), scenarioName: 'rich', portfolioReturn: 0.03, safeReturn: 0.01, benefits: {} },
  depletes_in_first_month: { state: broke, profile: makeProfile(65 * 12), scenarioName: 'broke', portfolioReturn: 0.03, safeReturn: 0.01, benefits: {} },
  zero_portfolio_but_benefit_exactly_covers_floor: { state: broke, profile: makeProfile(65 * 12), scenarioName: 'exact_cover', portfolioReturn: 0.03, safeReturn: 0.01, benefits: flat(FLOOR / 12.0, 65 * 12, 121 * 12) },
  zero_portfolio_benefit_one_cent_short: { state: broke, profile: makeProfile(65 * 12), scenarioName: 'one_cent_short', portfolioReturn: 0.03, safeReturn: 0.01, benefits: flat((FLOOR - 0.12) / 12.0, 65 * 12, 121 * 12) },
};

function evaluate(inputs) {
  return analyzer.evaluateScenario({
    planningState: inputs.state, mortalityProfile: inputs.profile, scenarioName: inputs.scenarioName,
    realPortfolioReturn: inputs.portfolioReturn, realSafeReturn: inputs.safeReturn,
    afterTaxBenefitByAgeMonth: inputs.benefits,
  });
}

const results = {};

test('social security longevity ADVERSARIAL: every boundary case matches the Python oracle', () => {
  for (const c of fixtures.cases) {
    const inputs = CASE_INPUTS[c.name];
    assert.ok(inputs, `missing JS inputs for ${c.name}`);

    if (c.expect_error !== undefined) {
      assert.throws(() => evaluate(inputs), new RegExp(c.expect_error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), c.name);
      continue;
    }

    const result = evaluate(inputs);
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
});

test('social security longevity ADVERSARIAL: the exact-cover / one-cent-short pair straddles the depletion boundary', () => {
  // The tightest boundary in this module: with a ZERO portfolio, a benefit
  // that exactly covers the monthly floor leaves required = max(0, 0) = 0
  // every month, so no depletion is ever recorded despite having no assets
  // at all -- while one cent less makes required a hair above 0, tripping
  // `required > balance + 1e-9` in the very first month. A port that got
  // the epsilon or the comparison direction wrong would collapse these two
  // into the same answer.
  const exact = results.zero_portfolio_but_benefit_exactly_covers_floor;
  const short = results.zero_portfolio_benefit_one_cent_short;
  assert.equal(exact.projectedDepletionAgeMonths, null, 'exact cover with zero assets must NOT record a depletion');
  assert.equal(exact.depletionProtection, 1.0, 'no depletion means protection short-circuits to exactly 1.0');
  assert.equal(short.projectedDepletionAgeMonths, 65 * 12, 'one cent short must deplete in the very first month');
  assert.ok(short.depletionProtection < 1.0, 'a real depletion must report protection strictly below 1.0');
});

test('social security longevity ADVERSARIAL: checkpoint coverage is a hard boundary at 1.0, not a rounded one', () => {
  assert.equal(results.coverage_exactly_one.age85Coverage, 1.0, 'twelve monthly benefits summing to the annual floor must give exactly 1.0');
  assert.ok(results.coverage_just_below_one.age85Coverage < 1.0, 'one cent short must land strictly below 1.0, not round up to it');
  assert.ok(results.coverage_just_below_one.conditionalShortfallPv > 0, 'and must register a real (if tiny) shortfall');
  assert.equal(results.coverage_exactly_one.conditionalShortfallPv, 0, 'exact coverage must register exactly zero shortfall');
});

test('social security longevity ADVERSARIAL: the accumulation window starts at the decision age once it is past the configured longevity start', () => {
  // range(max(current, longevity_start), terminal) -- with a decision age of
  // 90 the window starts at 90, not at the configured longevity_start of 85.
  // A port that hardcoded the configured start would accumulate five extra
  // years of months that this profile does not even contain, and would
  // throw on the out-of-range profilePoint() lookup rather than silently
  // differ -- so this case also proves the max() is present at all.
  const late = results.decision_age_past_longevity_start;
  assert.ok(Number.isFinite(late.conditionalShortfallPv), 'must not throw or produce NaN when the decision age is past the longevity start');
  assert.equal(late.age85Coverage, 0, 'no benefits exist at age 85 when the decision is made at 90');
});

test('social security longevity ADVERSARIAL: discounting direction holds across zero/positive/negative safe returns', () => {
  const zero = results.zero_safe_return_no_discounting.conditionalShortfallPv;
  const negative = results.negative_safe_return_amplifies_shortfall.conditionalShortfallPv;
  assert.ok(negative > zero, `a negative safe return must amplify shortfall PV: ${negative} vs ${zero}`);
});

test('social security longevity ADVERSARIAL: aggregate() matches the Python oracle on single, unnormalized, and inexact-thirds weights', () => {
  const byName = (name) => {
    const r = results[name];
    assert.ok(r, `scenario result ${name} not available`);
    return r;
  };

  for (const agg of fixtures.aggregate_cases) {
    const sources = agg.source_cases ? agg.source_cases.map(byName) : [byName(agg.source_case)];
    const aggregated = analyzer.aggregate(sources, agg.weights);
    const o = agg.output;
    assertClose(aggregated.age85Coverage, o.age85_coverage, `${agg.name}.age85Coverage`);
    assertClose(aggregated.age90Coverage, o.age90_coverage, `${agg.name}.age90Coverage`);
    assertClose(aggregated.age95Coverage, o.age95_coverage, `${agg.name}.age95Coverage`);
    assertClose(aggregated.conditionalShortfallPv, o.conditional_shortfall_pv, `${agg.name}.conditionalShortfallPv`);
    assertClose(aggregated.depletionProtection, o.depletion_protection, `${agg.name}.depletionProtection`);
    assertClose(aggregated.reserveEquivalentReal, o.reserve_equivalent_real, `${agg.name}.reserveEquivalentReal`);
    assertClose(aggregated.floorDepletionScenarioRate, o.floor_depletion_scenario_rate, `${agg.name}.floorDepletionScenarioRate`);
    assertClose(aggregated.survivalWeightedDepletionRisk, o.survival_weighted_depletion_risk, `${agg.name}.survivalWeightedDepletionRisk`);
    assert.equal(aggregated.earliestDepletionAgeMonths, o.earliest_depletion_age_months, `${agg.name}.earliestDepletionAgeMonths`);
    assertClose(aggregated.expectedFloorTerminalAssetsReal, o.expected_floor_terminal_assets_real, `${agg.name}.expectedFloorTerminalAssetsReal`);
    assert.deepEqual(aggregated.validationCodes, o.validation_codes, `${agg.name}.validationCodes`);
  }
});

test('social security longevity ADVERSARIAL: unnormalized weights are normalized, not applied raw', () => {
  // Weights of 3 and 7 must behave identically to 0.3 and 0.7 -- a port
  // that skipped the `weight / total` normalization would scale every
  // weighted field by 10x and still pass any single-scenario fixture.
  const a = results.coverage_exactly_one;
  const b = results.coverage_just_below_one;
  const raw = analyzer.aggregate([a, b], [3.0, 7.0]);
  const normalized = analyzer.aggregate([a, b], [0.3, 0.7]);
  assertClose(raw.conditionalShortfallPv, normalized.conditionalShortfallPv, 'unnormalized vs normalized shortfall PV');
  assertClose(raw.age85Coverage, normalized.age85Coverage, 'unnormalized vs normalized coverage');
});
