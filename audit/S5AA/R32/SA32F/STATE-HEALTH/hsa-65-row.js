'use strict';
// HSA owner crossing 65 inside a projection row (spouse-owned HSA, spouse 64.5 at the row's opening), MFJ, self 60.
// Pooled draw of spending 10,000 from the HSA (60% qualified). Income 0.4 W is far below the MFJ deduction: fed 0, AZ 0.
// Engine convention (year-opening age, declared for 59 1/2 in MA 18.3): 20% x 0.4 W on the whole draw -> W = 10,000/0.92.
// If the draw were spread evenly over the row, half would fall after 65: 20% x 0.4 x W/2 = 0.04 W -> W = 10,000/0.96.
// A dated transfer at spouse age 65.25 is judged on its date: no 20%.
const { h, base, check, row, cmp, summary } = require('./common.js');
{
  const p = base({ age: 60, endAge: 61, retireAge: 60, filing: 'mfj', spouseOn: true, spouseAge: 64.5 });
  p.accounts = [h.account('hsa', 'hsa', 100000, { owner: 'spouse', qualifiedMedicalPct: 60 }),
    h.account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} })];
  Object.assign(p.retirement, { spending: 10000, manualOrder: 'hsa,taxable,roth,preTax' });
  const r = check(p);
  cmp('HX1 engine convention (opening age 64.5 -> whole draw 20%)', row(r, 61).taxes, 10000 / 0.92 - 10000);
  console.log('   HX1 split-year reading would be ' + (10000 / 0.96 - 10000).toFixed(2));
}
{
  const p = base({ age: 60, endAge: 61, retireAge: 60, filing: 'mfj', spouseOn: true, spouseAge: 64.5 });
  p.accounts.push(h.account('src', 'hsa', 100000, { owner: 'spouse', qualifiedMedicalPct: 60 }), h.account('dst', 'taxable', 0));
  Object.assign(p.advanced, { transferOn: true, transferFrom: 'src', transferTo: 'dst', transferAmount: 50000, transferAge: 60.75 });
  const r = check(p);
  // includible 20,000; MFJ AGI 20,000 < 32,200 + 2,050... fed 0; AZ (20,000 - 32,200 - 2,100) < 0 -> 0; no 20% (spouse 65.25).
  cmp('HX2 dated HSA transfer at spouse 65.25: no additional tax', row(r, 61).taxes, 0);
}
summary();
