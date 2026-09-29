'use strict';
// DMC: declared debt behaviours (MODEL_ASSUMPTIONS 6, 9, 19, 20; Q113) and the five UI debt fields the engine never reads.
// Run: node declared-probe.js
const h = require('../harness.js');
const out = [];
function plan(years, debt) {
  const p = h.plan({ years, retireAge: 60, balance: 0, amount: 0 }); p.advanced.transferOn = false;
  p.accounts = [h.account('brk', 'taxable', 2000000)];
  p.retirement.otherIncomes = [{ name: 'Pension-like wage', type: 'employment', owner: 'self', amount: 150000, start: 60, end: 60 + years, growth: 0, growthMode: 'fixed' }];
  p.advanced.debts = [Object.assign({ id: 'd1', type: 'mortgage', name: 'M', owner: 'household', balance: 300000, rate: 6, rateType: 'fixed', paymentMonthly: 1798.65,
    payoffAge: 90, includePayment: true, includeHousingCosts: true, annualPropertyTax: 0, annualInsurance: 0, hoaMonthly: 0, pmiMonthly: 100,
    taxDeductible: false, mortgageType: 'conventional', originalAmount: 0, propertyValue: 0, remainingTermYears: 30, loanTermYears: 30 }, debt)];
  return p;
}
function run(p) { const v = h.validateScenario(structuredClone(p)); const r = h.engine.runPlan(structuredClone(p)); if (!v.valid || r.status !== 'ok') throw new Error('not ok ' + r.calculationErrorCode); return r; }
const sig = r => JSON.stringify(r.rows);
// Section 6: principal can be negative
{ const r = run(plan(1, { paymentMonthly: 1000, pmiMonthly: 0 })); out.push({ label: 'S6 negative principal', debtPrincipal: r.rows[1].debtPrincipal, handApprox: 12 * 1000 - (r.rows[1].debtInterest) }); }
// Section 9 declared inert: taxDeductible, owner
{ const a = run(plan(3, {})), b = run(plan(3, { taxDeductible: true })), c = run(plan(3, { owner: 'spouse' }));
  out.push({ label: 'S9 taxDeductible inert', identical: sig(a) === sig(b), taxes: a.rows[1].taxes, interest: a.rows[1].debtInterest });
  out.push({ label: 'S9 owner inert', identical: sig(a) === sig(c) }); }
// UNDECLARED inert: five mortgage fields the app's debt card offers (renderDebts) and the engine never reads
{ const a = run(plan(3, {}));
  const variants = { mortgageType_interestOnly: { mortgageType: 'interestOnly' }, mortgageType_fha: { mortgageType: 'fha' }, originalAmount: { originalAmount: 400000 },
    propertyValue: { propertyValue: 1500000 }, loanTermYears: { loanTermYears: 15 }, remainingTermYears: { remainingTermYears: 5 } };
  const res = {}; for (const [k, v] of Object.entries(variants)) res[k] = sig(a) === sig(run(plan(3, v)));
  const control = sig(a) === sig(run(plan(3, { rate: 7 })));
  out.push({ label: 'UNDECLARED inert mortgage fields (true = changes nothing)', res, controlRateChangeIdentical: control }); }
// Q113 (open): PMI still charged with the balance at ~51% of the original amount, and of a stated property value
{ const p = plan(12, { balance: 153000, originalAmount: 300000, propertyValue: 375000, loanTermYears: 30, paymentMonthly: 1500, pmiMonthly: 200, payoffAge: 85 });
  const r = run(p); out.push({ label: 'Q113 PMI at low LTV', pmiYear1: r.rows[1].debtHousing, balanceStart: 153000, ltvOfOriginalValue: 153000 / 375000,
    note: 'HPA 12 USC 4901/4902: automatic termination at 78% of original value (scheduled), final termination at the amortization midpoint' }); }
// Section 20: PMI only while owed (payoff at 60.5 -> 6 months)
{ const r = run(plan(1, { payoffAge: 60.5 })); out.push({ label: 'S20 PMI while owed', debtHousing: r.rows[1].debtHousing, hand: 600 }); }
// Section 19: a payoff age before the year began runs as before (a year of interest, then payoff)
{ const r = run(plan(1, { payoffAge: 59, pmiMonthly: 0 })); out.push({ label: 'S19 payoff before plan start', debtInterest: r.rows[1].debtInterest, debtBalance: r.rows[1].debtBalance }); }
for (const o of out) console.log(JSON.stringify(o));
console.log('DECLARED-PROBE DONE: items=' + out.length);
