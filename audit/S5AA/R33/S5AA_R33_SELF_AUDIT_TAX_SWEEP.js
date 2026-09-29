// S5AA R33 self-audit sweep: estimateTaxes() against the independent reference (S5AA_R33_SELF_AUDIT_TAX_REFERENCE.js) over a grid
// of isolated returns -- the R32F TAX-FED grid, plus married couples on single and head-of-household returns (SA32F-33), and loss
// carryovers in low-income senior years (SA32F-34, R32V-02). Ages are passed as the ages tested (no row span).
//   node audit/S5AA/R33/S5AA_R33_SELF_AUDIT_TAX_SWEEP.js [another checkout]
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..'));
const shell = fs.readFileSync(path.join(ROOT, 'src/app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools/capture-baseline.js')).installDebtModules();
const E = require(path.join(ROOT, 'src/engine.js'));
const ref = require('./S5AA_R33_SELF_AUDIT_TAX_REFERENCE.js');
function P(f, age, spouseAge) {
  const spouseOn = spouseAge !== undefined;
  return { profile: { filing: f, age, spouseOn, spouseAge: spouseOn ? spouseAge : age }, retirement: { selfLife: 110, spouseLife: 110 } };
}
let n = 0;
const bad = [];
function check(label, f, age, spouseAge, x) {
  const e = E.estimateTaxes(P(f, age, spouseAge), age, x.ordinary || 0, x.gains || 0, x.ss || 0, 0, x.qd || 0, 0, 0, 0, 0, x.carry || 0);
  const r = ref.federal(Object.assign({ f, ages: [age, spouseAge === undefined ? -1 : spouseAge], married: spouseAge !== undefined }, x));
  n++;
  const d = { federal: e.federal - r.incomeTax, niit: e.niit - r.niit, agi: e.measures.federal_agi - r.agi, ss: e.ssTaxable - r.ssTaxable,
    carry: (e.capitalLossCarryOut || 0) - r.carryOut };
  const worst = Object.entries(d).filter(([, v]) => Math.abs(v) > 0.005);
  if (worst.length) bad.push({ label, f, age, spouseAge, x, diffs: Object.fromEntries(worst) });
}
for (const f of ['single', 'mfj', 'hoh']) {
  for (const ages of [[60, undefined], [70, undefined], [70, 68], [70, 60], [60, 70]]) {
    for (const ordinary of [0, 10000, 30000, 49450 + 16100, 60000, 98900 + 32200, 120000, 180000, 260000, 600000, 900000])
      for (const qd of [0, 950, 1900, 5000, 40000])
        for (const gains of [0, 3000, 20000, 150000, 700000])
          for (const ss of [0, 20000, 45000])
            check('grid', f, ages[0], ages[1], { ordinary, qd, gains, ss });
    for (const carry of [1000, 5000, 10000, 50000]) for (const gains of [0, 2000, 60000]) for (const ordinary of [0, 5000, 20000, 80000]) for (const ss of [0, 30000])
      check('loss', f, ages[0], ages[1], { ordinary, gains, carry, ss, qd: 2000 });
  }
}
const kinds = {};
for (const b of bad) { const k = b.label + ':' + Object.keys(b.diffs).join('+') + (b.spouseAge !== undefined && b.f !== 'mfj' ? ':married-apart' : ''); kinds[k] = (kinds[k] || 0) + 1; }
console.log(JSON.stringify({ root: path.basename(ROOT), checked: n, mismatches: bad.length, kinds }));
bad.slice(0, 3).forEach((b) => console.log(JSON.stringify(b)));
console.log(bad.length ? 'SWEEP FAILED' : 'SWEEP PASSED');
process.exitCode = bad.length ? 1 : 0;
