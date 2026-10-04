/* S5AA R47 proof, Monte Carlo (C4/A-11): the paths that changed between the pre-repair and repaired trees, measured path by path with
   the engine's own seeds, against the corrected scan's binding paths. Usage: node r47_path_compare_v2.js <scan json> <tree before> <tree after> */
'use strict';
const path = require('path'), fs = require('fs');
const [scanFile, before, after] = process.argv.slice(2);
const scan = require(scanFile);
function load(root) {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  const SHELL = fs.readFileSync(path.join(root, 'src', 'app-shell.html'), 'utf8');
  global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
  const cap = require(path.join(root, 'tools', 'capture-baseline.js')); cap.installDebtModules();
  return { E: require(path.join(root, 'src', 'engine.js')), cap };
}
for (const n of scan.expanded.filter((x) => x.monteCarlo)) {
  const res = [];
  for (const root of [before, after]) {
    const X = load(root), p = X.cap.corpusWithDiagnostics({ composition: 'expanded' }).entries.find((e) => e.name === n.name).plan, b = Number(p.assumptions.seed);
    const paths = [];
    for (let i = 0; i < p.assumptions.runs; i++) paths.push(JSON.stringify(X.E.simulatePlan(JSON.parse(JSON.stringify(p)), X.E.rng(X.E.monteCarloPathSeed(b, i, 0)), 0, X.E.rng(X.E.monteCarloPathSeed(b, i, 1)), []).rows));
    const agg = X.E.runPlan(JSON.parse(JSON.stringify(p)));
    res.push({ paths, agg: JSON.stringify({ rows: agg.rows, successRate: agg.successRate }) });
  }
  const changed = res[0].paths.map((x, i) => (x !== res[1].paths[i] ? i : -1)).filter((i) => i >= 0);
  const named = new Set(n.bindingPaths), changedSet = new Set(changed);
  const missed = changed.filter((i) => !named.has(i)), extra = n.bindingPaths.filter((i) => !changedSet.has(i));
  console.log(n.name + ': changed ' + changed.length + ', named (binding) ' + n.bindingPaths.length + ', changed and not named ' + missed.length + ', named and not changed ' + extra.length +
    ' | published result moved: ' + (res[0].agg !== res[1].agg) + (missed.length || extra.length ? ' | missed ' + missed.join(',') + ' extra ' + extra.join(',') : ' | EXACT'));
}
