/* S5AA R46 (C4/A-11, after the build): for each Monte Carlo plan of the expanded composition, how many paths changed -- every path run
   with the documented seeding on both trees' engines, on the same plan (this tree's composition), rows compared exactly.
   Usage: node r46_paths_changed.js <head tree> <base tree> */
'use strict';
const path = require('node:path'), fs = require('node:fs');
const [HEAD, BASE] = process.argv.slice(2).map((p) => path.resolve(p));
const SHELL = fs.readFileSync(path.join(HEAD, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(HEAD, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const EH = require(path.join(HEAD, 'src', 'engine.js')), EB = require(path.join(BASE, 'src', 'engine.js'));
for (const e of cap.corpusWithDiagnostics({ composition: 'expanded' }).entries) {
  const p = e.plan;
  if (p.assumptions.method !== 'monteCarlo') continue;
  let seed = Number(p.assumptions.seed); if (!Number.isFinite(seed)) seed = 0;
  let changed = 0;
  for (let i = 0; i < p.assumptions.runs; i++) {
    const run = (E) => JSON.stringify(E.simulatePlan(JSON.parse(JSON.stringify(p)), E.rng(E.monteCarloPathSeed(seed, i, 0)), 0, E.rng(E.monteCarloPathSeed(seed, i, 1)), null).rows);
    if (run(EH) !== run(EB)) changed++;
  }
  console.log(e.name + ': ' + changed + ' of ' + p.assumptions.runs + ' paths changed');
}
