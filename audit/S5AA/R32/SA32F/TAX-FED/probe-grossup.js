// Gross-up fixed point: when withdrawals pay the tax, does the engine's sale equal the true fixed point?
// Expectation found by an independent hand bisection over ref.js (federal) + Arizona (2.5% x (AGI - SS taxable - 16,100 - 2,100 per 65+)).
'use strict';
const h = require('../harness.js');
const ref = require('./ref.js');
function base(age, spending, filing) {
  const p = h.plan({ years: 1, retireAge: age, amount: 0 });
  p.profile.age = age; p.profile.retireAge = age; p.profile.endAge = age + 1; p.profile.filing = filing || 'single';
  p.employment.contributionStop = age;
  Object.assign(p.retirement, { spending, dividendStart: age, selfLife: 100, strategy: 'fixedNominal' });
  p.advanced.transferOn = false;
  return p;
}
function az(agi, ssT, n65, f) { const std = f === 'mfj' ? 32200 : f === 'hoh' ? 24150 : 16100; return .025 * Math.max(0, agi - ssT - std - 2100 * n65); }
function totalTax(x) { const r = ref.federal(x); return { fed: r.incomeTax + r.niit, az: az(r.agi, r.ssTaxable, x.ages.filter(a => a >= 65).length, x.f), r }; }
function bisect(fn, lo, hi) { for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (fn(m) > 0) hi = m; else lo = m; } return (lo + hi) / 2; }
const cases = [];
// Case A: IRA only, single 70, spend 60,000, no other income
{ const p = base(70, 60000); p.accounts = [h.account('ira', 'traditionalIRA', 1000000)]; p.retirement.manualOrder = 'preTax,taxable,roth,hsa';
  const G = bisect(W => { const t = totalTax({ f: 'single', ages: [70, -1], ordinary: W }); return W - (60000 + t.fed + t.az); }, 0, 500000);
  cases.push({ label: 'A IRA only single 70 spend 60k', p, G }); }
// Case B: IRA only with Social Security 30,000, spend 70,000 (SS taxability kink)
{ const p = base(70, 70000); p.accounts = [h.account('ira', 'traditionalIRA', 1000000)]; p.retirement.manualOrder = 'preTax,taxable,roth,hsa';
  p.retirement.otherIncomes = [{ name: 'SS', type: 'socialSecurity', owner: 'self', amount: 30000, start: 70, end: 100, growth: 0, growthMode: 'fixed' }];
  const G = bisect(W => { const t = totalTax({ f: 'single', ages: [70, -1], ordinary: W, ss: 30000 }); return W + 30000 - (70000 + t.fed + t.az); }, 0, 500000);
  cases.push({ label: 'B IRA + SS 30k single 70 spend 70k', p, G }); }
// Case C: taxable account basis 40%, pension 50,000, spend 150,000 (gains stack, 0%/15% boundary)
{ const p = base(70, 150000); p.retirement.pension = 50000; p.accounts = [h.account('brk', 'taxable', 2000000, { basisPct: 40 })];
  const G = bisect(S => { const t = totalTax({ f: 'single', ages: [70, -1], ordinary: 50000, gains: .6 * S }); return S + 50000 - (150000 + t.fed + t.az); }, 0, 900000);
  cases.push({ label: 'C taxable 40% basis + pension 50k spend 150k', p, G }); }
// Case D: MFJ both 67, IRA, SS 40k, spend 260k (NIIT none, senior phaseout crossing)
{ const p = base(67, 260000, 'mfj'); p.profile.spouseOn = true; p.profile.spouseAge = 67; p.retirement.spouseLife = 100;
  p.accounts = [h.account('ira', 'traditionalIRA', 3000000)]; p.retirement.manualOrder = 'preTax,taxable,roth,hsa';
  p.retirement.otherIncomes = [{ name: 'SS', type: 'socialSecurity', owner: 'self', amount: 40000, start: 67, end: 100, growth: 0, growthMode: 'fixed' }];
  const G = bisect(W => { const t = totalTax({ f: 'mfj', ages: [67, 67], ordinary: W, ss: 40000 }); return W + 40000 - (260000 + t.fed + t.az); }, 0, 900000);
  cases.push({ label: 'D MFJ 67/67 IRA + SS 40k spend 260k', p, G }); }
// Case E: taxable 20% basis then IRA; big spend crosses NIIT threshold single
{ const p = base(66, 400000); p.accounts = [h.account('brk', 'taxable', 300000, { basisPct: 20, priority: 1 }), h.account('ira', 'traditionalIRA', 3000000, { priority: 2 })];
  p.retirement.manualOrder = 'taxable,preTax,roth,hsa';
  // taxable exhausts at 300,000 (gain 240,000); then IRA W
  const G = bisect(W => { const t = totalTax({ f: 'single', ages: [66, -1], ordinary: W, gains: 240000 }); return 300000 + W - (400000 + t.fed + t.az); }, 0, 900000);
  cases.push({ label: 'E taxable 300k@20% then IRA, spend 400k', p, G: 300000 + G, iraPart: G }); }
for (const c of cases) {
  const v = h.validateScenario(structuredClone(c.p));
  const r = h.engine.runPlan(c.p);
  const row = r.rows[1];
  console.log(JSON.stringify({ label: c.label, valid: v.valid, status: r.status, code: r.calculationErrorCode, engineWithdrawals: row.withdrawals, engineTaxes: row.taxes,
    spending: row.spending, income: row.income, shortfall: row.shortfall, handGross: +c.G.toFixed(4), diff: +(row.withdrawals - c.G).toFixed(4), agi: row.federalAgi }));
}
console.log('TERMINATOR probe-grossup done');
