/* S5AA R54 item 4, the stop condition (the owner's decisions of 2026-10-04, about 7:50 pm): every plan with an entered seed of 0, a
   non-integer seed or a negative seed (now refused), and every plan with a negative prior-year MAGI (now refused by the engine too), in the
   control (36) and expanded (71) compositions (golden included), the golden definitions, defaultPlan, generator seeds 1-N, tests/fixtures,
   the R40 grid generator (3,000 plans) and ChatGPT's four companions' stored plans. Widened bounds refuse nothing new; the scan also counts
   plans inside the widened ranges but outside the old ones (item 3's), which item 4 makes valid again.
   Usage: node r54i4_stop_scan.js <tree> [generator seeds, default 5000] [companion witness_runs dir] [out.txt] */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SWEEP = Number(process.argv[3] || 5000);
const COMP = process.argv[4];
const at = (o, d) => d.split('.').reduce((x, k) => (x == null || typeof x !== 'object' ? undefined : x[k]), o);
const WIDENED = [['assumptions.fee', 0, 2, 0, 5], ['retirement.withdrawalRate', 0, 15, 0, 25], ['retirement.adjustment', 1, null, 0, null],
  ['retirement.dividendGrowth', -20, 20, -50, 20], ['retirement.survivorSpendingReduction', 0, 50, 0, 75]];
function check(p) {
  const out = [];
  const s = at(p, 'assumptions.seed');
  if (s !== undefined && s !== null && typeof s === 'number' && (!Number.isInteger(s) || s < 1)) out.push('seed=' + s);
  for (const k of ['advanced.irmaaMagiTwoYearsBefore', 'advanced.irmaaMagiOneYearBefore']) { const v = at(p, k); if (typeof v === 'number' && v < 0) out.push(k + '=' + v); }
  return out;
}
function widened(p) {
  const out = [];
  for (const [k, lo, hi, nlo, nhi] of WIDENED) { const v = at(p, k); if (typeof v !== 'number') continue; const oldIn = v >= lo && (hi === null || v <= hi), newIn = v >= nlo && (nhi === null || v <= nhi); if (newIn && !oldIn) out.push(k + '=' + v); }
  return out;
}
const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
for (const comp of ['control', 'expanded']) {
  const { entries } = cap.corpusWithDiagnostics({ composition: comp });
  const hits = entries.map((e) => [e.name, check(e.plan)]).filter((x) => x[1].length);
  const wid = entries.map((e) => [e.name, widened(e.plan)]).filter((x) => x[1].length);
  say('== ' + comp + ' (' + entries.length + '): seed/MAGI refusals ' + hits.length + (hits.length ? ' ' + JSON.stringify(hits) : '') + '; inside the widened range only ' + wid.length);
}
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
const golden = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js'));
const dp = golden.extractDefaultPlan(SHELL);
say('== defaultPlan: ' + (check(dp).join(', ') || 'no seed/MAGI refusal') + ' (seed ' + dp.assumptions.seed + ')');
const g = golden.GOLDEN_SCENARIOS.map((x) => [x.id || x.name, check(golden.buildScenario(dp, x))]).filter((x) => x[1].length);
say('== golden definitions (' + golden.GOLDEN_SCENARIOS.length + '): ' + g.length);
const { generateScenario } = require(path.join(ROOT, 'tests', 'lib', 'scenario-generator.js'));
let gh = 0, gw = 0; const seeds = new Set();
for (let s = 1; s <= SWEEP; s++) { const p = generateScenario(dp, s); if (check(p).length) gh++; if (widened(p).length) gw++; seeds.add(typeof p.assumptions.seed + (Number.isInteger(p.assumptions.seed) ? ':int' : ':other')); }
say('== generator seeds 1-' + SWEEP + ': seed/MAGI refusals ' + gh + '; inside the widened range only ' + gw + '; seed kinds ' + [...seeds].join(','));
const fx = [];
(function walk(dir) { for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) (function w(o, where) { if (!o || typeof o !== 'object') return; if (o.profile && o.retirement && o.assumptions) { const h = check(o); if (h.length) fx.push(where + ': ' + h.join(', ')); } for (const k of Object.keys(o)) w(o[k], where + '.' + k); })(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), f); })(path.join(ROOT, 'tests', 'fixtures'));
say('== tests/fixtures: ' + (fx.length ? fx.join('; ') : '0'));
const { genPlan } = require(path.join(ROOT, 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'grid.js'));
let gr = 0; for (let k = 0; k < 3000; k++) if (check(genPlan(k)).length) gr++;
say('== R40 grid (3,000): ' + gr);
if (COMP) for (const f of fs.readdirSync(COMP).filter((x) => /\.json$/.test(x))) {
  const hits = new Set();
  (function w(o, where) { if (!o || typeof o !== 'object') return; if (o.profile && o.retirement && o.assumptions) check(o).forEach((h) => hits.add(h)); for (const k of Object.keys(o)) w(o[k], where); })(JSON.parse(fs.readFileSync(path.join(COMP, f), 'utf8')), f);
  say('== companion ' + f + ': ' + (hits.size ? [...hits].join(', ') : '0'));
}
if (process.argv[5]) fs.writeFileSync(process.argv[5], lines.join('\n') + '\n');
