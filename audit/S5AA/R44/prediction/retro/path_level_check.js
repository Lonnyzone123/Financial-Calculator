/* S5AA R44 (R43-04): for a Monte Carlo plan, which paths change between two trees, and does the aggregated result (rows and success
   rate) change? Usage: node audit/S5AA/R44/prediction/retro/path_level_check.js <tree before> <tree after> [<plan name>]  (each tree a clean worktree with a
   node_modules junction). Seeds as at R43 part 2's trees: seed + 2i and seed + 2i + 1. */
const path = require('path'), fs = require('fs');
function load(root) {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  const SHELL = fs.readFileSync(path.join(root, 'src', 'app-shell.html'), 'utf8');
  global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
  const cap = require(path.join(root, 'tools', 'capture-baseline.js')); cap.installDebtModules();
  return { E: require(path.join(root, 'src', 'engine.js')), cap };
}
const name = process.argv[4] || 'golden:monte-carlo-fixed-seed';
const res = {};
for (const root of process.argv.slice(2, 4)) {
  const X = load(root), p = X.cap.corpusWithDiagnostics({ composition: 'expanded' }).entries.find((e) => e.name === name).plan, b = Number(p.assumptions.seed);
  const paths = []; for (let i = 0; i < p.assumptions.runs; i++) paths.push(JSON.stringify(X.E.simulatePlan(JSON.parse(JSON.stringify(p)), X.E.rng(b + 2 * i), 0, X.E.rng(b + 2 * i + 1), []).rows));
  const agg = X.E.runPlan(JSON.parse(JSON.stringify(p)));
  res[root] = { paths, agg: JSON.stringify({ rows: agg.rows, successRate: agg.successRate }) };
}
const [a, b] = Object.values(res);
const changed = a.paths.map((x, i) => (x !== b.paths[i] ? i : -1)).filter((i) => i >= 0);
console.log(name, '-- paths changed:', changed.length, changed.slice(0, 12).join(','), '| aggregated result equal:', a.agg === b.agg);
