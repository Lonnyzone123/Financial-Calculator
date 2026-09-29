// Gross-up fixed point, composite: MFJ 70/68, SS 50,000, taxable 150,000 at 30% basis drained first, then IRA; spending 300,000.
// The draw crosses the SS 85% band, the senior-deduction phaseout (one spouse 65+ at 70, other 68 -> both 65+), the 0%/15% band,
// and the NIIT threshold.  Hand: bisection over ref.js + Arizona.
'use strict';
const h = require('../harness.js');
const ref = require('./ref.js');
const p = h.plan({ years: 1, retireAge: 70, amount: 0 });
p.profile.age = 70; p.profile.retireAge = 70; p.profile.endAge = 71; p.profile.filing = 'mfj'; p.profile.spouseOn = true; p.profile.spouseAge = 68;
p.employment.contributionStop = 70;
Object.assign(p.retirement, { spending: 300000, dividendStart: 70, selfLife: 100, spouseLife: 100, manualOrder: 'taxable,preTax,roth,hsa',
  otherIncomes: [{ name: 'SS', type: 'socialSecurity', owner: 'self', amount: 50000, start: 70, end: 100, growth: 0, growthMode: 'fixed' }] });
p.advanced.transferOn = false;
p.accounts = [h.account('brk', 'taxable', 150000, { basisPct: 30, priority: 1 }), h.account('ira', 'traditionalIRA', 3000000, { priority: 2 })];
function tax(W) { const r = ref.federal({ f: 'mfj', ages: [70, 68], ordinary: W, gains: 105000, ss: 50000 });
  return r.incomeTax + r.niit + .025 * Math.max(0, r.agi - r.ssTaxable - 32200 - 2 * 2100); }
let lo = 0, hi = 900000; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (150000 + m + 50000 - 300000 - tax(m) > 0) hi = m; else lo = m; }
const v = h.validateScenario(structuredClone(p)), r = h.run(p), row = r.rows[1];
console.log(JSON.stringify({ valid: v.valid, status: r.status, engineWithdrawals: row.withdrawals, handWithdrawals: +(150000 + lo).toFixed(4), diff: +(row.withdrawals - 150000 - lo).toFixed(6), engineTaxes: row.taxes, handTaxes: +tax(lo).toFixed(4), shortfall: row.shortfall }));
console.log('TERMINATOR probe-grossup2 done');
