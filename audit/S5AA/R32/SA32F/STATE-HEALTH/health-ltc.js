'use strict';
// Health and LTC cost modelling. spending 0, so the row's `spending` is health + LTC only. Income below the IRMAA tiers.
const { base, income, check, row, cmp, summary } = require('./common.js');
const MED = 202.90 * 12 + 283; // 2,717.80 per person, 2026 Part B standard + deductible (CMS 2026 fact sheet)

// H1: single, 63 -> 67, healthCost 12,000, healthInflation 5%. Pre-Medicare rows: 12,000 x 1.05^t (t = years since plan start).
// Row opening 63: 12,000; 64: 12,600; 65: Medicare 2,717.80; 66: Medicare 2,717.80 (Medicare is not inflated: the app's
// "Fixed tax-year boundary" card says Medicare calculations use the stored 2026 rules).
{
  const p = base({ age: 63, endAge: 67, retireAge: 60 });
  Object.assign(p.advanced, { healthOn: true, healthCost: 12000, healthInflation: 5 });
  income(p, 'pension', 40000);
  const r = check(p);
  cmp('H1 opens 63: pre-Medicare 12,000', row(r, 64).spending, 12000);
  cmp('H1 opens 64: 12,000 x 1.05', row(r, 65).spending, 12600);
  cmp('H1 opens 65: Medicare only', row(r, 66).spending, MED);
  cmp('H1 opens 66: Medicare only (not inflated)', row(r, 67).spending, MED);
}
// H2: couple MFJ, self 64, spouse 65, healthCost 12,000, 0% inflation: self carries 12,000/2 = 6,000; spouse Medicare 2,717.80.
// Next row both 65+: 2 x 2,717.80 = 5,435.60.
{
  const p = base({ age: 64, endAge: 66, filing: 'mfj', spouseOn: true, spouseAge: 65, retireAge: 60 });
  Object.assign(p.advanced, { healthOn: true, healthCost: 12000, healthInflation: 0 });
  income(p, 'pension', 60000);
  const r = check(p);
  cmp('H2 self 64 / spouse 65: 6,000 + 2,717.80', row(r, 65).spending, 6000 + MED);
  cmp('H2 both 65+: 2 x 2,717.80', row(r, 66).spending, 2 * MED);
  // swap owners
  const q = base({ age: 65, endAge: 67, filing: 'mfj', spouseOn: true, spouseAge: 64, retireAge: 60 });
  Object.assign(q.advanced, { healthOn: true, healthCost: 12000, healthInflation: 0 });
  income(q, 'pension', 60000);
  const rq = check(q);
  cmp('H2s swapped (self 65 / spouse 64)', row(rq, 66).spending, 6000 + MED);
}
// H3: health cost is not deductible and does not change tax: taxes with healthOn equal taxes with healthOff when paid from
// cash with 100% basis. Single 60, pension 50,000: taxes 4,667.50 (fed 3,820 + AZ 847.50).
{
  const p = base({ age: 60, endAge: 61 });
  Object.assign(p.advanced, { healthOn: true, healthCost: 30000, healthInflation: 0 });
  income(p, 'pension', 50000);
  const r = check(p);
  cmp('H3 taxes unchanged by health cost', row(r, 61).taxes, 4667.50);
  cmp('H3 spending = health 30,000', row(r, 61).spending, 30000);
}
// H4: LTC deterministic mode. ltcStart = max(65, round(retireAge + 10)) = 70 for retireAge 60; weight = probability.
// ltcCost 100,000, insurance 20,000, probability 25%, years 3: (100,000 - 20,000) x 0.25 = 20,000 for rows opening 70, 71, 72.
{
  const p = base({ age: 69, endAge: 74, retireAge: 60 });
  Object.assign(p.advanced, { ltcOn: true, ltcCost: 100000, ltcInsurance: 20000, ltcProbability: 25, ltcYears: 3 });
  income(p, 'pension', 40000);
  const r = check(p);
  r.rows.forEach(x => console.log('   H4 row closing ' + x.age + ' spending ' + x.spending.toFixed(2)));
  cmp('H4 opens 69: none', row(r, 70).spending, 0);
  cmp('H4 opens 70: 20,000', row(r, 71).spending, 20000);
  cmp('H4 opens 72: 20,000', row(r, 73).spending, 20000);
  cmp('H4 opens 73: none', row(r, 74).spending, 0);
}
summary();
