/* S5AA R54 item 3, the stop condition (the owner's decision of 2026-10-04): every plan in the control (36) and expanded (71) compositions
   (the golden plans are in both), generator seeds 1-N, tests/fixtures (any object with the four plan sections), the R40 conservation-grid
   generator (3,000 plans, its default seed), and defaultPlan, checked against each new bound of r54i3_bounds.json. A value outside a bound
   would be refused by the validator and the engine once the bound is in src/plan-value-contract.json. Run on the tree before the edit.
   Usage: node r54i3_stop_scan.js <tree> [generator seeds, default 5000] */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SWEEP = Number(process.argv[3] || 5000);
const B = JSON.parse(fs.readFileSync(path.join(__dirname, 'r54i3_bounds.json'), 'utf8')).bounds;
const at = (o, dotted) => dotted.split('.').reduce((x, k) => (x == null || typeof x !== 'object' ? undefined : x[k]), o);
function outside(p) {
  const hits = [];
  for (const b of B) {
    const v = at(p, b.path);
    if (v === undefined || (v === null && b.nullable)) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) continue; // a type fault is already refused today
    if ((b.min !== undefined && v < b.min) || (b.max !== undefined && v > b.max)) hits.push(b.path + '=' + v);
  }
  return hits;
}
const out = [];
const say = (s) => { out.push(s); console.log(s); };
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
for (const comp of ['control', 'expanded']) {
  const { entries } = cap.corpusWithDiagnostics({ composition: comp });
  const hits = entries.map((e) => [e.name, outside(e.plan)]).filter((x) => x[1].length);
  say('== ' + comp + ' (' + entries.length + ' plans): outside a new bound in ' + hits.length + (hits.length ? '\n   ' + hits.map((h) => h[0] + ': ' + h[1].join(', ')).join('\n   ') : ''));
}
const golden = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js'));
const dp = golden.extractDefaultPlan(SHELL);
say('== defaultPlan: ' + (outside(dp).join(', ') || 'inside every bound'));
const goldenHits = golden.GOLDEN_SCENARIOS.map((g) => [g.id || g.name, outside(golden.buildScenario(dp, g))]).filter((x) => x[1].length);
say('== golden definitions (' + golden.GOLDEN_SCENARIOS.length + '): outside in ' + goldenHits.length + (goldenHits.length ? ': ' + JSON.stringify(goldenHits) : ''));
const { generateScenario } = require(path.join(ROOT, 'tests', 'lib', 'scenario-generator.js'));
const gen = {};
let genPlans = 0;
for (let s = 1; s <= SWEEP; s++) { const h = outside(generateScenario(dp, s)); genPlans++; h.forEach((x) => { const k = x.split('=')[0]; (gen[k] = gen[k] || []).push(s); }); }
say('== generator seeds 1-' + SWEEP + ' (' + genPlans + ' plans): ' + (Object.keys(gen).length ? Object.entries(gen).map(([k, v]) => k + ' in ' + v.length + ' (first ' + v.slice(0, 10).join(',') + ')').join('; ') : 'none outside a bound'));
const fx = [];
function walk(o, where) {
  if (!o || typeof o !== 'object') return;
  if (o.profile && o.retirement && o.assumptions) { const h = outside(o); if (h.length) fx.push(where + ': ' + h.join(', ')); }
  for (const k of Object.keys(o)) walk(o[k], where + '.' + k);
}
for (const f of fs.readdirSync(path.join(ROOT, 'tests', 'fixtures')).filter((f) => f.endsWith('.json'))) walk(JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', f), 'utf8')), f);
say('== tests/fixtures/*.json: ' + (fx.length ? fx.length + '\n   ' + fx.join('\n   ') : 'none outside a bound'));
const { genPlan } = require(path.join(ROOT, 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'grid.js'));
const grid = {};
for (let k = 0; k < 3000; k++) outside(genPlan(k)).forEach((x) => { const n = x.split('=')[0]; grid[n] = (grid[n] || 0) + 1; });
say('== R40 grid generator (3,000 plans, default seed): ' + (Object.keys(grid).length ? JSON.stringify(grid) : 'none outside a bound'));
if (process.argv[4]) fs.writeFileSync(process.argv[4], out.join('\n') + '\n');
