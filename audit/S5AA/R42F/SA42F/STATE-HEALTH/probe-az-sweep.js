'use strict';
// Arizona component of estimateTaxes against A.R.S. 43-1022/1023/1041 by hand, across ages, spans, deaths and statuses.
const { h } = require('./common.js');
const E = h.engine;
let seed = 5; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; const pick = a => a[Math.floor(rnd() * a.length)];
const STD = { single: 16100, mfj: 32200, hoh: 24150 };
let n = 0, bad = 0;
for (let t = 0; t < 20000; t++) {
  const spouseOn = rnd() < .6, startAge = pick([60, 63.5, 64, 64.3, 65, 70]), spouseStart = pick([62, 63.8, 64, 64.9, 66]);
  const entered = spouseOn ? pick(['mfj', 'mfj', 'single', 'hoh']) : pick(['single', 'hoh', 'mfj']);
  const selfLife = pick([100, 64.6, 65.2, 66, 70.5]), spouseLife = pick([100, 64.4, 65.5, 67.3]);
  const p = { profile: { age: startAge, spouseOn, spouseAge: spouseStart, filing: entered }, retirement: { selfLife, spouseLife } };
  const age = startAge + pick([0, 0.5, 1, 1.5, 2, 3]), span = pick([1, 0.5, 0.25, 1]);
  const ord = pick([0, 20000, 60000, 150000]), cg = pick([0, 5000, -8000]), ss = pick([0, 30000, 45000]), qd = pick([0, 2000]);
  const x = E.estimateTaxes(p, age, ord, cg, ss, 0, qd, 0, 0, 0, 0, 0, span);
  // law: who is alive at the row's opening (engine convention), filing
  const sAge = age, pAge = spouseStart + (age - startAge);
  const sDead = selfLife < sAge, pDead = spouseOn && spouseLife < pAge;
  let filing = entered; if (entered === 'mfj' && spouseOn && (sDead || pDead)) filing = 'single';
  const closeAge = (a, life) => Math.min(a + span, Math.max(a, life));
  let n65 = 0;
  if (!spouseOn) { if (closeAge(sAge, selfLife) >= 65) n65++; }
  else {
    if (!sDead && closeAge(sAge, selfLife) >= 65) n65++;
    const apart = !sDead && !pDead && filing !== 'mfj';
    if (!pDead && !apart && closeAge(pAge, spouseLife) >= 65) n65++;
  }
  const azAgi = x.measures.federal_agi - x.ssTaxable;
  const exp = 0.025 * Math.max(0, azAgi - STD[filing] - 2100 * n65);
  n++;
  if (Math.abs(x.az - exp) > 0.005) { bad++; if (bad < 10) console.log('MISMATCH', JSON.stringify({ p, age, span, ord, cg, ss, exp, got: x.az, n65, filing })); }
}
console.log('SUMMARY cases=' + n + ' mismatches=' + bad);
