'use strict';
// LIFE-01 / LIFE-02: the Social Security survivor benefit amount after a death.
// Run: node repro-LIFE-01-02-ss-survivor.js
const L = require('./lib.js');
function rowIncome(p, age) {
  const c = L.check(p); if (!c.valid) throw new Error(JSON.stringify(c.errs));
  const r = L.run(p);
  const row = r.rows.find(x => Math.abs(x.age - (age + 1)) < 1e-9); // a row is labelled by its closing age
  return { status: r.status, income: row.income, codes: r.issues.map(i => i.code).filter(c => /SURVIVOR/.test(c)) };
}
const out = [];
function cmp(label, got, expected) { out.push({ label, engine: +got.toFixed(2), hand: +expected.toFixed(2), diff: +(got - expected).toFixed(2) }); }
// Case A: the deceased dies at 65 before claiming (planned claim 70). PIA $3,000/mo. Survivor is 69 (past FRA 67).
const A = L.couple({ profile: { age: 68, spouseAge: 64, endAge: 72 },
  retirement: { ssBenefit: 1000, ssClaim: 67, spouseSS: 3000, spouseClaim: 70, spouseLife: 65 } });
// hand: 42 USC 402(e)(2)(A) widow benefit = deceased PIA = 3000*12 = 36,000; survivor at/after FRA so no age reduction;
// no RIB-LIM (the deceased never had a reduced benefit). Survivor receives the larger: 36,000.
cmp('A died-before-claim, survivor row [69,70)', rowIncome(A, 69).income, 36000);
// Case B: the deceased claimed at 62 (70% of PIA = 2,100/mo = 25,200/yr) and dies at 65; survivor 69.
const B = L.couple({ profile: { age: 68, spouseAge: 64, endAge: 72 },
  retirement: { ssBenefit: 1000, ssClaim: 67, spouseSS: 3000, spouseClaim: 62, spouseLife: 65 } });
// hand: OB = 36,000 (100% of PIA), no age reduction at 69; RIB-LIM = max(25,200, 0.825*36,000 = 29,700) = 29,700;
// paid = min(36,000, 29,700) = 29,700 (POMS RS 00615.320).
cmp('B early-claim deceased, survivor past FRA, row [69,70)', rowIncome(B, 69).income, 29700);
// Case C: survivor 61 when the deceased (claimed at 62, 25,200/yr) dies at 63. Engine's own linear factor:
const f61 = 1 - 0.285 * ((67 - 61) * 12) / ((67 - 60) * 12); // 0.755714...
const C = L.couple({ profile: { age: 60, spouseAge: 62, endAge: 63, retireAge: 60 }, employment: { contributionStop: 60 },
  retirement: { ssBenefit: 1000, ssClaim: 67, spouseSS: 3000, spouseClaim: 62, spouseLife: 63 } });
// hand: reduction applies to OB (POMS RS 00615.301): 36,000 * 0.755714 = 27,205.71; RIB-LIM 29,700 does not bind.
cmp('C early-claim deceased, survivor 61, row [61,62)', rowIncome(C, 61).income, 36000 * f61);
// Control D: the deceased claimed at 70 (124%), survivor past FRA: OB includes DRCs = 3000*1.24*12 = 44,640.
const D = L.couple({ profile: { age: 71, spouseAge: 70, endAge: 74 },
  retirement: { ssBenefit: 1000, ssClaim: 67, spouseSS: 3000, spouseClaim: 70, spouseLife: 71 } });
cmp('D control: delayed-claim deceased, row [72,73)', rowIncome(D, 72).income, 44640);
// Case E: a widow(er) whose spouse died BEFORE the plan starts, at 60, never having claimed (PIA $2,500/mo). Self is 68,
// own PIA $800 claimed at 67 (9,600/yr). The spouse would be 66 now, so the death was when self was 62.
// hand, keeping the engine's own start-age convention (survivor benefit taken at the survivor's age at the death, 62, and
// fixed there): factor(62) = 1 - 0.285*60/84 = 0.796429; 2,500*12*0.796429 = 23,892.86 > own 9,600 -> 23,892.86.
const E = L.couple({ profile: { age: 68, spouseAge: 66, endAge: 70 },
  retirement: { ssBenefit: 800, ssClaim: 67, spouseSS: 2500, spouseClaim: 67, spouseLife: 60 } });
cmp('E spouse died before plan start, never claimed, row [68,69)', rowIncome(E, 68).income, 2500 * 12 * (1 - 0.285 * 60 / 84));
console.table(out);
console.log('warnings on B:', rowIncome(B, 69).codes.join(','));
