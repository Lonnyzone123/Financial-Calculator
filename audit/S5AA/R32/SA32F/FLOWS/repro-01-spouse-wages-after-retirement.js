'use strict';
// FLOWS-01: a younger spouse keeps earning a salary after the household's retirement spending starts (the spouse works
// until the spouse's own age reaches profile.retireAge), but the salary never funds spending: the portfolio pays the whole
// spending, and the wages -- net of the tax on them -- leave the model. The same wages entered as an "employment" income
// stream owned by the spouse DO offset spending.
// Run: node repro-01-spouse-wages-after-retirement.js
const L = require('./lib.js');
const { account } = L;

function plan(asStream) {
  const p = L.basePlan({ couple: true, age: 65, retireAge: 65, spouseAge: 60, endAge: 66, spending: 60000, strategy: 'fixedNominal',
    accounts: [account('roth', 'rothIRA', 1000000)] });
  p.employment.spouseSalary = asStream ? 0 : 60000;
  p.employment.contributionStop = 70;
  if (asStream) p.retirement.otherIncomes = [{ name: 'Spouse job', type: 'employment', owner: 'spouse', amount: 60000, start: 60, end: 65, growth: 0, growthMode: 'fixed' }];
  return p;
}
for (const asStream of [false, true]) {
  const p = plan(asStream);
  const v = L.h.validateScenario(structuredClone(p));
  const r = L.h.engine.runPlan(structuredClone(p));
  const row = r.rows[1];
  console.log(JSON.stringify({ spouseWagesEnteredAs: asStream ? 'employment income stream' : 'employment.spouseSalary',
    valid: v.valid, status: r.status, age: row.age, income: row.income, spending: row.spending, withdrawals: +row.withdrawals.toFixed(2),
    taxes: +row.taxes.toFixed(2), rothEnd: row.roth, issues: r.issues.map(i => i.code) }));
}
// Hand expectation (2026 MFJ, self 65, spouse 60, $60,000 of spouse wages, nothing else taxable; Roth draws are tax-free):
//   payroll:   60,000 x 7.65%                                   = 4,590.00
//   federal:   60,000 - 32,200 std - 1,650 add'l (self 65) - 6,000 senior (self 65) = 20,150 taxable; 10% (to 24,800) = 2,015.00
//   Arizona:   60,000 - 32,200 AZ std (mfj) - 2,100 (one person 65+) = 25,700 x 2.5% = 642.50
//   net wages: 60,000 - 4,590 - 2,015 - 642.50                 = 52,752.50
//   Roth draw: 60,000 spending - 52,752.50                      = 7,247.50   (engine: 60,000.00; difference 52,752.50)
const exp = 60000 - (60000 - 60000 * 0.0765 - 0.10 * (60000 - 32200 - 1650 - 6000) - 0.025 * (60000 - 32200 - 2100));
console.log(JSON.stringify({ handExpectedWithdrawal: +exp.toFixed(2) }));
