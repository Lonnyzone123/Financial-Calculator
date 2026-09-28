'use strict';
/*
 * Ported from the Financial Projection V2.1.2 (M5 PASS) Python engine's
 * retirement_model_v2/effectiveness_grader.py. Faithful line-by-line
 * translation, verified against Python-generated fixtures in
 * fixtures/effectiveness-grader.fixtures.json (see
 * tests/ported/effectiveness-grader.test.js).
 *
 * SCOPE NOTE: this ports the engine's own AnnualResult row shape as-is
 * (Social Security claim tracking, SCHD regime tracking, reserve target
 * tracking -- fields the calculator's own engine does not currently
 * produce). Adapting it to the calculator's different row shape is Phase 9
 * work, deliberately deferred so this port is independently verifiable
 * first, matching the pattern already used for the tax optimizer's
 * tbills/voo/roth/schd asset model.
 *
 * Expected row shape (plain object, camelCase):
 *   { year, age, retirementYear, inflationFactor, spendingReal,
 *     spendingEligibleCeilingReal, socialSecurityClaimAgeMonths,
 *     socialSecurityDecisionValid, socialSecurityValidationCodes,
 *     socialSecurityRobustness, taxReal,
 *     withdrawals: { fromTbills, fromVoo, fromRoth, fromSchd, feasible },
 *     reserveTargetReal,
 *     endingRealBalances: { voo, schd, tbills, roth },
 *     endingRealTotal }
 *
 * NOT ported: retirement_model_v2/diagnostics.py (579 lines) was
 * deliberately excluded from Phase 8. It is a low-level invariant checker
 * tied to this Python engine's own simulation-loop internals (hindsight
 * guards, cash-ledger reconciliation, timing checks) -- content specific to
 * proving THAT engine's own correctness, not calculator-facing
 * decision-quality signals. The calculator will need its own analogous
 * invariant checks when its engine is extended, informed by this module but
 * not a line-by-line port of it. See MERGE_AUDIT_AND_PLAN.md's Phase 8
 * section.
 */

const { preciseSum, preciseMean } = require('./precise-math');

// Python's sum()/statistics.fmean() use compensated (Neumaier) summation,
// not naive sequential addition -- see precise-math.js for why this
// matters (a real, boundary-crossing divergence this audit pass actually
// found, not a theoretical concern). Every `sum(...)`/`fmean(...)` call in
// effectiveness_grader.py is routed through preciseSum/preciseMean below;
// this local `mean` alias exists only so call sites below read the same as
// the Python source's `fmean(...)`.
const mean = preciseMean;

// Python's min()/max() raise ValueError on an empty iterable; JS's
// Math.min(...[])/Math.max(...[]) instead silently return
// Infinity/-Infinity and let the caller keep computing with a bogus value.
// Both call sites below (troughReal, largestFinalShare) are unreachable
// through today's real config (sequence_sensitive_years=12,
// endingRealBalances always has exactly 4 keys), but the port must match
// the source's behavior regardless of what today's config happens to pass
// -- same principle as the reserve-manager and tax-optimizer audit fixes.
function pyMin(values, what) {
  if (values.length === 0) throw new Error(`min() iterable argument is empty (${what})`);
  return Math.min(...values);
}
function pyMax(values, what) {
  if (values.length === 0) throw new Error(`max() iterable argument is empty (${what})`);
  return Math.max(...values);
}

function floorForAge(spendingConfig, age) {
  const schedule = (spendingConfig.floor_schedule || []).slice().sort((a, b) => a.start_age - b.start_age);
  const values = schedule.filter((item) => age >= item.start_age).map((item) => Number(item.floor_real));
  return values.length > 0 ? values[values.length - 1] : Number(spendingConfig.floor_real);
}

function round2(value) {
  // Python's round(value, 2) uses banker's rounding (round-half-to-even);
  // Math.round here rounds half away from zero. These differ only when a
  // value lands on an EXACT x.xx5 boundary, which arithmetic chained
  // through many prior floating-point operations essentially never
  // produces in practice -- verified against fixtures, not just assumed.
  return Math.round(value * 100) / 100;
}

function createEffectivenessGrader(gradingConfig, spendingConfig, reserveConfig, portfolioConfig) {
  function grade(annualResults, { initialRealTotal, diagnostics }) {
    diagnostics = diagnostics || { issues: [] };
    const annual = annualResults.slice();
    const flags = [];
    const concerns = [];
    if (annual.length === 0) flags.push('NO_ANNUAL_RESULTS');

    const diagnosticErrors = (diagnostics.issues || [])
      .filter((item) => item.severity === 'error')
      .map((item) => String(item.code || 'UNKNOWN_DIAGNOSTIC_ERROR'));
    flags.push(...diagnosticErrors);

    const accessAge = portfolioConfig.roth_access_age === undefined ? 60 : Number(portfolioConfig.roth_access_age);
    const preAccessRothReal = preciseSum(
      annual.filter((row) => row.age < accessAge).map((row) => row.withdrawals.fromRoth / Math.max(1e-9, row.inflationFactor))
    );
    if (preAccessRothReal > 0.01) flags.push('ROTH_BEFORE_ACCESS_AGE');

    const ssInvalidYears = annual
      .filter((row) => {
        const valid = row.socialSecurityDecisionValid === undefined ? true : row.socialSecurityDecisionValid;
        const codes = row.socialSecurityValidationCodes || [];
        return !valid || codes.length > 0;
      })
      .map((row) => row.year);
    if (ssInvalidYears.length > 0) flags.push('SOCIAL_SECURITY_DECISION_INVALID');

    const minimumClaimMonths = 62 * 12;
    const maximumClaimMonths = 70 * 12;
    const observedClaimMonths = annual
      .map((row) => row.socialSecurityClaimAgeMonths)
      .filter((v) => v !== null && v !== undefined)
      .map((v) => Math.trunc(v));
    const outOfRangeClaims = Array.from(new Set(observedClaimMonths.filter((v) => v < minimumClaimMonths || v > maximumClaimMonths))).sort((a, b) => a - b);
    if (outOfRangeClaims.length > 0) flags.push('SOCIAL_SECURITY_CLAIM_AGE_OUT_OF_RANGE');
    const claimAgeChanges = Array.from(new Set(observedClaimMonths)).sort((a, b) => a - b);
    if (claimAgeChanges.length > 1) flags.push('SOCIAL_SECURITY_CLAIM_STATUS_CHANGED');
    const reachedAge70 = annual.some((row) => row.age >= 70);
    if (reachedAge70 && observedClaimMonths.length === 0) flags.push('SOCIAL_SECURITY_NOT_CLAIMED_BY_70');

    const ssEvaluationRows = annual.filter((row) => row.socialSecurityRobustness !== null && row.socialSecurityRobustness !== undefined);
    const ssSensitiveYears = ssEvaluationRows.filter((row) => row.socialSecurityRobustness === 'SENSITIVE' || row.socialSecurityRobustness === 'FRAGILE').map((row) => row.year);
    const ssFragileYears = ssEvaluationRows.filter((row) => row.socialSecurityRobustness === 'FRAGILE').map((row) => row.year);
    const ssWarningCodes = (diagnostics.issues || [])
      .filter((item) => item.severity === 'warning' && String(item.code || '').startsWith('SS_'))
      .map((item) => String(item.code));

    if (annual.length === 0) {
      return {
        classification: 'Invalid',
        valid: false,
        score: 0.0,
        components: {},
        metrics: {},
        validityFlags: Array.from(new Set(flags)).sort(),
        concerns: concerns.slice(),
      };
    }

    const ending = annual[annual.length - 1];
    const failureYears = annual.filter((row) => row.endingRealTotal <= 0.01 || !row.withdrawals.feasible).map((row) => row.year);
    const floorViolations = annual.filter((row) => row.spendingReal + 0.01 < floorForAge(spendingConfig, row.age)).map((row) => row.year);

    const sequenceYears = Math.trunc(reserveConfig.sequence_sensitive_years);
    const sequenceRows = annual.slice(0, sequenceYears);
    const troughReal = pyMin(sequenceRows.map((row) => row.endingRealTotal), 'sequence trough');
    const troughFraction = troughReal / Math.max(1.0, initialRealTotal);

    const reserveRatios = annual.map((row) => Math.min(1.0, row.endingRealBalances.tbills / Math.max(1.0, row.reserveTargetReal)));
    const finalNeed = ending.spendingReal + ending.taxReal;
    const finalReserveMonths = (ending.endingRealBalances.tbills / Math.max(1.0, finalNeed)) * 12.0;

    const first12 = Math.trunc(spendingConfig.first_12_years);
    const opportunityYears = annual.filter((row) => row.retirementYear > first12 && row.spendingEligibleCeilingReal > row.spendingReal + 1.0);
    const prosperityParticipation =
      opportunityYears.length > 0
        ? mean(opportunityYears.map((row) => Math.min(1.0, row.spendingReal / Math.max(1.0, row.spendingEligibleCeilingReal))))
        : 1.0;
    const floorCompliance = 1.0 - floorViolations.length / annual.length;

    const schdSaleYears = annual.filter((row) => row.withdrawals.fromSchd > 0.01).length;
    const finalBalances = ending.endingRealBalances;
    const finalBalanceValues = Object.values(finalBalances);
    const largestFinalShare = pyMax(finalBalanceValues, 'ending balances') / Math.max(1.0, preciseSum(finalBalanceValues));

    const weights = gradingConfig.weights;
    const survivalFraction = failureYears.length > 0 ? 0.0 : 1.0;
    const sequenceFraction = Math.min(1.0, troughFraction / Math.max(1e-9, Number(gradingConfig.sequence_trough_full_credit_fraction)));
    const lifestyleFraction = 0.6 * floorCompliance + 0.4 * prosperityParticipation;
    const reserveFraction = mean(reserveRatios);
    const allowedSchdYears = Math.trunc(gradingConfig.maximum_schd_principal_sale_years_for_full_credit);
    const schdFraction = schdSaleYears <= allowedSchdYears ? 1.0 : Math.max(0.0, 1.0 - 0.1 * (schdSaleYears - allowedSchdYears));
    const concentrationFraction = Math.max(0.0, Math.min(1.0, (1.0 - largestFinalShare) / 0.5));
    const stewardshipFraction = 0.6 * schdFraction + 0.4 * concentrationFraction;

    const components = {
      survival: Number(weights.survival) * survivalFraction,
      sequence_resilience: Number(weights.sequence_resilience) * sequenceFraction,
      lifestyle_delivery: Number(weights.lifestyle_delivery) * lifestyleFraction,
      reserve_effectiveness: Number(weights.reserve_effectiveness) * reserveFraction,
      asset_stewardship: Number(weights.asset_stewardship) * stewardshipFraction,
    };
    const score = round2(preciseSum(Object.values(components)));

    if (failureYears.length > 0) concerns.push(`portfolio funding failed in ${failureYears[0]}`);
    if (floorViolations.length > 0) concerns.push(`lifestyle floor was missed in ${floorViolations.length} years`);
    if (finalReserveMonths < Number(gradingConfig.minimum_final_reserve_months)) {
      concerns.push(`ending reserve coverage was only ${finalReserveMonths.toFixed(2)} months`);
    }
    if (opportunityYears.length > 0 && prosperityParticipation < 0.5) {
      concerns.push('lifestyle captured less than half of eligible prosperity capacity');
    }
    if (largestFinalShare > 0.9) concerns.push('more than 90% of ending assets were concentrated in one sleeve');
    if (schdSaleYears > allowedSchdYears) concerns.push(`SCHD principal was sold in ${schdSaleYears} years`);
    if (ssSensitiveYears.length > 0) {
      concerns.push(`Social Security claiming was sensitivity-dependent in ${ssSensitiveYears.length} evaluation year(s)`);
    }
    if (ssFragileYears.length > 0) concerns.push(`Social Security claiming was fragile in ${ssFragileYears.length} year(s)`);
    if (ssWarningCodes.length > 0) concerns.push(`Social Security diagnostics produced ${ssWarningCodes.length} warning(s)`);

    const valid = flags.length === 0;
    let classification;
    if (!valid) {
      classification = 'Invalid';
    } else if (failureYears.length > 0 || score < Number(gradingConfig.conditional_score)) {
      classification = 'Failed';
    } else if (
      score >= Number(gradingConfig.successful_score) &&
      finalReserveMonths >= Number(gradingConfig.minimum_final_reserve_months) &&
      floorViolations.length === 0
    ) {
      classification = 'Successful';
    } else {
      classification = 'Conditional';
    }

    const metrics = {
      initial_real_total: initialRealTotal,
      ending_real_total: ending.endingRealTotal,
      sequence_trough_real: troughReal,
      sequence_trough_fraction: troughFraction,
      cumulative_lifestyle_real: preciseSum(annual.map((row) => row.spendingReal)),
      cumulative_tax_real: preciseSum(annual.map((row) => row.taxReal)),
      floor_violation_years: floorViolations,
      failure_years: failureYears,
      prosperity_opportunity_years: opportunityYears.length,
      prosperity_participation: prosperityParticipation,
      average_reserve_target_funding: mean(reserveRatios),
      ending_reserve_months: finalReserveMonths,
      schd_principal_sale_years: schdSaleYears,
      pre_access_roth_withdrawals_real: preAccessRothReal,
      largest_ending_sleeve_share: largestFinalShare,
      social_security_claim_age_months: observedClaimMonths.length > 0 ? observedClaimMonths[0] : null,
      social_security_claim_age: observedClaimMonths.length > 0 ? observedClaimMonths[0] / 12.0 : null,
      social_security_evaluation_years: ssEvaluationRows.length,
      social_security_sensitive_years: ssSensitiveYears,
      social_security_fragile_years: ssFragileYears,
      social_security_invalid_years: ssInvalidYears,
      social_security_warning_count: ssWarningCodes.length,
      social_security_warning_codes: Array.from(new Set(ssWarningCodes)).sort(),
    };

    const roundedComponents = {};
    for (const [key, value] of Object.entries(components)) roundedComponents[key] = round2(value);

    return {
      classification,
      valid,
      score,
      components: roundedComponents,
      metrics,
      validityFlags: Array.from(new Set(flags)).sort(),
      concerns: concerns.slice(),
    };
  }

  return { grade };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createEffectivenessGrader };
}
