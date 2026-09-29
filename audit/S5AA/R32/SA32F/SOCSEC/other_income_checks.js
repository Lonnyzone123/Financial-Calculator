'use strict';
// Other incomes and the pension field: timing (self vs spouse clocks, start/end proration, death) and tax character.
// Expected to MATCH unless noted.
const { single, couple, run, report } = require('./lib.js');
let bad = 0, plans = 0;
function R(p) { plans++; return run(p); }
const inc = (o) => Object.assign({ name: 'x', owner: 'self', end: 100, growth: 0, growthMode: 'fixed' }, o);

// 1. Spouse-owned pension from the spouse's 65, self 60 / spouse 62 -> starts at self 63. Row self 63-64 = 30,000.
{ const p = couple({ age: 60, spouseAge: 62, years: 5, survivor: false });
  p.retirement.otherIncomes = [inc({ type: 'pension', owner: 'spouse', amount: 30000, start: 65 })];
  const r = R(p);
  bad += report('1a spouse pension, row self 62-63 (spouse 64-65): nothing yet', 0, r.rows[3].income);
  bad += report('1b spouse pension, row self 63-64 (spouse 65-66): full year', 30000, r.rows[4].income); }
// 2. Self-owned stream starting 60.5 and ending 62.5: row 60-61 half, 61-62 full, 62-63 half.
{ const p = single({ age: 60, years: 3 });
  p.retirement.otherIncomes = [inc({ type: 'rental', amount: 12000, start: 60.5, end: 62.5 })];
  const r = R(p);
  bad += report('2a rental start 60.5, row 60-61', 6000, r.rows[1].income);
  bad += report('2b rental end 62.5, row 62-63', 6000, r.rows[3].income); }
// 3. COLA growth on a pension stream starting at 65 with COLA 2.8: row 67-68 = 20,000 * 1.028^2.
{ const p = single({ age: 65, years: 3, ssCola: 2.8 });
  p.retirement.otherIncomes = [inc({ type: 'pension', amount: 20000, start: 65, growthMode: 'cola' })];
  const r = R(p);
  bad += report('3 pension, cola growth, row 67-68', 20000 * 1.028 * 1.028, r.rows[3].income); }
// 4. The retirement.pension field with 2% COLA from retireAge 60: row 62-63 = 30,000 * 1.02^2.
{ const p = single({ age: 60, years: 3 });
  Object.assign(p.retirement, { pension: 30000, pensionCola: 2 });
  const r = R(p);
  bad += report('4 pension field, row 62-63', 30000 * 1.02 * 1.02, r.rows[3].income); }
// 5. Tax character, single 66: pension 30,000 + socialSecurity-type 20,000.
//    Provisional = 30,000 + 10,000 = 40,000; taxable SS = min(0.85*20,000, 0.85*(40,000-34,000) + min(4,500, 10,000))
//    = min(17,000, 5,100 + 4,500) = 9,600 -> AGI 39,600.
{ const p = single({ age: 66, years: 1 });
  p.retirement.otherIncomes = [inc({ type: 'pension', amount: 30000, start: 60 }), inc({ type: 'socialSecurity', amount: 20000, start: 60, growthMode: 'cola' })];
  const r = R(p);
  bad += report('5 AGI pension + SS-type', 39600, r.rows[1].federalAgi); }
// 6. taxFree and oneTimeTaxFree add nothing to AGI; oneTime adds its amount.
{ const p = single({ age: 66, years: 1 });
  p.retirement.otherIncomes = [inc({ type: 'taxFree', amount: 10000, start: 60 }), inc({ type: 'oneTimeTaxFree', amount: 50000, start: 66 }), inc({ type: 'oneTime', amount: 7000, start: 66 })];
  const r = R(p);
  bad += report('6 AGI taxFree+oneTimeTaxFree+oneTime', 7000, r.rows[1].federalAgi); }
// 7. A spouse's employment stream ends at the spouse's death (spouseLife 63.5, spouse 62 at start, self 62):
//    row self 63-64 (spouse 63-64) pays half of 40,000.
{ const p = couple({ age: 62, spouseAge: 62, years: 3, survivor: false, spouseLife: 63.5 });
  p.retirement.otherIncomes = [inc({ type: 'employment', owner: 'spouse', amount: 40000, start: 60, end: 70 })];
  const r = R(p);
  bad += report('7 spouse employment ends at spouse death, row 63-64', 20000, r.rows[2].income); }
// 8. Household SS across a death, both claimed: self 70 PIA 2,000 claimed 67 (no COLA), spouse 70 PIA 1,000 claimed 67,
//    self dies 70.5, survivor on. Row 70-71: both for half (1500 + ... ) = (24,000 + 12,000) * 0.5 + max(12,000, 24,000)*0.5
//    = 18,000 + 12,000 = 30,000. Row 71-72: 24,000 (survivor past FRA, deceased claimed at FRA).
{ const r = R(couple({ age: 70, spouseAge: 70, years: 2, ssBenefit: 2000, ssClaim: 67, spouseSS: 1000, spouseClaim: 67, selfLife: 70.5 }));
  bad += report('8a death row 70-71', 30000, r.rows[1].income);
  bad += report('8b survivor row 71-72', 24000, r.rows[2].income); }
console.log(`\nplans run: ${plans}; mismatches: ${bad}`);
