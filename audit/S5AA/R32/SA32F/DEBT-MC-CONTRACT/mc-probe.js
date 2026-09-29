'use strict';
// DMC Monte Carlo probes. Run: node mc-probe.js
const h = require('../harness.js');
const E = h.engine;
const out = [];
function onePot(years, method, extra) {
  const p = h.plan({ years, retireAge: 60 + years, balance: 0, amount: 0 });
  p.advanced.transferOn = false;
  p.accounts = [h.account('brk', 'taxable', 1000000)];
  Object.assign(p.assumptions, { method, returnRate: 10, volatility: 18.5, fee: 0, inflation: 0, runs: 4000, seed: 1 }, extra || {});
  p.advanced.assetsOn = false;
  return p;
}
function run(p) {
  const v = h.validateScenario(structuredClone(p));
  const r = E.runPlan(structuredClone(p));
  if (!v.valid || r.status !== 'ok') throw new Error('not ok ' + JSON.stringify(v.issues.filter(x => x.severity === 'ERROR')) + r.calculationErrorCode);
  return r;
}
// ---- hand: E[ln(1+R)] for R ~ Normal(mu, sigma), by Simpson quadrature over +-8 sigma (independent of the engine) ----
function eLog(mu, sigma, t) { // t = fraction of a year; t=1 -> annual
  const N = 20000, a = -8, b = 8, hh = (b - a) / N; let s = 0;
  for (let k = 0; k <= N; k++) { const z = a + k * hh; const w = (k === 0 || k === N) ? 1 : (k % 2 ? 4 : 2);
    const R = mu + sigma * z; s += w * Math.log(Math.max(1e-9, 1 + R)) * t * Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI); }
  return s * hh / 3;
}
// M1: 30 years, one account, no flows. Simple = (1.10)^30; MC median = exp(30 * E ln(1+R)).
{
  const years = 30, simple = run(onePot(years, 'simple')), mc = run(onePot(years, 'monteCarlo'));
  const gl = eLog(0.10, 0.185, 1);
  const handMean = 1e6 * Math.pow(1.10, years), handMedian = 1e6 * Math.exp(years * gl);
  const last = r => r.rows[r.rows.length - 1];
  out.push({ label: 'M1 30y median vs expected', simpleEnd: last(simple).total, handSimple: handMean,
    mcMedianEnd: last(mc).total, handMedian, medianCagr: Math.pow(last(mc).total / 1e6, 1 / years) - 1, handMedianCagr: Math.exp(gl) - 1,
    mcMedianOverSimple: last(mc).total / last(simple).total, relErrVsHandMedian: last(mc).total / handMedian - 1 });
  // Mean of the paths, by the engine's own per-path function (diagnostic only)
  if (typeof E.simulatePlan === 'function' && typeof E.rng === 'function') {
    const p = onePot(years, 'monteCarlo'); let s = 0, n = 400, ends = [];
    for (let i = 0; i < n; i++) { const r = E.simulatePlan(structuredClone(p), E.rng(1 + 2 * i), 0, E.rng(1 + 2 * i + 1)); const e = r.rows[r.rows.length - 1].total; s += e; ends.push(e); }
    ends.sort((a, b) => a - b);
    out.push({ label: 'M1b 400-path mean (engine per-path)', mean: s / n, handMean, meanOverHandMean: s / n / handMean, median400: ends[200] });
  }
  // Historical 1928 start, 30 years: product of HIST_RETURNS 1928..1957
  const hist = run(onePot(years, 'historical', { historyStart: 1928 }));
  let prod = 1; for (let k = 0; k < years; k++) prod *= 1 + E.HIST_RETURNS[k][1];
  out.push({ label: 'M1c historical 1928-1957', engine: last(hist).total, hand: 1e6 * prod, diff: last(hist).total - 1e6 * prod });
  // Geometric mean of the whole embedded series, for the preset comparison
  let lp = 0; E.HIST_RETURNS.forEach(x => { lp += Math.log(1 + x[1]); });
  const am = E.HIST_RETURNS.reduce((t, x) => t + x[1], 0) / E.HIST_RETURNS.length;
  const sd = Math.sqrt(E.HIST_RETURNS.reduce((t, x) => t + (x[1] - am) ** 2, 0) / (E.HIST_RETURNS.length - 1));
  out.push({ label: 'M1d HIST_RETURNS series', years: E.HIST_RETURNS.length + ' (' + E.HIST_RETURNS[0][0] + '-' + E.HIST_RETURNS[E.HIST_RETURNS.length - 1][0] + ')',
    geometricMean: Math.exp(lp / E.HIST_RETURNS.length) - 1, arithmeticMean: am, sampleSd: sd });
}
// M2: a half-year horizon (endAge 60.5). Under i.i.d. increments the half-year log sd is sigma_ln*sqrt(0.5); the engine
// draws a full annual return and raises (1+R) to 0.5, i.e. sigma_ln*0.5. Compare q90/q10 of the ending total.
{
  const p = onePot(1, 'monteCarlo'); p.profile.endAge = 60.5; p.profile.retireAge = 60.5;
  const r = run(p); const row = r.rows[r.rows.length - 1];
  // hand: annual log sd from quadrature, then scale
  const m1 = eLog(0.10, 0.185, 1); let s2 = 0; { const N = 20000, a = -8, b = 8, hh = (b - a) / N; for (let k = 0; k <= N; k++) { const z = a + k * hh; const w = (k === 0 || k === N) ? 1 : (k % 2 ? 4 : 2); const L = Math.log(Math.max(1e-9, 1 + 0.10 + 0.185 * z)); s2 += w * (L - m1) ** 2 * Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI); } s2 = s2 * hh / 3; }
  const sdAnnual = Math.sqrt(s2), z90 = 1.2815515655;
  out.push({ label: 'M2 half-year row dispersion', engineQ90overQ10: row.q90 / row.q10,
    handIidSqrtT: Math.exp(2 * z90 * sdAnnual * Math.sqrt(0.5)), handEngineRuleT: Math.exp(2 * z90 * sdAnnual * 0.5), annualLogSd: sdAnnual });
}
// M3: aggregateMonteCarloRuns on fabricated paths (hand quantiles, success rate, shortfall-age median)
{
  const mk = (tot, failed, fsa) => ({ calculationErrorAge: null, failed, firstShortfallAge: fsa, sustainedFailureAge: null, lifetimeContributions: 0, lifetimeContributionsReal: 0, lifetimeTaxes: 0, limitWarnings: [],
    rows: [{ age: 60, total: 0 }, { age: 61, total: tot, shortfall: failed ? 100 : 0 }] });
  const runs = [mk(10, false, null), mk(20, false, null), mk(30, true, 61), mk(40, false, null), mk(50, false, null)];
  const agg = E.aggregateMonteCarloRuns(runs);
  // hand: 4 of 5 funded = 80%; median of {10..50} = 30; q10 = 10 + 0.4*(20-10) = 14 (linear, (n-1)q); q90 = 40+0.6*10 = 46
  out.push({ label: 'M3 synthetic aggregate', successRate: agg.successRate, hand: 80, median: agg.rows[1].total, handMedian: 30, q10: agg.rows[1].q10, handQ10: 14, q90: agg.rows[1].q90, handQ90: 46,
    firstShortfallAge: agg.firstShortfallAge, medianRowShortfall: agg.rows[1].shortfall, failed: agg.failed });
}
// M4: determinism and path independence of the seed
{
  const p = onePot(10, 'monteCarlo', { runs: 200, seed: 99 });
  const a = run(p), b = run(p);
  out.push({ label: 'M4 same seed identical', identical: JSON.stringify(a.rows) === JSON.stringify(b.rows) });
  const q = structuredClone(p); q.assumptions.seed = 100; const c = run(q);
  out.push({ label: 'M4b seed+1 differs', differs: JSON.stringify(a.rows) !== JSON.stringify(c.rows) });
  const q0 = structuredClone(p); delete q0.assumptions.seed; const q00 = structuredClone(p); q00.assumptions.seed = 0;
  out.push({ label: 'M4c absent seed == seed 0', same: JSON.stringify(run(q0).rows) === JSON.stringify(run(q00).rows) });
}
// M5: the app's shortfall guidance reads r.firstShortfallAge / r.sustainedFailureAge (Monte Carlo: the median age among
// FAILING paths only) and then prints the shortfall of the MEDIAN row at that age (app-shell renderInsights, L935):
//   "Eligible sources are short by about "+money(firstRow.shortfall||0)+" in that projection year."
// With most paths funded, the median row's shortfall at that age is $0.
{
  const p = onePot(30, 'monteCarlo', { runs: 1000, seed: 5, returnRate: 6 });
  p.profile.retireAge = 60; p.retirement.spending = 60000; p.retirement.strategy = 'fixedNominal';
  const r = run(p);
  const at = a => r.rows.find(x => x.age >= a) || r.rows[r.rows.length - 1];
  const sa = r.sustainedFailureAge, fa = r.firstShortfallAge;
  out.push({ label: 'M5 MC shortfall guidance', successRate: r.successRate, firstShortfallAge: fa, sustainedFailureAge: sa,
    medianRowShortfallAtFirst: fa == null ? null : at(fa).shortfall, medianRowShortfallAtSustained: sa == null ? null : at(sa).shortfall,
    appWouldSay: sa != null ? 'Confirmed funding failure near age ' + Number(sa).toFixed(1) + ' ... remain short by about USD ' + Math.round(at(sa).shortfall || 0) + ' in the following projection year'
      : 'Isolated shortfall near age ' + Number(fa).toFixed(1) + ' ... short by about USD ' + Math.round(at(fa).shortfall || 0) });
}
for (const o of out) console.log(JSON.stringify(o));
console.log('MC-PROBE DONE: items=' + out.length);
