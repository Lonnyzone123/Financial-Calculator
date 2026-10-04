/* S5AA R46 prediction: which TEST plans are exposed to the R46 rules. Loaded with NODE_OPTIONS=--require into each test process on the
   tree BEFORE the R46 edits; it wraps src/engine.js's runPlan, simulatePlan and runScenario (tests that load an engine variant through
   vm are not seen, and the record says so) and appends one JSON line per exposed call to $R46_EXPOSURE_OUT.
   Exposure (necessary conditions, as r46_corpus_scan.js, through the pre-repair engine with probes, r46_instrument.js):
   - mc: a Monte Carlo plan. Asset classes on: every path exposed. Asset classes off: runPlan/runScenario calls run every path on the
     probed engine with the tree's seeding and are exposed when some row does not draw exactly one normal or a draw is suppressed; a
     direct simulatePlan() call with the test's own generator is replayed with rng(1) for its draw structure (the counts, not the values).
   - refusal: Monte Carlo, asset classes on, and the correlation outside [-1, 1] or below -1/(m-1) for the m active classes.
   - reserve: a non-Monte-Carlo plan with the reserve on in which the probed engine blends the reserve for an account whose balance
     is below min(reserve, portfolio total) ("live" when that balance is above zero, "empty" when it is zero). */
'use strict';
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const OUT = process.env.R46_EXPOSURE_OUT;
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const ENGINE = path.join(ROOT, 'src', 'engine.js').toLowerCase();
let P = null, E = null, busy = false;
function probe() { if (!P) P = require('./r46_instrument.js').loadInstrumentedEngine(ROOT); return P; }
function activeCount(p) {
  const adv = p.advanced || {}, classes = Array.isArray(adv.assetClasses) ? adv.assetClasses : [], active = new Set();
  (p.accounts || []).forEach((a) => {
    if (!a || !a.allocation || typeof a.allocation !== 'object') return;
    [0, 1e9].forEach((yp) => { const g = E.accountGlideWeights(a, p, yp); if (g) classes.forEach((c) => { if ((g.weights[c.id] || 0) > 0) active.add(c.id); }); });
  });
  return active.size;
}
function withProbe(fn) {
  const log = { draws: new Map(), sup: 0, res: [] };
  globalThis.__r46 = { draw: (age) => log.draws.set(age, (log.draws.get(age) || 0) + 1), sup: () => { log.sup++; }, res: (age, bal, R, T) => log.res.push({ age, bal, R, T }) };
  try { return { out: fn(), log }; } finally { globalThis.__r46 = null; }
}
function notOne(out, log) { if (!out || !out.rows) return false; for (let k = 0; k < out.rows.length - 1; k++) if ((log.draws.get(out.rows[k].age) || 0) !== 1) return true; return log.sup > 0; }
function check(fn, p) {
  if (busy || !OUT) return;
  busy = true;
  try {
    if (!p || typeof p !== 'object' || !p.assumptions || !p.advanced || !p.profile) return;
    const q = JSON.parse(JSON.stringify(p)), flags = [], adv = q.advanced, method = q.assumptions.method;
    if (method === 'monteCarlo') {
      if (adv.assetsOn === true) {
        flags.push('mc assets on: every path');
        const rho = Number(adv.correlation), m = activeCount(q);
        if (rho > 1 || rho < -1 || (m >= 2 && 1 + (m - 1) * rho < -1e-12)) flags.push('refusal: rho ' + rho + ', ' + m + ' active');
      } else if (fn === 'simulatePlan') {
        const { out, log } = withProbe(() => probe().simulatePlan(q, probe().rng(1), 0, probe().rng(2), null));
        if (notOne(out, log)) flags.push('mc assets off: draws per row not one (direct simulatePlan)');
        else flags.push('mc assets off, one draw per row (direct simulatePlan, own generator): unchanged');
      } else {
        let seed = Number(q.assumptions.seed); if (!Number.isFinite(seed)) seed = 0;
        let exposed = 0; const runs = Number(q.assumptions.runs) || 0;
        for (let i = 0; i < runs; i++) {
          const { out, log } = withProbe(() => probe().simulatePlan(q, probe().rng(probe().monteCarloPathSeed(seed, i, 0)), 0, probe().rng(probe().monteCarloPathSeed(seed, i, 1)), null));
          if (notOne(out, log)) exposed++;
          if (i === 0 && exposed) { exposed = runs; break; }
        }
        flags.push(exposed ? 'mc assets off: ' + exposed + ' of ' + runs + ' paths' : 'mc assets off, one draw per row on all ' + runs + ' paths: unchanged');
      }
    } else if (adv.reserveOn === true) {
      const { log } = withProbe(() => probe().runPlan(q));
      const live = log.res.some((x) => x.bal > 0 && x.bal < Math.min(x.R, x.T)), empty = log.res.some((x) => !(x.bal > 0) && 0 < Math.min(x.R, x.T));
      if (live) flags.push('reserve: an account below min(reserve, total)');
      else if (empty) flags.push('reserve: only an empty account below it');
    }
    if (flags.length) fs.appendFileSync(OUT, JSON.stringify({ file: path.basename(process.argv[1] || ''), fn, method, flags }) + '\n');
  } catch (e) { /* exposure logging never fails a test */ } finally { busy = false; }
}
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const m = load.apply(this, arguments);
  let resolved = '';
  try { resolved = Module._resolveFilename(request, parent, isMain).toLowerCase(); } catch (e) { return m; }
  if (resolved === ENGINE && m && !m.__r46wrapped && typeof m.runPlan === 'function') {
    E = m;
    ['runPlan', 'simulatePlan', 'runScenario'].forEach((k) => { const f = m[k]; if (typeof f === 'function') m[k] = function (p) { check(k, p); return f.apply(this, arguments); }; });
    Object.defineProperty(m, '__r46wrapped', { value: true });
  }
  return m;
};
