'use strict';
// S5AA R34 self-audit: every Social Security case of Claude's R32F audit (SOCSEC-01 to -08, LIFE-01/02 A-E, LIFE-05), run through
// the published builders with the R32F repros' own inputs, against expectations worked from the law as R34 builds it -- with
// tests/lib/ssa-reference.js, which does not import src/engine.js. The R32F repros' "hand" figures read every full retirement age
// as the entered 67 and did not round; where that differs from the law, the case says so.
// Run from the repository root: node audit/S5AA/R34/S5AA_R34_SELF_AUDIT_SS_REFERENCE.js
const path = require('path');
const S = require('../R32/SA32F/SOCSEC/lib.js');
const L = require('../R32/SA32F/LIFE-EVENTS/lib.js');
const SSA = require(path.join(__dirname, '..', '..', '..', 'tests', 'lib', 'ssa-reference.js'));

const out = [];
function cmp(id, engine, law, r32f, note) {
  out.push({ id, engine: +engine.toFixed(2), law: +law.toFixed(2), match: Math.abs(engine - law) < 0.005 ? 'yes' : 'NO', r32fHand: r32f, note });
}
const own = (pia, claim, age) => SSA.floorDollar(pia * SSA.claimFactor(claim, SSA.fra(age)));
/* The spouse's excess (20 CFR 404.333, 404.410): half the worker's PIA less the recipient's own, reduced by the start age. */
const excess = (workerPia, ownPia, startAge, age) => SSA.floorDollar(Math.max(0, workerPia / 2 - ownPia) * SSA.spousalFactor(startAge, SSA.fra(age)));
/* The survivor (POMS RS 00615.301/.320): the original benefit (the PIA, or with the delayed credits earned by the death), reduced for the
   survivor's start age; if the deceased took a REDUCED benefit, limited to the larger of it and 82.5% of the PIA. */
function survivor({ pia, deceasedAgeNow, claimedAt, deathAt, survivorAgeNow, startAge }) {
  const f = SSA.fra(deceasedAgeNow);
  const filed = claimedAt !== null && claimedAt < deathAt;
  const ob = filed ? pia * Math.max(1, SSA.claimFactor(claimedAt, f)) : (deathAt > f ? pia * SSA.claimFactor(Math.min(deathAt, 70), f) : pia);
  let amount = ob * SSA.survivorFactor(startAge, SSA.survivorFra(survivorAgeNow));
  if (filed && SSA.claimFactor(claimedAt, f) < 1) amount = Math.min(amount, Math.max(SSA.floorDollar(pia * SSA.claimFactor(claimedAt, f)), 0.825 * pia));
  return SSA.floorDollar(amount);
}

// SOCSEC-01 (couple 67/67, the self's PIA 3,000; the self dies at 68). The self was born 1959 (66y10m): a claim at 62 is 58 months early.
{
  const A = S.run(S.couple({ age: 67, spouseAge: 67, ssBenefit: 3000, ssClaim: 62, selfLife: 68 }));
  cmp('SOCSEC-01 A', A.rows[2].income, survivor({ pia: 3000, deceasedAgeNow: 67, claimedAt: 62, deathAt: 68, survivorAgeNow: 67, startAge: 68 }) * 12, 29700, 'limit 2,475 binds');
  const B = S.run(S.couple({ age: 67, spouseAge: 59, ssBenefit: 3000, ssClaim: 62, selfLife: 68 }));
  cmp('SOCSEC-01 B', B.rows[2].income, survivor({ pia: 3000, deceasedAgeNow: 67, claimedAt: 62, deathAt: 68, survivorAgeNow: 59, startAge: 60 }) * 12, 25740, '71.5% of the PIA, under the limit');
  const C = S.run(S.couple({ age: 67, spouseAge: 67, ssBenefit: 3000, ssClaim: 64, selfLife: 68 }));
  cmp('SOCSEC-01 C', C.rows[2].income, survivor({ pia: 3000, deceasedAgeNow: 67, claimedAt: 64, deathAt: 68, survivorAgeNow: 67, startAge: 68 }) * 12, 29700, 'R32F read 36 months early; a 1959 birth is 34');
}
// SOCSEC-02 (the self 64, born 1962, PIA 3,000, planned claim 67, dies at 65 unfiled; the spouse 66 -> 67 at the death).
{
  const A = S.run(S.couple({ age: 64, spouseAge: 66, ssBenefit: 3000, ssClaim: 67, selfLife: 65 }));
  cmp('SOCSEC-02 A', A.rows[2].income, survivor({ pia: 3000, deceasedAgeNow: 64, claimedAt: null, deathAt: 65, survivorAgeNow: 66, startAge: 67 }) * 12, 36000, '');
  const B = S.run(S.couple({ age: 64, spouseAge: 66, ssBenefit: 3000, ssClaim: 67, spouseSS: 1000, spouseClaim: 67, selfLife: 65 }));
  cmp('SOCSEC-02 B', B.rows[2].income, Math.max(own(1000, 67, 66), survivor({ pia: 3000, deceasedAgeNow: 64, claimedAt: null, deathAt: 65, survivorAgeNow: 66, startAge: 67 })) * 12, 36000, 'own + excess = the larger');
}
// SOCSEC-03 (the worker 67, born 1959: a claim at 67 is 2 months past 66y10m).
{
  const W = own(3000, 67, 67);
  const A = S.run(S.couple({ age: 67, spouseAge: 67, ssBenefit: 3000, ssClaim: 67, spouseSS: 0, spouseClaim: 67, survivor: false }));
  cmp('SOCSEC-03 A', A.rows[1].income, (W + excess(3000, 0, 67, 67)) * 12, 54000, 'R32F read FRA 67: the worker is 3,040, not 3,000');
  const B = S.run(S.couple({ age: 67, spouseAge: 67, ssBenefit: 3000, ssClaim: 67, spouseSS: 600, spouseClaim: 67, survivor: false }));
  cmp('SOCSEC-03 B', B.rows[1].income, (W + own(600, 67, 67) + excess(3000, 600, 67, 67)) * 12, 54000, 'own 608 + excess 900');
  const C1 = S.run(S.couple({ age: 67, spouseAge: 62, ssBenefit: 3000, ssClaim: 67, spouseSS: 1500, spouseClaim: 62, survivor: false }));
  cmp('SOCSEC-03 C1', C1.rows[1].income, (W + own(1500, 62, 62) + excess(3000, 1500, 62, 62)) * 12, 47700, 'the workaround enters 1,500 as an OWN PIA, and the engine now reads it as one');
  const C2 = S.run(S.couple({ age: 67, spouseAge: 70, ssBenefit: 3000, ssClaim: 67, spouseSS: 1500, spouseClaim: 70, survivor: false }));
  cmp('SOCSEC-03 C2', C2.rows[1].income, (W + own(1500, 70, 70) + excess(3000, 1500, 70, 70)) * 12, 54000, 'as C1; a 1956 birth earns 44 months of credit');
}
// SOCSEC-04 (single, 62, born 1964; COLA 2.8%; claim 67). Today's dollars (decision 3): five COLA steps to the claim, each to the dime.
{
  const p = S.single({ age: 62, years: 7, ssClaim: 67, ssCola: 2.8, inflation: 2.8 });
  p.retirement.ssAdvanced = true; p.retirement.aime = 6000;
  const r = S.run(p);
  cmp('SOCSEC-04 AIME 67-68', r.rows[6].income, SSA.floorDollar(SSA.colaPia(SSA.pia(6000), 0.028, 5)) * 12, 36727.17, 'R32F did not round');
  cmp('SOCSEC-04 AIME 68-69', r.rows[7].income, SSA.floorDollar(SSA.colaPia(SSA.pia(6000), 0.028, 6)) * 12, 37755.53, 'R32F did not round');
  const q = S.run(S.single({ age: 62, years: 6, ssBenefit: 2000, ssClaim: 67, ssCola: 2.8, inflation: 2.8 }));
  cmp('SOCSEC-04 entered 67-68', q.rows.find((x) => Math.abs(x.age - 68) < 1e-9).income, SSA.floorDollar(SSA.colaPia(2000, 0.028, 5)) * 12, 27553.5, 'today\'s dollars from the plan start');
}
// SOCSEC-05 (the self 60; the spouse 68, born 1958, 66y8m, PIA 2,000).
{
  const A = S.run(S.couple({ age: 60, spouseAge: 68, spouseSS: 2000, spouseClaim: 70, ssBenefit: 0, survivor: false }));
  cmp('SOCSEC-05 A', A.rows[3].income, own(2000, 70, 68) * 12, 30400, 'rounded to the dollar');
  const B = S.run(S.couple({ age: 60, spouseAge: 68, spouseSS: 2000, spouseClaim: 62, ssBenefit: 0, survivor: false }));
  cmp('SOCSEC-05 B', B.rows[1].income, own(2000, 62, 68) * 12, 17200, 'rounded to the dollar');
}
// SOCSEC-06 and -07.
{
  const p = S.single({ age: 62, ssBenefit: 2000, ssClaim: 62 });
  p.retirement.otherIncomes = [{ name: 'business', type: 'selfEmployment', owner: 'self', amount: 50000, start: 62, end: 63, growth: 0, growthMode: 'fixed' }];
  cmp('SOCSEC-06', S.run(p).rows[1].income - 50000, own(2000, 62, 62) * 12 - (50000 * 0.9235 - 24480) / 2, 5952.5, 'SS paid');
  const g = S.single({ age: 62, years: 2, ssBenefit: 2000, ssClaim: 62.5 });
  g.profile.retireAge = 62.5;
  Object.assign(g.employment, { salary: 60000, growth: 0, contributionStop: 62.5 });
  cmp('SOCSEC-07', S.run(g).rows[1].income - 30000, own(2000, 62.5, 62) * 6, 8700, 'SS paid, no months withheld');
}
// SOCSEC-08.
{
  cmp('SOCSEC-08 ssFra 60', S.run(S.single({ age: 62, ssBenefit: 2000, ssClaim: 62, ssFra: 60 })).rows[1].income, own(2000, 62, 62) * 12, 16800, '');
  cmp('SOCSEC-08 ssFra 75', S.run(S.single({ age: 70, ssBenefit: 2000, ssClaim: 70, ssFra: 75 })).rows[1].income, own(2000, 70, 70) * 12, 29760,
    'R32F ERROR: a 70-year-old was born 1956 (66y4m), 44 months of credit, not 36');
}
// LIFE-01/02 (L.couple; ssCola 0).
function lifeRow(p, age) { const r = L.run(p); return r.rows.find((x) => Math.abs(x.age - (age + 1)) < 1e-9).income; }
{
  const A = L.couple({ profile: { age: 68, spouseAge: 64, endAge: 72 }, retirement: { ssBenefit: 1000, ssClaim: 67, spouseSS: 3000, spouseClaim: 70, spouseLife: 65 } });
  cmp('LIFE A', lifeRow(A, 69), survivor({ pia: 3000, deceasedAgeNow: 64, claimedAt: null, deathAt: 65, survivorAgeNow: 68, startAge: 69 }) * 12, 36000, '');
  const B = L.couple({ profile: { age: 68, spouseAge: 64, endAge: 72 }, retirement: { ssBenefit: 1000, ssClaim: 67, spouseSS: 3000, spouseClaim: 62, spouseLife: 65 } });
  cmp('LIFE B', lifeRow(B, 69), survivor({ pia: 3000, deceasedAgeNow: 64, claimedAt: 62, deathAt: 65, survivorAgeNow: 68, startAge: 69 }) * 12, 29700, '');
  const C = L.couple({ profile: { age: 60, spouseAge: 62, endAge: 63, retireAge: 60 }, employment: { contributionStop: 60 }, retirement: { ssBenefit: 1000, ssClaim: 67, spouseSS: 3000, spouseClaim: 62, spouseLife: 63 } });
  cmp('LIFE C', lifeRow(C, 61), survivor({ pia: 3000, deceasedAgeNow: 62, claimedAt: 62, deathAt: 63, survivorAgeNow: 60, startAge: 61 }) * 12, 27205.71, 'rounded to the dollar');
  const D = L.couple({ profile: { age: 71, spouseAge: 70, endAge: 74 }, retirement: { ssBenefit: 1000, ssClaim: 67, spouseSS: 3000, spouseClaim: 70, spouseLife: 71 } });
  cmp('LIFE D', lifeRow(D, 72), survivor({ pia: 3000, deceasedAgeNow: 70, claimedAt: 70, deathAt: 71, survivorAgeNow: 71, startAge: 72 }) * 12, 44640, 'R32F read FRA 67; a 1956 birth earns 44 months');
  const E = L.couple({ profile: { age: 68, spouseAge: 66, endAge: 70 }, retirement: { ssBenefit: 800, ssClaim: 67, spouseSS: 2500, spouseClaim: 67, spouseLife: 60 } });
  cmp('LIFE E', lifeRow(E, 68), Math.max(own(800, 67, 68), survivor({ pia: 2500, deceasedAgeNow: 66, claimedAt: null, deathAt: 60, survivorAgeNow: 68, startAge: 62 })) * 12, 23892.86,
    'survivor full retirement age 66y4m for a 1958 birth, not 67');
}
// LIFE-05: a Social Security stream owned by the spouse, who dies at 72.
{
  const p = L.couple({ profile: { age: 70, spouseAge: 70, retireAge: 60, endAge: 76 }, retirement: { spouseLife: 72, spending: 0, survivor: false,
    otherIncomes: [{ name: 'Spouse benefit', type: 'socialSecurity', owner: 'spouse', amount: 24000, start: 0, end: 200, growth: 0, growthMode: 'fixed' }] } });
  const r = L.run(p);
  for (const age of [72, 73]) cmp('LIFE-05 row closing ' + age, r.rows.find((x) => Math.abs(x.age - age) < 1e-9).income, age <= 72 ? 24000 : 0, age <= 72 ? 24000 : 0, '');
}
console.table(out);
const bad = out.filter((x) => x.match !== 'yes').length;
console.log('cases: ' + out.length + '; mismatches against the law as built: ' + bad);
process.exitCode = bad ? 1 : 0;
