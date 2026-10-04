/* S5AA R50 measurement (C4, A-11): which Monte Carlo paths changed, on both trees, for every Monte Carlo plan of the expanded
   composition. Each path is simulated as runPlan() simulates it (the plan's seed, monteCarloPathSeed(seed, i, 0) and (seed, i, 1)),
   on the base tree and on the head tree, and its rows compared.
   Usage: node audit/S5AA/R50/prediction/r50_mc_paths.js <base tree> <head tree> */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const [BASE, HEAD] = process.argv.slice(2).map((x) => path.resolve(x));
function load(root) {
  const SHELL = fs.readFileSync(path.join(root, 'src', 'app-shell.html'), 'utf8');
  global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
  const cap = require(path.join(root, 'tools', 'capture-baseline.js'));
  cap.installDebtModules();
  return { E: require(path.join(root, 'src', 'engine.js')), cap };
}
const base = load(BASE), head = load(HEAD);
const { entries } = head.cap.corpusWithDiagnostics({ composition: 'expanded' });
for (const e of entries) {
  if (!e.plan.assumptions || e.plan.assumptions.method !== 'monteCarlo') continue;
  const runs = e.plan.assumptions.runs, seed = Number(e.plan.assumptions.seed) || 0, changed = [];
  for (let i = 0; i < runs; i++) {
    const sim = (E) => E.simulatePlan(JSON.parse(JSON.stringify(e.plan)), E.rng(E.monteCarloPathSeed(seed, i, 0)), 0, E.rng(E.monteCarloPathSeed(seed, i, 1)), []);
    const a = sim(base.E), b = sim(head.E);
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(i);
  }
  const pub = (E) => { const r = E.runPlan(JSON.parse(JSON.stringify(e.plan))); delete r.issues; return JSON.stringify(r); };
  console.log(e.name + ': ' + changed.length + ' of ' + runs + ' paths changed' + (changed.length ? ' [' + changed.join(',') + ']' : '')
    + '; published result ' + (pub(base.E) === pub(head.E) ? 'unchanged' : 'moved'));
}
