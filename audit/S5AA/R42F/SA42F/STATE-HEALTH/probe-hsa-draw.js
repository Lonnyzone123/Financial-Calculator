'use strict';
const { h, base, income, check, row, cmp, summary } = require('./common.js');
function mk(age, pct, spend, extraIncome) {
  const p = base({ age, endAge: age + 1, retireAge: 50 });
  p.retirement.spending = spend; p.retirement.manualOrder = 'hsa,taxable,roth,preTax'; p.retirement.withdrawalOrder = 'manual';
  p.accounts = [h.account('hsa', 'hsa', 500000, { qualifiedMedicalPct: pct })];
  if (extraIncome) income(p, 'pension', extraIncome);
  return p;
}
// 60, 50% qualified, spend 20,000: W = 20,000 + 0.10 W (20% of the includible half; half < 16,100) -> W = 22,222.22, tax 2,222.22
let r = check(mk(60, 50, 20000));
cmp('HSA 60 half qualified: taxes', row(r, 61).taxes, 2222.222222, 0.02);
// 66: no 20%; includible half taxed: W = 20,000 + tax; 0.5W < 16,100 + 2,050 + 6,000 -> tax 0, W = 20,000
r = check(mk(66, 50, 20000));
cmp('HSA 66 half qualified: taxes', row(r, 67).taxes, 0);
// 66 with pension 40,000: includible 0.5W stacks: deduction 16,100+2,050+6,000=24,150. tax = (12%+2.5%... ) solve:
// fed: taxable = 40,000 + 0.5W - 24,150; AZ: 40,000 + 0.5W - 16,100 - 2,100. W = 20,000 - 40,000 (pension covers) -> no draw needed
r = check(mk(66, 50, 60000, 40000));
// spending 60,000, pension 40,000: W = 20,000 + T(W); T = 10% x 12,400 + 12% x (15,850 + 0.5W - 12,400) + 2.5% x (21,800 + 0.5W)
// = 1,240 + 414 + 0.06W + 545 + 0.0125W = 2,199 + 0.0725W -> W = 22,199 / 0.9275 = 23,934.23 ; T = 3,934.23
cmp('HSA 66 half qualified + pension: taxes', row(r, 67).taxes, 22199 / 0.9275 - 20000, 0.02);
summary();
