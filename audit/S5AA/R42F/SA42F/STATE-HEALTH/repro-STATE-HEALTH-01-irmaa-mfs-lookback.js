'use strict';
// STATE-HEALTH-01: a pre-plan IRMAA lookback return entered as "mfs" (the validator's enum allows it) is priced on the
// individual table. CMS 2026 / 20 CFR 418.1115(d): married filing separately and lived with the spouse -> >$109,000 to <$391,000
// pays $649.20 Part B + $83.30 Part D. Run: node repro-STATE-HEALTH-01-irmaa-mfs-lookback.js
const { h, base, income, check, row, cmp, summary } = require('./common.js');
const PARTD = 38.99 * 12, DED = 283;
const annual = (b, d) => (b + d) * 12 + DED + PARTD;
// Married couple, both alive, joint return today; self 66 (on Medicare), spouse 60 (not). They filed separately in the two
// years before the plan (self's own MAGI 150,000 each year), living together.
const p = base({ age: 66, endAge: 69, retireAge: 60, filing: 'mfj', spouseOn: true, spouseAge: 60 });
Object.assign(p.advanced, { healthOn: true, healthCost: 0, healthInflation: 0,
  irmaaMagiTwoYearsBefore: 150000, irmaaMagiOneYearBefore: 150000,
  irmaaFilingTwoYearsBefore: 'mfs', irmaaFilingOneYearBefore: 'mfs' });
income(p, 'pension', 50000);
const v = h.validateScenario(structuredClone(p));
console.log('validator valid=' + v.valid + ' errors=' + JSON.stringify(v.issues.filter(i => i.severity === 'ERROR')));
const r = check(p);
console.log('engine irmaaMonthly(150000,"mfs") = ' + h.engine.irmaaMonthly(150000, 'mfs') + ' (single tier 3 = 443.30; MFS lived-together = 732.50)');
cmp('plan year 0 (looks back to the mfs return two years before)', row(r, 67).spending, annual(649.20, 83.30));
cmp('plan year 1 (looks back to the mfs return one year before)', row(r, 68).spending, annual(649.20, 83.30));
cmp('control plan year 2 (looks back to the plan\'s own joint return, 50,000): standard', row(r, 69).spending, annual(202.90, 0));
summary();
