'use strict';
/*
 * Ported from the Financial Projection V2.1.2 (post-audit-repair,
 * requalified) Python engine's retirement_model_v2/social_security_optimizer.py
 * -- Phase 4 (Social Security optimizer port), module 9/9 (the last one).
 *
 * Ports the CURRENT (V2.1.2) no-hindsight annual optimal-stopping decision
 * path only: decide() -> _decide_v2_1_2() -> _evaluate_candidate_set() ->
 * _compare_candidates()/_select_candidate() -> _attach_sensitivity_results().
 * This evaluates every monthly claim-age candidate from the earliest
 * eligible month to the maximum claiming age, ranks them through a strict
 * hierarchy (avoid floor depletion first, then require robustness across
 * scenarios, then maximize economic value among close-enough candidates,
 * using longevity/tax/terminal-asset tiebreaks -- never an additive score),
 * then stress-tests the winner against portfolio-return, mortality-table,
 * and safe-discount-rate sensitivities to classify it ROBUST/SENSITIVE/
 * FRAGILE.
 *
 * DELIBERATELY NOT PORTED (both explicitly marked as dead/legacy in the
 * Python source's own comments, and unreachable from the calculator's own
 * call pattern, which always supplies compact mortality data and its own
 * SocialSecurityPlanningState -- see social-security-state.js's
 * buildSocialSecurityPlanningState()):
 *   - ClaimCandidate / _legacy_decide() / _legacy_candidate() /
 *     _legacy_after_tax_fraction(): "Legacy V2.1.0 candidate retained only
 *     until M3 engine integration" (the class's own docstring). Only ever
 *     invoked by decide() when mortality_data is None, which this port's
 *     construction path never allows (ss-mortality-data.json always
 *     supplies compact mortality data).
 *   - _approximate_planning_state(): "Compatibility adapter removed from
 *     engine use during M3" (the method's own docstring). Only reachable
 *     via decide()'s state= parameter, which this port's decide() doesn't
 *     accept -- callers build a SocialSecurityPlanningState themselves via
 *     buildSocialSecurityPlanningState(), the same real construction path
 *     Python's own engine uses everywhere except this removed adapter.
 *   - Decision-log integration (self.log.record(...) calls, and the
 *     TARGET_CHANGED trace reason that depends on remembering the previous
 *     decision's target across calls): logging/tracing infrastructure, not
 *     decision-affecting output. diagnostic_summary (compact_record) IS
 *     still computed and returned on the decision, matching Python exactly;
 *     trace_reasons/detailed_candidates remain available by calling
 *     social-security-diagnostics.js directly on the returned decision's
 *     `comparison` when needed.
 */

const { claimFactorMonths } = require('./social-security-benefit');
const { createMortalityTable } = require('./social-security-mortality');
const { createPortfolioBridgeProjector } = require('./social-security-bridge');
const {
  createValuationEngine, planningStateFingerprint, firstYearBenefitFraction, createPlanningScenario,
} = require('./social-security-valuation');
const { createDiagnosticBuilder } = require('./social-security-diagnostics');

function claimFactor(age, fraAge = 67) {
  return claimFactorMonths(age * 12, fraAge * 12);
}

/** First-occurrence-wins maximum by an array-valued (tuple) key, matching
 * Python's max(iterable, key=lambda x: (...)) tuple comparison + tie-break
 * (only replaces the incumbent on a STRICTLY greater key, so the first
 * maximal item found wins ties) -- same pattern as lifetime-tax-optimizer.js's
 * minBy, generalized to tuples and to "greater is better". */
function maxByTuple(items, keyFn) {
  let best = items[0];
  let bestKey = keyFn(best);
  for (let i = 1; i < items.length; i++) {
    const key = keyFn(items[i]);
    let greater = false;
    for (let j = 0; j < key.length; j++) {
      if (key[j] > bestKey[j]) { greater = true; break; }
      if (key[j] < bestKey[j]) { greater = false; break; }
    }
    if (greater) {
      best = items[i];
      bestKey = key;
    }
  }
  return best;
}

function scenarioResult(candidate, name) {
  const found = candidate.scenarioResults.find((item) => item.scenario === name);
  if (found === undefined) throw new Error(`No scenario result named ${name} on this candidate`);
  return found;
}

function centralResult(candidate) {
  return scenarioResult(candidate, 'central');
}

function createSocialSecurityOptimizer({
  config, calculator = null, decisionLog = null, mortalityData = null, optimizerConfig = null, reserveConfig = null,
}) {
  const bridgeProjector = (optimizerConfig !== null && reserveConfig !== null)
    ? createPortfolioBridgeProjector({ ssConfig: config, optimizerConfig, reserveConfig, calculator })
    : null;
  const valuation = createValuationEngine({ config, calculator, bridgeProjector });
  const diagnosticBuilder = createDiagnosticBuilder(config);
  let candidateCache = new Map();

  function benefitRealForMonths(claimAgeMonths, fraMonthlyReal) {
    const monthly = fraMonthlyReal !== undefined && fraMonthlyReal !== null ? Number(fraMonthlyReal) : Number(config.fra_monthly_real);
    return monthly * claimFactorMonths(claimAgeMonths, Number(config.fra_age) * 12) * Number(config.scheduled_benefit_fraction);
  }

  function annualBenefitReal(age) {
    return benefitRealForMonths(age * 12) * 12.0;
  }

  function scenarioSignature(scenarioSet) {
    return scenarioSet.map((item) => [item.name, item.realPortfolioReturn, item.realSafeReturn, item.inflationRate, item.taxIncomeRealGrowth, item.weight]);
  }

  function cacheKeyFor(planningState, mortalityAlternative, scenarioSet) {
    return JSON.stringify([planningStateFingerprint(planningState), mortalityAlternative, scenarioSignature(scenarioSet)]);
  }

  function evaluateCandidateSet({ planningState, mortalityAlternative, scenarios }) {
    if (mortalityData === null) {
      throw new Error('V2.1.2 candidate evaluation requires mortality data');
    }
    const scenarioSet = scenarios !== undefined && scenarios !== null ? Array.from(scenarios) : valuation.scenarios();
    const key = cacheKeyFor(planningState, mortalityAlternative, scenarioSet);
    if (candidateCache.has(key)) return candidateCache.get(key);

    const current = Math.trunc(planningState.decisionAgeMonths);
    const minimum = Number(config.claim_min_age_months);
    const maximum = Number(config.claim_max_age_months);
    const table = createMortalityTable(mortalityData, mortalityAlternative);
    const profile = table.conditionalProfile({
      birthYear: Number(config.birth_year), sex: String(config.sex),
      valuationAgeMonths: current, throughAgeMonths: Number(config.planning_terminal_age) * 12,
    });
    const step = Math.trunc(config.claim_step_months);
    const result = [];
    for (let claimMonth = Math.max(current, minimum); claimMonth <= maximum; claimMonth += step) {
      result.push(valuation.evaluateCandidate({
        planningState, claimAgeMonths: claimMonth, mortalityProfile: profile, scenarios: scenarioSet,
      }));
    }
    candidateCache.set(key, result);
    return result;
  }

  function scenarioAcceptabilityRates(candidates, scenarioNames) {
    const closeFraction = Number(config.economic_close_call_fraction);
    const acceptable = new Map(candidates.map((c) => [c.claimAgeMonths, 0]));
    for (const scenarioName of scenarioNames) {
      const best = Math.max(...candidates.map((c) => scenarioResult(c, scenarioName).netEconomicValue));
      const tolerance = Math.max(Math.abs(best), 1.0) * closeFraction;
      for (const candidate of candidates) {
        const value = scenarioResult(candidate, scenarioName).netEconomicValue;
        if (best - value <= tolerance + 1e-9) {
          acceptable.set(candidate.claimAgeMonths, acceptable.get(candidate.claimAgeMonths) + 1);
        }
      }
    }
    const denominator = Math.max(1, scenarioNames.length);
    const rates = new Map();
    for (const [age, count] of acceptable) rates.set(age, count / denominator);
    return rates;
  }

  function selectCandidate(candidates, acceptabilityRates) {
    let pool = candidates;
    const noDepletion = pool.filter((c) => !(c.longevity.floorDepletionScenarioRate > 1e-12));
    if (noDepletion.length > 0) {
      pool = noDepletion;
    } else {
      const minimumRate = Math.min(...pool.map((c) => c.longevity.floorDepletionScenarioRate));
      pool = pool.filter((c) => Math.abs(c.longevity.floorDepletionScenarioRate - minimumRate) <= 1e-12);
      const minimumShortfall = Math.min(...pool.map((c) => c.longevity.conditionalShortfallPv));
      pool = pool.filter((c) => c.longevity.conditionalShortfallPv <= minimumShortfall + 1.0);
    }

    const minimumRobust = Number(config.minimum_robust_win_rate);
    const robust = pool.filter((c) => acceptabilityRates.get(c.claimAgeMonths) >= minimumRobust);
    if (robust.length > 0) {
      pool = robust;
    } else {
      const bestRate = Math.max(...pool.map((c) => acceptabilityRates.get(c.claimAgeMonths)));
      pool = pool.filter((c) => Math.abs(acceptabilityRates.get(c.claimAgeMonths) - bestRate) <= 1e-12);
    }

    const bestEconomic = Math.max(...pool.map((c) => centralResult(c).netEconomicValue));
    const closeFraction = Number(config.economic_close_call_fraction);
    const closeTolerance = Math.max(Math.abs(bestEconomic), 1.0) * closeFraction;
    const closePool = pool.filter((c) => bestEconomic - centralResult(c).netEconomicValue <= closeTolerance + 1e-9);

    return maxByTuple(closePool, (c) => [
      c.longevity.depletionProtection,
      Math.min(c.longevity.age85Coverage, c.longevity.age90Coverage, c.longevity.age95Coverage),
      c.longevity.reserveEquivalentReal,
      -c.longevity.conditionalShortfallPv,
      -c.taxPv,
      c.terminalAssets,
      c.claimAgeMonths,
    ]);
  }

  function compareCandidates(candidates) {
    const valid = candidates.filter((c) => c.feasible);
    if (valid.length === 0) {
      throw new Error('No valid Social Security claim candidate');
    }
    const scenarioNames = valid[0].scenarioResults.map((r) => r.scenario);
    const acceptabilityRates = scenarioAcceptabilityRates(valid, scenarioNames);
    const winner = selectCandidate(valid, acceptabilityRates);
    const remaining = valid.filter((c) => c !== winner);
    const runner = remaining.length > 0 ? selectCandidate(remaining, acceptabilityRates) : null;
    const winnerCentral = centralResult(winner).netEconomicValue;
    const runnerCentral = runner !== null ? centralResult(runner).netEconomicValue : winnerCentral;
    const margin = winnerCentral - runnerCentral;
    const flipAges = {};
    for (const scenarioName of scenarioNames) {
      const scenarioWinner = maxByTuple(valid, (c) => [scenarioResult(c, scenarioName).netEconomicValue, c.claimAgeMonths]);
      flipAges[scenarioName] = scenarioWinner.claimAgeMonths;
    }
    const winRate = acceptabilityRates.get(winner.claimAgeMonths);
    const minimumRobust = Number(config.minimum_robust_win_rate);
    const closeFraction = Number(config.economic_close_call_fraction);
    const close = runner !== null && Math.abs(margin) <= Math.max(Math.abs(winnerCentral), 1.0) * closeFraction;
    let robustness;
    if (winRate >= 1.0 && !close) {
      robustness = 'ROBUST';
    } else if (winRate >= minimumRobust) {
      robustness = 'SENSITIVE';
    } else {
      robustness = 'FRAGILE';
    }
    return {
      winner, runnerUp: runner, economicMargin: margin, scenarioWinRate: winRate,
      sensitivityFlipAges: flipAges, robustnessClass: robustness, candidates,
    };
  }

  function attachSensitivityResults({ planningState, comparison }) {
    const selected = comparison.winner.claimAgeMonths;
    const centralAlternative = String(config.mortality_central_alternative);
    const baseScenarios = valuation.scenarios();
    const flips = {};
    const noncentralWinners = [];
    for (const sensitivity of baseScenarios) {
      let winner;
      if (sensitivity.name === 'central') {
        winner = selected;
      } else {
        const scenarios = baseScenarios.map((item) => createPlanningScenario(Object.assign({}, item, { realPortfolioReturn: sensitivity.realPortfolioReturn })));
        const candidates = evaluateCandidateSet({ planningState, mortalityAlternative: centralAlternative, scenarios });
        winner = compareCandidates(candidates).winner.claimAgeMonths;
        noncentralWinners.push(winner);
      }
      flips[`portfolio_return.${sensitivity.name}`] = winner;
    }
    flips[`mortality.${centralAlternative}`] = selected;

    for (const alternative of config.mortality_sensitivity_alternatives) {
      const candidates = evaluateCandidateSet({ planningState, mortalityAlternative: String(alternative) });
      const winner = compareCandidates(candidates).winner.claimAgeMonths;
      flips[`mortality.${alternative}`] = winner;
      noncentralWinners.push(winner);
    }

    const centralSafeRate = Number(config.safe_real_discount_rate);
    flips[`safe_rate.${centralSafeRate.toFixed(6)}`] = selected;
    for (const safeRate of config.safe_real_discount_rate_sensitivities) {
      const rate = Number(safeRate);
      const scenarios = baseScenarios.map((item) => createPlanningScenario(Object.assign({}, item, { realSafeReturn: rate })));
      const candidates = evaluateCandidateSet({ planningState, mortalityAlternative: centralAlternative, scenarios });
      const winner = compareCandidates(candidates).winner.claimAgeMonths;
      flips[`safe_rate.${rate.toFixed(6)}`] = winner;
      noncentralWinners.push(winner);
    }

    let robustness = comparison.robustnessClass;
    if (robustness === 'ROBUST' && noncentralWinners.some((age) => age !== selected)) {
      robustness = 'SENSITIVE';
    }
    return Object.assign({}, comparison, { sensitivityFlipAges: flips, robustnessClass: robustness });
  }

  function decideV212(planningState) {
    if (mortalityData === null) {
      throw new Error('V2.1.2 decision path requires compact mortality data');
    }
    const minimum = Number(config.claim_min_age_months);
    const maximum = Number(config.claim_max_age_months);
    const current = Math.trunc(planningState.decisionAgeMonths);

    if (planningState.ssClaimAgeMonths !== null && planningState.ssClaimAgeMonths !== undefined) {
      const claimed = Math.trunc(planningState.ssClaimAgeMonths);
      return {
        eligible: true, claimNow: false, selectedClaimAge: Math.floor(claimed / 12),
        annualBenefitRealIfClaimed: benefitRealForMonths(claimed, planningState.fraMonthlyBenefitReal) * 12.0,
        reason: 'already claimed', candidates: [], action: 'ALREADY_CLAIMED',
        selectedClaimAgeMonths: claimed, selectedClaimMonth: claimed % 12,
        firstYearBenefitFraction: 1.0, comparison: null,
        diagnosticSummary: { future_market_data_used: false },
      };
    }
    if (current < minimum) {
      return {
        eligible: false, claimNow: false, selectedClaimAge: null, annualBenefitRealIfClaimed: 0.0,
        reason: `not eligible until age ${Math.floor(minimum / 12)}`, candidates: [], action: 'NOT_ELIGIBLE',
        selectedClaimAgeMonths: null, selectedClaimMonth: null, firstYearBenefitFraction: 0.0, comparison: null,
        diagnosticSummary: { future_market_data_used: false },
      };
    }

    const centralAlternative = String(config.mortality_central_alternative);
    const candidates = evaluateCandidateSet({ planningState, mortalityAlternative: centralAlternative });
    let comparison = compareCandidates(candidates);
    comparison = attachSensitivityResults({ planningState, comparison });
    let selected = comparison.winner.claimAgeMonths;

    let action;
    let claimNow;
    let reason;
    if (current >= maximum) {
      action = 'FORCED_CLAIM';
      selected = maximum;
      claimNow = true;
      reason = 'maximum claim age reached; claim is mandatory';
    } else if (selected === current) {
      action = 'CLAIM';
      claimNow = true;
      reason = 'claim now is the highest-ranked no-hindsight action';
    } else if (selected < current + 12) {
      action = 'SCHEDULE';
      claimNow = true;
      reason = `schedule claim in ${selected - current} month(s)`;
    } else {
      action = 'WAIT';
      claimNow = false;
      reason = `wait one year and reevaluate; current no-hindsight target is ${Math.floor(selected / 12)}:${String(selected % 12).padStart(2, '0')}`;
    }

    const firstFraction = claimNow ? firstYearBenefitFraction(selected) : 0.0;
    const annual = claimNow ? benefitRealForMonths(selected, planningState.fraMonthlyBenefitReal) * 12.0 : 0.0;
    const summary = diagnosticBuilder.compactRecord({ planningState, comparison, action });

    return {
      eligible: true, claimNow, selectedClaimAge: Math.floor(selected / 12), annualBenefitRealIfClaimed: annual,
      reason, candidates, action, selectedClaimAgeMonths: selected, selectedClaimMonth: selected % 12,
      firstYearBenefitFraction: firstFraction, comparison, diagnosticSummary: summary,
    };
  }

  function decide({ planningState }) {
    if (planningState === undefined || planningState === null) {
      throw new Error('A Social Security planning state is required');
    }
    return decideV212(planningState);
  }

  function clearCache() {
    candidateCache = new Map();
  }

  return {
    decide, benefitRealForMonths, annualBenefitReal, evaluateCandidateSet, compareCandidates,
    attachSensitivityResults, scenarioAcceptabilityRates, selectCandidate, clearCache,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    claimFactor,
    maxByTuple,
    scenarioResult,
    centralResult,
    createSocialSecurityOptimizer,
  };
}
