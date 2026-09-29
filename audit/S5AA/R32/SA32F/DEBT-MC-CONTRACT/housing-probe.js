'use strict';
// DMC: mortgage housing costs (property tax, insurance, HOA) are charged at their entered NOMINAL amount in every year,
// while retirement spending entered "in today's dollars" is inflated. Run: node housing-probe.js
const h = require('../harness.js');
const p = h.plan({ years: 25, retireAge: 60, balance: 0, amount: 0 }); p.advanced.transferOn = false;
p.accounts = [h.account('brk', 'taxable', 3000000)];
p.assumptions.inflation = 3; p.retirement.spending = 60000; p.retirement.strategy = 'fixedReal';
p.retirement.strategy = 'incomeFirst';
p.advanced.debts = [{ id: 'm', type: 'mortgage', name: 'M', owner: 'household', balance: 100000, rate: 5, rateType: 'fixed', paymentMonthly: 1060.66, payoffAge: 70,
  includePayment: true, includeHousingCosts: true, annualPropertyTax: 3000, annualInsurance: 1200, hoaMonthly: 50, pmiMonthly: 0 }];
const v = h.validateScenario(structuredClone(p)); const r = h.engine.runPlan(structuredClone(p));
if (!v.valid || r.status !== 'ok') throw new Error('not ok');
const pick = i => ({ age: r.rows[i].age, debtHousing: r.rows[i].debtHousing, spending: r.rows[i].spending, inflationFactor: r.rows[i].inflationFactor,
  handHousingIfIndexed: (3000 + 1200 + 600) * r.rows[i].inflationFactor / 1.03 /* cost level during the row (start-of-row factor) */, balance: r.rows[i].debtBalance });
const rows = [1, 5, 10, 11, 20, 25].map(pick);
console.log(JSON.stringify({ entered: 4800, rows }, null, 1));
let under = 0; for (let i = 1; i < r.rows.length; i++) under += 4800 * (r.rows[i].inflationFactor / 1.03) - r.rows[i].debtHousing;
console.log(JSON.stringify({ lifetimeHousingCharged: r.rows.slice(1).reduce((t, x) => t + x.debtHousing, 0), lifetimeIfIndexedAtInflation: r.rows.slice(1).reduce((t, x) => t + 4800 * x.inflationFactor / 1.03, 0), difference: under }));
console.log('HOUSING-PROBE DONE');
