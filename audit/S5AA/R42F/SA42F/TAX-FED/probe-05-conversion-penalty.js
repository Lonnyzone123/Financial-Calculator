'use strict';
const h = require('../harness.js'); const g = h.grid;
const p = g.basePlan({ age: 50, retireAge: 50, endAge: 52, spending: 0, accounts: [g.account('ira', 'traditionalIRA', 500000), g.account('roth', 'rothIRA', 0), g.account('cash', 'taxable', 100000, { basisPct: 100 })], manualOrder: 'taxable,preTax,roth,hsa' });
p.advanced.conversionOn = true; p.advanced.conversionAmount = 50000;
const v = h.validateScenario(structuredClone(p)); const r = h.engine.runPlan(structuredClone(p)); const row = r.rows[1];
console.log('valid', v.valid, r.status, 'agi', row.federalAgi, 'taxes', row.taxes, 'roth', row.roth, 'divs', row.dividends, (r.issues||[]).map(i=>i.code).join(','));
// hand: AGI = 50000 + imputed QD (1.5% of taxable); tax = regular on (AGI-16100) with QD preferential; no 10% on a conversion (72(t) applies to distributions includible... conversion excepted by 408A(d)(3)(A)(ii))
const e = h.engine.estimateTaxes(p, 50, 50000, 0, 0, 0, row.federalAgi - 50000, 0, 0, 0, 0, 0, 1);
console.log('estimateTaxes direct', JSON.stringify({ fed: e.federal, az: e.az, total: e.total }));
console.log(JSON.stringify(r.rows.slice(1).map(x => ({ age: x.age, taxes: x.taxes, settled: x.taxSettled, trueUp: x.taxTrueUpPaid, out: x.taxOutstanding, taxable: x.taxable, w: x.withdrawals }))));
