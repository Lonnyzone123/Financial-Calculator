'use strict';

/*
 * S4 task 6 -- the household cash-flow ledger.
 *
 * HOUSEHOLD_LEDGER.md is the definition, committed before this file existed.
 * This implements it and nothing more: if the two disagree, the document is
 * the authority and this file is the defect. Section numbers below are the
 * document's.
 */

const { loadEngineVariant } = require('./engine-variant.js');

const HOOK = '__S4_HOUSEHOLD_LEDGER__';

/* Section 4: the four values the engine computes but does not put on the row. */
const TAPS = [
  { id: 'row-flows', marker: 'function checkRowInvariants(issues,row,flows){',
    append: 'if(globalThis.' + HOOK + ')globalThis.' + HOOK + '.flows(row,flows);' },
  { id: 'wages', marker: 'wages=salary*selfWorkDuration+spouseSalary*spouseWorkDuration,',
    append: '__s4LedgerWages=(globalThis.' + HOOK + '&&globalThis.' + HOOK + '.wages(wages)),' },
  { id: 'qcd-paid', marker: 'var shortfall=Math.max(0,need+taxNeed),nonPortfolioDraw=0;',
    append: 'if(globalThis.' + HOOK + ')globalThis.' + HOOK + '.qcd(Math.min(qcd,rmdGross));' },
];

const CLASSES = ['CLOSED', 'UNALLOCATED_WAGES', 'UNFUNDED_CONTRIBUTION_OR_DEBT', 'FAIL_CASH_UNUSED', 'FAIL_USE_UNFUNDED'];
const FAILURES = new Set(['FAIL_CASH_UNUSED', 'FAIL_USE_UNFUNDED']);

/* The tapped engine, optionally carrying declared faults (section 10). */
function tappedEngine(faults) {
  return loadEngineVariant(TAPS.concat(faults || []));
}

const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);

/* Sections 5-7, for one row. `obs` is { employer, outsideDeposit, wages, qcd }. */
function ledgerOf(row, obs) {
  const employee = row.contributions - obs.employer;
  const offBudgetDebt = row.debtPaymentsTotal - row.debtPayments;
  const sources = {
    externalIncome: row.income - row.dividends,
    portfolioCashOut: row.withdrawals + row.dividends,
    nonPortfolioProceeds: row.nonPortfolioDraw,
  };
  const uses = {
    fundedSpending: row.spending - row.shortfall,
    taxes: row.taxes,
    householdCashIn: employee + obs.outsideDeposit,
    offBudgetDebt,
    charitableDistributions: obs.qcd,
  };
  const totalSources = sum(sources);
  const totalUses = sum(uses);
  const residual = totalSources - totalUses;
  const scale = Math.max(Math.abs(totalSources), Math.abs(totalUses), Math.abs(row.spending), Math.abs(row.shortfall), Math.abs(row.income), Math.abs(row.withdrawals));
  const tolerance = Math.max(0.01, 1e-9 * scale);
  let cls;
  if (Math.abs(residual) <= tolerance) cls = 'CLOSED';
  else if (residual > 0) cls = obs.wages > 0 && residual <= obs.wages + tolerance ? 'UNALLOCATED_WAGES' : 'FAIL_CASH_UNUSED';
  else cls = -residual <= employee + offBudgetDebt + tolerance ? 'UNFUNDED_CONTRIBUTION_OR_DEBT' : 'FAIL_USE_UNFUNDED';
  /* Section 8: nothing is available to explain a residual on such a row. */
  const strict = !(obs.wages > 0) && !(employee > tolerance) && !(offBudgetDebt > tolerance);
  return { age: row.age, sources, uses, totalSources, totalUses, residual, tolerance, cls, strict };
}

/* Section 9: every path runPlan() would run for simple and historical, and the
   first `pathLimit` of Monte Carlo's per-path generators, mirrored from
   tests/reconciliation-invariant.test.js. */
function pathRunners(plan, pathLimit) {
  const copy = () => JSON.parse(JSON.stringify(plan));
  if (plan.assumptions.method !== 'monteCarlo') {
    return [(eng, issues) => eng.simulatePlan(copy(), eng.rng(plan.assumptions.seed), 0, null, issues)];
  }
  let base = Number(plan.assumptions.seed);
  if (!Number.isFinite(base)) base = 0;
  return Array.from({ length: Math.min(plan.assumptions.runs, pathLimit) }, (_, i) =>
    (eng, issues) => eng.simulatePlan(copy(), eng.rng(eng.monteCarloPathSeed(base, i, 0)), 0, eng.rng(eng.monteCarloPathSeed(base, i, 1)), issues));   // S5AA R43 (SA42F-31): runPlan()'s seeds
}

/*
 * Sweep one plan through a tapped engine.
 *   options.pathLimit  Monte Carlo sample size (default 50)
 *   options.reference  the real engine: every path is also run there and the
 *                      rows must be identical, or `notNeutral` counts it
 */
function sweepPlan(engine, plan, options) {
  const opts = options || {};
  const out = { paths: 0, rows: 0, classes: {}, failures: [], l4Mismatches: 0, strictRows: 0, lowResolutionRows: 0, notNeutral: 0 };
  pathRunners(plan, opts.pathLimit || 50).forEach((run, pathIndex) => {
    const obs = { flows: [], wages: [], qcd: [] };
    const issues = [];
    globalThis[HOOK] = {
      flows: (row, f) => obs.flows.push({ age: row.age, employer: f.employer, outsideDeposit: f.outsideDeposit || 0 }),
      wages: (w) => obs.wages.push(w),
      qcd: (q) => obs.qcd.push(q),
    };
    let result;
    try {
      result = run(engine, issues);
    } finally {
      globalThis[HOOK] = null;
    }
    if (opts.reference && JSON.stringify(run(opts.reference, []).rows) !== JSON.stringify(result.rows)) out.notNeutral++;
    const rows = result.rows.slice(1);
    [['flows', obs.flows], ['wages', obs.wages], ['qcd', obs.qcd]].forEach(([id, list]) => {
      if (list.length !== rows.length) throw new Error('household ledger: the ' + id + ' tap observed ' + list.length + ' values for ' + rows.length + ' rows');
    });
    out.paths++;
    out.l4Mismatches += issues.filter((x) => x.code === 'RECONCILIATION_MISMATCH').length;
    rows.forEach((row, k) => {
      const f = obs.flows[k];
      if (f.age !== row.age) throw new Error('household ledger: flows observed at age ' + f.age + ' paired with the row at age ' + row.age);
      const entry = ledgerOf(row, { employer: f.employer, outsideDeposit: f.outsideDeposit, wages: obs.wages[k], qcd: obs.qcd[k] });
      out.rows++;
      out.classes[entry.cls] = (out.classes[entry.cls] || 0) + 1;
      if (entry.strict) out.strictRows++;
      if (entry.tolerance > 1) out.lowResolutionRows++;
      if (FAILURES.has(entry.cls) && out.failures.length < 5) out.failures.push(Object.assign({ path: pathIndex }, entry));
    });
  });
  return out;
}

/* Sum a list of sweeps. */
function combine(sweeps) {
  const out = { paths: 0, rows: 0, classes: {}, failures: [], l4Mismatches: 0, strictRows: 0, lowResolutionRows: 0, notNeutral: 0 };
  sweeps.forEach((s) => {
    ['paths', 'rows', 'l4Mismatches', 'strictRows', 'lowResolutionRows', 'notNeutral'].forEach((k) => { out[k] += s[k]; });
    Object.entries(s.classes).forEach(([k, v]) => { out.classes[k] = (out.classes[k] || 0) + v; });
    out.failures.push(...s.failures);
  });
  return out;
}

const failureCount = (s) => (s.classes.FAIL_CASH_UNUSED || 0) + (s.classes.FAIL_USE_UNFUNDED || 0);

module.exports = { HOOK, TAPS, CLASSES, FAILURES, tappedEngine, ledgerOf, pathRunners, sweepPlan, combine, failureCount };
