'use strict';
// Early-distribution tax (IRC 72(t)), the Rule of 55, penaltyException, HSA non-qualified draws (IRC 223(f)(2), (f)(4)).
// Dated transfers are judged at their own date (MA 18.3), which isolates the charge. Taxes are paid from a 100%-basis cash account.
const { h, base, income, check, row, cmp, summary } = require('./common.js');

function transferPlan({ age, retireAge, type, amount, at, owner = 'self', rule55 = false, exc = false, extra = {}, spouseAge }) {
  const p = base({ age, endAge: Math.floor(age) + 2, retireAge, spouseOn: owner === 'spouse', spouseAge: spouseAge || age,
    filing: owner === 'spouse' ? 'mfj' : 'single' });
  p.accounts.push(h.account('src', type, 200000, Object.assign({ owner }, extra)), h.account('dst', 'taxable', 0));
  Object.assign(p.advanced, { transferOn: true, transferFrom: 'src', transferTo: 'dst', transferAmount: amount, transferAge: at,
    rule55, penaltyException: exc });
  return p;
}
const T = (p, a) => row(check(p), a).taxes;
// Single, AGI 20,000: fed (20,000 - 16,100) x 10% = 390; AZ 3,900 x 2.5% = 97.50; 10% additional = 2,000.
cmp('P1 IRA->taxable 20k at 57.5: 390 + 97.50 + 2,000', T(transferPlan({ age: 57, retireAge: 57, type: 'traditionalIRA', amount: 20000, at: 57.5 }), 58), 2487.50);
cmp('P2 IRA->taxable 20k at 60: no 10%', T(transferPlan({ age: 60, retireAge: 60, type: 'traditionalIRA', amount: 20000, at: 60.5 }), 61), 487.50);
cmp('P3 401k, Rule of 55, separated at 56, drawn at 56.5: exempt', T(transferPlan({ age: 56, retireAge: 56, type: 'traditional401k', amount: 20000, at: 56.5, rule55: true }), 57), 487.50);
cmp('P4 401k, Rule of 55 toggled, separated at 50, drawn at 56.5: 72(t)(2)(A)(v) does not apply', T(transferPlan({ age: 56, retireAge: 50, type: 'traditional401k', amount: 20000, at: 56.5, rule55: true }), 57), 2487.50);
cmp('P5 IRA, Rule of 55 on, 56.5: not an IRA exception', T(transferPlan({ age: 56, retireAge: 56, type: 'traditionalIRA', amount: 20000, at: 56.5, rule55: true }), 57), 2487.50);
cmp('P6 IRA, penaltyException, 56.5', T(transferPlan({ age: 56, retireAge: 56, type: 'traditionalIRA', amount: 20000, at: 56.5, exc: true }), 57), 487.50);
cmp('P7 401k, Rule of 55 on, 54.5 (under 55)', T(transferPlan({ age: 54, retireAge: 54, type: 'traditional401k', amount: 20000, at: 54.5, rule55: true }), 55), 2487.50);
// P4b: same separated-at-50 case with the plan starting at 48 and retiring at 50: the validator and runPlan accept it.
{
  const p = transferPlan({ age: 48, retireAge: 50, type: 'traditional401k', amount: 20000, at: 56.5, rule55: true });
  p.profile.endAge = 58;
  const r = check(p);
  const v = h.validateScenario(structuredClone(p));
  console.log('   P4b validator issues mentioning rule55/Rule of 55: ' + JSON.stringify(v.issues.filter(x => /rule ?55|rule of 55/i.test(JSON.stringify(x)))));
  console.log('   P4b runPlan issues mentioning rule55: ' + JSON.stringify((r.issues || []).filter(x => /rule ?55|rule of 55/i.test(JSON.stringify(x)))));
  cmp('P4b retired 50, drawn at 56.5 (plan from 48)', row(r, 57).taxes, 2487.50);
}
// Spouse-owned 401(k): self 60, spouse 56.5 at the transfer, MFJ. AGI 20,000 < 32,200: fed 0, AZ 0. 10% = 2,000 (no Rule of 55).
cmp('P8 spouse 401k, spouse 56.5, no rule55: 2,000', T(transferPlan({ age: 60, retireAge: 60, type: 'traditional401k', amount: 20000, at: 60.5, owner: 'spouse', spouseAge: 56 }), 61), 2000);
cmp('P8b spouse 401k, spouse 56.5, rule55: 0', T(transferPlan({ age: 60, retireAge: 60, type: 'traditional401k', amount: 20000, at: 60.5, owner: 'spouse', spouseAge: 56, rule55: true }), 61), 0);

// Pooled spending draw from an IRA at 57 (order preTax first): W = 20,000 + tax(W), tax = 10%(W-16,100) + 2.5%(W-16,100) + 10% W
// => 0.775 W = 20,000 - 2,012.50 => W = 23,209.677; tax = 3,209.677 (taxable income 7,109.68 stays in the 10% bracket).
{
  const p = base({ age: 57, endAge: 58, retireAge: 57 });
  p.accounts = [h.account('ira', 'traditionalIRA', 200000), h.account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} })];
  Object.assign(p.retirement, { spending: 20000, manualOrder: 'preTax,taxable,roth,hsa' });
  const r = check(p);
  cmp('P9 pooled IRA draw at 57: withdrawals', row(r, 58).withdrawals, 17987.5 / 0.775);
  cmp('P9 pooled IRA draw at 57: taxes', row(r, 58).taxes, 17987.5 / 0.775 - 20000);
}
// HSA with 60% qualified share: HSA -> taxable transfer of 50,000 at 60.5. Includible 20,000 (IRC 223(f)(2)).
// fed (20,000 - 16,100) x 10% = 390; AZ 97.50; additional 20% of the includible amount = 4,000 (223(f)(4)(A)). Total 4,487.50.
function hsaPlan(age, owner = 'self', spouseAge) {
  const p = base({ age, endAge: Math.floor(age) + 2, retireAge: 60, spouseOn: owner === 'spouse' || !!spouseAge, spouseAge: spouseAge || age,
    filing: owner === 'spouse' || spouseAge ? 'mfj' : 'single' });
  p.accounts.push(h.account('src', 'hsa', 100000, { owner, qualifiedMedicalPct: 60 }), h.account('dst', 'taxable', 0));
  Object.assign(p.advanced, { transferOn: true, transferFrom: 'src', transferTo: 'dst', transferAmount: 50000, transferAge: age + 0.5 });
  return p;
}
cmp('P10 HSA 60% qualified, 50k out at 60.5: 390 + 97.50 + 4,000', T(hsaPlan(60), 61), 4487.50);
// At 66: deduction 16,100 + 2,050 + 6,000 = 24,150 > 20,000 -> fed 0; AZ (20,000 - 16,100 - 2,100) x 2.5% = 45; no 20% after 65.
cmp('P11 HSA 60% qualified, 50k out at 66.5: AZ 45 only', T(hsaPlan(66), 67), 45);
// Spouse-owned HSA, self 66, spouse 60 (MFJ): AGI 20,000 < 32,200 + ... -> fed 0, AZ 0; 20% x 20,000 = 4,000 on the spouse's age.
cmp('P12 spouse HSA, self 66 / spouse 60.5: 4,000', T(hsaPlan(66, 'spouse', 60), 67), 4000);
// Pooled HSA draw at 60 (order hsa first), spending 10,000: income 0.4 W < 16,100 so fed 0, AZ 0; 20% x 0.4 W = 0.08 W.
// W = 10,000 / 0.92 = 10,869.565; tax 869.565.
{
  const p = base({ age: 60, endAge: 61, retireAge: 60 });
  p.accounts = [h.account('hsa', 'hsa', 100000, { qualifiedMedicalPct: 60 }), h.account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} })];
  Object.assign(p.retirement, { spending: 10000, manualOrder: 'hsa,taxable,roth,preTax' });
  const r = check(p);
  cmp('P13 pooled HSA draw at 60: withdrawals', row(r, 61).withdrawals, 10000 / 0.92);
  cmp('P13 pooled HSA draw at 60: taxes', row(r, 61).taxes, 10000 / 0.92 - 10000);
}
// Roth IRA drawn at 50: the engine flags UNSUPPORTED_ROTH_ORDERING (declared unsupported domain) and taxes nothing.
{
  const p = base({ age: 50, endAge: 51, retireAge: 50 });
  p.accounts = [h.account('roth', 'rothIRA', 100000), h.account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} })];
  Object.assign(p.retirement, { spending: 10000, manualOrder: 'roth,taxable,preTax,hsa' });
  const r = check(p);
  console.log('   P14 Roth early draw issues: ' + JSON.stringify((r.issues || []).filter(x => /ROTH/.test(x.code)).map(x => x.code + ':' + x.severity)) + ' status ' + r.status);
  cmp('P14 Roth early draw taxes', row(r, 51).taxes, 0);
}
// Year opening before 59.5, closing after it (declared MA 18.3): whole pooled draw at 59 owes the 10%.
{
  const p = base({ age: 59, endAge: 60, retireAge: 59 });
  p.accounts = [h.account('ira', 'traditionalIRA', 200000), h.account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} })];
  Object.assign(p.retirement, { spending: 20000, manualOrder: 'preTax,taxable,roth,hsa' });
  const r = check(p);
  cmp('P15 row opening 59 (declared: whole draw at opening age)', row(r, 60).taxes, 17987.5 / 0.775 - 20000);
}
summary();
