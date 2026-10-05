/* S5AA R54 (item 2, the keys the form does not carry): R54 carries every key of profile / employment / assumptions / retirement that no
   input writes. This confirms, on every expanded-corpus plan, that the engine reads none of the ones known to occur: each plan is run as
   it is, then with retirement.ssFra removed, set to 60 and to 75, with retirement.pensionStart and pensionAge added and removed, and with
   an unlisted key added to each of the four sections. Every run's whole result (rows, issues, aggregates) must be identical.
   Usage: node r54_inert_keys_differential.js <tree> */
'use strict';
const path = require('node:path');
const TREE = path.resolve(process.argv[2] || '.');
const engine = require(path.join(TREE, 'src', 'engine.js'));
const cap = require(path.join(TREE, 'tools', 'capture-baseline.js'));
const VARIANTS = {
  'ssFra removed': (p) => { delete p.retirement.ssFra; },
  'ssFra 60': (p) => { p.retirement.ssFra = 60; },
  'ssFra 75': (p) => { p.retirement.ssFra = 75; },
  'pensionStart/pensionAge 50, 90': (p) => { p.retirement.pensionStart = 50; p.retirement.pensionAge = 90; },
  'pensionStart/pensionAge removed': (p) => { delete p.retirement.pensionStart; delete p.retirement.pensionAge; },
  'an unlisted key in each section': (p) => { for (const s of ['profile', 'employment', 'assumptions', 'retirement']) p[s].zzUnlisted = 'x'; },
};
const { entries } = cap.corpusWithDiagnostics({ composition: 'expanded' });
const strip = (r) => JSON.stringify(r, (k, v) => (k === 'durationMs' || k === 'elapsedMs' ? undefined : v));
let runs = 0, differing = [];
for (const e of entries) {
  const ref = strip(engine.runPlan(JSON.parse(JSON.stringify(e.plan))));
  for (const [name, mutate] of Object.entries(VARIANTS)) {
    const p = JSON.parse(JSON.stringify(e.plan)); mutate(p);
    runs++;
    if (strip(engine.runPlan(p)) !== ref) differing.push(e.name + ' / ' + name);
  }
}
console.log('plans ' + entries.length + ', variant runs ' + runs + ', differing ' + differing.length + (differing.length ? ': ' + differing.join('; ') : ''));
