/* S5AA R43 prediction, part 5b (Monte Carlo seeds, the result contract, historical starts): which corpus plans can each repair move?
   Run BEFORE the part 5b edits.   Usage: node audit/S5AA/R43/prediction/seeds_corpus_scan.js [<source tree>]
   - SA42F-31 changes every Monte Carlo path's two seeds, so every plan whose method is monteCarlo moves (all its paths change;
     its percentiles and success rate are re-drawn);
   - SA42F-34 refuses a historical start that is not one of the return series' years (before the first, or a fraction);
   - SA42F-33 changes only an unknown-method refusal's `mode`, and the contract document. */
'use strict';
const path = require('node:path');
const ROOT = path.resolve(process.argv[2] || '.');
const fs = require('node:fs');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const years = new Set(E.HIST_RETURNS.map((x) => x[0]));
const METHODS = ['simple', 'monteCarlo', 'historical'];
function scan(p) {
  const out = [];
  if (p.assumptions.method === 'monteCarlo') out.push('SA42F-31 monteCarlo, ' + p.assumptions.runs + ' runs, seed ' + p.assumptions.seed);
  const y = p.assumptions.historyStart;
  if (y !== undefined && typeof y === 'number' && y <= E.HIST_RETURNS[E.HIST_RETURNS.length - 1][0] && !years.has(y)) out.push('SA42F-34 historyStart ' + y);
  if (!METHODS.includes(p.assumptions.method)) out.push('SA42F-33 method ' + p.assumptions.method);
  return out;
}
for (const comp of ['control', 'expanded']) {
  const es = cap.corpusWithDiagnostics({ composition: comp }).entries, hits = es.map((e) => [e.name, scan(e.plan)]).filter(([, o]) => o.length);
  console.log('== ' + comp + ' (' + es.length + ' plans): ' + hits.length + ' flagged');
  hits.forEach(([n, o]) => console.log('   ' + n + ': ' + o.join('; ')));
}
const golden = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')), d = golden.extractDefaultPlan(SHELL);
const gh = golden.GOLDEN_SCENARIOS.map(([n, o]) => [n, scan(golden.buildScenario(d, o))]).filter(([, o]) => o.length);
console.log('== golden: ' + gh.map(([n, o]) => n + ' (' + o.join('; ') + ')').join(', '));
const pc = (method, y) => ({ assumptions: { method, historyStart: y, runs: 3, seed: 1 } });
console.log('== positive control: ' + [['mc', pc('monteCarlo')], ['1900', pc('historical', 1900)], ['1966.5', pc('historical', 1966.5)], ['1967 (control)', pc('historical', 1967)],
  ['2026 (after data, its own code)', pc('historical', 2026)], ['montecarlo', pc('montecarlo')]].map(([n, p]) => n + ': ' + (scan(p).join('; ') || 'none')).join(' | '));
