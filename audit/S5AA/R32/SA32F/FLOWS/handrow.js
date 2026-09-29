'use strict';
// Hand verification of full rows: (A) the tax gross-up on a pre-tax draw, (B) dividends paid, taxed and retained,
// (C) the shortfall when every account is empty.
// 2026 constants used (Rev. Proc. 2025-32): single standard deduction 16,100; single brackets 10% to 12,400, 12% to 50,400;
// additional standard deduction (single, 65+) 2,050; senior deduction 6,000 (IRC 151(d)(5)); 0% LTCG to 49,450 single.
// Arizona: 2.5% flat (A.R.S. 43-1011), basic standard deduction 16,100 single (the engine's INFERRED record, MODEL_ASSUMPTIONS 16),
// age-65 exemption 2,100.
const L = require('./lib.js');
const { account } = L;
function run(p) { const v = L.h.validateScenario(structuredClone(p)); if (!v.valid) throw new Error(JSON.stringify(v.issues)); const r = L.h.engine.runPlan(structuredClone(p)); if (r.status !== 'ok') throw new Error(r.status); return r; }
const res = [];
function cmp(label, actual, expected) { res.push({ label, actual: +actual.toFixed(2), expected: +expected.toFixed(2), diff: +(actual - expected).toFixed(2), verdict: Math.abs(actual - expected) < 0.01 ? 'PASS' : 'MISMATCH' }); }

// (A) single, 60, $500,000 traditional IRA, $50,000 fixed nominal spending, no other income, zero return.
//   W = 50,000 + tax(W); fed = 1,240 + 12% x (W - 16,100 - 12,400); AZ = 2.5% x (W - 16,100)
//   W = 50,000 + 1,240 - 3,420 - 402.50 + 0.145 W  ->  W = 47,417.50 / 0.855
{ const r = run(L.basePlan({ age: 60, endAge: 61, spending: 50000, accounts: [account('ira', 'traditionalIRA', 500000)] }));
  const W = 47417.5 / 0.855, row = r.rows[1];
  cmp('A withdrawals (spending + the tax on the whole draw)', row.withdrawals, W);
  cmp('A taxes', row.taxes, W - 50000);
  cmp('A federal AGI', row.federalAgi, W);
  cmp('A end balance', row.total, 500000 - W);
  cmp('A spending', row.spending, 50000); cmp('A shortfall', row.shortfall, 0); }

// (B) $1,000,000 taxable at 100% basis, 4% dividend yield paid from 0 (80% qualified), $30,000 spending, surplus retained.
//   dividends 40,000 cash; ordinary 8,000 is under the deduction; the remaining 8,100 of deduction comes off the 32,000 qualified -> 23,900 at 0%.
//   AZ 2.5% x (40,000 - 16,100) = 597.50; surplus 10,000 - 597.50 = 9,402.50 retained in a zero-return cash holding.
{ const p = L.basePlan({ age: 60, endAge: 61, spending: 30000, dividendOn: true, dividendYield: 4, dividendStart: 0, accounts: [account('brok', 'taxable', 1e6, { basisPct: 100 })] });
  const r = run(p), row = r.rows[1];
  cmp('B dividends', row.dividends, 40000); cmp('B taxes', row.taxes, 597.5); cmp('B withdrawals', row.withdrawals, 0);
  cmp('B end total (960,000 + 9,402.50 retained)', row.total, 969402.5); cmp('B income', row.income, 40000); }

// (C) single, 67, no portfolio, $60,000 pension, $70,000 spending.
//   fed: 60,000 - 16,100 - 2,050 - 6,000 = 35,850 -> 1,240 + 12% x 23,450 = 4,054; AZ: (60,000 - 16,100 - 2,100) x 2.5% = 1,045
//   shortfall = 70,000 - 60,000 + 5,099 = 15,099 each year; first shortfall at 68, sustained at 69.
{ const p = L.basePlan({ age: 67, endAge: 70, spending: 70000, pension: 60000, accounts: [account('cash', 'taxable', 0, { cashHolding: true, allocation: {}, priority: 0 })] });
  const r = run(p);
  cmp('C taxes', r.rows[1].taxes, 5099); cmp('C shortfall', r.rows[1].shortfall, 15099); cmp('C withdrawals', r.rows[1].withdrawals, 0);
  cmp('C firstShortfallAge', r.firstShortfallAge, 68); cmp('C sustainedFailureAge', r.sustainedFailureAge, 69); cmp('C successRate', r.successRate, 0); }
console.log(res.map(x => JSON.stringify(x)).join('\n'));
