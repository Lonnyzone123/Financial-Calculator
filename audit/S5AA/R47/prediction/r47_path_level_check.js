/* S5AA R47 (C4/A-11): for a Monte Carlo plan, which paths change between two trees, whether each changed path was exposed (someone
   65 or older, on the senior-deduction age list, alive by a row's close at plan year 3 or later -- the prediction's age-only
   condition, which is the same on every path), and whether the published result (rows and success rate) changes.
   Usage: node audit/S5AA/R47/prediction/r47_path_level_check.js <tree before> <tree after> [<plan name> ...]
   Each tree a clean worktree with a node_modules junction. Path seeds as runPlan() draws them since R43 part 5b
   (monteCarloPathSeed(seed, path, stream)). */
'use strict';
const path = require('path'), fs = require('fs');
function load(root) {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  const SHELL = fs.readFileSync(path.join(root, 'src', 'app-shell.html'), 'utf8');
  global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
  const cap = require(path.join(root, 'tools', 'capture-baseline.js')); cap.installDebtModules();
  return { E: require(path.join(root, 'src', 'engine.js')), cap };
}
const names = process.argv.slice(4).length ? process.argv.slice(4) : ['golden:monte-carlo-fixed-seed', 'expansion:monte-carlo-sensitive-band'];
for (const name of names) {
  const res = [];
  for (const root of process.argv.slice(2, 4)) {
    const X = load(root), p = X.cap.corpusWithDiagnostics({ composition: 'expanded' }).entries.find((e) => e.name === name).plan, b = Number(p.assumptions.seed);
    const paths = [], exposed = [];
    for (let i = 0; i < p.assumptions.runs; i++) {
      const r = X.E.simulatePlan(JSON.parse(JSON.stringify(p)), X.E.rng(X.E.monteCarloPathSeed(b, i, 0)), 0, X.E.rng(X.E.monteCarloPathSeed(b, i, 1)), []);
      paths.push(JSON.stringify(r.rows));
      let ex = false;
      for (let k = 4; k < r.rows.length && !ex; k++) { const age = r.rows[k - 1].age, dur = r.rows[k].age - age, f = X.E.householdFilingFor(p, age); ex = X.E.ageAmountAges(p, age, f, dur).seniorDeductionAges.some((a) => a >= 65); }
      exposed.push(ex);
    }
    const agg = X.E.runPlan(JSON.parse(JSON.stringify(p)));
    res.push({ paths, exposed, agg: JSON.stringify({ rows: agg.rows, successRate: agg.successRate }), success: agg.successRate });
  }
  const [a, b] = res;
  const changed = a.paths.map((x, i) => (x !== b.paths[i] ? i : -1)).filter((i) => i >= 0);
  const unexposedChanged = changed.filter((i) => !a.exposed[i]);
  console.log(name + ' -- paths ' + a.paths.length + ', exposed ' + a.exposed.filter(Boolean).length + ', changed ' + changed.length +
    ' (changed but not exposed: ' + unexposedChanged.length + ') | published result equal: ' + (a.agg === b.agg) + ' | success ' + a.success + ' -> ' + b.success);
}
