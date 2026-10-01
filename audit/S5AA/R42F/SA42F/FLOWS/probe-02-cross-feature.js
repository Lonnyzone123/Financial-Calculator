'use strict';
// Cross-feature hand witnesses: retirement inside a row; stage boundary inside a row; death inside a row with the survivor reduction;
// an expense in a final partial row and at the end age; a one-time income at the end age; pension/health/dividends across a
// retirement inside a row. Roth-only where tax must be zero.
const { plan, account, run, rows, cmp, summary, h } = require('./flib.js');

// 1. Retirement at 60.5 inside the row 60 -> 61; incomeFirst 40,000, 3% inflation; pension 12,000 from retirement.
{
  const p = plan({ age: 60, retireAge: 60.5, endAge: 63, inflation: 3, strategy: 'incomeFirst', spending: 40000, pension: 12000,
    accounts: [account('roth', 'rothIRA', 500000)] });
  const r = run(p);
  cmp('1 row61 spending = 40,000 x 0.5', r.rows[1].spending, 20000);
  cmp('1 row61 income = pension 12,000 x 0.5', r.rows[1].income, 6000);
  cmp('1 row61 withdrawals = 20,000 - 6,000', r.rows[1].withdrawals, 14000);
  cmp('1 row62 spending = 40,000 x 1.03', r.rows[2].spending, 41200);
  cmp('1 row62 income = 12,000 (no COLA)', r.rows[2].income, 12000);
}
// 2. fixedReal with retirement inside a row: first amount = 4% of the balance at the row's opening, annual, x 0.5;
//    next row = that annual amount x 1.03 (a whole year of inflation since it was set at the row's opening).
{
  const p = plan({ age: 60, retireAge: 60.5, endAge: 63, inflation: 3, strategy: 'fixedReal', spending: 0,
    accounts: [account('roth', 'rothIRA', 500000)] });
  p.retirement.withdrawalRate = 4;
  const r = run(p);
  cmp('2 row61 spending = 20,000 x 0.5', r.rows[1].spending, 10000);
  cmp('2 row62 spending = 20,000 x 1.03', r.rows[2].spending, 20600);
}
// 3. Stage boundary inside a row: percent 150 from 61.5 through end 62 ([61.5, 63)), fixedNominal 40,000, no inflation.
{
  const p = plan({ age: 60, retireAge: 60, endAge: 64, strategy: 'fixedNominal', spending: 40000,
    stages: [{ name: 'Up', start: 61.5, end: 62, mode: 'percent', value: 150 }], accounts: [account('roth', 'rothIRA', 900000)] });
  const r = run(p);
  cmp('3 row61 (60-61) 40,000', r.rows[1].spending, 40000);
  cmp('3 row62 (61-62) half 40,000, half 60,000', r.rows[2].spending, 50000);
  cmp('3 row63 (62-63) 60,000', r.rows[3].spending, 60000);
  cmp('3 row64 (63-64) 40,000', r.rows[4].spending, 40000);
}
// 3b. A set-amount stage (inflation growth) starting inside a fractional first row: start 60.5, stage start 60.75 set 30,000.
//     Row 60.5-61 (0.25 at 40,000 then 0.25 at 30,000 x IF(60.5)=1) = 10,000 + 7,500 = 17,500.
{
  const p = plan({ age: 60.5, retireAge: 60.5, endAge: 63, inflation: 3, strategy: 'incomeFirst', spending: 40000,
    stages: [{ name: 'Set', start: 60.75, end: 70, mode: 'amount', value: 30000, growthMode: 'inflation' }], accounts: [account('roth', 'rothIRA', 900000)] });
  const r = run(p);
  cmp('3b row61 (60.5-61)', r.rows[1].spending, 17500);
  cmp('3b row62 (61-62) 30,000 x 1.03^0.5', r.rows[2].spending, 30000 * Math.sqrt(1.03));
}
// 4. Death inside a row: couple, both 66, self dies at 67.5; survivor reduction 25%; incomeFirst 80,000; Roth only (self) -> passes.
//    The row opening at 67 is the death year (both alive at the opening): 80,000. Row opening at 68: 60,000.
{
  const p = plan({ couple: true, age: 66, retireAge: 66, endAge: 70, spouseAge: 66, strategy: 'incomeFirst', spending: 80000,
    accounts: [account('roth', 'rothIRA', 900000), account('sroth', 'rothIRA', 100000, { owner: 'spouse' })] });
  Object.assign(p.retirement, { survivor: true, survivorSpendingReduction: 25, selfLife: 67.5 });
  const r = run(p);
  cmp('4 row67 (66-67) 80,000', r.rows[1].spending, 80000);
  cmp('4 row68 (67-68, death year) 80,000', r.rows[2].spending, 80000);
  cmp('4 row69 (68-69) 60,000', r.rows[3].spending, 60000);
}
// 5. Expense inside a final partial row (end 62.5, expense at 62.25) is charged in full; expense at the end age warns and is not charged.
{
  const p = plan({ age: 60, retireAge: 60, endAge: 62.5, strategy: 'fixedNominal', spending: 0,
    expenses: [{ name: 'Late', kind: 'expense', age: 62.25, amount: 25000 }, { name: 'AtEnd', kind: 'expense', age: 62.5, amount: 9000 }],
    accounts: [account('roth', 'rothIRA', 100000)] });
  const r = run(p);
  cmp('5 last partial row charges the 62.25 expense', r.rows[r.rows.length - 1].spending, 25000);
  console.log('   issues:', (r.issues || []).map(i => i.code).join(','), '| validator:', r._warn.join(','));
}
// 6. One-time income at the end age: never paid; is anything said?
{
  const p = plan({ age: 60, retireAge: 60, endAge: 62, strategy: 'fixedNominal', spending: 0,
    otherIncomes: [{ name: 'Inheritance', type: 'oneTimeTaxFree', owner: 'self', amount: 50000, start: 62, end: 62, growth: 0, growthMode: 'fixed' }],
    accounts: [account('roth', 'rothIRA', 100000)] });
  const r = run(p);
  console.log('6 one-time income at end age: income by row', r.rows.map(x => x.income).join(','), '| issues:', (r.issues || []).map(i => i.code).join(','), '| validator:', r._warn.join(','));
}
summary();
