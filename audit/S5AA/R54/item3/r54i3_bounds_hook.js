/* S5AA R54 item 3 prediction: which TEST plans carry a value outside a new bound (r54i3_bounds.json), and through which route. Loaded with
   NODE_OPTIONS=--require into each test process on the tree BEFORE the contract edit (runner: r54i3_run_hook.js). Read-only taps log a plan
   (file, function, the values outside a bound) when it reaches:
   - src/engine.js runPlan / runScenario / simulatePlan, and src/scenario-validator.js validateScenario (Module._load);
   - the same three engine functions of every tests/lib/engine-variant.js variant (household-ledger's included);
   - runScenario / runPlan of a Worker source run in a vm context (tests/lib/worker-source.js);
   - the built app in jsdom: its own runPlan and validateScenario (the import review, Plan checks, the calculation).
   Identical records are logged once per process. A tap never changes a result and never throws. */
'use strict';
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const OUT = process.env.R54I3_OUT;
const TREE = path.resolve(process.env.R54I3_TREE || process.cwd());
const B = JSON.parse(fs.readFileSync(path.join(__dirname, 'r54i3_bounds.json'), 'utf8')).bounds;
const ENGINE = path.join(TREE, 'src', 'engine.js').toLowerCase();
const VALIDATOR = path.join(TREE, 'src', 'scenario-validator.js').toLowerCase();
const VARIANT = path.join(TREE, 'tests', 'lib', 'engine-variant.js').toLowerCase();
const file = path.basename(process.argv[1] || '');
const seen = new Set();
function outside(p) {
  const hits = [];
  for (const b of B) {
    let v;
    try { v = b.path.split('.').reduce((x, k) => (x == null || typeof x !== 'object' ? undefined : x[k]), p); } catch (e) { return hits; }
    if (typeof v === 'number' && Number.isFinite(v) && ((b.min !== undefined && v < b.min) || (b.max !== undefined && v > b.max))) hits.push(b.path + '=' + v);
  }
  return hits;
}
function tap(route, fn, p) {
  try {
    if (!p || typeof p !== 'object') return;
    const hits = outside(p);
    if (!hits.length) return;
    const key = route + fn + hits.join();
    if (seen.has(key)) return;
    seen.add(key);
    if (OUT) fs.appendFileSync(OUT, JSON.stringify({ file, route, fn, hits }) + '\n');
  } catch (e) { /* never fails a test */ }
}
function wrapEngine(out, route) {
  ['runPlan', 'runScenario', 'simulatePlan'].forEach((fn) => {
    const f = out[fn];
    if (typeof f !== 'function' || f.__r54i3) return;
    const w = function (p) { tap(route, fn, p); return f.apply(this, arguments); };
    w.__r54i3 = true;
    try { out[fn] = w; } catch (e) { /* frozen */ }
  });
}
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const out = origLoad.apply(this, arguments);
  try {
    const resolved = Module._resolveFilename(request, parent, isMain).toLowerCase();
    if (resolved === ENGINE && out && !out.__r54i3) { wrapEngine(out, 'engine'); Object.defineProperty(out, '__r54i3', { value: true }); }
    if (resolved === VALIDATOR && out && !out.__r54i3) {
      const f = out.validateScenario;
      if (typeof f === 'function') out.validateScenario = function (p) { tap('validator', 'validateScenario', p); return f.apply(this, arguments); };
      Object.defineProperty(out, '__r54i3', { value: true });
    }
    if (resolved === VARIANT && out && !out.__r54i3) {
      const f = out.loadEngineVariant;
      if (typeof f === 'function') out.loadEngineVariant = function () { const e = f.apply(this, arguments); try { wrapEngine(e, 'variant'); } catch (x) { /* ignore */ } return e; };
      Object.defineProperty(out, '__r54i3', { value: true });
    }
  } catch (e) { /* not resolvable: not ours */ }
  return out;
};
// A Worker source run in a vm context: its global runScenario and runPlan are wrapped after it runs.
const origRun = vm.runInContext;
vm.runInContext = function (code, ctx) {
  const r = origRun.apply(this, arguments);
  try {
    if (typeof code === 'string' && code.indexOf('function runScenario(') >= 0 && ctx) {
      ['runScenario', 'runPlan'].forEach((fn) => { const f = ctx[fn]; if (typeof f === 'function' && !f.__r54i3) { const w = function (p) { tap('worker-vm', fn, p); return f.apply(this, arguments); }; w.__r54i3 = true; ctx[fn] = w; } });
    }
  } catch (e) { /* ignore */ }
  return r;
};
// The built app in jsdom: taps at the start of its own runPlan and validateScenario.
let jsdom = null;
try { jsdom = require(require.resolve('jsdom', { paths: [TREE] })); } catch (e) { jsdom = null; }
if (jsdom) {
  const Original = jsdom.JSDOM;
  const A1 = 'function runPlan(p,givenGate,gateToken){', A2 = 'function validateScenario(plan) {';
  class Tapped extends Original {
    constructor(html, options) {
      let h = html;
      const opts = Object.assign({}, options || {});
      if (typeof h === 'string' && h.indexOf(A1) >= 0) {
        h = h.split(A1).join(A1 + 'if(typeof window!=="undefined"&&window.__r54i3tap)window.__r54i3tap("runPlan",p);');
        h = h.split(A2).join(A2 + 'if(typeof window!=="undefined"&&window.__r54i3tap)window.__r54i3tap("validateScenario",plan);');
        const prior = opts.beforeParse;
        opts.beforeParse = (window) => { window.__r54i3tap = (fn, p) => tap('app', fn, p); if (prior) prior(window); };
      }
      super(h, opts);
    }
  }
  jsdom.JSDOM = Tapped;
}
