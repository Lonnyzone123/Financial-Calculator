'use strict';
// DMC: src/debt-arm.js caps (bundled, not called by the engine, no UI). Run: node arm-module-probe.js
const path = require('path');
const arm = require(path.join(__dirname, '../../../../../src/debt-arm.js'));
const am = require(path.join(__dirname, '../../../../../src/debt-amortization.js'));
// 5/1 ARM, start 3%, index 4.5 + margin 2.75 = 7.25 fully indexed; caps 2/2/5 (initial/periodic/lifetime increase)
const cfg = { termMonths: 360, startRatePct: 3, marginPct: 2.75, indexRatePct: 4.5, initialCapPct: 2, periodicCapPct: 2, lifetimeIncreaseCapPct: 5, fixedPeriodMonths: 60, resetEveryMonths: 12 };
const s = arm.armSchedule(300000, cfg);
const rates = s.resets.slice(0, 4).map(r => [r.month, r.rate, r.binding]);
// hand: month 61 -> min(7.25, 3+2)=5 (initialCap); month 73 -> min(7.25, 5+2)=7 (periodicCap); month 85 -> 7.25 (none); lifetime ceiling 8 never binds
// hand payment at month 61: balance after 60 payments at 3% of the 360-month payment, re-amortised at 5% over 300 months
const i = 0.03 / 12, A = 300000 * i / (1 - Math.pow(1 + i, -360)); let b = 300000; for (let m = 0; m < 60; m++) b = b * (1 + i) - A;
const A2 = am.monthlyPayment(b, 5, 300), j = 0.05 / 12, A2hand = b * j / (1 - Math.pow(1 + j, -300));
const seg2 = s.segments[1];
console.log(JSON.stringify({ rates, handRates: [[61, 5, 'initialCap'], [73, 7, 'periodicCap'], [85, 7.25, 'none']],
  segment2Payment: seg2.monthlyPayment, handPayment: A2hand, segment2Opening: seg2.openingBalance, handOpening: b,
  diffPayment: seg2.monthlyPayment - A2hand, diffOpening: seg2.openingBalance - b }));
// Payment-cap-free rate DECREASE: index falls to 1% -> fully indexed 3.75, periodic cap limits a fall to 2 per reset too
const down = arm.armRatePath(Object.assign({}, cfg, { indexPathPct: [4.5, 4.5, 1, 1] }));
console.log(JSON.stringify({ downPath: down.resets.slice(0, 4).map(r => [r.month, r.rate, r.binding]), handDown: [[61, 5], [73, 7], [85, 5], [97, 3.75]] }));
console.log('ARM-MODULE-PROBE DONE');
