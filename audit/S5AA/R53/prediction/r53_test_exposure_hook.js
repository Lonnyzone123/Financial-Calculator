/* S5AA R53 prediction: which TEST plans are exposed to the round's engine and validator rules. Loaded with NODE_OPTIONS=--require into
   each test process on the tree BEFORE the repair (cbce0ce), as R51's and R52's hooks were (runner: r53_run_exposure.js).
   - grace (R51F-01): each runPlan()/simulatePlan() of src/engine.js is re-run once on the tapped variant (r53_mirror.js; a direct
     simulatePlan() as runPlan() with one run, path 0's seeding; identical plans once per process) and logged when exposed.
   - endBeforeRetire (decision 3): every plan given to runPlan(), simulatePlan() or validateScenario() with profile.endAge <
     profile.retireAge, logged with the function, so a test that projects or validates such a plan is named.
   Tests that build the app or load the engine through vm are not seen; those are searched by text and run after the build. */
'use strict';
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const OUT = process.env.R53_EXPOSURE_OUT;
const TREE = path.resolve(process.env.R53_TREE || path.join(__dirname, '..', '..', '..', '..'));
const ENGINE = path.join(TREE, 'src', 'engine.js').toLowerCase();
const VALIDATOR = path.join(TREE, 'src', 'scenario-validator.js').toLowerCase();
const M = require('./r53_mirror.js');
let V = null;
const T = M.fresh({});
function variant() {
  if (V) return V;
  const { loadEngineVariant } = require(path.join(TREE, 'tests', 'lib', 'engine-variant.js'));
  V = M.makeVariant(loadEngineVariant, '__R53Y');
  return V;
}
let busy = false;
const seen = new Map();
function log(rec) { if (OUT) fs.appendFileSync(OUT, JSON.stringify(Object.assign({ file: path.basename(process.argv[1] || '') }, rec)) + '\n'); }
function endBeforeRetire(fn, p0) {
  try {
    const pr = p0 && p0.profile;
    if (pr && typeof pr.endAge === 'number' && typeof pr.retireAge === 'number' && pr.endAge < pr.retireAge) {
      const key = 'ebr' + fn + JSON.stringify(pr);
      if (!seen.has(key)) { seen.set(key, true); log({ fn, endBeforeRetire: { age: pr.age, retireAge: pr.retireAge, endAge: pr.endAge } }); }
    }
  } catch (e) { /* never fails a test */ }
}
function check(fn, p0) {
  endBeforeRetire(fn, p0);
  if (busy) return;
  busy = true;
  try {
    if (!p0 || !p0.profile || !p0.assumptions || !p0.advanced || !p0.retirement) return;
    const p = JSON.parse(JSON.stringify(p0));
    if (fn === 'simulatePlan' && p.assumptions.method === 'monteCarlo') p.assumptions.runs = 1;
    const key = fn + JSON.stringify(p);
    if (seen.has(key)) return;
    seen.set(key, true);
    globalThis.__R53Y = M.fresh(T); T.on = true;
    try { variant().runPlan(JSON.parse(JSON.stringify(p))); } finally { T.on = false; }
    const x = M.exposures(T);
    if (x.grace.length) { const e = x.grace[0]; log({ fn, method: p.assumptions.method, runs: p.assumptions.runs, grace: 'at ' + e.age + ' (' + e.owner + '): earnings ' + e.earnings.toFixed(2) + ' > exempt ' + e.exempt.toFixed(2) + ', stream ' + e.stream.toFixed(2) + ', grace today ' + e.todayGrace + ', rows ' + x.grace.length }); }
  } catch (e) { /* exposure logging never fails a test */ } finally { busy = false; }
}
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const out = origLoad.apply(this, arguments);
  try {
    const resolved = Module._resolveFilename(request, parent, isMain).toLowerCase();
    if (resolved === ENGINE && out && !out.__r53Wrapped) {
      ['runPlan', 'simulatePlan'].forEach((fn) => {
        const f = out[fn];
        if (typeof f !== 'function') return;
        out[fn] = function (p) { check(fn, p); return f.apply(this, arguments); };
      });
      Object.defineProperty(out, '__r53Wrapped', { value: true });
    }
    if (resolved === VALIDATOR && out && !out.__r53Wrapped) {
      const f = out.validateScenario;
      if (typeof f === 'function') out.validateScenario = function (p) { endBeforeRetire('validateScenario', p); return f.apply(this, arguments); };
      Object.defineProperty(out, '__r53Wrapped', { value: true });
    }
  } catch (e) { /* not resolvable: not ours */ }
  return out;
};
