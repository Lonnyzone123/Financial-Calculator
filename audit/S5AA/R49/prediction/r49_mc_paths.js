/* S5AA R49, C4 after the build: seed:17's Monte Carlo paths, one by one, with the engine's own seeding (path i: returns from
   rng(monteCarloPathSeed(seed, i, 0)), care draws from rng(monteCarloPathSeed(seed, i, 1)), exactly as runPlan() seeds them), written as
   one hash per path. Run on each tree and compare.   Usage: node r49_mc_paths.js <tree> [<entry name>] */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const ROOT = path.resolve(process.argv[2] || '.'), NAME = process.argv[3] || 'seed:17';
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const p = cap.corpusWithDiagnostics({ composition: 'expanded' }).entries.find((e) => e.name === NAME).plan;
const seed = Number.isFinite(Number(p.assumptions.seed)) ? Number(p.assumptions.seed) : 0;
const out = [];
for (let i = 0; i < p.assumptions.runs; i++) {
  const r = E.simulatePlan(JSON.parse(JSON.stringify(p)), E.rng(E.monteCarloPathSeed(seed, i, 0)), 0, E.rng(E.monteCarloPathSeed(seed, i, 1)), []);
  out.push(i + ' ' + crypto.createHash('sha256').update(JSON.stringify(r.rows)).digest('hex').slice(0, 16) + ' ' + Math.round(r.rows[r.rows.length - 1].total));
}
console.log(out.join('\n'));
