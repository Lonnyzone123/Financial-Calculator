'use strict';
/*
 * Ported from the Financial Projection V2.1.2 (post-audit-repair,
 * requalified) Python engine's retirement_model_v2/social_security_longevity.py
 * -- Phase 4 (Social Security optimizer port), module 5/9.
 *
 * Measures late-life floor protection (age 85/90/95 benefit coverage,
 * conditional shortfall present value, portfolio-depletion risk) for one
 * claim-decision scenario, then aggregates across scenarios by
 * mortality-weighted probability. Deliberately separate from the delay
 * bridge's own economic value -- it's a guardrail, not a second retirement
 * simulation, so it applies the SAME configured scenario return to every
 * candidate and funds only the real spending floor net of after-tax Social
 * Security.
 *
 * Uses preciseSum (see precise-math.js) everywhere the Python source calls
 * sum() over floats -- per the Phase 8 audit finding that Python's sum()
 * uses compensated (Neumaier) summation, not naive sequential addition.
 * Manual `total = 0.0; total += x` accumulator loops (shortfall_pv,
 * reserve_equivalent, the depletion-protection loop) are NOT routed through
 * preciseSum, since naive JS addition already matches those exactly (same
 * classification Phase 8 applied elsewhere).
 */

const { preciseSum } = require('./precise-math');
const { profilePoint } = require('./social-security-mortality');

// Inlined rather than imported from social-security-valuation.js (which
// needs this module for CandidateValuation's longevity aggregation) --
// avoids a circular require between the two files. Matches
// planningStatePortfolioReal() there exactly: voo+schd+tbills+roth.
function planningStatePortfolioReal(state) {
  return state.vooReal + state.schdReal + state.tbillsReal + state.rothReal;
}

function createLongevityScenarioMetrics(fields) {
  return {
    scenario: fields.scenario,
    age85Coverage: fields.age85Coverage,
    age90Coverage: fields.age90Coverage,
    age95Coverage: fields.age95Coverage,
    conditionalShortfallPv: fields.conditionalShortfallPv,
    depletionProtection: fields.depletionProtection,
    reserveEquivalentReal: fields.reserveEquivalentReal,
    floorTerminalAssetsReal: fields.floorTerminalAssetsReal,
    projectedDepletionAgeMonths: fields.projectedDepletionAgeMonths,
    survivalAtDepletion: fields.survivalAtDepletion,
    validationCodes: fields.validationCodes || [],
  };
}

function longevityMetricsMinimumCheckpointCoverage(m) {
  return Math.min(m.age85Coverage, m.age90Coverage, m.age95Coverage);
}

function longevityMetricsHasFloorDepletion(m) {
  return m.floorDepletionScenarioRate > 1e-12;
}

function createLongevityAnalyzer(config) {
  function evaluateScenario({
    planningState, mortalityProfile, scenarioName,
    realPortfolioReturn, realSafeReturn, afterTaxBenefitByAgeMonth,
  }) {
    const floor = Number(planningState.spendingFloorReal);
    if (!(floor > 0.0)) {
      throw new Error('Social Security longevity analysis requires a positive floor');
    }
    if (realPortfolioReturn <= -1.0 || realSafeReturn <= -1.0) {
      throw new Error('Longevity projection rates must exceed -100%');
    }
    if (mortalityProfile.valuationAgeMonths !== planningState.decisionAgeMonths) {
      throw new Error('Longevity mortality profile and decision age are misaligned');
    }

    const current = Math.trunc(planningState.decisionAgeMonths);
    const terminal = Math.trunc(mortalityProfile.throughAgeMonths);
    const longevityStart = Math.trunc(config.longevity_start_age) * 12;
    const checkpointAges = config.longevity_checkpoint_ages.map((a) => Math.trunc(a));
    if (!(checkpointAges.length === 3 && checkpointAges[0] === 85 && checkpointAges[1] === 90 && checkpointAges[2] === 95)) {
      throw new Error('V2.1.2 longevity output requires checkpoints 85, 90, and 95');
    }
    if (terminal < Math.max(...checkpointAges) * 12 + 12) {
      throw new Error('Mortality horizon does not cover each longevity checkpoint year');
    }

    const benefits = new Map();
    for (const [ageMonths, amount] of Object.entries(afterTaxBenefitByAgeMonth)) {
      benefits.set(Math.trunc(Number(ageMonths)), Number(amount));
    }
    for (const amount of benefits.values()) {
      if (amount < -1e-9) throw new Error('After-tax Social Security cannot be negative');
    }

    const benefitAt = (month) => (benefits.has(month) ? benefits.get(month) : 0.0);

    const coverage = {};
    for (const age of checkpointAges) {
      const monthly = [];
      for (let month = age * 12; month < age * 12 + 12; month++) monthly.push(benefitAt(month));
      coverage[age] = preciseSum(monthly) / floor;
    }

    const floorMonthly = floor / 12.0;
    let shortfallPv = 0.0;
    let reserveEquivalent = 0.0;
    for (let ageMonths = Math.max(current, longevityStart); ageMonths < terminal; ageMonths++) {
      const point = profilePoint(mortalityProfile, ageMonths);
      const discount = Math.pow(1.0 + realSafeReturn, (ageMonths - current) / 12.0);
      const afterTaxBenefit = benefitAt(ageMonths);
      reserveEquivalent += (point.survival * afterTaxBenefit) / discount;
      shortfallPv += (point.survival * Math.max(0.0, floorMonthly - afterTaxBenefit)) / discount;
    }

    let balance = Math.max(0.0, Number(planningStatePortfolioReal(planningState)));
    const monthlyReturn = Math.pow(1.0 + realPortfolioReturn, 1.0 / 12.0) - 1.0;
    let depletionMonth = null;
    for (let ageMonths = current; ageMonths < terminal; ageMonths++) {
      balance *= 1.0 + monthlyReturn;
      const required = Math.max(0.0, floorMonthly - benefitAt(ageMonths));
      if (required > balance + 1e-9) {
        balance = 0.0;
        depletionMonth = ageMonths;
        break;
      }
      balance -= required;
    }

    const survivalAtDepletion = depletionMonth !== null
      ? profilePoint(mortalityProfile, depletionMonth).survival
      : 0.0;
    const depletionProtection = depletionProtectionOf({
      depletionMonth, terminalAgeMonths: terminal, floorMonthly, benefitAt, mortalityProfile,
    });
    const validationCodes = validateMetrics({
      coverage, shortfallPv, depletionProtection, reserveEquivalent, terminalAssets: balance,
    });
    return createLongevityScenarioMetrics({
      scenario: scenarioName,
      age85Coverage: coverage[85],
      age90Coverage: coverage[90],
      age95Coverage: coverage[95],
      conditionalShortfallPv: shortfallPv,
      depletionProtection,
      reserveEquivalentReal: reserveEquivalent,
      floorTerminalAssetsReal: balance,
      projectedDepletionAgeMonths: depletionMonth,
      survivalAtDepletion,
      validationCodes,
    });
  }

  function aggregate(results, weights) {
    const scenarios = Array.from(results);
    const rawWeights = Array.from(weights).map(Number);
    if (scenarios.length === 0 || scenarios.length !== rawWeights.length) {
      throw new Error('Longevity scenario results and weights must align');
    }
    const total = preciseSum(rawWeights);
    if (!(total > 0.0)) {
      throw new Error('Longevity scenario weights must have positive total');
    }
    const normalized = rawWeights.map((w) => w / total);

    const weighted = (attribute) => preciseSum(normalized.map((w, i) => w * Number(scenarios[i][attribute])));

    const depletionMonths = scenarios
      .map((r) => r.projectedDepletionAgeMonths)
      .filter((v) => v !== null && v !== undefined);

    const codeSet = new Set();
    for (const r of scenarios) for (const code of r.validationCodes) codeSet.add(code);

    return {
      age85Coverage: weighted('age85Coverage'),
      age90Coverage: weighted('age90Coverage'),
      age95Coverage: weighted('age95Coverage'),
      conditionalShortfallPv: weighted('conditionalShortfallPv'),
      depletionProtection: weighted('depletionProtection'),
      reserveEquivalentReal: weighted('reserveEquivalentReal'),
      floorDepletionScenarioRate: preciseSum(
        normalized.filter((_, i) => scenarios[i].projectedDepletionAgeMonths !== null && scenarios[i].projectedDepletionAgeMonths !== undefined)
      ),
      survivalWeightedDepletionRisk: preciseSum(normalized.map((w, i) => w * scenarios[i].survivalAtDepletion)),
      earliestDepletionAgeMonths: depletionMonths.length > 0 ? Math.min(...depletionMonths) : null,
      expectedFloorTerminalAssetsReal: weighted('floorTerminalAssetsReal'),
      scenarioResults: scenarios,
      validationCodes: Array.from(codeSet).sort(),
    };
  }

  return { evaluateScenario, aggregate };
}

function depletionProtectionOf({ depletionMonth, terminalAgeMonths, floorMonthly, benefitAt, mortalityProfile }) {
  if (depletionMonth === null || depletionMonth === undefined) return 1.0;
  let protected_ = 0.0;
  let required = 0.0;
  for (let ageMonths = depletionMonth; ageMonths < terminalAgeMonths; ageMonths++) {
    const survival = profilePoint(mortalityProfile, ageMonths).survival;
    required += survival * floorMonthly;
    protected_ += survival * Math.min(floorMonthly, benefitAt(ageMonths));
  }
  return required > 0.0 ? Math.min(1.0, Math.max(0.0, protected_ / required)) : 1.0;
}

function validateMetrics({ coverage, shortfallPv, depletionProtection, reserveEquivalent, terminalAssets }) {
  const codes = [];
  if (Object.values(coverage).some((v) => v < -1e-9)) codes.push('SS_LONGEVITY_NEGATIVE_COVERAGE');
  if (shortfallPv < -1e-9) codes.push('SS_LONGEVITY_NEGATIVE_SHORTFALL');
  if (!(depletionProtection >= 0.0 && depletionProtection <= 1.0)) codes.push('SS_LONGEVITY_PROTECTION_RANGE');
  if (reserveEquivalent < -1e-9) codes.push('SS_LONGEVITY_NEGATIVE_RESERVE_EQUIVALENT');
  if (terminalAssets < -1e-9) codes.push('SS_LONGEVITY_NEGATIVE_TERMINAL_ASSETS');
  return codes;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createLongevityScenarioMetrics,
    longevityMetricsMinimumCheckpointCoverage,
    longevityMetricsHasFloorDepletion,
    createLongevityAnalyzer,
  };
}
