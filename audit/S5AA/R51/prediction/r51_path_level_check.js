/* S5AA R51 (C4/A-11): for each Monte Carlo corpus plan, which paths change between two trees (path i seeded as runPlan() seeds it:
   rng(monteCarloPathSeed(seed, i, 0)) for returns, rng(monteCarloPathSeed(seed, i, 1)) for care draws), whether the published result
   (rows and success rate) changes, and its headline figures. Each tree is built from its own corpus (so decision 1's inputs).
   Usage: node r51_path_level_check.js <tree before> <tree after> */
'use strict';
const path = require('node:path'), fs = require('node:fs');
function load(root) {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  const SHELL = fs.readFileSync(path.join(root, 'src', 'app-shell.html'), 'utf8');
  global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
  const cap = require(path.join(root, 'tools', 'capture-baseline.js')); cap.installDebtModules();
  return { E: require(path.join(root, 'src', 'engine.js')), cap };
}
const trees = process.argv.slice(2, 4).map((t) => path.resolve(t)), res = {};
for (const root of trees) {
  const X = load(root);
  for (const e of X.cap.corpusWithDiagnostics({ composition: 'expanded' }).entries) {
    const p = e.plan;
    if (p.assumptions.method !== 'monteCarlo') continue;
    const seed = Number.isFinite(Number(p.assumptions.seed)) ? Number(p.assumptions.seed) : 0, paths = [];
    for (let i = 0; i < p.assumptions.runs; i++) paths.push(JSON.stringify(X.E.simulatePlan(JSON.parse(JSON.stringify(p)), X.E.rng(X.E.monteCarloPathSeed(seed, i, 0)), 0, X.E.rng(X.E.monteCarloPathSeed(seed, i, 1)), []).rows));
    const agg = X.E.runPlan(JSON.parse(JSON.stringify(p)));
    (res[e.name] = res[e.name] || []).push({ paths, agg: JSON.stringify({ rows: agg.rows, s: agg.successRate }), s: agg.successRate, fin: agg.rows[agg.rows.length - 1].total, tax: agg.lifetimeTaxes, flex: p.retirement.flexibility, spend: p.retirement.spending });
  }
}
for (const [name, [a, b]] of Object.entries(res)) {
  const changed = a.paths.map((x, i) => (x !== b.paths[i] ? i : -1)).filter((i) => i >= 0);
  console.log(name + ' -- flexibility ' + a.flex + ' -> ' + b.flex + ', spending ' + a.spend + ' -> ' + b.spend + '; paths ' + a.paths.length + ', changed ' + changed.length +
    (changed.length && changed.length < a.paths.length ? ' (unchanged: ' + a.paths.map((x, i) => (x === b.paths[i] ? i : -1)).filter((i) => i >= 0).join(',') + ')' : '') +
    ' | published result equal: ' + (a.agg === b.agg) + ' | success ' + a.s + ' -> ' + b.s + ', final total ' + a.fin.toFixed(2) + ' -> ' + b.fin.toFixed(2) + ', lifetime taxes ' + a.tax.toFixed(2) + ' -> ' + b.tax.toFixed(2));
}
