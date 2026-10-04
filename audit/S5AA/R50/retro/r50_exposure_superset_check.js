/* S5AA R50 proof (C4, A-11): is the corrected scan's exposure test a SUPERSET of the Monte Carlo paths that changed?
   Usage: node r50_exposure_superset_check.js <pre-repair tree (ba9946d)> <R50 tree (2d9ede3)> <exposed.json from r50_corpus_scan_v2.js>
   For every Monte Carlo plan of the expanded composition: each path is simulated as runPlan() simulates it on that tree (the plan's
   seed, monteCarloPathSeed(seed, i, 0) and (seed, i, 1)), on both trees, and its result compared; then the changed paths are held
   to the scan's exposed set. Also: whether the published result moved. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const [PRE, POST] = process.argv.slice(2, 4).map((x) => path.resolve(x));
const exposed = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
function load(root) {
  const SHELL = fs.readFileSync(path.join(root, 'src', 'app-shell.html'), 'utf8');
  global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
  const cap = require(path.join(root, 'tools', 'capture-baseline.js'));
  cap.installDebtModules();
  return { E: require(path.join(root, 'src', 'engine.js')), cap };
}
const pre = load(PRE), post = load(POST);
const { entries } = pre.cap.corpusWithDiagnostics({ composition: 'expanded' });
let allHeld = true;
for (const e of entries) {
  if (e.plan.assumptions.method !== 'monteCarlo') continue;
  const runs = e.plan.assumptions.runs, seed = Number(e.plan.assumptions.seed) || 0, changed = [];
  for (let i = 0; i < runs; i++) {
    const sim = (X) => JSON.stringify(X.E.simulatePlan(JSON.parse(JSON.stringify(e.plan)), X.E.rng(X.E.monteCarloPathSeed(seed, i, 0)), 0, X.E.rng(X.E.monteCarloPathSeed(seed, i, 1)), []));
    if (sim(pre) !== sim(post)) changed.push(i);
  }
  const ex = exposed[e.name] || [], missed = changed.filter((i) => !ex.includes(i));
  const pub = (X) => { const r = X.E.runPlan(JSON.parse(JSON.stringify(e.plan))); delete r.issues; return JSON.stringify(r); };
  if (missed.length) allHeld = false;
  console.log(e.name + ': exposure test flags ' + ex.length + ' of ' + runs + ' paths; ' + changed.length + ' changed'
    + (changed.length ? ' (' + changed.join(',') + ')' : '') + '; every changed path flagged: ' + (missed.length === 0)
    + (missed.length ? ' (missed ' + missed.join(',') + ')' : '') + '; flagged and unchanged: ' + ex.filter((i) => !changed.includes(i)).length
    + '; published result ' + (pub(pre) === pub(post) ? 'unchanged' : 'moved'));
}
console.log('SUPERSET HOLDS FOR EVERY MONTE CARLO PLAN: ' + allHeld);
