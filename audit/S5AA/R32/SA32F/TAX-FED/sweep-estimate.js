// Sweep engine estimateTaxes() against the independent reference in ref.js over a grid of isolated inputs.
'use strict';
const h = require('../harness.js');
const ref = require('./ref.js');
const E = h.engine;
function P(f, age, spouseAge) {
  const spouseOn = spouseAge !== undefined;
  return { profile: { filing: f, age, spouseOn, spouseAge: spouseOn ? spouseAge : age }, retirement: { selfLife: 110, spouseLife: 110 } };
}
let n = 0, bad = [];
function check(label, f, age, spouseAge, x) {
  const p = P(f, age, spouseAge);
  const e = E.estimateTaxes(p, age, x.ordinary || 0, x.gains || 0, x.ss || 0, x.wages || 0, x.qd || 0, 0, x.seSelf || 0, 0, x.niiOther || 0, x.carry || 0);
  const r = ref.federal(Object.assign({ f, ages: [age, spouseAge === undefined ? -1 : spouseAge] }, x));
  n++;
  const d = { federal: e.federal - r.incomeTax, niit: e.niit - r.niit, agi: e.measures.federal_agi - r.agi, ss: e.ssTaxable - r.ssTaxable, carry: (e.capitalLossCarryOut || 0) - r.carryOut };
  const worst = Object.entries(d).filter(([k, v]) => Math.abs(v) > 0.005);
  if (worst.length) bad.push({ label, f, age, spouseAge, x, diffs: Object.fromEntries(worst), engineFederal: e.federal, refFederal: r.incomeTax, refLine23: r.incomeTaxNoLine25 });
}
const statuses = ['single', 'mfj', 'hoh'];
for (const f of statuses) {
  for (const ages of [[60, undefined], [70, undefined], [70, 68], [70, 60], [60, 70]]) {
    if (f !== 'mfj' && ages[1] !== undefined) continue;
    for (const ordinary of [0, 10000, 30000, 49450 + 16100, 60000, 98900 + 32200, 120000, 180000, 260000, 600000, 900000])
      for (const qd of [0, 950, 1900, 5000, 40000])
        for (const gains of [0, 3000, 20000, 150000, 700000])
          for (const ss of [0, 20000, 45000])
            check('grid', f, ages[0], ages[1], { ordinary, qd, gains, ss });
    for (const carry of [1000, 5000, 50000]) for (const gains of [0, 2000, 60000]) for (const ordinary of [0, 5000, 20000, 80000]) for (const ss of [0, 30000])
      check('loss', f, ages[0], ages[1], { ordinary, gains, carry, ss, qd: 2000 });
  }
}
console.log(JSON.stringify({ checked: n, mismatches: bad.length }));
const byKey = {};
for (const b of bad) { const k = Object.keys(b.diffs).join('+') + '|' + b.f; (byKey[k] = byKey[k] || []).push(b); }
for (const [k, list] of Object.entries(byKey)) {
  console.log('== ' + k + ' count ' + list.length);
  list.slice(0, 4).forEach(b => console.log(JSON.stringify(b)));
}
console.log('TERMINATOR sweep-estimate done');
