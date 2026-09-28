'use strict';
/*
 * Ported from the Financial Projection V2.1.2 (post-audit-repair,
 * requalified) Python engine's retirement_model_v2/social_security_valuation.py
 * -- Phase 4 (Social Security optimizer port).
 *
 * NOTE: this file currently ports only SocialSecurityPlanningState (the
 * plain decision-date data holder built by social-security-state.js's
 * buildSocialSecurityPlanningState()). The valuation/optimal-stopping logic
 * that lives in the rest of social_security_valuation.py is ported in a
 * later Phase 4 module and will be added to this same file.
 */

const crypto = require('crypto');
const { preciseSum } = require('./precise-math');
const { claimFactorMonths, claimFactorSchedule, scheduleEventual, scheduleInitialPayable } = require('./social-security-benefit');
const { createLongevityAnalyzer } = require('./social-security-longevity');

function createSocialSecurityPlanningState(fields) {
  return {
    decisionYear: fields.decisionYear,
    decisionAgeMonths: fields.decisionAgeMonths,
    retirementYear: fields.retirementYear,
    inflationFactor: fields.inflationFactor,
    spendingReal: fields.spendingReal,
    spendingFloorReal: fields.spendingFloorReal,
    vooReal: fields.vooReal,
    vooBasisReal: fields.vooBasisReal,
    schdReal: fields.schdReal,
    schdBasisReal: fields.schdBasisReal,
    tbillsReal: fields.tbillsReal,
    rothReal: fields.rothReal,
    reserveMonths: fields.reserveMonths,
    equityDrawdown: fields.equityDrawdown,
    baseIncomeNominal: fields.baseIncomeNominal === undefined ? {
      ordinaryIncome: 0, qualifiedDividends: 0, nonqualifiedDividends: 0,
      longTermGains: 0, treasuryInterest: 0, socialSecurity: 0, capitalLossCarryforward: 0,
    } : fields.baseIncomeNominal,
    trailingSpendingReal: fields.trailingSpendingReal === undefined ? [] : fields.trailingSpendingReal,
    trailingTaxReal: fields.trailingTaxReal === undefined ? [] : fields.trailingTaxReal,
    trailingRealReturns: fields.trailingRealReturns === undefined ? [] : fields.trailingRealReturns,
    trend15yReal: fields.trend15yReal === undefined ? null : fields.trend15yReal,
    ssClaimAgeMonths: fields.ssClaimAgeMonths === undefined ? null : fields.ssClaimAgeMonths,
    fraMonthlyBenefitReal: fields.fraMonthlyBenefitReal === undefined ? null : fields.fraMonthlyBenefitReal,
  };
}

function planningStatePortfolioReal(state) {
  return state.vooReal + state.schdReal + state.tbillsReal + state.rothReal;
}

// Python's json.dumps renders a float as e.g. "60000.0" (always a decimal
// point) but an int as "60000" -- discovered by spot-checking Python's own
// json.dumps rather than assumed, since JS's Number has no such distinction
// and JSON.stringify(60000) always produces "60000". PyFloat marks a value
// as float-typed in the source dataclass so the serializer below can
// reproduce that distinction; every dataclass field not wrapped in PyFloat
// is treated as Python's `int` (decision_year, decision_age_months,
// retirement_year, ss_claim_age_months -- the only int-typed fields in
// SocialSecurityPlanningState).
class PyFloat {
  constructor(value) {
    this.value = value;
  }
}

function f(value) {
  return value === null || value === undefined ? value : new PyFloat(value);
}

// Mirrors the Python dataclass field order exactly (asdict() preserves
// declaration order, and fingerprint() depends on sort_keys=True over that
// payload's *keys*, not field order -- but the payload's nested dict
// (base_income_nominal) must also serialize with the same snake_case keys
// Python's asdict()/json.dumps produce, since the hash is byte-for-byte
// over the JSON text).
function planningStateToPythonDict(state) {
  return {
    decision_year: state.decisionYear,
    decision_age_months: state.decisionAgeMonths,
    retirement_year: state.retirementYear,
    inflation_factor: f(state.inflationFactor),
    spending_real: f(state.spendingReal),
    spending_floor_real: f(state.spendingFloorReal),
    voo_real: f(state.vooReal),
    voo_basis_real: f(state.vooBasisReal),
    schd_real: f(state.schdReal),
    schd_basis_real: f(state.schdBasisReal),
    tbills_real: f(state.tbillsReal),
    roth_real: f(state.rothReal),
    reserve_months: f(state.reserveMonths),
    equity_drawdown: f(state.equityDrawdown),
    base_income_nominal: {
      ordinary_income: f(state.baseIncomeNominal.ordinaryIncome),
      qualified_dividends: f(state.baseIncomeNominal.qualifiedDividends),
      nonqualified_dividends: f(state.baseIncomeNominal.nonqualifiedDividends),
      long_term_gains: f(state.baseIncomeNominal.longTermGains),
      treasury_interest: f(state.baseIncomeNominal.treasuryInterest),
      social_security: f(state.baseIncomeNominal.socialSecurity),
      capital_loss_carryforward: f(state.baseIncomeNominal.capitalLossCarryforward),
    },
    trailing_spending_real: state.trailingSpendingReal.map(f),
    trailing_tax_real: state.trailingTaxReal.map(f),
    trailing_real_returns: state.trailingRealReturns.map(f),
    trend_15y_real: f(state.trend15yReal),
    ss_claim_age_months: state.ssClaimAgeMonths,
    fra_monthly_benefit_real: f(state.fraMonthlyBenefitReal),
  };
}

// Reproduces CPython's repr(float) / json.dumps(float) formatting exactly.
//
// This started out only handling the integral case ("60000" -> "60000.0") and
// documented the rest as an unverified gap. An adversarial pass then actually
// measured it and found the gap was real and wider than assumed: JS and
// Python disagree BOTH on when to switch to exponential notation and on how
// to render the exponent. Python (CPython's format_float_short in 'r' mode)
// uses exponential when `decpt <= -4 || decpt > 16`, where decpt is the
// decimal point's position relative to the shortest round-trip digit string,
// and always pads the exponent to at least two digits. JS switches at
// `n <= -6 || n >= 21` and never pads. So Python renders 1e-5 as "1e-05" and
// 1e16 as "1e+16" where JS produces "0.00001" and "10000000000000000".
//
// That mattered because planningStateFingerprint() hashes this text: any
// state holding a small fraction (an equity_drawdown or trend_15y_real below
// 1e-4 is entirely plausible) would have produced a fingerprint that did NOT
// match Python's, silently breaking the byte-for-byte equivalence the
// fingerprint claims. Verified against 191 CPython-generated values covering
// both switch points, exponent padding, negative zero, denormals, and 80
// randoms spanning 30 orders of magnitude (see
// fixtures/py-float-repr.fixtures.json).
function pyFloatRepr(value) {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  if (value === 0) return Object.is(value, -0) ? '-0.0' : '0.0';

  const negative = value < 0;
  const abs = Math.abs(value);
  // toExponential() with no argument yields the shortest round-trip digits,
  // the same digit string CPython's 'r' mode starts from.
  const parsed = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(abs.toExponential());
  if (!parsed) throw new Error(`Unexpected exponential form for ${abs}`);
  const digits = parsed[1] + (parsed[2] || '');
  const exponent = Number(parsed[3]);
  const decpt = exponent + 1;

  let out;
  if (decpt <= -4 || decpt > 16) {
    // Python omits the decimal point entirely for a single-digit mantissa
    // ("1e+22", not "1.0e+22").
    const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits[0];
    const sign = exponent < 0 ? '-' : '+';
    out = `${mantissa}e${sign}${String(Math.abs(exponent)).padStart(2, '0')}`;
  } else if (decpt <= 0) {
    out = `0.${'0'.repeat(-decpt)}${digits}`;
  } else if (decpt >= digits.length) {
    // Positional and integral -- Python always keeps one decimal place.
    out = `${digits}${'0'.repeat(decpt - digits.length)}.0`;
  } else {
    out = `${digits.slice(0, decpt)}.${digits.slice(decpt)}`;
  }
  return negative ? `-${out}` : out;
}

function sortKeysDeepJson(value) {
  if (value instanceof PyFloat) return pyFloatRepr(value.value);
  if (Array.isArray(value)) return `[${value.map(sortKeysDeepJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${sortKeysDeepJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// Matches Python's json.dumps(payload, sort_keys=True, separators=(",", ":"))
// -- compact separators, no whitespace, keys sorted at every nesting level,
// float/int distinction preserved via PyFloat.
function pythonCompactJson(value) {
  return sortKeysDeepJson(value);
}

function planningStateFingerprint(state) {
  const payload = planningStateToPythonDict(state);
  const encoded = pythonCompactJson(payload);
  return crypto.createHash('sha256').update(encoded, 'utf8').digest('hex');
}

// Python's `%` always returns a result with the same sign as the divisor
// (floor division): -1 % 12 == 11. JS's `%` returns a result with the sign
// of the dividend (truncated division): -1 % 12 == -1. Claim ages are never
// negative in this module's real domain, but pyMod is used anywhere the
// Python source relies on modulo so the port is correct even outside that
// domain, not just lucky.
function pyMod(a, b) {
  return ((a % b) + b) % b;
}

function createPlanningScenario({ name, realPortfolioReturn, realSafeReturn, inflationRate, taxIncomeRealGrowth, weight }) {
  return { name, realPortfolioReturn, realSafeReturn, inflationRate, taxIncomeRealGrowth, weight };
}

function createBridgeProjection(fields) {
  const f = fields || {};
  return {
    opportunityCostPv: f.opportunityCostPv === undefined ? 0.0 : f.opportunityCostPv,
    incrementalTaxPv: f.incrementalTaxPv === undefined ? 0.0 : f.incrementalTaxPv,
    terminalAssetDifference: f.terminalAssetDifference === undefined ? 0.0 : f.terminalAssetDifference,
    terminalAssetsReal: f.terminalAssetsReal === undefined ? 0.0 : f.terminalAssetsReal,
    feasible: f.feasible === undefined ? true : f.feasible,
    sourceWithdrawalsReal: f.sourceWithdrawalsReal === undefined ? {} : f.sourceWithdrawalsReal,
    annualRecords: f.annualRecords === undefined ? [] : f.annualRecords,
    validationCodes: f.validationCodes === undefined ? [] : f.validationCodes,
  };
}

function fraMonthlyRealForState(planningState, config) {
  const value = planningState.fraMonthlyBenefitReal;
  return value !== null && value !== undefined ? Number(value) : Number(config.fra_monthly_real);
}

function projectIncome(income, { currentInflationFactor, futureInflationFactor, realGrowth, projectionYear }) {
  if (!(currentInflationFactor > 0.0) || !(futureInflationFactor > 0.0)) {
    throw new Error('Inflation factors must be positive');
  }
  const scale = (futureInflationFactor / currentInflationFactor) * Math.pow(1.0 + realGrowth, projectionYear);
  return {
    ordinaryIncome: income.ordinaryIncome * scale,
    qualifiedDividends: income.qualifiedDividends * scale,
    nonqualifiedDividends: income.nonqualifiedDividends * scale,
    longTermGains: income.longTermGains * scale,
    treasuryInterest: income.treasuryInterest * scale,
    socialSecurity: income.socialSecurity * scale,
    capitalLossCarryforward: income.capitalLossCarryforward,
  };
}

function firstYearBenefitFraction(claimAgeMonths) {
  const claimMonth = pyMod(Math.trunc(claimAgeMonths), 12);
  return (12 - claimMonth) / 12.0;
}

function createCandidateScenarioValuation(fields) {
  return {
    scenario: fields.scenario,
    grossBenefitPv: fields.grossBenefitPv,
    afterTaxBenefitPv: fields.afterTaxBenefitPv,
    taxPv: fields.taxPv,
    bridge: fields.bridge,
    longevity: fields.longevity,
    netEconomicValue: fields.netEconomicValue,
    terminalAssets: fields.terminalAssets,
    feasible: fields.feasible,
    validationCodes: fields.validationCodes || [],
  };
}

function createCandidateValuation(fields) {
  return {
    claimAgeMonths: fields.claimAgeMonths,
    factor: fields.factor,
    firstYearFraction: fields.firstYearFraction,
    grossBenefitPv: fields.grossBenefitPv,
    afterTaxBenefitPv: fields.afterTaxBenefitPv,
    bridgeCostPv: fields.bridgeCostPv,
    netEconomicValue: fields.netEconomicValue,
    taxPv: fields.taxPv,
    terminalAssets: fields.terminalAssets,
    longevity: fields.longevity,
    feasible: fields.feasible,
    validationCodes: fields.validationCodes,
    scenarioResults: fields.scenarioResults,
  };
}

function candidateClaimAge(candidate) {
  return Math.floor(candidate.claimAgeMonths / 12);
}

function candidateClaimMonth(candidate) {
  return pyMod(candidate.claimAgeMonths, 12);
}

function createValuationEngine({ config, calculator = null, bridgeProjector = null }) {
  const longevityAnalyzer = createLongevityAnalyzer(config);

  function scenarios() {
    const result = config.planning_scenarios.map((item) => createPlanningScenario({
      name: item.name,
      realPortfolioReturn: item.real_portfolio_return,
      realSafeReturn: item.real_safe_return,
      inflationRate: item.inflation_rate,
      taxIncomeRealGrowth: item.tax_income_real_growth,
      weight: item.weight,
    }));
    if (Math.abs(preciseSum(result.map((item) => item.weight)) - 1.0) > 1e-12) {
      throw new Error('Planning scenario weights must sum to 1');
    }
    return result;
  }

  function validateScenarios(scenarioSet) {
    const names = scenarioSet.map((item) => String(item.name).trim());
    if (names.some((n) => !n) || new Set(names).size !== names.length) {
      throw new Error('Social Security planning scenario names must be unique and nonempty');
    }
    for (const item of scenarioSet) {
      const numeric = [item.realPortfolioReturn, item.realSafeReturn, item.inflationRate, item.taxIncomeRealGrowth, item.weight];
      if (numeric.some((v) => !Number.isFinite(Number(v)))) {
        throw new Error('Social Security planning scenario values must be finite');
      }
      if (!(Number(item.weight) > 0.0)) {
        throw new Error('Social Security planning scenarios require positive weights');
      }
      if ([item.realPortfolioReturn, item.realSafeReturn, item.inflationRate, item.taxIncomeRealGrowth].some((v) => Number(v) <= -1.0)) {
        throw new Error('Social Security planning scenario rates must be greater than -100%');
      }
    }
  }

  function projectedIncrementalTaxReal({ planningState, projectionYear, annualBenefitReal, scenario }) {
    if (calculator === null || !(annualBenefitReal > 0.0)) return 0.0;
    const futureInflationFactor = planningState.inflationFactor * Math.pow(1.0 + scenario.inflationRate, projectionYear);
    const base = projectIncome(planningState.baseIncomeNominal, {
      currentInflationFactor: planningState.inflationFactor,
      futureInflationFactor,
      realGrowth: scenario.taxIncomeRealGrowth,
      projectionYear,
    });
    const nominalBenefit = annualBenefitReal * futureInflationFactor;
    const without = calculator.calculate(base, futureInflationFactor).total;
    const withBenefit = calculator.calculate(
      Object.assign({}, base, { socialSecurity: base.socialSecurity + nominalBenefit }),
      futureInflationFactor
    ).total;
    return Math.max(0.0, withBenefit - without) / futureInflationFactor;
  }

  function evaluateScenarioForCandidate({ planningState, claimAgeMonths, mortalityProfile, scenario }) {
    const factorSchedule = claimFactorSchedule({
      claimAgeMonths,
      fraAgeMonths: Number(config.fra_age) * 12,
      maximumAgeMonths: Number(config.claim_max_age_months),
      claimCycleStartCalendarMonth: Number(config.claim_cycle_start_calendar_month),
    });
    const fraMonthlyReal = fraMonthlyRealForState(planningState, config);
    const scheduledFraction = Number(config.scheduled_benefit_fraction);
    const paymentsByYear = new Map();
    for (const point of mortalityProfile.points) {
      if (point.ageMonths < claimAgeMonths) continue;
      if (point.ageMonths >= mortalityProfile.throughAgeMonths) continue;
      const offsetMonths = point.ageMonths - planningState.decisionAgeMonths;
      const projectionYear = Math.max(0, Math.floor(offsetMonths / 12));
      const factor = (factorSchedule.pendingEffectiveAgeMonths !== null
        && point.ageMonths < factorSchedule.pendingEffectiveAgeMonths)
        ? scheduleInitialPayable(factorSchedule)
        : scheduleEventual(factorSchedule);
      const monthlyBenefitReal = fraMonthlyReal * factor * scheduledFraction;
      if (!paymentsByYear.has(projectionYear)) paymentsByYear.set(projectionYear, []);
      paymentsByYear.get(projectionYear).push([offsetMonths, point.survival, monthlyBenefitReal]);
    }

    let grossPv = 0.0;
    let afterTaxPv = 0.0;
    let taxPv = 0.0;
    const afterTaxBenefitByAgeMonth = {};
    const safeRate = Number(scenario.realSafeReturn);
    const years = Array.from(paymentsByYear.keys()).sort((a, b) => a - b);
    for (const projectionYear of years) {
      const payments = paymentsByYear.get(projectionYear);
      const annualBenefitReal = preciseSum(payments.map(([, , amount]) => amount));
      const incrementalTaxReal = projectedIncrementalTaxReal({
        planningState, projectionYear, annualBenefitReal, scenario,
      });
      const taxFraction = Math.min(1.0, Math.max(0.0, incrementalTaxReal / Math.max(annualBenefitReal, 1e-12)));
      for (const [offsetMonths, survival, grossReal] of payments) {
        const discount = Math.pow(1.0 + safeRate, offsetMonths / 12.0);
        const weightedGross = (survival * grossReal) / discount;
        const weightedTax = (survival * grossReal * taxFraction) / discount;
        grossPv += weightedGross;
        taxPv += weightedTax;
        afterTaxPv += weightedGross - weightedTax;
        afterTaxBenefitByAgeMonth[planningState.decisionAgeMonths + offsetMonths] = grossReal * (1.0 - taxFraction);
      }
    }

    const bridge = bridgeProjector !== null
      ? bridgeProjector.project({ planningState, claimAgeMonths, mortalityProfile, scenario })
      : createBridgeProjection({ terminalAssetsReal: planningStatePortfolioReal(planningState) });
    const netValue = afterTaxPv - bridge.opportunityCostPv;
    const longevity = longevityAnalyzer.evaluateScenario({
      planningState, mortalityProfile, scenarioName: scenario.name,
      realPortfolioReturn: scenario.realPortfolioReturn, realSafeReturn: scenario.realSafeReturn,
      afterTaxBenefitByAgeMonth,
    });
    const validationCodes = [];
    if (afterTaxPv > grossPv + 1e-8) validationCodes.push('SS_AFTER_TAX_EXCEEDS_GROSS');
    if (Number.isNaN(netValue)) validationCodes.push('SS_VALUE_NAN');
    const combinedCodes = Array.from(new Set([...validationCodes, ...bridge.validationCodes])).sort();
    return createCandidateScenarioValuation({
      scenario: scenario.name,
      grossBenefitPv: grossPv,
      afterTaxBenefitPv: afterTaxPv,
      taxPv,
      bridge,
      longevity,
      netEconomicValue: netValue,
      terminalAssets: bridge.terminalAssetsReal,
      feasible: bridge.feasible && validationCodes.length === 0,
      validationCodes: combinedCodes,
    });
  }

  function validateCandidate(planningState, claimAgeMonths, mortalityProfile) {
    const minimum = Number(config.claim_min_age_months);
    const maximum = Number(config.claim_max_age_months);
    if (claimAgeMonths < Math.max(minimum, planningState.decisionAgeMonths)) {
      throw new Error('Claim candidate precedes eligibility or decision date');
    }
    if (claimAgeMonths > maximum) {
      throw new Error('Claim candidate exceeds maximum claiming age');
    }
    if (mortalityProfile.valuationAgeMonths !== planningState.decisionAgeMonths) {
      throw new Error('Mortality profile and decision age are misaligned');
    }
    if (mortalityProfile.throughAgeMonths < Number(config.planning_terminal_age) * 12) {
      throw new Error('Mortality profile does not reach the planning terminal age');
    }
    if (Math.trunc(mortalityProfile.birthYear) !== Math.trunc(config.birth_year)) {
      throw new Error('Mortality profile birth cohort disagrees with configuration');
    }
    if (String(mortalityProfile.sex).trim().toLowerCase() !== String(config.sex).trim().toLowerCase()) {
      throw new Error('Mortality profile sex disagrees with configuration');
    }
    const fraMonthlyReal = fraMonthlyRealForState(planningState, config);
    if (!Number.isFinite(fraMonthlyReal) || !(fraMonthlyReal > 0.0)) {
      throw new Error('FRA monthly benefit must be finite and positive');
    }
  }

  function evaluateCandidate({ planningState, claimAgeMonths, mortalityProfile, scenarios: scenariosArg }) {
    validateCandidate(planningState, claimAgeMonths, mortalityProfile);
    const scenarioSet = scenariosArg === undefined || scenariosArg === null ? scenarios() : Array.from(scenariosArg);
    if (scenarioSet.length === 0) {
      throw new Error('At least one Social Security planning scenario is required');
    }
    validateScenarios(scenarioSet);
    const values = scenarioSet.map((scenario) => evaluateScenarioForCandidate({
      planningState, claimAgeMonths, mortalityProfile, scenario,
    }));
    const totalWeight = preciseSum(scenarioSet.map((item) => item.weight));
    const weights = scenarioSet.map((item) => item.weight / totalWeight);
    const weightedSum = (attribute) => preciseSum(weights.map((w, i) => w * values[i][attribute]));
    const gross = weightedSum('grossBenefitPv');
    const afterTax = weightedSum('afterTaxBenefitPv');
    const tax = weightedSum('taxPv');
    const bridgeCost = preciseSum(weights.map((w, i) => w * values[i].bridge.opportunityCostPv));
    const net = weightedSum('netEconomicValue');
    const terminalAssets = weightedSum('terminalAssets');
    const codeSet = new Set();
    for (const item of values) {
      for (const code of item.validationCodes) codeSet.add(code);
      for (const code of item.longevity.validationCodes) codeSet.add(code);
    }
    const validationCodes = Array.from(codeSet).sort();
    const longevity = longevityAnalyzer.aggregate(values.map((item) => item.longevity), weights);
    const finalCodes = Array.from(new Set([...validationCodes, ...longevity.validationCodes])).sort();
    return createCandidateValuation({
      claimAgeMonths,
      factor: claimFactorMonths(claimAgeMonths, Number(config.fra_age) * 12),
      firstYearFraction: firstYearBenefitFraction(claimAgeMonths),
      grossBenefitPv: gross,
      afterTaxBenefitPv: afterTax,
      bridgeCostPv: bridgeCost,
      netEconomicValue: net,
      taxPv: tax,
      terminalAssets,
      longevity,
      feasible: values.every((item) => item.feasible) && validationCodes.length === 0,
      validationCodes: finalCodes,
      scenarioResults: values,
    });
  }

  return { scenarios, evaluateCandidate };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createSocialSecurityPlanningState,
    planningStatePortfolioReal,
    planningStateToPythonDict,
    planningStateFingerprint,
    firstYearBenefitFraction,
    pyMod,
    pyFloatRepr,
    pythonCompactJson,
    createPlanningScenario,
    createBridgeProjection,
    fraMonthlyRealForState,
    projectIncome,
    createCandidateScenarioValuation,
    createCandidateValuation,
    candidateClaimAge,
    candidateClaimMonth,
    createValuationEngine,
  };
}
