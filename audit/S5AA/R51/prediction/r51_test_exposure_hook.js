/* S5AA R51 prediction: which TEST plans are exposed to the R51 rules. Loaded with NODE_OPTIONS=--require into each test process on
   the tree BEFORE the R51 edits; it wraps src/engine.js's runPlan and simulatePlan (tests that build the app or load an engine
   variant through vm are not seen, and the record says so), re-runs each plan through the tapped variant (r51_mirror.js, the same
   taps and conditions as r51_corpus_scan.js) and appends one JSON line per exposed plan to $R51_EXPOSURE_OUT.
   Conditions (necessary):
     medicare  -- some row's health differs under R51's per-person Medicare start (any path);
     irmaa     -- IRMAA_PRE_PLAN_MAGI_ASSUMED would be gained or removed; partial -- IRMAA_PARTIAL_FIRST_YEAR_COMPLETED would be removed;
     working   -- the first working-years shortfall (age or amount) moves once streams count as pay;
     flex10    -- the plan carries retirement.flexibility 10 (defaultPlan's), the variant took the flexibility branch, and the real engine's rows or success rate differ at 0
                  (decision 1 moves such a plan only where the test inherits the value from defaultPlan; the record checks which). */
'use strict';
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const OUT = process.env.R51_EXPOSURE_OUT;
const TREE = path.resolve(process.env.R51_TREE || path.join(__dirname, '..', '..', '..', '..'));
const ENGINE = path.join(TREE, 'src', 'engine.js').toLowerCase();
const M = require('./r51_mirror.js');
let V = null, E = null;
const T = { on: false, path: -1, health: [], work: [], flex: 0 };
function variant() {
  if (V) return V;
  const { loadEngineVariant } = require(path.join(TREE, 'tests', 'lib', 'engine-variant.js'));
  V = M.makeVariant(loadEngineVariant, '__R51X');
  return V;
}
let busy = false;
const seen = new Map();
/* A direct simulatePlan() call is one path with a generator already consumed, so it cannot be replayed; it is checked as runPlan() of
   the same plan with one run (path 0's own seeding): a proxy for the path, recorded as such. Identical plans are checked once per process. */
function check(fn, p0, result) {
  if (busy) return;
  busy = true;
  try {
    if (!p0 || !p0.profile || !p0.assumptions || !p0.advanced || !p0.retirement) return;
    const p = JSON.parse(JSON.stringify(p0));
    if (fn === 'simulatePlan' && p.assumptions.method === 'monteCarlo') p.assumptions.runs = 1;
    const key = fn + JSON.stringify(p);
    if (seen.has(key)) { const f = seen.get(key); if (f && OUT) fs.appendFileSync(OUT, f); return; }
    seen.set(key, null);
    const flags = [];
    globalThis.__R51X = T; T.on = true; T.path = -1; T.health = []; T.work = []; T.flex = 0;
    try { variant().runPlan(JSON.parse(JSON.stringify(p))); } finally { T.on = false; }
    if (p.advanced.healthOn) {
      const paths = new Set(), ages = new Set();
      T.health.forEach((h) => { const v = M.healthPair(E, p, h); if (Math.abs(v.neu - v.old) > 0.005) { paths.add(h.path); ages.add(h.age); } });
      if (paths.size) flags.push('medicare ' + (p.assumptions.method === 'monteCarlo' ? paths.size + ' paths, ' : '') + 'rows ' + [...ages].slice(0, 6).join(','));
    }
    if (M.irmaaFirstYears(E, p, false) !== M.irmaaFirstYears(E, p, true)) flags.push('irmaa first-years ' + (M.irmaaFirstYears(E, p, true) ? 'gained' : 'removed'));
    if (p.advanced.healthOn && Number(p.profile.age) % 1 !== 0 && M.partialAgeTest(E, p, false) !== M.partialAgeTest(E, p, true)) flags.push('partial-year disclosure');
    const w0 = T.work.filter((w) => w.path === 0), fo = w0.find((w) => w.ran && w.oldPay < -0.005), fn2 = w0.find((w) => w.ran && M.newPay(w) < -0.005);
    if (!fo !== !fn2 || (fo && (fo.age !== fn2.age || Math.abs(M.newPay(fn2) - fo.oldPay) > 0.005))) flags.push('working ' + (fo ? fo.age : '-') + ' -> ' + (fn2 ? fn2.age : '-'));
    if (p.retirement.flexibility === 10 && T.flex > 0) {
      const q = JSON.parse(JSON.stringify(p)); q.retirement.flexibility = 0;
      const a = E.runPlan(JSON.parse(JSON.stringify(p))), b = E.runPlan(q);
      if (JSON.stringify(a.rows) !== JSON.stringify(b.rows) || a.successRate !== b.successRate) flags.push('flex10');
    }
    if (flags.length && OUT) fs.appendFileSync(OUT, JSON.stringify({ file: path.basename(process.argv[1] || ''), fn, method: p.assumptions.method, flags }) + '\n');
  } catch (e) { /* exposure logging never fails a test */ } finally { busy = false; }
}
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const m = load.apply(this, arguments);
  let resolved = '';
  try { resolved = Module._resolveFilename(request, parent, isMain).toLowerCase(); } catch (e) { return m; }
  if (resolved === ENGINE && m && !m.__r51wrapped && typeof m.runPlan === 'function') {
    E = m;
    const orig = { runPlan: m.runPlan, simulatePlan: m.simulatePlan };
    E = Object.assign({}, m, orig);
    ['runPlan', 'simulatePlan'].forEach((k) => { const f = orig[k]; if (typeof f === 'function') m[k] = function (p) { const r = f.apply(this, arguments); check(k, p, r); return r; }; });
    Object.defineProperty(m, '__r51wrapped', { value: true });
  }
  return m;
};
