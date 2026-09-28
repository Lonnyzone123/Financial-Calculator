'use strict';
/*
 * Ported from the Financial Projection V2.1.2 (post-audit-repair,
 * requalified) Python engine's retirement_model_v2/social_security_bridge.py
 * -- Phase 4 (Social Security optimizer port), module 6/9.
 *
 * Projects the INCREMENTAL portfolio cost of self-funding spending while
 * delaying a Social Security claim -- not the full bridge cost, since
 * missing early benefit principal is already reflected in the candidate's
 * own benefit present value. This avoids double-counting: opportunity_cost_pv
 * only captures incremental tax plus the excess of terminal investment loss
 * over the principal already accounted for elsewhere.
 *
 * Ports the same tax-gross-up-then-allocate structure already seen in Phase
 * 5's lifetime-tax-optimizer.js: greedily fund a net cash need across ranked
 * sources, then iterate because the sale itself creates incremental tax that
 * changes the required gross amount, damping 50/50 between iterations to
 * avoid oscillation, same as that module's own loop.
 */

const { claimFactorMonths } = require('./social-security-benefit');
const { profilePoint } = require('./social-security-mortality');
const {
  createBridgeProjection, fraMonthlyRealForState, projectIncome,
} = require('./social-security-valuation');
const {
  createAccount, createPortfolio, clonePortfolio, cloneAccount,
  sellFromAccount, applyReturnToAccount, portfolioTotal,
} = require('./model-types');

const SOURCES = ['tbills', 'voo', 'roth', 'schd'];

function createPortfolioBridgeProjector({ ssConfig, optimizerConfig, reserveConfig, calculator }) {
  function sourceReturn(source, scenario) {
    return source === 'tbills' ? scenario.realSafeReturn : scenario.realPortfolioReturn;
  }

  function projectedIncome(planningState, projectionYear, scenario) {
    const futureFactor = planningState.inflationFactor * Math.pow(1.0 + scenario.inflationRate, projectionYear);
    return [futureFactor, projectIncome(planningState.baseIncomeNominal, {
      currentInflationFactor: planningState.inflationFactor,
      futureInflationFactor: futureFactor,
      realGrowth: scenario.taxIncomeRealGrowth,
      projectionYear,
    })];
  }

  function incrementalSsTaxReal({ planningState, projectionYear, annualBenefitReal, scenario }) {
    if (!calculator) return 0.0;
    const [factor, base] = projectedIncome(planningState, projectionYear, scenario);
    const without = calculator.calculate(base, factor).total;
    const withSs = calculator.calculate(
      Object.assign({}, base, { socialSecurity: base.socialSecurity + annualBenefitReal * factor }),
      factor
    ).total;
    return Math.max(0.0, withSs - without) / factor;
  }

  function incrementalSaleTaxReal({ planningState, projectionYear, portfolio, allocation, scenario }) {
    if (!calculator) return 0.0;
    let realizedGainReal = 0.0;
    const clone = clonePortfolio(portfolio);
    for (const source of ['voo', 'schd']) {
      realizedGainReal += sellFromAccount(clone[source], allocation[source]).realizedGain;
    }
    const [factor, base] = projectedIncome(planningState, projectionYear, scenario);
    const without = calculator.calculate(base, factor).total;
    const withGain = calculator.calculate(
      Object.assign({}, base, { longTermGains: base.longTermGains + realizedGainReal * factor }),
      factor
    ).total;
    return Math.max(0.0, withGain - without) / factor;
  }

  function evaluateSource({ source, portfolio, planningState, monthsToClaim, scenario }) {
    const acct = portfolio[source];
    let available = acct.value;
    if (source === 'tbills') {
      const protectedAmount = (planningState.spendingReal * Number(reserveConfig.protected_final_months)) / 12.0;
      available = Math.max(0.0, acct.value - protectedAmount);
    }
    const growth = Math.pow(1.0 + sourceReturn(source, scenario), monthsToClaim / 12.0);
    let cost = growth;
    if (source === 'roth') cost += Number(optimizerConfig.roth_shadow_cost);
    if (source === 'schd') cost += Number(optimizerConfig.schd_principal_penalty);
    if (planningState.retirementYear <= 12 && planningState.equityDrawdown > 0.0 && (source === 'voo' || source === 'schd')) {
      cost += planningState.equityDrawdown * Number(optimizerConfig.sequence_penalty_multiplier);
    }
    return { source, marginalCost: available > 0.0 ? cost : Infinity, available };
  }

  function rankSources({ portfolio, planningState, monthsToClaim, scenario }) {
    const evaluated = optimizerConfig.candidate_sources.map((source) =>
      evaluateSource({ source, portfolio, planningState, monthsToClaim, scenario })
    );
    // Matches Python's sorted(key=lambda item: (item.marginal_cost, item.source))
    // -- tuple comparison: cost first, source name as a lexicographic tiebreak.
    evaluated.sort((a, b) => {
      if (a.marginalCost !== b.marginalCost) return a.marginalCost - b.marginalCost;
      return a.source < b.source ? -1 : a.source > b.source ? 1 : 0;
    });
    return evaluated;
  }

  function fundNetCash({ portfolio, requiredNetReal, planningState, projectionYear, monthsToClaim, scenario }) {
    let allocation = Object.fromEntries(SOURCES.map((s) => [s, 0.0]));
    let gross = requiredNetReal;
    let incrementalTax = 0.0;
    let ranked = [];
    let converged = false;

    const maxIterations = Math.trunc(optimizerConfig.max_tax_iterations);
    for (let i = 0; i < maxIterations; i++) {
      ranked = rankSources({ portfolio, planningState, monthsToClaim, scenario });
      const [nextAllocation, feasible] = greedyAllocate(gross, ranked);
      if (!feasible) {
        return [allocation, incrementalTax, false];
      }
      incrementalTax = incrementalSaleTaxReal({ planningState, projectionYear, portfolio, allocation: nextAllocation, scenario });
      const nextGross = requiredNetReal + incrementalTax;
      const difference = Math.abs(nextGross - gross);
      allocation = nextAllocation;
      if (difference <= Number(optimizerConfig.tax_convergence_nominal)) {
        gross = nextGross;
        converged = true;
        break;
      }
      gross = 0.5 * gross + 0.5 * nextGross;
    }
    if (!converged) {
      return [allocation, incrementalTax, false];
    }

    const [final, feasible] = greedyAllocate(gross, ranked);
    if (!feasible) {
      return [final, incrementalTax, false];
    }
    incrementalTax = incrementalSaleTaxReal({ planningState, projectionYear, portfolio, allocation: final, scenario });
    for (const source of SOURCES) {
      if (final[source] > 0.0) sellFromAccount(portfolio[source], final[source]);
    }
    return [final, incrementalTax, true];
  }

  function project({ planningState, claimAgeMonths, mortalityProfile, scenario }) {
    const current = planningState.decisionAgeMonths;
    if (claimAgeMonths <= current) {
      return createBridgeProjection({
        terminalAssetsReal: planningState.portfolioReal !== undefined
          ? planningState.portfolioReal
          : planningState.vooReal + planningState.schdReal + planningState.tbillsReal + planningState.rothReal,
        sourceWithdrawalsReal: Object.fromEntries(SOURCES.map((s) => [s, 0.0])),
      });
    }

    const portfolio = portfolioFromState(planningState);
    const noBridge = clonePortfolio(portfolio);
    const withdrawals = Object.fromEntries(SOURCES.map((s) => [s, 0.0]));
    const records = [];
    const validationCodes = [];
    let opportunityCostPv = 0.0;
    let incrementalTaxPv = 0.0;
    let remainingMonths = claimAgeMonths - current;
    let elapsedMonths = 0;

    while (remainingMonths > 0) {
      const months = Math.min(12, remainingMonths);
      const projectionYear = Math.floor(elapsedMonths / 12);
      const claimNowGrossReal = fraMonthlyRealForState(planningState, ssConfig)
        * claimFactorMonths(current, Number(ssConfig.fra_age) * 12)
        * Number(ssConfig.scheduled_benefit_fraction)
        * months;
      const ssIncrementalTaxReal = incrementalSsTaxReal({
        planningState, projectionYear, annualBenefitReal: claimNowGrossReal, scenario,
      });
      const requiredNetReal = Math.max(0.0, claimNowGrossReal - ssIncrementalTaxReal);
      const [allocation, saleTaxReal, feasible] = fundNetCash({
        portfolio, requiredNetReal, planningState, projectionYear, monthsToClaim: remainingMonths, scenario,
      });
      if (!feasible) {
        validationCodes.push('SS_BRIDGE_INFEASIBLE');
        return createBridgeProjection({
          opportunityCostPv: Infinity,
          incrementalTaxPv,
          terminalAssetDifference: Infinity,
          terminalAssetsReal: portfolioTotal(portfolio),
          feasible: false,
          sourceWithdrawalsReal: withdrawals,
          annualRecords: records,
          validationCodes,
        });
      }

      const survival = profilePoint(mortalityProfile, current + elapsedMonths).survival;
      const safeDiscountAtWithdrawal = Math.pow(1.0 + scenario.realSafeReturn, elapsedMonths / 12.0);
      const safeDiscountAtClaim = Math.pow(1.0 + scenario.realSafeReturn, (claimAgeMonths - current) / 12.0);
      let terminalLoss = 0.0;
      for (const [source, amount] of Object.entries(allocation)) {
        withdrawals[source] += amount;
        const sourceRate = sourceReturn(source, scenario);
        terminalLoss += amount * Math.pow(1.0 + sourceRate, remainingMonths / 12.0);
      }
      const principalPv = (survival * requiredNetReal) / safeDiscountAtWithdrawal;
      const lossPv = (survival * terminalLoss) / safeDiscountAtClaim;
      const excessCost = Math.max(0.0, lossPv - principalPv);
      opportunityCostPv += excessCost;
      incrementalTaxPv += (survival * saleTaxReal) / safeDiscountAtWithdrawal;
      records.push({
        projectionYear, months, survival, claimNowGrossReal,
        claimNowIncrementalTaxReal: ssIncrementalTaxReal, requiredNetReal,
        saleIncrementalTaxReal: saleTaxReal, allocationReal: allocation,
        terminalLossReal: terminalLoss, excessOpportunityCostPv: excessCost,
      });

      const fraction = months / 12.0;
      applyScenarioReturn(portfolio, scenario, fraction);
      applyScenarioReturn(noBridge, scenario, fraction);
      elapsedMonths += months;
      remainingMonths -= months;
    }

    const terminalDifference = Math.max(0.0, portfolioTotal(noBridge) - portfolioTotal(portfolio));
    return createBridgeProjection({
      opportunityCostPv,
      incrementalTaxPv,
      terminalAssetDifference: terminalDifference,
      terminalAssetsReal: portfolioTotal(portfolio),
      feasible: validationCodes.length === 0,
      sourceWithdrawalsReal: withdrawals,
      annualRecords: records,
      validationCodes,
    });
  }

  return { project, rankSources };
}

function greedyAllocate(amount, ranked) {
  const allocation = Object.fromEntries(SOURCES.map((s) => [s, 0.0]));
  let remaining = Math.max(0.0, amount);
  for (const item of ranked) {
    const take = Math.min(remaining, item.available);
    allocation[item.source] = take;
    remaining -= take;
    if (remaining <= 1e-7) break;
  }
  return [allocation, remaining <= 1e-7];
}

function portfolioFromState(state) {
  return createPortfolio(
    createAccount('voo', state.vooReal, state.vooBasisReal, true),
    createAccount('schd', state.schdReal, state.schdBasisReal, true),
    createAccount('tbills', state.tbillsReal),
    createAccount('roth', state.rothReal)
  );
}

function applyScenarioReturn(portfolio, scenario, fraction) {
  const equityReturn = Math.pow(1.0 + scenario.realPortfolioReturn, fraction) - 1.0;
  const safeReturn = Math.pow(1.0 + scenario.realSafeReturn, fraction) - 1.0;
  applyReturnToAccount(portfolio.voo, equityReturn);
  applyReturnToAccount(portfolio.schd, equityReturn);
  applyReturnToAccount(portfolio.roth, equityReturn);
  applyReturnToAccount(portfolio.tbills, safeReturn);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createPortfolioBridgeProjector,
    greedyAllocate,
    portfolioFromState,
    applyScenarioReturn,
  };
}
