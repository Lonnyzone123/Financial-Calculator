// TAXFED-06 (P3): effectiveMarginalRate() accepts no net-investment-income-other-than-gains (niiOther) and no carried loss, so for a
// household whose NII is rental income or non-qualified dividends it cannot see the 3.8% surtax an extra IRA dollar triggers.
// Run: node repro-TAXFED-06-emr-nii.js
'use strict';
const h = require('../harness.js');
const E = h.engine;
const p = { profile: { filing: 'single', age: 50, spouseOn: false }, retirement: { selfLife: 110 } };
// Household: pension 100,000 + rental 150,000 (NII). MAGI 250,000 > 200,000, NII 150,000 > excess, so every extra ordinary dollar
// (an IRA withdrawal) raises NIIT by 3.8 cents. Hand marginal rate on $100 more ordinary income:
//   federal 32% (taxable 233,900 in the 32% band) + NIIT 3.8% + Arizona 2.5% = 38.3%.
const emr = E.effectiveMarginalRate(p, 50, { ordinaryIncome: 250000 }, 'ordinary');
const t = (x) => E.estimateTaxes(p, 50, 250000 + x, 0, 0, 0, 0, 0, 0, 0, 150000, 0).total;
console.log(JSON.stringify({ emrAbove: emr.above, handAbove: 0.383, fullReturnAbove: (t(100) - t(0)) / 100, understatedBy: +(0.383 - emr.above).toFixed(4) }));
let threw = null; try { E.effectiveMarginalRate(p, 50, { ordinaryIncome: 250000, niiOther: 150000 }, 'ordinary'); } catch (e) { threw = e.message; }
console.log(JSON.stringify({ niiOtherKeyAccepted: threw === null, result: threw === null ? 'silently ignored' : threw }));
console.log('TERMINATOR repro-TAXFED-06 done');
