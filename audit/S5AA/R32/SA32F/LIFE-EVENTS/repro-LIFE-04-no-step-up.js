'use strict';
// LIFE-04: a decedent's solely-owned taxable account passes to the survivor with the decedent's cost basis.
// Run: node repro-LIFE-04-no-step-up.js
const L = require('./lib.js');
const p = L.couple({ profile: { age: 60, spouseAge: 62, retireAge: 55, endAge: 66 },
  retirement: { spouseLife: 63, spending: 60000, strategy: 'fixedNominal', dividendOn: true, dividendYield: 0, survivor: false,
    withdrawalOrder: 'manual', manualOrder: 'taxable,preTax,roth,hsa' },
  accounts: [L.h.account('brk', 'taxable', 400000, { owner: 'spouse', basisPct: 50 })] });
console.log(JSON.stringify(L.check(p)));
const r = L.run(p);
r.rows.forEach(x => console.log(x.age, 'total', x.total.toFixed(2), 'withdrawals', x.withdrawals.toFixed(2), 'AGI', x.federalAgi.toFixed(2), 'taxes', x.taxes.toFixed(2)));
console.log('succession warnings:', r.issues.filter(i => /SPOUSAL|SUCCESSION|STEP/.test(i.code)).map(i => i.code + ': ' + JSON.stringify(i.details || i.data || '').slice(0, 300)).join('\n'));
// hand, from the row after the death (the first row the survivor owns it, opening at self age 62):
//   balance at death = 400,000 - 60,000 - 60,000 = 280,000 (zero return; no tax in the joint rows because AGI 30,000 < 32,200)
//   IRC 1014(a)(1): basis = FMV at death = 280,000, so a sale at an unchanged value realises no gain.
//   => AGI 0, tax 0, withdrawal 60,000 in each survivor row.
const surv = r.rows.filter(x => x.age >= 63);
console.log(JSON.stringify(surv.map(x => ({ age: x.age, engineAgi: +x.federalAgi.toFixed(2), handAgi: 0, engineTax: +x.taxes.toFixed(2), handTax: 0 }))));
// Variant B: the same household with $60,000 of other (ordinary) income and $120,000 of spending.
// hand, survivor row (single, under 65, stepped-up basis so the sale has no gain):
//   federal: taxable 60,000 - 16,100 = 43,900 -> 1,240 + 12% x 31,500 = 5,020; Arizona 2.5% x 43,900 = 1,097.50; total 6,117.50
const q = structuredClone(p);
q.retirement.spending = 120000;
q.retirement.otherIncomes = [{ name: 'Other', type: 'other', owner: 'household', amount: 60000, start: 0, end: 200, growth: 0, growthMode: 'fixed' }];
q.accounts[0].balance = 800000;
console.log(JSON.stringify(L.check(q)));
const rq = L.run(q);
console.log(JSON.stringify(rq.rows.filter(x => x.age >= 63).map(x => ({ age: x.age, engineAgi: +x.federalAgi.toFixed(2), handAgi: 60000, engineTax: +x.taxes.toFixed(2), handTax: 6117.5, diff: +(x.taxes - 6117.5).toFixed(2) }))));
