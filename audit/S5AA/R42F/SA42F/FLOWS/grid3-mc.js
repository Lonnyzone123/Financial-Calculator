'use strict';
// R42F FLOWS: household and combined conservation on MONTE CARLO paths (the R32F/R40 grids ran simple mode only, and the engine
// checks only the portfolio identity on each path). Each path is one direct simulatePlan() call on the tapped variant, with the
// path's own generators, as runPlan() builds them; the same call on the real engine must give identical rows.
// Usage: node grid3-mc.js [plans] [pathsPerPlan] [seed]
const path = require('path');
const GDIR = (require('path').join(__dirname, '..', '..', '..', '..', '..') + "/audit/S5AA/R40/S5AA_R40_CONSERVATION_GRID");
const L = require(path.join(GDIR, 'lib.js'));
const saved = process.argv.slice(2);
process.argv.length = 2; process.argv.push(String(saved[0] || 100), String(Number(saved[2] || 9001)));
const { genPlan } = require(path.join(GDIR, 'grid.js'));
const NP = Number(saved[0] || 100), PATHS = Number(saved[1] || 5);
const E = L.h.engine, V = L.variant;
const st = { plans: 0, paths: 0, rows: 0, invalid: 0, worst: { portfolio: 0, household: 0, combined: 0 }, cls: {}, fails: [], errPaths: 0 };
for (let k = 0; k < NP; k++) {
  const p = genPlan(k);
  p.assumptions.method = 'monteCarlo'; p.assumptions.volatility = 15;
  p.advanced.assetClasses = [{ id: 'flat', name: 'Flat', returnRate: p.assumptions.returnRate || 6, volatility: 15 }];
  const v = L.h.validateScenario(structuredClone(p));
  if (!v.valid) { st.invalid++; continue; }
  st.plans++;
  for (let i = 0; i < PATHS; i++) {
    const seed = 1000 + i * 2;
    const taps = []; globalThis.__FT = t => taps.push(JSON.parse(JSON.stringify(t)));
    let rv; try { rv = V.simulatePlan(structuredClone(p), V.rng(seed), 0, V.rng(seed + 1), []); } finally { globalThis.__FT = null; }
    const re = E.simulatePlan(structuredClone(p), E.rng(seed), 0, E.rng(seed + 1), []);
    if (JSON.stringify(rv.rows) !== JSON.stringify(re.rows)) throw new Error('tap not neutral');
    if (re.calculationErrorAge !== null) { st.errPaths++; continue; }
    st.paths++;
    const rec = L.reconcile(re, taps, p);
    st.rows += rec.length;
    rec.forEach(q => ['portfolio', 'household', 'combined'].forEach(f => {
      if (Math.abs(q[f]) > st.worst[f]) st.worst[f] = Math.abs(q[f]);
      if (Math.abs(q[f]) > q.tol) { const cls = (f !== 'portfolio' && Math.abs(Math.abs(q[f]) - q.clampGap) <= q.tol) ? 'WAGE_TAX_CLAMP' : 'LEAK'; st.cls[cls] = (st.cls[cls] || 0) + 1; if (cls === 'LEAK') st.fails.push({ k, i, age: q.age, kind: f, residual: q[f] }); }
    }));
  }
}
console.log(JSON.stringify({ NP, PATHS, plans: st.plans, invalid: st.invalid, paths: st.paths, errPaths: st.errPaths, rows: st.rows, worst: st.worst, classes: st.cls, failCount: st.fails.length, firstFails: st.fails.slice(0, 20) }, null, 1));
