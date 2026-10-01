'use strict';
// STATE-HEALTH-03: a retired spouse aged 65+ is charged no Medicare (Part B, Part D, deductible, IRMAA) while the SELF still
// works, because the whole health block is gated on the self's retired span. Swapping the two people charges it.
// MODEL_ASSUMPTIONS 18.4: "each person 65 or over is charged Medicare"; Q121 / D-6: health costs are chosen per person,
// "not keyed to the self's age". Run: node repro-STATE-HEALTH-03-medicare-gated-on-self-retirement.js
const { h, base, income, check, row, cmp, summary } = require('./common.js');
const MED = 202.90 * 12 + 283 + 38.99 * 12; // 3,185.68: standard Part B, deductible, Part D base (no IRMAA in plan years 0-1)
// A: self 60, working to 67 (salary 80,000); spouse 68, retired.
const a = base({ age: 60, endAge: 63, retireAge: 67, filing: 'mfj', spouseOn: true, spouseAge: 68 });
Object.assign(a.employment, { salary: 80000, contributionStop: 101 });
Object.assign(a.advanced, { healthOn: true, healthCost: 0, healthInflation: 0 });
// B: the same household with the two people swapped (one shared retireAge 67, read on each person's own clock):
// self 68 retired; spouse 60 working to 67 (salary 80,000).
const b = base({ age: 68, endAge: 71, retireAge: 67, filing: 'mfj', spouseOn: true, spouseAge: 60 });
Object.assign(b.employment, { spouseSalary: 80000, contributionStop: 101 });
Object.assign(b.advanced, { healthOn: true, healthCost: 0, healthInflation: 0 });
const ra = check(a), rb = check(b);
for (let k = 1; k <= 3; k++) {
  cmp('A row ' + ra.rows[k].age + ': the retired 68-year-old spouse\'s Medicare', ra.rows[k].spending, MED);
  cmp('B row ' + rb.rows[k].age + ': the retired 68-year-old self\'s Medicare (control)', rb.rows[k].spending, MED);
}
// With the entered pre-Medicare cost at 12,000: B also charges the WORKING 60-year-old spouse a 6,000 share, A charges the
// working 60-year-old self nothing -- the same person, priced differently by role.
a.advanced.healthCost = 12000; b.advanced.healthCost = 12000;
console.log('   with healthCost 12,000: A row 61 spending ' + check(a).rows[1].spending.toFixed(2) + ' | B row 69 spending ' + check(b).rows[1].spending.toFixed(2));
summary();
// Proof the two households are mirrors: same wages and taxes in each row.
for (let k = 1; k <= 3; k++) console.log('   mirror check row ' + k + ': A taxes ' + ra.rows[k].taxes.toFixed(2) + ' / B taxes ' + rb.rows[k].taxes.toFixed(2) + ' ; A contributions ' + ra.rows[k].contributions + ' / B ' + rb.rows[k].contributions);
