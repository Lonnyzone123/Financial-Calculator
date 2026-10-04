/* S5AA R52 prediction: which TEST plans are exposed to the round's four rules (r52_mirror.js). Loaded with NODE_OPTIONS=--require into
   each test process on the tree BEFORE the repair (2fb8c6f), as R51's hooks were. Each runPlan()/simulatePlan() of src/engine.js is
   re-run once on the tapped variant (a direct simulatePlan() as runPlan() with one run, path 0's seeding; identical plans once per
   process); each validateScenario() of src/scenario-validator.js is re-checked under the R52 transfer rule. Conditions (necessary):
   excess, qbi, pool, conv (r52_mirror.js exposures()), validator (TRANSFER_BETWEEN_OWNERS lifted). Tests that build the app or load
   the engine through vm are not seen. */
'use strict';
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const OUT = process.env.R52_EXPOSURE_OUT;
const TREE = path.resolve(process.env.R52_TREE || path.join(__dirname, '..', '..', '..', '..'));
const ENGINE = path.join(TREE, 'src', 'engine.js').toLowerCase();
const VALIDATOR = path.join(TREE, 'src', 'scenario-validator.js').toLowerCase();
const M = require('./r52_mirror.js');
let V = null;
const T = M.fresh({});
function variant() {
  if (V) return V;
  const { loadEngineVariant } = require(path.join(TREE, 'tests', 'lib', 'engine-variant.js'));
  V = M.makeVariant(loadEngineVariant, '__R52Y');
  return V;
}
let busy = false;
const seen = new Map();
function log(rec) { if (OUT) fs.appendFileSync(OUT, JSON.stringify(Object.assign({ file: path.basename(process.argv[1] || '') }, rec)) + '\n'); }
function check(fn, p0) {
  if (busy) return;
  busy = true;
  try {
    if (!p0 || !p0.profile || !p0.assumptions || !p0.advanced || !p0.retirement) return;
    const p = JSON.parse(JSON.stringify(p0));
    if (fn === 'simulatePlan' && p.assumptions.method === 'monteCarlo') p.assumptions.runs = 1;
    const key = fn + JSON.stringify(p);
    if (seen.has(key)) return;
    seen.set(key, true);
    globalThis.__R52Y = M.fresh(T); T.on = true;
    try { variant().runPlan(JSON.parse(JSON.stringify(p))); } finally { T.on = false; }
    const x = M.exposures(T), flags = [];
    if (x.excess.length) flags.push('excess from ' + x.excess[0].age + ' (Roth carried +' + x.excess[0].rothCarriedMore.toFixed(2) + ')');
    if (x.qbi.length) flags.push('qbi from ' + x.qbi[0].age + ' (cut ' + x.qbi[0].qbiCutOld.toFixed(2) + ' -> ' + x.qbi[0].qbiCutNew.toFixed(2) + ', tax ' + x.qbi[0].taxDelta.toFixed(2) + ')');
    if (x.pool.length) flags.push('pool at ' + x.pool[0].age + ' (basis ' + x.pool[0].basisMoved.toFixed(2) + ')');
    if (x.conv.length) flags.push('conv year ' + x.conv[0].yi + ' (nt ' + x.conv[0].provisionalNt.toFixed(2) + ' -> ' + x.conv[0].settledNt.toFixed(2) + ', early Roth draws ' + x.conv[0].laterEarlyRothDraws + ')');
    if (flags.length) log({ fn, method: p.assumptions.method, runs: p.assumptions.runs, flags });
  } catch (e) { /* exposure logging never fails a test */ } finally { busy = false; }
}
function checkValidator(p0, v) {
  try {
    if (!v || !Array.isArray(v.issues) || !v.issues.some((i) => i && i.code === 'TRANSFER_BETWEEN_OWNERS')) return;
    if (M.r52TransferAccepted(p0)) log({ fn: 'validateScenario', flags: ['validator TRANSFER_BETWEEN_OWNERS lifted (transfer at ' + p0.advanced.transferAge + ')'] });
  } catch (e) { /* never fails a test */ }
}
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const m = load.apply(this, arguments);
  let resolved = '';
  try { resolved = Module._resolveFilename(request, parent, isMain).toLowerCase(); } catch (e) { return m; }
  if (resolved === ENGINE && m && !m.__r52wrapped && typeof m.runPlan === 'function') {
    ['runPlan', 'simulatePlan'].forEach((k) => { const f = m[k]; if (typeof f === 'function') m[k] = function (p) { const r = f.apply(this, arguments); check(k, p); return r; }; });
    Object.defineProperty(m, '__r52wrapped', { value: true });
  }
  if (resolved === VALIDATOR && m && !m.__r52wrapped && typeof m.validateScenario === 'function') {
    const f = m.validateScenario;
    m.validateScenario = function (p) { const v = f.apply(this, arguments); checkValidator(p, v); return v; };
    Object.defineProperty(m, '__r52wrapped', { value: true });
  }
  return m;
};
