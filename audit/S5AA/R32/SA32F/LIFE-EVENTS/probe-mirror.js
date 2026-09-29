'use strict';
// Mirror test: swap who is "self" and who is "spouse" and require identical household rows.
// Run: node probe-mirror.js [variant]
const L = require('./lib.js');
const variant = process.argv[2] || 'base';
function build(swap) {
  const A = { age: 72, life: variant === 'bfirst' ? 95 : (variant === 'half' ? 80.5 : 80), ss: 2500, claim: 70 }, B = { age: 66, life: variant === 'bfirst' ? 70 : (variant === 'halfb' ? 88.5 : 90), ss: 1500, claim: 67 };
  const gap = A.age - B.age;
  const S = swap ? B : A, P = swap ? A : B;          // S is "self", P is "spouse"
  const own = who => (who === 'A') === !swap ? 'self' : 'spouse';
  const accounts = [
    L.h.account('cash', 'taxable', 50000, { cashHolding: true, allocation: {} }),
    L.h.account('iraA', 'traditionalIRA', 600000, { owner: own('A') }),
    L.h.account('iraB', 'traditionalIRA', 300000, { owner: own('B') }),
    L.h.account('rothB', 'rothIRA', 100000, { owner: own('B') }),
    L.h.account('brkA', 'taxable', 400000, { owner: variant === 'joint' ? 'joint' : own('A'), basisPct: 50 }),
    L.h.account('hsaB', 'hsa', 30000, { owner: own('B') })
  ];
  const p = L.couple({ profile: { age: S.age, spouseAge: P.age, retireAge: 60, endAge: 100 - (swap ? gap : 0) },
    retirement: { ssBenefit: S.ss, ssClaim: S.claim, spouseSS: P.ss, spouseClaim: P.claim, selfLife: S.life, spouseLife: P.life,
      spending: 90000, strategy: 'fixedNominal', survivor: true, survivorSpendingReduction: 20, ssCola: 2 },
    advanced: { rmdOn: true, healthOn: variant === 'health', healthCost: 12000, healthInflation: 0 },
    accounts });
  p.assumptions.returnRate = 5; p.assumptions.inflation = 2.5;
  p.advanced.assetClasses = [{ id: 'flat', name: 'Flat', returnRate: 5, volatility: 0 }];
  return p;
}
const p0 = build(false), p1 = build(true);
for (const p of [p0, p1]) { const c = L.check(p); if (!c.valid) { console.log(JSON.stringify(c.errs)); process.exit(1); } }
const r0 = L.run(p0), r1 = L.run(p1);
const keys = ['total', 'taxable', 'preTax', 'roth', 'hsa', 'income', 'spending', 'withdrawals', 'taxes', 'rmd', 'federalAgi', 'dividends', 'networth'];
let worst = 0, first = null;
console.log('rows', r0.rows.length, r1.rows.length, 'last ages', r0.rows.at(-1).age, r1.rows.at(-1).age);
for (let i = 0; i < Math.max(r0.rows.length, r1.rows.length); i++) {
  const a = r0.rows[i], b = r1.rows[i];
  if (!a || !b) { console.log('row count differs at', i); break; }
  for (const k of keys) { const d = Math.abs(a[k] - b[k]); if (d > worst) worst = d; if (d > 0.01 && !first) first = { i, age0: a.age, age1: b.age, k, v0: a[k], v1: b[k] }; }
}
console.log('variant', variant, 'max abs diff', worst.toFixed(4), 'first', JSON.stringify(first));
console.log('lifetimeTaxes', r0.lifetimeTaxes.toFixed(2), r1.lifetimeTaxes.toFixed(2));
