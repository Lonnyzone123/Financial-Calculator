'use strict';
// STATE-HEALTH-02: later-year IRMAA joint thresholds are indexed and rounded on their own, not set at twice the indexed single
// amounts as 42 USC 1395r(i)(3)(C)(ii) requires. Run: node repro-STATE-HEALTH-02-irmaa-joint-threshold-rounding.js
const { h, base, income, check, row, cmp, summary } = require('./common.js');
const near = (x, m) => Math.floor(x / m + .5 + 1e-9) * m;
const PARTD = 38.99 * 12, DED = 283, annual = (b, d, n) => ((b + d) * 12 + DED + PARTD) * n;
// 2.5% inflation: 2027 single first threshold = 109,000 x 1.025 = 111,725 -> 112,000 (nearest $1,000, (i)(5)(B)); joint = 2 x 112,000 = 224,000.
const single27 = near(109000 * 1.025, 1000), lawJoint27 = 2 * single27;
const rulesK1 = h.engine.taxYearRules ? null : null;
console.log('2027 single first threshold (hand) = ' + single27 + '; joint by statute = ' + lawJoint27 + '; engine joint = ' + near(218000 * 1.025, 1000) + ' (218,000 x 1.025 = 223,450 rounded on its own)');
// Couple, both 66, mfj; joint return the year before the plan shows MAGI 223,500 (between 223,000 and 224,000).
const p = base({ age: 66, endAge: 69, retireAge: 60, filing: 'mfj', spouseOn: true, spouseAge: 66 });
p.assumptions.inflation = 2.5;
Object.assign(p.advanced, { healthOn: true, healthCost: 0, healthInflation: 0,
  irmaaMagiTwoYearsBefore: 100000, irmaaMagiOneYearBefore: 223500, irmaaFilingTwoYearsBefore: 'mfj', irmaaFilingOneYearBefore: 'mfj' });
income(p, 'pension', 100000);
const r = check(p);
cmp('plan year 1 (tax year 2027; lookback 223,500 joint <= 224,000): standard for two', row(r, 68).spending, annual(202.90, 0, 2));
cmp('control plan year 0 (2026 figures, lookback 100,000): standard for two', row(r, 67).spending, annual(202.90, 0, 2));
summary();
