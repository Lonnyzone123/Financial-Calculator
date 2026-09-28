'use strict';
/*
 * Ported from the Financial Projection V2.1.2 (M5 PASS) Python engine's
 * retirement_model_v2/lifetime_tax_optimizer.py. Faithful line-by-line
 * translation, verified against Python-generated fixtures in
 * fixtures/lifetime-tax-optimizer.fixtures.json (see
 * tests/ported/lifetime-tax-optimizer.test.js).
 *
 * This optimizer chooses a withdrawal mix across four fixed sources
 * (tbills, voo, roth, schd) via a coarse-then-refined grid search over
 * withdrawal-mix weights, iterating each candidate to a tax-gross-up
 * fixed point. It has no randomness anywhere.
 *
 * NOTE ON SCOPE: this ports the Python engine's own 4-source asset model
 * (tbills/voo/roth/schd) as-is -- it does not yet map onto the calculator's
 * arbitrary N-account model (taxable/preTax/roth/hsa, unlimited accounts
 * per class). That mapping is Phase 9 (wiring) work, not this port's job;
 * porting first against the engine's own fixtures, then adapting the
 * interface, keeps each step independently verifiable.
 *
 * Depends on ./tax-engine.js for the TaxCalculator shape (calculate(income,
 * inflationFactor) -> { total, ... }).
 *
 * Uses preciseSum (see precise-math.js) everywhere the Python source calls
 * sum() -- discovered during a Phase 8 audit pass that Python's sum() uses
 * compensated (Neumaier) summation, which is NOT the same as naive
 * sequential addition, and the difference is large enough to flip a
 * boundary comparison even with as few as 4 terms. Every sum() call site
 * in lifetime_tax_optimizer.py (_score, _realized_gain, _allocate's
 * minimum_total/maximum_total/denominator, _local_simplex_grid's `last`)
 * is routed through preciseSum below.
 */

const { preciseSum } = require('./precise-math');

const SOURCES = ['tbills', 'voo', 'roth', 'schd'];

function account(name, value, basis, taxable) {
  return { name, value, basis: basis === undefined ? 0 : basis, taxable: !!taxable };
}

function cloneAccount(acct) {
  return account(acct.name, acct.value, acct.basis, acct.taxable);
}

function clonePortfolio(portfolio) {
  const out = {};
  for (const source of SOURCES) out[source] = cloneAccount(portfolio[source]);
  return out;
}

/** Mutates `acct` in place, returns { account, proceeds, basisRecovered, realizedGain }. */
function sellFromAccount(acct, requested) {
  const proceeds = Math.min(Math.max(0, requested), Math.max(0, acct.value));
  const basisFraction = acct.value > 0 ? acct.basis / acct.value : 0;
  const basisRecovered = proceeds * basisFraction;
  const realizedGain = acct.taxable ? proceeds - basisRecovered : 0;
  acct.value -= proceeds;
  acct.basis = Math.max(0, acct.basis - basisRecovered);
  return { account: acct.name, proceeds, basisRecovered, realizedGain };
}

function withdrawalBoundsFromPortfolio(portfolio) {
  const maximum = {};
  for (const source of SOURCES) maximum[source] = portfolio[source].value;
  return { minimum: {}, maximum };
}

function isFiniteNum(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

function boundsLimits(bounds, source, available) {
  const low = Number((bounds.minimum || {})[source] || 0);
  const maxCap = (bounds.maximum || {})[source];
  const requestedHigh = maxCap === undefined ? available : Number(maxCap);
  if (!isFiniteNum(low) || low < 0 || !isFiniteNum(requestedHigh) || requestedHigh < 0 || !isFiniteNum(available) || available < 0) {
    throw new Error(`Withdrawal limits and available ${source} must be finite and nonnegative`);
  }
  const high = Math.min(available, requestedHigh);
  if (low > high) {
    throw new Error(`Withdrawal minimum exceeds maximum or capacity for ${source}`);
  }
  return [low, high];
}

/** First-occurrence-wins minimum, matching Python's min(iterable, key=...) tie-breaking. */
function minBy(items, keyFn) {
  let best = items[0];
  let bestKey = keyFn(best);
  for (let i = 1; i < items.length; i++) {
    const key = keyFn(items[i]);
    if (key < bestKey) {
      best = items[i];
      bestKey = key;
    }
  }
  return best;
}

function realizedGain(portfolio, allocations) {
  const clone = clonePortfolio(portfolio);
  const gains = [];
  for (const source of SOURCES) {
    const amount = allocations[source];
    if (amount > 0) gains.push(sellFromAccount(clone[source], amount).realizedGain);
  }
  return preciseSum(gains);
}

function allocate(amount, weights, portfolio, bounds) {
  if (!isFiniteNum(amount) || Object.values(weights).some((w) => !isFiniteNum(w) || w < 0)) {
    throw new Error('Allocation request and weights must be finite with nonnegative weights');
  }
  amount = Math.max(0, amount);
  const allocations = {};
  for (const s of SOURCES) allocations[s] = 0;
  const limits = {};
  for (const s of SOURCES) limits[s] = boundsLimits(bounds, s, portfolio[s].value);

  const minimumTotal = preciseSum(SOURCES.map((s) => limits[s][0]));
  const maximumTotal = preciseSum(SOURCES.map((s) => limits[s][1]));
  if (amount + 1e-7 < minimumTotal) return [allocations, false];
  const fullyFundable = amount <= maximumTotal + 1e-7;
  amount = Math.min(amount, maximumTotal);
  for (const s of SOURCES) allocations[s] = limits[s][0];
  let remaining = amount - minimumTotal;

  let available = new Set(SOURCES.filter((s) => limits[s][1] > allocations[s] + 1e-9));

  for (let pass = 0; pass < SOURCES.length + 2; pass++) {
    if (remaining <= 1e-7) return [allocations, fullyFundable];
    // Iterate in canonical SOURCES order (not Set insertion order) -- the
    // Python source iterates an unordered set here, but each source's
    // addition this pass only depends on the shared `share`/`remaining`
    // snapshot, not on other sources processed earlier in the same pass,
    // so the result is order-independent and matching SOURCES order is
    // just for readability/determinism, not required for correctness.
    const weighted = SOURCES.filter((s) => available.has(s) && (weights[s] || 0) > 0);
    const eligible = weighted.length > 0 ? weighted : SOURCES.filter((s) => available.has(s));
    if (eligible.length === 0) return [allocations, false];
    const denominator = preciseSum(eligible.map((s) => weights[s] || 0));
    const equal = denominator <= 0;
    let consumed = 0;
    for (const source of eligible) {
      const share = equal ? 1 / eligible.length : (weights[source] || 0) / denominator;
      const capacity = limits[source][1] - allocations[source];
      const addition = Math.min(capacity, remaining * share);
      allocations[source] += addition;
      consumed += addition;
      if (capacity - addition <= 1e-7) available.delete(source);
    }
    remaining -= consumed;
    if (consumed <= 1e-9) break;
  }
  return [allocations, fullyFundable && remaining <= 1e-7];
}

function* simplexGrid(active, step) {
  const units = Math.round(1.0 / step);
  if (active.length === 0) {
    yield {};
    return;
  }
  function* recurse(index, remaining, values) {
    if (index === active.length - 1) {
      const final = values.concat([remaining]);
      const obj = {};
      active.forEach((source, i) => {
        obj[source] = final[i] / units;
      });
      yield obj;
      return;
    }
    for (let unit = 0; unit <= remaining; unit++) {
      yield* recurse(index + 1, remaining - unit, values.concat([unit]));
    }
  }
  yield* recurse(0, units, []);
}

function* cartesianProduct(arrays) {
  function* helper(index) {
    if (index === arrays.length) {
      yield [];
      return;
    }
    for (const value of arrays[index]) {
      for (const rest of helper(index + 1)) yield [value, ...rest];
    }
  }
  yield* helper(0);
}

function* localSimplexGrid(active, center, step, window, limit) {
  if (active.length === 1) {
    yield { [active[0]]: 1.0 };
    return;
  }
  const candidateArrays = [];
  for (const source of active.slice(0, -1)) {
    const c = center[source] || 0;
    const low = Math.max(0, c - window);
    const high = Math.min(1, c + window);
    const start = Math.round(low / step);
    const stop = Math.round(high / step);
    const values = [];
    for (let unit = start; unit <= stop; unit++) values.push(unit * step);
    candidateArrays.push(values);
  }
  let emitted = 0;
  const seen = new Set();
  const lastSource = active[active.length - 1];
  for (const values of cartesianProduct(candidateArrays)) {
    const sumValues = preciseSum(values);
    const last = 1.0 - sumValues;
    if (last < -1e-9 || last > 1.0 + 1e-9) continue;
    if (Math.abs(last - (center[lastSource] || 0)) > window + 1e-9) continue;
    const vector = values.concat([Math.max(0, last)]).map((v) => Number(v.toFixed(10)));
    const key = vector.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const obj = {};
    active.forEach((source, i) => {
      obj[source] = vector[i];
    });
    yield obj;
    emitted += 1;
    if (emitted >= limit) break;
  }
}

function score(allocations, tax, state, config) {
  const remainingYears = Math.max(1, Math.trunc(config.planning_horizon_years));
  const sourceReturns = config.source_expected_real_returns;
  const terminalDrag = config.terminal_tax_drag;
  let lostTerminal = 0;
  for (const source of SOURCES) {
    const amount = allocations[source];
    const growth = Math.pow(1.0 + Number(sourceReturns[source]), remainingYears);
    const gain = Math.max(0, growth - 1.0);
    const afterTaxGrowth = 1.0 + gain * (1.0 - Number(terminalDrag[source]));
    lostTerminal += amount * afterTaxGrowth;
  }

  const rothShadow = allocations.roth * Number(config.roth_shadow_cost);
  const schdPenalty = allocations.schd * Number(config.schd_principal_penalty);
  let sequenceEquity = 0;
  if (state.retirementYear <= 12 && state.equityDrawdown > 0) {
    sequenceEquity = (allocations.voo + allocations.schd) * state.equityDrawdown * Number(config.sequence_penalty_multiplier);
  }

  const components = {
    current_tax: tax * Number(config.tax_weight),
    lost_terminal_value: lostTerminal * Number(config.terminal_value_weight),
    roth_shadow: rothShadow,
    schd_principal_penalty: schdPenalty,
    sequence_equity_penalty: sequenceEquity,
  };
  const objective = preciseSum(Object.values(components));
  return [objective, components];
}

function createLifetimeTaxOptimizer(taxCalculator, config) {
  function evaluate(portfolio, baseIncome, preTaxCashShortfall, state, bounds, weights) {
    const toleranceNominal = Number(config.tax_convergence_nominal);
    const toleranceRelative = Number(config.tax_convergence_relative);
    const maxIterations = Math.trunc(config.max_tax_iterations);
    if (maxIterations < 1) {
      throw new Error('Tax gross-up requires at least one iteration');
    }
    const baseTax = taxCalculator.calculate(baseIncome, state.inflationFactor).total;
    let gross = Math.max(0, preTaxCashShortfall + baseTax);
    let feasible = true;
    const reasons = [];
    let allocations = {};
    for (const s of SOURCES) allocations[s] = 0;
    let gain = 0;
    let tax = baseTax;
    let iteration = 0;
    let converged = false;

    for (iteration = 1; iteration <= maxIterations; iteration++) {
      [allocations, feasible] = allocate(gross, weights, portfolio, bounds);
      if (!feasible) {
        gain = realizedGain(portfolio, allocations);
        const income = Object.assign({}, baseIncome, { longTermGains: baseIncome.longTermGains + gain });
        tax = taxCalculator.calculate(income, state.inflationFactor).total;
        reasons.push('available sources cannot fund gross cash requirement');
        converged = true;
        break;
      }
      gain = realizedGain(portfolio, allocations);
      const income = Object.assign({}, baseIncome, { longTermGains: baseIncome.longTermGains + gain });
      tax = taxCalculator.calculate(income, state.inflationFactor).total;
      const nextGross = Math.max(0, preTaxCashShortfall + tax);
      const difference = Math.abs(nextGross - gross);
      const relative = difference / Math.max(1, Math.abs(nextGross));
      if (difference <= toleranceNominal || relative <= toleranceRelative) {
        gross = nextGross;
        [allocations, feasible] = allocate(gross, weights, portfolio, bounds);
        gain = feasible ? realizedGain(portfolio, allocations) : gain;
        converged = true;
        break;
      }
      gross = 0.5 * gross + 0.5 * nextGross;
    }
    if (!converged) {
      iteration = maxIterations;
      reasons.push('tax gross-up did not converge');
    }

    // The final reallocation changes realized gains. Recalculate its tax,
    // then check the actual plan, not the previous fixed-point iterate.
    gain = realizedGain(portfolio, allocations);
    tax = taxCalculator.calculate(
      Object.assign({}, baseIncome, { longTermGains: baseIncome.longTermGains + gain }),
      state.inflationFactor
    ).total;
    const finalNeed = Math.max(0, preTaxCashShortfall + tax);
    const residual = Math.abs(finalNeed - preciseSum(SOURCES.map((s) => allocations[s])));
    const allowedError = Math.max(toleranceNominal, toleranceRelative * Math.max(1, finalNeed));
    if (feasible && (residual > allowedError || reasons.includes('tax gross-up did not converge'))) {
      feasible = false;
      if (!reasons.includes('tax gross-up did not converge')) {
        reasons.push('tax gross-up did not converge');
      }
    }

    let objective;
    let components;
    if (feasible) {
      [objective, components] = score(allocations, tax, state, config);
    } else {
      objective = Infinity;
      components = { infeasible: 1.0 };
    }

    const plan = {
      requiredCash: Math.max(0, preTaxCashShortfall),
      fromTbills: allocations.tbills,
      fromVoo: allocations.voo,
      fromRoth: allocations.roth,
      fromSchd: allocations.schd,
      tax,
      realizedGain: gain,
      iterations: iteration,
      objective,
      feasible,
      reasons,
      scoreComponents: components,
    };
    return { weights: Object.assign({}, weights), plan };
  }

  function optimize({ portfolio, baseIncome, preTaxCashShortfall, state, bounds }) {
    bounds = bounds || withdrawalBoundsFromPortfolio(portfolio);
    if (!isFiniteNum(preTaxCashShortfall)) {
      throw new Error('Cash shortfall must be finite');
    }
    const boundSourceNames = new Set([...Object.keys(bounds.minimum || {}), ...Object.keys(bounds.maximum || {})]);
    if ([...boundSourceNames].some((name) => !SOURCES.includes(name))) {
      throw new Error('Unknown withdrawal-bound source');
    }
    for (const name of SOURCES) boundsLimits(bounds, name, portfolio[name].value);
    const candidateSources = config.candidate_sources || SOURCES;
    const active = candidateSources.filter((name) => boundsLimits(bounds, name, portfolio[name].value)[1] > 0);
    if (active.length === 0) {
      return evaluate(portfolio, baseIncome, preTaxCashShortfall, state, bounds, {}).plan;
    }

    const coarseStep = Number(config.coarse_mix_step);
    const fineStep = Number(config.fine_mix_step);
    const coarseWeights = Array.from(simplexGrid(active, coarseStep));
    const coarse = coarseWeights.map((weights) => evaluate(portfolio, baseIncome, preTaxCashShortfall, state, bounds, weights));
    const bestCoarse = minBy(coarse, (item) => item.plan.objective);

    const window = Math.max(coarseStep, fineStep);
    const limit = config.max_refinement_candidates === undefined ? 1500 : Math.trunc(config.max_refinement_candidates);
    const refinement = Array.from(localSimplexGrid(active, bestCoarse.weights, fineStep, window, limit));
    const fine = refinement.map((weights) => evaluate(portfolio, baseIncome, preTaxCashShortfall, state, bounds, weights));

    const candidates = coarse.concat(fine);
    const best = minBy(candidates, (item) => item.plan.objective);
    return best.plan;
  }

  return { optimize, evaluate };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SOURCES,
    account,
    cloneAccount,
    clonePortfolio,
    sellFromAccount,
    withdrawalBoundsFromPortfolio,
    boundsLimits,
    createLifetimeTaxOptimizer,
  };
}
