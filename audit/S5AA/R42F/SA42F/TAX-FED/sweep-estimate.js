'use strict';
// Random sweep: engine estimateTaxes() vs the independent reference (ref.js), at 2026 rules and at indexed later-year rules.
const h = require('../harness.js'); const ref = require('./ref.js'); const E = h.engine;
const N = Number(process.argv[2] || 40000); let seed = Number(process.argv[3] || 42);
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const base = h.RULES; let mism = 0, n = 0; const worst = {};
const fields = ['fed', 'niit', 'payroll', 'agi', 'carryOut'];
for (let i = 0; i < N; i++) {
  const indexed = rnd() < 0.4;
  const yrs = indexed ? pick([1, 2, 5, 10, 17, 30]) : 0, infl = pick([0.02, 0.025, 0.03, 0.041]), wg = pick([0.0, 0.03, 0.045]);
  const f = Math.pow(1 + infl, yrs), w = Math.pow(1 + wg, yrs);
  global.RULES = indexed ? E.taxYearRules(base, f, w, yrs, 1 + infl) : base;
  const C = indexed ? ref.idx(f, w) : ref.B26;
  const fs = pick(['single', 'mfj', 'hoh', 'mfj', 'single']); const spouseOn = rnd() < 0.6;
  const A = pick([55, 60, 63.5, 64, 64.5, 64.75, 65, 70, 80]), S = pick([55, 62, 64.2, 64.6, 65, 70, 75]);
  const span = pick([1, 1, 1, 0.5, 0.25, 0.9]);
  const deathCase = pick(['none', 'none', 'spouseBefore', 'spouseInRow', 'selfInRow']);
  let selfLife = 120, spouseLife = 120;
  if (deathCase === 'spouseBefore') spouseLife = S - 0.5;
  if (deathCase === 'spouseInRow') spouseLife = S + span * 0.4;
  if (deathCase === 'selfInRow') selfLife = A + span * 0.6;
  const p = { profile: { filing: fs, age: A, spouseOn, spouseAge: S }, retirement: { selfLife, spouseLife } };
  const wS = pick([0, 0, 40000, 150000, 190000, 260000]), wP = spouseOn ? pick([0, 0, 30000, 90000, 200000]) : 0;
  const def = pick([0, 0, 10000, 23000]);
  const seS = pick([0, 0, 0, 300, 20000, 120000, 250000]), seP = spouseOn ? pick([0, 0, 15000, 160000]) : 0;
  const other = pick([0, 10000, 30000, 60000, 110000, 300000, 900000]);
  const qd = pick([0, 0, 2000, 15000, 60000]), cg = pick([0, 0, 1000, 30000, 200000, 700000, -1500, -9000]);
  const carry = pick([0, 0, 0, 2000, 8000, 40000]), ss = pick([0, 0, 18000, 30000, 52000]), nii = pick([0, 0, 12000, 80000]);
  const ordinary = Math.max(0, wS + wP - def) + seS + seP + other;
  const tOpen = A, sAlive = selfLife >= A, pAlive = spouseOn && spouseLife >= S;
  const sAge = sAlive ? Math.min(A + span, Math.max(A, selfLife)) : null, pAge = pAlive ? Math.min(S + span, Math.max(S, spouseLife)) : null;
  let rfs = fs; if (fs === 'mfj' && spouseOn && (!sAlive || !pAlive)) rfs = 'single';
  const apart = spouseOn && sAlive && pAlive && fs !== 'mfj';
  const ages = spouseOn ? [sAge, pAge] : [sAge];
  const r = ref.federal({ fs: rfs, apart, ages, ordinary, wagesSelf: wS, wagesSpouse: wP, seSelf: seS, seSpouse: seP, qd, cg, carry, ss, niiOther: nii, C });
  const e = E.estimateTaxes(p, A, ordinary, cg, ss, wS + wP, qd, wP, seS, seP, nii, carry, span);
  const ev = { fed: e.federal, niit: e.niit, payroll: e.payroll, agi: e.measures.federal_agi, carryOut: e.capitalLossCarryOut };
  n++; let bad = false;
  for (const k of fields) { const d = ev[k] - r[k]; if (Math.abs(d) > 0.01) { bad = true; if (!worst[k] || Math.abs(d) > Math.abs(worst[k].d)) worst[k] = { d, case: { indexed, yrs, infl, wg, fs, spouseOn, A, S, span, deathCase, wS, wP, def, seS, seP, other, qd, cg, carry, ss, nii }, eng: ev[k], ref: r[k] }; } }
  if (bad) mism++;
}
global.RULES = base;
console.log(JSON.stringify(worst, null, 1));
console.log(`cases ${n}, mismatches ${mism}`);
console.log('SWEEP DONE');
