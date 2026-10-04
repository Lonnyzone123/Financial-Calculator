/* S5AA R51 prediction, C4 (A-11) for decision 1 (defaultPlan.retirement.flexibility 10 -> 0): which Monte Carlo paths are exposed.
   A path is exposed when strategySpending() -- the engine's one reader of retirement.flexibility -- takes the flexibility branch
   (prior return below zero and flexibility above zero) at least once on it, through either caller (the row's spending or the cash
   reserve's sizing). A path that never takes it cannot change when flexibility becomes 0: a necessary condition. Read-only tap in an
   in-memory variant of the tree's engine (tests/lib/engine-variant.js); the variant's rows are asserted equal to the real engine's.
   Usage: node r51_mc_flex_exposure.js <tree>   (run on the base: the corpus inputs there still carry the default's 10) */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const { loadEngineVariant } = require(path.join(ROOT, 'tests', 'lib', 'engine-variant.js'));
const T = { on: false, path: -1, hits: new Set() };
globalThis.__R51F = T;
const V = loadEngineVariant([
  { id: 'path', marker: 'function simulatePlanRows(p,random,historyOffset,ltcRandom,issues,serialized,gateToken){', append: 'globalThis.__R51F&&globalThis.__R51F.on&&globalThis.__R51F.path++;' },
  { id: 'flex', marker: 'if(priorReturn<0&&r.flexibility>0){', append: 'globalThis.__R51F&&globalThis.__R51F.on&&globalThis.__R51F.hits.add(globalThis.__R51F.path);' },
]);
for (const e of cap.corpusWithDiagnostics({ composition: 'expanded' }).entries) {
  const p = e.plan;
  if (p.assumptions.method !== 'monteCarlo') continue;
  T.on = true; T.path = -1; T.hits = new Set();
  let rv;
  try { rv = V.runPlan(JSON.parse(JSON.stringify(p))); } finally { T.on = false; }
  const r = E.runPlan(JSON.parse(JSON.stringify(p)));
  if (JSON.stringify(rv.rows) !== JSON.stringify(r.rows) || rv.successRate !== r.successRate) throw new Error(e.name + ': the tap is not output-neutral');
  const hits = [...T.hits].sort((a, b) => a - b), unexposed = [];
  for (let i = 0; i < p.assumptions.runs; i++) if (!T.hits.has(i)) unexposed.push(i);
  console.log(e.name + ': flexibility ' + p.retirement.flexibility + '; runs ' + p.assumptions.runs + '; exposed paths ' + hits.length +
    (unexposed.length ? '; not exposed (' + unexposed.length + '): ' + unexposed.join(',') : '; every path exposed'));
}
