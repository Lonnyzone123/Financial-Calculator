/* S5AA R51 addendum prediction: which TEST plans are exposed to the addendum's two rules (r51b_mirror.js). Loaded with
   NODE_OPTIONS=--require into each test process on the tree BEFORE the addendum's edits (678c60f), as r51_test_exposure_hook.js was.
   Conditions (necessary): roth -- at some smartWithdrawalOrder() call with a Roth balance the class order changes under the new weight
   ("roth-reach" when a spending or tax-funding draw in such a row reaches a class past the orders' common prefix);
   working -- the first working-years shortfall (age or amount) moves once the streams' income tax is subtracted. */
'use strict';
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const OUT = process.env.R51_EXPOSURE_OUT;
const TREE = path.resolve(process.env.R51_TREE || path.join(__dirname, '..', '..', '..', '..'));
const ENGINE = path.join(TREE, 'src', 'engine.js').toLowerCase();
const M = require('./r51b_mirror.js');
let V = null, E = null;
const T = { on: false, path: -1, roth: [], work: [], draw: [] };
function variant() {
  if (V) return V;
  const { loadEngineVariant } = require(path.join(TREE, 'tests', 'lib', 'engine-variant.js'));
  V = M.makeVariant(loadEngineVariant, '__R51Y');
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
    globalThis.__R51Y = T; T.on = true; T.path = -1; T.roth = []; T.work = []; T.draw = [];
    try { variant().runPlan(JSON.parse(JSON.stringify(p))); } finally { T.on = false; }
    const flips = T.roth.filter((x) => x.rothBal > 1e-9 && x.orderOld !== x.orderNew);
    if (flips.length) {
      const reach = flips.some((f) => { const o1 = f.orderOld.split(','), o2 = f.orderNew.split(','); let k = 0; while (k < o1.length && o1[k] === o2[k]) k++;
        return T.draw.some((d) => d.path === f.path && d.age === f.age && d.amount > 1e-9 && o1.indexOf(d.cls) >= k); });
      flags.push((reach ? 'roth-reach' : 'roth') + ' from ' + flips[0].age);
    }
    const w0 = T.work.filter((w) => w.path === 0), fo = w0.find((w) => w.ran && w.pay < -0.005), fn2 = w0.find((w) => w.ran && w.newPay < -0.005);
    if (!fo !== !fn2 || (fo && (fo.age !== fn2.age || Math.abs(fn2.newPay - fo.pay) > 1e-9))) flags.push('working ' + (fo ? fo.age : '-') + ' -> ' + (fn2 ? fn2.age : '-'));
    if (flags.length && OUT) fs.appendFileSync(OUT, JSON.stringify({ file: path.basename(process.argv[1] || ''), fn, method: p.assumptions.method, flags }) + '\n');
  } catch (e) { /* exposure logging never fails a test */ } finally { busy = false; }
}
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const m = load.apply(this, arguments);
  let resolved = '';
  try { resolved = Module._resolveFilename(request, parent, isMain).toLowerCase(); } catch (e) { return m; }
  if (resolved === ENGINE && m && !m.__r51bwrapped && typeof m.runPlan === 'function') {
    E = m;
    const orig = { runPlan: m.runPlan, simulatePlan: m.simulatePlan };
    E = Object.assign({}, m, orig);
    ['runPlan', 'simulatePlan'].forEach((k) => { const f = orig[k]; if (typeof f === 'function') m[k] = function (p) { const r = f.apply(this, arguments); check(k, p, r); return r; }; });
    Object.defineProperty(m, '__r51bwrapped', { value: true });
  }
  return m;
};
