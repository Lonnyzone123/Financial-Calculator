'use strict';
// TAX-FED-02: a "Self-employment profit" stream bears SE tax but never receives the IRC 199A qualified business income deduction,
// and nothing in the result or the app says so. Run: node repro-TAX-FED-02-no-qbi-deduction.js
const h = require('../harness.js'); const g = h.grid;
const se = { id: 'se', name: 'Consulting', type: 'selfEmployment', amount: 80000, start: 0, end: 120, owner: 'self', growthMode: 'fixed', growth: 0 };
const p = g.basePlan({ age: 50, retireAge: 50, endAge: 52, spending: 50000, otherIncomes: [se], accounts: [g.account('ira', 'traditionalIRA', 100000)] });
const v = h.validateScenario(structuredClone(p)); const r = h.engine.runPlan(structuredClone(p)); const row = r.rows[1];
console.log('validateScenario.valid', v.valid, '| status', r.status, '| issues', (r.issues || []).map(i => i.code).join(',') || 'none');
// Hand, 2026, single:
const net = 80000 * 0.9235, seTax = net * 0.124 + net * 0.029, half = seTax / 2;          // Schedule SE
const agi = 80000 - half, tiBefore = agi - 16100;                                           // Form 1040 line 11, 14
const qbi = 80000 - half;                                                                   // Reg. 1.199A-3(b)(1)(vi)
const qbiDed = Math.max(400, Math.min(0.2 * qbi, 0.2 * (tiBefore - 0)));                    // 199A(a), (b)(3)(A) below $201,750; (i)
const ti = tiBefore - qbiDed;
const reg = t => t <= 12400 ? 0.1 * t : t <= 50400 ? 1240 + 0.12 * (t - 12400) : 5800 + 0.22 * (t - 50400);
const az = 0.025 * Math.max(0, agi - 16100);                                                // Arizona starts from federal AGI; no QBI
const expected = reg(ti) + seTax + az;
console.log(`hand: SE tax ${seTax.toFixed(2)}, AGI ${agi.toFixed(2)}, QBI deduction ${qbiDed.toFixed(2)}, taxable ${ti.toFixed(2)}, federal ${reg(ti).toFixed(2)}, AZ ${az.toFixed(2)}, total ${expected.toFixed(2)}`);
console.log(`engine: AGI ${row.federalAgi.toFixed(2)}, taxes ${row.taxes.toFixed(2)}  -> overstated by ${(row.taxes - expected).toFixed(2)} a year`);
console.log(`engine federal if no QBI deduction: ${reg(tiBefore).toFixed(2)} (= taxes - SE - AZ = ${(row.taxes - seTax - az).toFixed(2)})`);
console.log('REPRO DONE');
