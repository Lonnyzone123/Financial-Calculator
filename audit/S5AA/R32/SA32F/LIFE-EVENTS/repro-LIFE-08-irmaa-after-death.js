'use strict';
// LIFE-08: after a death, the survivor's IRMAA is read from a JOINT-return year's MAGI against the SINGLE bands.
// 20 CFR 418.1115 applies the bands of the filing status of the tax year used (the lookback year).
// Run: node repro-LIFE-08-irmaa-after-death.js
const L = require('./lib.js');
const p = L.couple({ profile: { age: 70, spouseAge: 70, retireAge: 60, endAge: 78 },
  retirement: { spouseLife: 73, spending: 0,
    otherIncomes: [{ name: 'Annuity', type: 'pension', owner: 'household', amount: 180000, start: 0, end: 200, growth: 0, growthMode: 'fixed' }] },
  advanced: { healthOn: true, healthCost: 0, healthInflation: 0 } });
console.log(JSON.stringify(L.check(p)));
const r = L.run(p);
// hand (CMS 2026 fact sheet; lookback 2 years; plan years 0 and 1 assumed below tier 1 per MODEL_ASSUMPTIONS section 11):
const base = 202.90 * 12 + 283;                 // 2,717.80 per person, no IRMAA
const single180 = (527.50 + 60.40) * 12 + 283;  // 7,337.80: MAGI 180,000 on the individual table
const hand = { 71: 2 * base, 72: 2 * base, 73: 2 * base, 74: 2 * base, 75: base, 76: base, 77: single180, 78: single180 };
// row closing 75 (opening 74) looks back to the row opening 72, a joint return (MAGI 180,000 <= 218,000 -> no IRMAA);
// row closing 76 (opening 75) looks back to the row opening 73, the year of death, also a joint return;
// row closing 77 (opening 76) looks back to the row opening 74, the survivor's first single return.
console.log(JSON.stringify(r.rows.slice(1).map(x => ({ age: x.age, magi: x.irmaaMagi, engineHealth: +x.spending.toFixed(2), hand: +hand[x.age].toFixed(2), diff: +(x.spending - hand[x.age]).toFixed(2) }))));
