// Probe: are CPI-indexed federal amounts held at 2026 nominal values while incomes inflate?
'use strict';
const h = require('../harness.js');
const p = h.plan({ years: 30, retireAge: 65, pension: 60000, amount: 0 });
p.profile.age = 65; p.profile.retireAge = 65; p.profile.endAge = 95;
p.employment.contributionStop = 65;
p.retirement.pensionCola = 3; p.retirement.dividendStart = 65; p.retirement.selfLife = 100;
p.assumptions.inflation = 3;
p.advanced.transferOn = false;
p.accounts = [h.account('cash', 'taxable', 2000000, { cashHolding: true, allocation: {} })];
const v = h.validateScenario(structuredClone(p));
console.log('valid', v.valid);
const r = h.run(p);
for (const i of [1, 10, 20, 30]) {
  const row = r.rows[i];
  console.log(JSON.stringify({ age: row.age, income: row.income, agi: row.federalAgi, taxes: row.taxes, inflationFactor: row.inflationFactor,
    realIncome: row.income / row.inflationFactor, realTaxes: row.taxes / row.inflationFactor }));
}
console.log('TERMINATOR probe-indexing done');
