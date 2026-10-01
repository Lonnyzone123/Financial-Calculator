'use strict';
// IRMAA and Medicare premiums. healthOn with healthCost 0, spending 0: the row's `spending` is exactly the Medicare cost.
// 2026 CMS fact sheet: Part B 202.90 standard; tiers (individual) <=109k, (109k,137k], (137k,171k], (171k,205k], (205k,500k), >=500k;
// Part B totals 202.90/284.10/405.80/527.50/649.20/689.90; Part D add-ons 0/14.50/37.50/60.40/83.30/91.00; deductible 283.
// Joint thresholds 218k/274k/342k/410k/750k. Lookback two years (20 CFR 418.1135(a)); plan years 0 and 1 assume none (MA section 11).
const { h, base, income, check, row, cmp, summary } = require('./common.js');
const E = h.engine;
const annual = (b, d, n = 1) => ((b + d) * 12 + 283) * n;

// Rows are labelled by the age they CLOSE at: row(66) is the year opening at 65.
function single(magi, ages = 4) {
  const p = base({ age: 65, endAge: 65 + ages, retireAge: 60 });
  p.advanced.healthOn = true; p.advanced.healthCost = 0;
  income(p, 'pension', magi);
  return p;
}
// I1: MAGI 150,000 single -> tier (137k,171k]: (405.80 + 37.50) x 12 + 283 = 5,602.60 from plan year 2.
{
  const r = check(single(150000));
  cmp('I1 plan year 0 (no lookback): standard', row(r, 66).spending, annual(202.90, 0));
  cmp('I1 plan year 1 (no lookback): standard', row(r, 67).spending, annual(202.90, 0));
  cmp('I1 plan year 2: tier 3', row(r, 68).spending, annual(405.80, 37.50));
  cmp('I1 irmaaMagi reported', row(r, 66).irmaaMagi, 150000);
}
// I2: exact threshold 109,000 -> standard (<=).
{
  const r = check(single(109000));
  cmp('I2 MAGI 109,000 = standard', row(r, 68).spending, annual(202.90, 0));
}
// I3: MAGI exactly 500,000 single -> CMS ">= $500,000": 689.90 + 91.00 -> (780.90 x 12) + 283 = 9,653.80.
{
  const r = check(single(500000));
  cmp('I3 MAGI 500,000 single (CMS >= 500,000 top tier)', row(r, 68).spending, annual(689.90, 91.00));
  const direct = E.irmaaMonthly(500000, 'single');
  cmp('I3 irmaaMonthly(500000,single) = 689.90 + 91.00', direct, 780.90);
}
// I4: MAGI 500,001 -> top tier (control).
{
  cmp('I4 irmaaMonthly(500001,single) control', E.irmaaMonthly(500001, 'single'), 780.90);
  cmp('I4b irmaaMonthly(750000,mfj) (CMS >= 750,000)', E.irmaaMonthly(750000, 'mfj'), 780.90);
  cmp('I4c irmaaMonthly(499999.99,single) = 649.20 + 83.30', E.irmaaMonthly(499999.99, 'single'), 732.50);
}
// I5: couple, MFJ, both 65, joint MAGI 250,000 -> joint tier 2: (284.10 + 14.50) x 12 + 283 = 3,866.20 each, 7,732.40.
{
  const p = base({ age: 65, endAge: 69, filing: 'mfj', spouseOn: true, spouseAge: 65, retireAge: 60 });
  p.advanced.healthOn = true; p.advanced.healthCost = 0;
  income(p, 'pension', 250000);
  const r = check(p);
  cmp('I5 mfj both 65 plan year 2: 2 x tier 2', row(r, 68).spending, annual(284.10, 14.50, 2));
  // I5s: only the spouse is 65+ (self 60): one person, joint thresholds; pre-Medicare 0.
  const q = base({ age: 60, endAge: 64, filing: 'mfj', spouseOn: true, spouseAge: 65, retireAge: 60 });
  q.advanced.healthOn = true; q.advanced.healthCost = 0;
  income(q, 'pension', 250000);
  const rq = check(q);
  cmp('I5s mfj spouse only 65+: 1 x tier 2', row(rq, 63).spending, annual(284.10, 14.50, 1));
}
// I6: a survivor's IRMAA. Couple both 70, self dies at 71 (selfLife 71): the row opening at 71 is the year of death,
// filed jointly; the survivor files single from the row opening at 72. Joint pension 250,000 continues in full (PENSION_AFTER_DEATH_ASSUMED
// is about pension; this uses a spouse-owned stream so nothing ends at the death).
// Law: 20 CFR 418.1115(c) applies the joint ranges to individuals who "filed a joint tax return" for the tax year SSA uses,
// which is the year two years earlier (418.1135(a)). Row opening 72 looks back to the row opening 70 (joint return);
// row opening 73 looks back to the row opening 71 (the year of death, joint return). Both: joint tier 2 for one person
// = 3,866.20. Row opening 74 looks back to 72 (single return, MAGI 250,000): single tier (205k,500k) = (649.20+83.30) x 12 + 283 = 9,073.00.
{
  const p = base({ age: 70, endAge: 76, filing: 'mfj', spouseOn: true, spouseAge: 70, retireAge: 60, selfLife: 71 });
  p.advanced.healthOn = true; p.advanced.healthCost = 0;
  income(p, 'pension', 250000, 'spouse');
  const r = check(p);
  for (const a of [71, 72, 73, 74, 75, 76]) { const x = row(r, a); if (x) console.log('   I6 row closing ' + a + ': spending ' + x.spending.toFixed(2) + ' irmaaMagi ' + x.irmaaMagi); }
  cmp('I6 year of death (opens 71, lookback 69? no: plan year 1) both counted, standard', row(r, 72).spending, annual(202.90, 0, 2));
  cmp('I6a survivor, opens 72, lookback = joint return of year opening 70', row(r, 73).spending, annual(284.10, 14.50, 1));
  cmp('I6b survivor, opens 73, lookback = joint return of the year of death', row(r, 74).spending, annual(284.10, 14.50, 1));
  cmp('I6c survivor, opens 74, lookback = single return (control)', row(r, 75).spending, annual(649.20, 83.30, 1));
}
// I7: the common case. Same couple, joint MAGI 150,000 (below the joint 218,000 tier). Survivor rows opening 72 and 73 look back
// to joint returns: standard premium, 2,717.80. The engine applies the single table to 150,000: (405.80 + 37.50) x 12 + 283 = 5,602.60.
{
  const p = base({ age: 70, endAge: 76, filing: 'mfj', spouseOn: true, spouseAge: 70, retireAge: 60, selfLife: 71 });
  p.advanced.healthOn = true; p.advanced.healthCost = 0;
  income(p, 'pension', 150000, 'spouse');
  const r = check(p);
  cmp('I7a survivor, opens 72, joint-return lookback 150,000: standard', row(r, 73).spending, annual(202.90, 0, 1));
  cmp('I7b survivor, opens 73, joint-return (death-year) lookback: standard', row(r, 74).spending, annual(202.90, 0, 1));
  cmp('I7c survivor, opens 74, single-return lookback (control): tier 3', row(r, 75).spending, annual(405.80, 37.50, 1));
}
summary();
