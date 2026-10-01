/* S5AA R44.1 (ChatGPT's R44-01): is the corrected part 2 scan's EXPOSURE test alone (the IRMAA guard flips between the old and new joint
   tables at a path's latest MAGI, 63 or over, an optimized order with the guard on, a joint return) a superset of the paths that actually
   changed? Usage: node audit/S5AA/R44.1/exposure_superset_check.js <d11017f tree> <b131aeb tree>
   For both Monte Carlo plans the scan named: the paths the exposure test flags, the paths that changed (simulated on both trees with that
   part's seeding, seed + 2i and + 2i + 1), and whether every changed path is flagged. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
function load(root) {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  const SHELL = fs.readFileSync(path.join(root, 'src', 'app-shell.html'), 'utf8');
  global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
  const cap = require(path.join(root, 'tools', 'capture-baseline.js')); cap.installDebtModules();
  return { E: require(path.join(root, 'src', 'engine.js')), cap, BASE: global.RULES };
}
const [pre, post] = process.argv.slice(2).map((x) => path.resolve(x));
const names = ['golden:monte-carlo-fixed-seed', 'expansion:monte-carlo-sensitive-band'];
const sim = (X, p, i) => { const s = Number(p.assumptions.seed); return X.E.simulatePlan(JSON.parse(JSON.stringify(p)), X.E.rng(s + 2 * i), 0, X.E.rng(s + 2 * i + 1), []).rows; };
let X = load(pre);
const plans = Object.fromEntries(names.map((n) => [n, X.cap.corpusWithDiagnostics({ composition: 'expanded' }).entries.find((e) => e.name === n).plan]));
const pre1 = {}, exposed = {};
for (const n of names) {
  const p = plans[n], r = p.retirement, infl = Number(p.assumptions.inflation) / 100, W = Math.max(10000, (Number(r.spending) || 0) * 0.35);
  pre1[n] = []; exposed[n] = [];
  for (let i = 0; i < p.assumptions.runs; i++) {
    const rows = sim(X, p, i); pre1[n].push(JSON.stringify(rows));
    for (let k = 2; k < rows.length; k++) {
      const age = rows[k - 1].age;
      if (!(r.withdrawalOrder === 'optimized' && r.irmaaGuard && X.E.householdFilingFor(p, age) === 'mfj' && age >= 63 && infl !== 0)) continue;
      const yr = k - 1, R0 = X.E.taxYearRules(X.BASE, Math.pow(1 + infl, yr), Math.pow(1 + (Number(p.employment.growth) || 0) / 100, yr), yr, 1 + infl);
      const oldJ = R0.medicare.irmaa.jointThresholds, sing = R0.medicare.irmaa.singleThresholds, newJ = oldJ.map((x, j) => (j < sing.length - 1 ? 2 * sing[j] : x));
      const m = Number(rows[k - 1].magi) || 0, guard = (T) => ((T.find((x) => x > m) || Infinity) - m < W);
      if (guard(oldJ) !== guard(newJ)) { exposed[n].push(i); break; }
    }
  }
}
X = load(post);
for (const n of names) {
  const p = plans[n], changed = [];
  for (let i = 0; i < p.assumptions.runs; i++) if (JSON.stringify(sim(X, p, i)) !== pre1[n][i]) changed.push(i);
  const missed = changed.filter((i) => !exposed[n].includes(i));
  console.log(n + ': exposure test flags ' + exposed[n].length + ' of ' + p.assumptions.runs + ' paths; ' + changed.length + ' changed (' + changed.join(',') + '); every changed path flagged: ' + (missed.length === 0) + (missed.length ? ' (missed ' + missed.join(',') + ')' : ''));
}
