'use strict';
// SOCSEC-03: no spouse's (auxiliary) benefit exists. A spouse with little or no record of their own receives only
// the entered own benefit, never up to one-half of the worker's PIA.
// Law: 20 CFR 404.333: "one-half the insured person's primary insurance amount"; reduced 25/36 of 1% a month for the
// first 36 months and 5/12 of 1% after (20 CFR 404.410); no delayed credits; payable only once the worker is entitled
// (20 CFR 404.330). Deemed filing (born 1954 or later): the own and spouse's benefit are taken together.
// Run: node repro_socsec03_no_spousal.js
const { couple, run, report } = require('./lib.js');
let bad = 0;
// Case A: both 67 at start (FRA 67), worker PIA 3000 claims 67, spouse own 0 claims 67.
//   Law: worker 36,000 + spouse 0.5*3000*12 = 18,000 -> 54,000/yr household.
{
  const r = run(couple({ age: 67, spouseAge: 67, ssBenefit: 3000, ssClaim: 67, spouseSS: 0, spouseClaim: 67, survivor: false }));
  bad += report('A: non-earning spouse at FRA, worker filed at FRA (row 67-68)', 36000 + 18000, r.rows[1].income);
}
// Case B: spouse own PIA 600, both claim at 67. Law (deemed filing): own 600 + spousal excess (1500 - 600) = 1500/mo.
//   Household = 36,000 + 18,000 = 54,000. Engine pays 36,000 + 7,200 = 43,200.
{
  const r = run(couple({ age: 67, spouseAge: 67, ssBenefit: 3000, ssClaim: 67, spouseSS: 600, spouseClaim: 67, survivor: false }));
  bad += report('B: low-earning spouse (own 600) at FRA (row 67-68)', 36000 + 18000, r.rows[1].income);
}
// Case C: the obvious workaround -- enter the spousal amount (1500) as the spouse's own benefit and claim at 62 (spouse 62,
//   worker 67 and filed). Law: spousal at 62 = 1500 * (1 - 36*25/36% - 24*5/12%) = 1500 * (1 - .25 - .10) = 975/mo.
//   The engine reduces it as a retirement benefit: 1500 * 0.70 = 1050/mo. And at 70 the workaround earns 24% DRCs
//   (1860/mo) that a spouse's benefit never earns (law 1500).
{
  const r = run(couple({ age: 67, spouseAge: 62, ssBenefit: 3000, ssClaim: 67, spouseSS: 1500, spouseClaim: 62, survivor: false }));
  bad += report('C1: workaround, spousal entered as own, claimed at 62 (row 67-68)', 36000 + 975 * 12, r.rows[1].income);
  const r2 = run(couple({ age: 67, spouseAge: 70, ssBenefit: 3000, ssClaim: 67, spouseSS: 1500, spouseClaim: 70, survivor: false }));
  bad += report('C2: workaround, spousal entered as own, claimed at 70 (row 67-68)', 36000 + 1500 * 12, r2.rows[1].income);
}
console.log(`plans run: 4; mismatches: ${bad}`);
