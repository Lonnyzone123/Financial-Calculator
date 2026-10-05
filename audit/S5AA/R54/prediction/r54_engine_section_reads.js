/* S5AA R54 (C6): which keys of profile / employment / assumptions / retirement does the engine READ? Every expanded-corpus plan is run
   through runPlan() with each of the four sections wrapped in a Proxy that logs property reads (get / has / getOwnPropertyDescriptor) and
   enumeration (ownKeys). A key the engine reads that the app's form does not write (readStatic()) would become live if R54 carries it
   through restore; this lists them. Usage: node r54_engine_section_reads.js <tree> [out.json] */
'use strict';
const path = require('node:path'), fs = require('node:fs');
const TREE = path.resolve(process.argv[2] || '.');
const engine = require(path.join(TREE, 'src', 'engine.js'));
const cap = require(path.join(TREE, 'tools', 'capture-baseline.js'));
const SECTIONS = ['profile', 'employment', 'assumptions', 'retirement'];
const reads = {}, enumerated = {}, perPlanKeys = {};
SECTIONS.forEach((s) => { reads[s] = {}; enumerated[s] = 0; perPlanKeys[s] = {}; });
function wrap(s, obj) {
  return new Proxy(obj, {
    get(t, k, r) { if (typeof k === 'string') reads[s][k] = (reads[s][k] || 0) + 1; return Reflect.get(t, k, r); },
    has(t, k) { if (typeof k === 'string') reads[s][k] = (reads[s][k] || 0) + 1; return Reflect.has(t, k); },
    getOwnPropertyDescriptor(t, k) { if (typeof k === 'string') reads[s]['(descriptor) ' + k] = (reads[s]['(descriptor) ' + k] || 0) + 1; return Reflect.getOwnPropertyDescriptor(t, k); },
    ownKeys(t) { enumerated[s]++; return Reflect.ownKeys(t); },
  });
}
const { entries } = cap.corpusWithDiagnostics({ composition: 'expanded' });
for (const e of entries) {
  const p = JSON.parse(JSON.stringify(e.plan));
  SECTIONS.forEach((s) => { Object.keys(p[s] || {}).forEach((k) => { perPlanKeys[s][k] = (perPlanKeys[s][k] || 0) + 1; }); if (p[s]) p[s] = wrap(s, p[s]); });
  if (p.assumptions && p.assumptions.method === 'monteCarlo') { /* the Monte Carlo plans run as captured */ }
  engine.runPlan(p);
}
const out = { plans: entries.length, enumerated, reads, keysPresentInCorpus: perPlanKeys };
console.log(JSON.stringify({ plans: entries.length, enumerated, readKeys: Object.fromEntries(SECTIONS.map((s) => [s, Object.keys(reads[s]).sort()])) }, null, 1));
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
