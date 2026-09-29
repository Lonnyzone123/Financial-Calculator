// TAXFED-02: CPI-indexed federal amounts (rate brackets, basic standard deduction, 0%/15% thresholds, aged addition) are held
// at their 2026 nominal values in every projection year, while every income and spending figure is inflated. A household
// whose income only keeps pace with inflation pays a rising share of it in federal tax ("bracket creep").
// Run: node repro-TAXFED-02-indexing.js
'use strict';
const h = require('../harness.js');
// Single filer aged 50, retired, a $60,000 pension with a 3% COLA, 3% inflation, no other income, no one 65+ in any row.
const p = h.plan({ years: 14, retireAge: 50, pension: 60000, amount: 0 });
p.profile.age = 50; p.profile.retireAge = 50; p.profile.endAge = 64;
p.employment.contributionStop = 50;
Object.assign(p.retirement, { pensionCola: 3, dividendStart: 50, selfLife: 100 });
p.assumptions.inflation = 3;
p.advanced.transferOn = false;
p.accounts = [h.account('cash', 'taxable', 2000000, { cashHolding: true, allocation: {} })];
const v = h.validateScenario(structuredClone(p));
const r = h.run(p);
console.log(JSON.stringify({ valid: v.valid, status: r.status }));
// Hand, 2026 row: taxable 60,000 - 16,100 = 43,900; tax 1,240 + 12% x (43,900 - 12,400) = 5,020.
// Indexed at the plan's own 3% CPI (the proxy TAX_RULES_ENGINE_REFERENCE_2026.md s.8.1 prescribes), every bracket edge and
// the standard deduction in the year opening t years in are x 1.03^t, exactly as the income is, so federal tax = 5,020 x 1.03^t.
let lifetimeOver = 0;
for (let i = 1; i < r.rows.length; i++) {
  const row = r.rows[i], t = i - 1, s = Math.pow(1.03, t);
  const azEngine = .025 * Math.max(0, row.federalAgi - 16100);   // Arizona as the engine computes it (state area; not audited here)
  const fedEngine = row.taxes - azEngine;
  const fedIndexed = 5020 * s;
  lifetimeOver += fedEngine - fedIndexed;
  if (t === 0 || t === 6 || t === 13) console.log(JSON.stringify({ rowAge: row.age, yearsIn: t, income: +row.income.toFixed(2),
    engineFederal: +fedEngine.toFixed(2), indexedFederal: +fedIndexed.toFixed(2), over: +(fedEngine - fedIndexed).toFixed(2),
    engineFederalReal: +(fedEngine / s).toFixed(2), indexedFederalReal: 5020 }));
}
console.log(JSON.stringify({ lifetimeFederalOverNominal: +lifetimeOver.toFixed(2) }));
// Hand for the last row (t = 13): income 60,000 x 1.03^13 = 88,112.00; engine taxable 88,112.00 - 16,100 = 72,012.00;
// engine tax 5,800 + 22% x (72,012.00 - 50,400) = 10,554.64; indexed 5,020 x 1.468534 = 7,372.04; over by 3,182.60.
// The same plan's NIIT and Social Security bases are statutory and unindexed; holding THEM fixed is correct.
// Wage base sub-case: salary 184,500 growing 3%/yr; OASDI stays capped at 184,500 in every year.
const q = h.plan({ years: 10, retireAge: 60, amount: 0 });
q.profile.age = 40; q.profile.retireAge = 60; q.profile.endAge = 50;
Object.assign(q.employment, { salary: 184500, growth: 3, contributionStop: 60 });
q.retirement.dividendStart = 60; q.assumptions.inflation = 3; q.advanced.transferOn = false;
q.accounts = [h.account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} })];
const vq = h.validateScenario(structuredClone(q));
const rq = h.run(q);
const E = h.engine;
const pe = { profile: { filing: 'single', age: 49, spouseOn: false }, retirement: { selfLife: 110 } };
const sal = 184500 * Math.pow(1.03, 9);
const est = E.estimateTaxes(pe, 49, sal, 0, 0, sal, 0, 0, 0, 0, 0, 0);
console.log(JSON.stringify({ wageBaseCase: { valid: vq.valid, status: rq.status, lastRowIncome: rq.rows[10].income, salaryYear10: sal,
  enginePayroll: est.payroll, handPayrollAtFixedBase: .062 * 184500 + .0145 * sal + .009 * Math.max(0, sal - 200000),
  handPayrollBaseIndexed3pct: .062 * sal + .0145 * sal + .009 * Math.max(0, sal - 200000) } }));
console.log('TERMINATOR repro-TAXFED-02 done');
