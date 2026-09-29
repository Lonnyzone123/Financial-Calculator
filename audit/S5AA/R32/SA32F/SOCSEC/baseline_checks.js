'use strict';
// Baseline checks of the retirement-benefit arithmetic against hand figures (expected to MATCH).
const { single, couple, run, report } = require('./lib.js');
let bad = 0, plans = 0;
// rows[0] is the opening row; rows[i] (i>=1) is the interval ending at rows[i].age, so interval k covers [age+k-1, age+k).
function row(p, i) { plans++; return run(p).rows[i + 1].income; }

// 1. PIA $2,000, FRA 67, claim 62: 60 months early = 36*5/9% + 24*5/12% = 20% + 10% = 30% -> $1,400/mo -> $16,800/yr.
bad += report('claim 62, PIA 2000, first row 62-63', 1400 * 12, row(single({ age: 62, ssBenefit: 2000, ssClaim: 62 }), 0));
// 2. claim 70: 36 months late * 2/3% = 24% -> $2,480/mo -> $29,760.
bad += report('claim 70, row 70-71', 2480 * 12, row(single({ age: 70, ssBenefit: 2000, ssClaim: 70 }), 0));
// 3. claim 64.5: 30 months early * 5/9% = 16.6667% -> 2000*0.833333 = 1666.667/mo -> $20,000/yr.
bad += report('claim 64.5, row 65-66', 2000 * (1 - 30 * 5 / 900) * 12, row(single({ age: 65, ssBenefit: 2000, ssClaim: 64.5 }), 0));
// 4. mid-row start: claim 62.5 (54 months early: 20% + 18*5/12% = 27.5%) paid for half of row 62-63: 2000*.725*12*.5 = 8,700.
bad += report('claim 62.5 prorated in row 62-63', 2000 * 0.725 * 12 * 0.5, row(single({ age: 62, ssBenefit: 2000, ssClaim: 62.5 }), 0));
// 5. FRA 66.5 (entered), claim 62: 54 months: 20% + 7.5% = 27.5% -> 1450/mo.
bad += report('FRA 66.5, claim 62', 1450 * 12, row(single({ age: 62, ssBenefit: 2000, ssClaim: 62, ssFra: 66.5 }), 0));
// 6. COLA after claim: claim 67, COLA 2.8%, row 68-69 is one COLA after the claim: 2000*12*1.028 = 24,672.
bad += report('COLA one year after claim, row 68-69', 24000 * 1.028, row(single({ age: 67, ssBenefit: 2000, ssClaim: 67, ssCola: 2.8 }), 1));
// 7. Earnings test, claim 62 PIA 2000 (16,800/yr), wages 40,000 via employment income: (40,000-24,480)/2 = 7,760 withheld.
{ const p = single({ age: 62, ssBenefit: 2000, ssClaim: 62 });
  p.retirement.otherIncomes = [{ name: 'job', type: 'employment', owner: 'self', amount: 40000, start: 62, end: 63, growth: 0, growthMode: 'fixed' }];
  bad += report('earnings test, wages 40k, row 62-63 income (wages + SS net)', 40000 + 16800 - 7760, row(p, 0)); }
// 8. Survivor at FRA of a deceased who claimed AT FRA: PIA 3000 at 67, self dies at 68.0, spouse 68 (past FRA) own 0.
//    Law: 100% of the deceased's benefit, 36,000/yr (no RIB-LIM since no reduction).
bad += report('survivor, deceased claimed at FRA, row 68-69 (survivor only)', 36000,
  row(couple({ age: 67, spouseAge: 67, ssBenefit: 3000, ssClaim: 67, selfLife: 68 }), 1));
// 9. Survivor starting at 60 (spouse 59 at the death, self dies at 66 after claiming at FRA? use FRA claim 66 -> reduced)
//    Keep deceased at FRA: self 67 claimed 67, dies 68; spouse 60 at the death -> 71.5%: 3000*.715*12 = 25,740.
bad += report('survivor from 60, deceased claimed at FRA, row 68-69', 3000 * 0.715 * 12,
  row(couple({ age: 67, spouseAge: 59, ssBenefit: 3000, ssClaim: 67, selfLife: 68 }), 1));
// 10. Survivor reduction at 63 (SSA "over 80%"): 1 - .285*48/84 = 0.837143
bad += report('survivor from 63, row 68-69', 3000 * (1 - 0.285 * 48 / 84) * 12,
  row(couple({ age: 67, spouseAge: 62, ssBenefit: 3000, ssClaim: 67, selfLife: 68 }), 1));
console.log(`\nplans run: ${plans}; mismatches: ${bad}`);
