'use strict';
/*
 * S3 task 7 (F3) -- pay the mortgage down, or invest the money?
 *
 * A STANDALONE ANALYSIS MODULE, NOT AN ENGINE CHANGE. It runs the existing
 * engine twice per comparison and diffs, the same additive shape
 * src/debt-refinance.js, src/debt-arm.js and src/debt-recast.js established.
 * Nothing here modifies simulatePlan(), so this module sits outside S3 task
 * 5's bit-identity claim entirely.
 *
 * D5 -- A MATRIX OF PRESETS, NOT A SINGLE COMPARISON. There is no single right
 * framing of this question, because different households are optimising for
 * different things. A preset is a METHOD x OBJECTIVE pair: five ways to deploy
 * the money, four things you might be trying to maximise or minimise. The
 * module reports the objective's value for each method and says which method
 * wins UNDER THAT OBJECTIVE -- it does not collapse the matrix into one
 * answer, because the whole finding is that different objectives pick
 * different winners on the same inputs.
 *
 * WHY THE INVEST METHODS TARGET A TAXABLE ACCOUNT. Deliberate: contribution
 * limits on workplace and IRA accounts would cap the invested amount at a
 * level that has nothing to do with the mortgage question, so a comparison
 * routed through them would silently be measuring the limit instead of the
 * trade. If a scenario has NO taxable account the invest methods REFUSE, with
 * a stated reason. They do not fall back to another tax class -- that would
 * change what the comparison means without saying so -- and they do not
 * synthesize an account.
 *
 * WHERE totalInterestPaid COMES FROM, AND WHY NOT FROM THE ENGINE. The engine
 * does not expose per-debt interest: projectDebts() returns only
 * {retirementPayments, totalPayments}, and a row carries debtPayments and
 * debtBalance summed across EVERY debt. Deriving mortgage interest from those
 * would be wrong in any plan with a second debt. So this objective is measured
 * from the mortgage's own amortization schedule, via the same
 * src/debt-amortization.js that projectDebts() itself uses -- exact, isolated
 * to the mortgage, and truncated to the horizon. Stated here rather than left
 * to be discovered.
 *
 * BUILD ORDER -- WHY EVERY ENGINE REFERENCE IS DEFERRED. build.js emits
 * `var __debtModules=__debtModulesFactory();` which EXECUTES IMMEDIATELY, at
 * the debt-modules position, and tests/build-debt-bundling.test.js asserts
 * debt comes BEFORE engine in the output. Function declarations hoist
 * script-wide, so `runPlan` resolves from inside the factory -- but `var`
 * INITIALIZERS do not, so ENGINE_VERSION, HIST_RETURNS, RULES and the rest are
 * still `undefined` while the factory body runs. A module that touched the
 * engine from its BODY would therefore find the function and fail on the data.
 *
 * Every engine and sibling-module reference in this file is therefore resolved
 * INSIDE an exported function, at call time, long after the whole script has
 * evaluated -- and the engine specifically is INJECTED rather than required at
 * all (see resolveRunPlan below for why). Together those are what make a plain
 * DEBT_MODULES entry correct here rather than a marker of this module's own
 * emitted after the engine.
 *
 * The test asserts the property directly: the emitted factory must evaluate
 * with NO engine in scope whatsoever. That is the thing that would break, and
 * it is checkable, so it is checked rather than reasoned about.
 */

/** Five ways to deploy the same dollar. */
const METHODS = [
  'extraPrincipalMonthly',
  'lumpSumPrincipal',
  'lumpSumRecast',
  'investMonthly',
  'investLumpSum',
];

/** Four things a household might actually be trying to do. */
const OBJECTIVES = [
  'endingNetWorth',
  'totalInterestPaid',
  'planSuccessRate',
  'accessibleLiquidityAtAge',
];

/** Which direction is better. Without this a "winner" is meaningless for
 *  totalInterestPaid, where less is more. */
const OBJECTIVE_DIRECTION = {
  endingNetWorth: 'higher',
  totalInterestPaid: 'lower',
  planSuccessRate: 'higher',
  accessibleLiquidityAtAge: 'higher',
};

/** The comparison window, in years. EXPLICIT, never an implicit end-of-plan:
 *  a 30-year mortgage compared over a 10-year horizon is a different question
 *  from the same mortgage over its full term, and the answer flips. */
const DEFAULT_HORIZON_YEARS = 30;

/** Monthly contributions are stated per month; the engine's account.contribution
 *  is an ANNUAL figure (accountPlannedContribution multiplies nothing by
 *  frequency -- frequency only drives changeTiming). */
const MONTHS_PER_YEAR = 12;

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
}

function nonNegative(v) {
  return Math.max(0, num(v, 0));
}

function clonePlan(plan) {
  return JSON.parse(JSON.stringify(plan));
}

/* ---------------------------------------------------------------------------
 * Deferred resolution -- see BUILD ORDER in the header.
 * ------------------------------------------------------------------------ */

/*
 * THE ENGINE IS INJECTED, NOT REQUIRED, and that is a deliberate choice worth
 * explaining because the obvious alternative looks fine and is not.
 *
 * build.js's rewriteSiblingRequires() rewrites a relative require of a debt
 * sibling to that sibling's namespace variable, and FAILS LOUDLY on any
 * require it does not recognise -- "an unrecognised sibling module is a
 * bundling gap". engine.js is not a debt module, so requiring it from this
 * file breaks the build. Spelling the path so the regex misses it would be
 * dodging a guard that exists for exactly this reason, and the guard is right:
 * a module that consumes the engine is not a debt module.
 *
 * (That rewriter matches raw source TEXT, comments included -- writing the
 * example require literally in this comment broke the build once while
 * documenting why it would. Recorded as SPRINT_QUESTIONS.md Q34.)
 *
 * The alternative build.js offers is a marker of this module's own, emitted
 * after the engine -- which needs a marker comment in src/app-shell.html, and
 * S3 ground rule 9 plus safety property 10(d) hold that file byte-identical
 * for the whole sprint.
 *
 * So the dependency is passed in. In Node, callers hand over `options.runPlan`.
 * In the built app it resolves from script scope, where runPlan is a hoisted
 * function declaration. Explicit at every call site, no build.js change, and
 * no engine reference in this module's body.
 */
function resolveRunPlan(options) {
  const injected = options && options.runPlan;
  if (typeof injected === 'function') return injected;
  /* eslint-disable no-undef */
  if (typeof runPlan === 'function') return runPlan;
  /* eslint-enable no-undef */
  throw new Error(
    'mortgage-vs-investing: runPlan is not reachable. In Node, pass options.runPlan; ' +
    'in the built app it resolves from script scope.');
}

/* These two ARE debt-module siblings, so the require survives the bundle:
   build.js rewrites each to its namespace variable. Kept inside a function so
   the reference is evaluated at call time, after the factory has finished
   assigning every namespace -- this module is emitted last, and reading
   DebtRecast from a module BODY would read it before it exists. */
function resolveAmortization() {
  return require('./debt-amortization.js');
}

function resolveRecast() {
  return require('./debt-recast.js');
}

/* ---------------------------------------------------------------------------
 * Locating the things a method acts on
 * ------------------------------------------------------------------------ */

/** The mortgage this analysis is about: the first debt of type "mortgage". */
function findMortgage(plan) {
  return ((plan.advanced && plan.advanced.debts) || [])
    .filter((d) => d.type === 'mortgage')[0] || null;
}

/** The highest-priority TAXABLE account. Lower `priority` sorts first, which
 *  is the engine's own convention (orderedAccountsInClass). */
function findTaxableAccount(plan) {
  return (plan.accounts || [])
    .filter((a) => a.taxClass === 'taxable' && !a.cashHolding)
    .slice()
    .sort((a, b) => num(a.priority, 0) - num(b.priority, 0))[0] || null;
}

const NOT_APPLICABLE = (reason) => ({ applicable: false, reason });

/* ---------------------------------------------------------------------------
 * The five methods
 * ------------------------------------------------------------------------ */

/**
 * Applies one method to a copy of the plan.
 *
 * Returns { applicable, reason?, plan, changedPaths } -- `changedPaths` names
 * exactly what moved, so a caller can assert the two compared runs differ in
 * the intended inputs and nothing else.
 */
function applyMethod(plan, method, amount) {
  if (METHODS.indexOf(method) < 0) {
    throw new Error('mortgage-vs-investing: unknown method ' + JSON.stringify(method));
  }
  const value = nonNegative(amount);
  const next = clonePlan(plan);

  if (method === 'investMonthly' || method === 'investLumpSum') {
    const account = findTaxableAccount(next);
    if (!account) {
      return NOT_APPLICABLE(
        'no taxable account: the invest methods deliberately target the highest-priority taxable ' +
        'account so contribution limits cannot confound the comparison. Falling back to another ' +
        'tax class would change what the comparison means, and synthesizing an account would ' +
        'invent a holding the household does not have.');
    }
    const index = next.accounts.indexOf(account);
    if (value === 0) return { applicable: true, plan: next, changedPaths: [] };
    if (method === 'investMonthly') {
      /* account.contribution is annual -- see MONTHS_PER_YEAR. */
      account.contribution = num(account.contribution, 0) + value * MONTHS_PER_YEAR;
      return { applicable: true, plan: next, changedPaths: ['accounts[' + index + '].contribution'] };
    }
    account.balance = num(account.balance, 0) + value;
    return { applicable: true, plan: next, changedPaths: ['accounts[' + index + '].balance'] };
  }

  const mortgage = findMortgage(next);
  if (!mortgage) {
    return NOT_APPLICABLE('no mortgage in this scenario, so there is nothing to pay down');
  }
  const index = next.advanced.debts.indexOf(mortgage);
  const at = (field) => 'advanced.debts[' + index + '].' + field;

  /* A ZERO AMOUNT IS AN EXACT NO-OP, and lumpSumRecast is the reason this
     guard is here rather than left implicit. The other four methods add zero
     to something and are naturally inert; a recast is not. Without this,
     recasting zero dollars still overwrote paymentMonthly with the freshly
     amortized figure -- so a household that had entered a payment differing
     from the schedule (because they pay extra, or the loan was recast before)
     would see their plan change from an action that did nothing. Found by
     criterion 5, which is exactly what it is for. */
  if (value === 0) return { applicable: true, plan: next, changedPaths: [] };

  if (method === 'extraPrincipalMonthly') {
    mortgage.extraPrincipalMonthly = num(mortgage.extraPrincipalMonthly, 0) + value;
    return { applicable: true, plan: next, changedPaths: [at('extraPrincipalMonthly')] };
  }

  if (method === 'lumpSumPrincipal') {
    mortgage.balance = Math.max(0, num(mortgage.balance, 0) - value);
    return { applicable: true, plan: next, changedPaths: [at('balance')] };
  }

  /* lumpSumRecast: reduce the balance, then RECAST -- the payment falls and
     the clock is unchanged. The new payment comes from
     src/debt-recast.js's recastAnalysis(), which is that module's only export;
     reimplementing recast arithmetic here would be a second definition of it
     and is exactly the mistake this project keeps recording. */
  const { recastAnalysis } = resolveRecast();
  const analysis = recastAnalysis({
    balance: num(mortgage.balance, 0),
    annualRatePct: num(mortgage.rate, 0),
    remainingTermMonths: Math.round(num(mortgage.remainingTermYears, 0) * MONTHS_PER_YEAR),
    extraMonthlyPrincipal: num(mortgage.extraPrincipalMonthly, 0),
  }, value);
  mortgage.balance = analysis.newBalance;
  mortgage.paymentMonthly = analysis.recast.monthlyPayment;
  return {
    applicable: true,
    plan: next,
    changedPaths: [at('balance'), at('paymentMonthly')],
    recastAnalysis: analysis,
  };
}

/* ---------------------------------------------------------------------------
 * The four objectives
 * ------------------------------------------------------------------------ */

/** The last row inside the horizon, or the last row there is. */
function rowAtHorizon(rows, horizonYears) {
  if (!rows || !rows.length) return null;
  const index = Math.min(rows.length - 1, Math.max(0, Math.floor(horizonYears)));
  return rows[index];
}

/** Mortgage interest over the horizon, from the mortgage's own schedule. */
function mortgageInterestOverHorizon(plan, horizonYears) {
  const mortgage = findMortgage(plan);
  if (!mortgage) return null;
  const { amortizationSchedule } = resolveAmortization();
  const run = amortizationSchedule(
    num(mortgage.balance, 0),
    num(mortgage.rate, 0),
    Math.round(num(mortgage.remainingTermYears, 0) * MONTHS_PER_YEAR),
    num(mortgage.extraPrincipalMonthly, 0));
  const months = Math.max(0, Math.floor(horizonYears * MONTHS_PER_YEAR));
  return run.schedule.slice(0, months).reduce((total, m) => total + m.interestPaid, 0);
}

/**
 * Measures one objective against an engine result.
 *
 * `plan` is the MODIFIED plan (methods can change the mortgage, which
 * totalInterestPaid reads); `result` is what runPlan returned for it.
 */
function measure(plan, result, objective, options) {
  const opt = options || {};
  const horizonYears = num(opt.horizonYears, DEFAULT_HORIZON_YEARS);

  if (OBJECTIVES.indexOf(objective) < 0) {
    throw new Error('mortgage-vs-investing: unknown objective ' + JSON.stringify(objective));
  }

  if (objective === 'planSuccessRate') {
    /* monteCarlo ONLY, and refused explicitly elsewhere. Comparing two
       deterministic paths and calling the result a "success rate" reports a
       probability that was never computed. */
    if (plan.assumptions.method !== 'monteCarlo') {
      return NOT_APPLICABLE(
        'planSuccessRate requires assumptions.method === "monteCarlo"; this scenario is "' +
        plan.assumptions.method + '". A deterministic run has one path, so its "success rate" is ' +
        'either 0 or 100 and comparing two of them misrepresents the result as a probability.');
    }
    return { applicable: true, value: num(result.successRate, 0) };
  }

  if (objective === 'totalInterestPaid') {
    const interest = mortgageInterestOverHorizon(plan, horizonYears);
    if (interest === null) {
      return NOT_APPLICABLE('no mortgage in this scenario, so there is no mortgage interest to total');
    }
    return { applicable: true, value: interest };
  }

  const rows = result.rows || [];
  if (!rows.length) return NOT_APPLICABLE('the engine returned no rows for this scenario');

  if (objective === 'endingNetWorth') {
    const row = rowAtHorizon(rows, horizonYears);
    return { applicable: true, value: num(row.networth, 0), rowAge: row.age };
  }

  /* accessibleLiquidityAtAge. "Accessible" is the TAXABLE balance and nothing
     else -- the only class with no age restriction of any kind. Roth is
     deliberately excluded: its earnings carry their own age and seasoning
     rules, so counting the whole roth balance as accessible would overstate
     liquidity by an amount that varies per household. A stated, conservative
     choice rather than a derived one. */
  const atAge = num(opt.atAge, NaN);
  if (!Number.isFinite(atAge)) {
    return NOT_APPLICABLE('accessibleLiquidityAtAge requires an explicit `atAge` option');
  }
  const row = rows.filter((r) => num(r.age, 0) >= atAge)[0];
  if (!row) {
    return NOT_APPLICABLE('the projection does not reach age ' + atAge +
      ' (it ends at ' + rows[rows.length - 1].age + ')');
  }
  return { applicable: true, value: num(row.taxable, 0), rowAge: row.age };
}

/* ---------------------------------------------------------------------------
 * Presets, evaluation and comparison
 * ------------------------------------------------------------------------ */

/** Every method x objective pair. */
function presets() {
  const out = [];
  METHODS.forEach((method) => {
    OBJECTIVES.forEach((objective) => out.push({ method, objective }));
  });
  return out;
}

/** Runs one preset: apply the method, run the engine, measure the objective. */
function evaluatePreset(plan, preset, options) {
  const applied = applyMethod(plan, preset.method, (options || {}).amount);
  if (!applied.applicable) {
    return {
      method: preset.method, objective: preset.objective,
      applicable: false, reason: applied.reason,
      direction: OBJECTIVE_DIRECTION[preset.objective],
    };
  }
  const result = resolveRunPlan(options)(clonePlan(applied.plan));
  const measured = measure(applied.plan, result, preset.objective, options);
  return Object.assign({
    method: preset.method,
    objective: preset.objective,
    direction: OBJECTIVE_DIRECTION[preset.objective],
    changedPaths: applied.changedPaths,
  }, measured);
}

/**
 * Compares two methods under ONE objective.
 *
 * Both sides are the same function on the same plan, differing only in which
 * method was applied -- so a difference cannot come from anything else.
 */
function compareMethods(plan, methodA, methodB, objective, options) {
  const a = evaluatePreset(plan, { method: methodA, objective }, options);
  const b = evaluatePreset(plan, { method: methodB, objective }, options);
  const direction = OBJECTIVE_DIRECTION[objective];

  if (!a.applicable || !b.applicable) {
    return {
      objective, direction, a, b,
      applicable: false,
      reason: (!a.applicable ? methodA + ': ' + a.reason : methodB + ': ' + b.reason),
      winner: null, delta: null,
    };
  }
  const better = direction === 'higher'
    ? (a.value > b.value ? methodA : (b.value > a.value ? methodB : null))
    : (a.value < b.value ? methodA : (b.value < a.value ? methodB : null));
  return {
    objective, direction, a, b, applicable: true,
    winner: better,
    tied: better === null,
    delta: a.value - b.value,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    METHODS,
    OBJECTIVES,
    OBJECTIVE_DIRECTION,
    DEFAULT_HORIZON_YEARS,
    presets,
    applyMethod,
    measure,
    evaluatePreset,
    compareMethods,
    findMortgage,
    findTaxableAccount,
    mortgageInterestOverHorizon,
  };
}
