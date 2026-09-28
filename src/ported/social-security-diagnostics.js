'use strict';
/*
 * Ported from the Financial Projection V2.1.2 (post-audit-repair,
 * requalified) Python engine's retirement_model_v2/social_security_diagnostics.py
 * -- Phase 4 (Social Security optimizer port), module 8/9.
 *
 * Pure formatter: turns a CandidateComparison (produced by the optimizer,
 * module 9 -- not yet ported) into compact/detailed diagnostic records for
 * display and audit trails. No new math -- everything here reads fields
 * already computed by modules 5-7.
 *
 * preciseSum is not needed here: every sum() in the Python source is either
 * over booleans (feasible/not feasible counts, sensitivity_flip_count) --
 * integer-valued, no compensation possible -- or is the SAME weighted-bridge
 * aggregation pattern already verified in module 7's evaluate_candidate(),
 * applied here to a candidate's own scenario_results instead of being
 * recomputed from scratch, so it gets the same preciseSum treatment for
 * consistency with that established pattern.
 */

const { preciseSum } = require('./precise-math');
const { stateBoundaryCategories } = require('./social-security-state');
const { planningStateFingerprint } = require('./social-security-valuation');

function createDiagnosticBuilder(config) {
  function aggregateBridge(candidate) {
    const configuredWeights = {};
    for (const item of config.planning_scenarios) configuredWeights[String(item.name)] = Number(item.weight);
    const rawWeights = candidate.scenarioResults.map((result) => configuredWeights[result.scenario] !== undefined ? configuredWeights[result.scenario] : 0.0);
    const total = preciseSum(rawWeights);
    const weights = total > 0.0
      ? rawWeights.map((w) => w / total)
      : candidate.scenarioResults.map(() => 1.0 / candidate.scenarioResults.length);

    const weighted = (attribute) => preciseSum(weights.map((w, i) => w * Number(candidate.scenarioResults[i].bridge[attribute])));

    const sourceNames = ['tbills', 'voo', 'roth', 'schd'];
    const sourceWithdrawalsReal = {};
    for (const source of sourceNames) {
      sourceWithdrawalsReal[source] = preciseSum(
        weights.map((w, i) => w * Number(candidate.scenarioResults[i].bridge.sourceWithdrawalsReal[source] || 0.0))
      );
    }
    const codeSet = new Set();
    for (const result of candidate.scenarioResults) {
      for (const code of result.bridge.validationCodes) codeSet.add(code);
    }
    return {
      opportunity_cost_pv_real: candidate.bridgeCostPv,
      incremental_tax_pv_real: weighted('incrementalTaxPv'),
      terminal_asset_difference_real: weighted('terminalAssetDifference'),
      terminal_assets_real: weighted('terminalAssetsReal'),
      source_withdrawals_real: sourceWithdrawalsReal,
      feasible: candidate.scenarioResults.every((result) => result.bridge.feasible),
      validation_codes: Array.from(codeSet).sort(),
    };
  }

  function candidateSummary(candidate) {
    if (candidate === null || candidate === undefined) return null;
    const bridge = aggregateBridge(candidate);
    return {
      claim_age_months: candidate.claimAgeMonths,
      claim_factor: candidate.factor,
      first_year_fraction: candidate.firstYearFraction,
      gross_benefit_pv_real: candidate.grossBenefitPv,
      after_tax_benefit_pv_real: candidate.afterTaxBenefitPv,
      benefit_tax_pv_real: candidate.taxPv,
      bridge_cost_pv_real: candidate.bridgeCostPv,
      net_economic_value_real: candidate.netEconomicValue,
      bridge,
      longevity: {
        age85_coverage: candidate.longevity.age85Coverage,
        age90_coverage: candidate.longevity.age90Coverage,
        age95_coverage: candidate.longevity.age95Coverage,
        minimum_checkpoint_coverage: Math.min(candidate.longevity.age85Coverage, candidate.longevity.age90Coverage, candidate.longevity.age95Coverage),
        conditional_shortfall_pv_real: candidate.longevity.conditionalShortfallPv,
        depletion_protection: candidate.longevity.depletionProtection,
        reserve_equivalent_real: candidate.longevity.reserveEquivalentReal,
        floor_depletion_scenario_rate: candidate.longevity.floorDepletionScenarioRate,
        survival_weighted_depletion_risk: candidate.longevity.survivalWeightedDepletionRisk,
        earliest_depletion_age_months: candidate.longevity.earliestDepletionAgeMonths,
        expected_floor_terminal_assets_real: candidate.longevity.expectedFloorTerminalAssetsReal,
      },
      feasible: candidate.feasible,
      validation_codes: candidate.validationCodes,
    };
  }

  function candidateDetail(candidate) {
    const summary = candidateSummary(candidate) || {};
    summary.scenarios = candidate.scenarioResults.map((result) => ({
      name: result.scenario,
      gross_benefit_pv_real: result.grossBenefitPv,
      after_tax_benefit_pv_real: result.afterTaxBenefitPv,
      tax_pv_real: result.taxPv,
      bridge: {
        opportunity_cost_pv: result.bridge.opportunityCostPv,
        incremental_tax_pv: result.bridge.incrementalTaxPv,
        terminal_asset_difference: result.bridge.terminalAssetDifference,
        terminal_assets_real: result.bridge.terminalAssetsReal,
        feasible: result.bridge.feasible,
        source_withdrawals_real: result.bridge.sourceWithdrawalsReal,
        annual_records: result.bridge.annualRecords,
        validation_codes: result.bridge.validationCodes,
      },
      net_economic_value_real: result.netEconomicValue,
      terminal_assets_real: result.terminalAssets,
      longevity: {
        scenario: result.longevity.scenario,
        age85_coverage: result.longevity.age85Coverage,
        age90_coverage: result.longevity.age90Coverage,
        age95_coverage: result.longevity.age95Coverage,
        conditional_shortfall_pv: result.longevity.conditionalShortfallPv,
        depletion_protection: result.longevity.depletionProtection,
        reserve_equivalent_real: result.longevity.reserveEquivalentReal,
        floor_terminal_assets_real: result.longevity.floorTerminalAssetsReal,
        projected_depletion_age_months: result.longevity.projectedDepletionAgeMonths,
        survival_at_depletion: result.longevity.survivalAtDepletion,
        validation_codes: result.longevity.validationCodes,
      },
      feasible: result.feasible,
      validation_codes: result.validationCodes,
    }));
    return summary;
  }

  function sensitivityDetails(comparison) {
    const selected = comparison.winner.claimAgeMonths;
    const out = {};
    const labels = Object.keys(comparison.sensitivityFlipAges).sort();
    for (const label of labels) {
      const age = comparison.sensitivityFlipAges[label];
      out[label] = { winner_age_months: age, delta_months: age - selected, flipped: age !== selected };
    }
    return out;
  }

  function compactRecord({ planningState, comparison, action }) {
    const winner = comparison.winner;
    const runner = comparison.runnerUp;
    const flips = sensitivityDetails(comparison);
    const economicMarginDirection = comparison.economicMargin > 1e-9
      ? 'winner_higher'
      : comparison.economicMargin < -1e-9
        ? 'winner_lower_for_higher_priority_tiebreak'
        : 'tied';
    return {
      schema: 'social_security_decision_v2_1_2',
      input_fingerprint: planningStateFingerprint(planningState),
      decision_year: planningState.decisionYear,
      decision_age_months: planningState.decisionAgeMonths,
      action,
      winner_age_months: winner.claimAgeMonths,
      runner_up_age_months: runner ? runner.claimAgeMonths : null,
      economic_margin_real: comparison.economicMargin,
      economic_margin_direction: economicMarginDirection,
      scenario_acceptability_rate: comparison.scenarioWinRate,
      robustness_class: comparison.robustnessClass,
      candidate_count: comparison.candidates.length,
      valid_candidate_count: comparison.candidates.filter((c) => c.feasible).length,
      invalid_candidate_count: comparison.candidates.filter((c) => !c.feasible).length,
      winner: candidateSummary(winner),
      runner_up: runner ? candidateSummary(runner) : null,
      sensitivity: flips,
      sensitivity_flip_count: Object.values(flips).filter((item) => item.flipped).length,
      future_market_data_used: false,
      state_boundary_categories: stateBoundaryCategories(),
      accessed_input_categories: [
        'planning_state', 'tax_policy', 'social_security_policy', 'mortality_cohort', 'no_hindsight_planning_scenarios',
      ],
    };
  }

  function detailedCandidates(comparison) {
    return comparison.candidates.map((candidate) => candidateDetail(candidate));
  }

  function traceReasons(comparison) {
    const winner = comparison.winner;
    const threshold = Math.max(Math.abs(winner.netEconomicValue), 1.0) * Number(config.economic_close_call_fraction);
    const reasons = [];
    if (comparison.runnerUp !== null && comparison.runnerUp !== undefined && Math.abs(comparison.economicMargin) <= threshold) {
      reasons.push('ECONOMIC_CLOSE_CALL');
    }
    if (['SENSITIVE', 'FRAGILE', 'INVALID'].includes(comparison.robustnessClass)) {
      reasons.push(`ROBUSTNESS_${comparison.robustnessClass}`);
    }
    if (Object.values(comparison.sensitivityFlipAges).some((age) => age !== winner.claimAgeMonths)) {
      reasons.push('SENSITIVITY_FLIP');
    }
    if (winner.validationCodes.length > 0) {
      reasons.push('WINNER_VALIDATION_CODE');
    }
    if (comparison.candidates.some((c) => !c.feasible)) {
      reasons.push('INVALID_CANDIDATE');
    }
    // Python's tuple(dict.fromkeys(reasons)) dedupes while preserving first-
    // occurrence order -- these reasons are already unique by construction
    // (each pushed at most once), so a plain array already matches, but
    // dedupe explicitly to mirror the source's own defensive intent.
    return Array.from(new Set(reasons));
  }

  return { compactRecord, detailedCandidates, traceReasons };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createDiagnosticBuilder };
}
