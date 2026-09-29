'use strict';
// SOCSEC-07: no grace-year (monthly) earnings test. A person who stops work mid-year and claims at once has benefits
// withheld for the months AFTER retirement because the whole year's wages exceed the annual exempt amount.
// Law: 20 CFR 404.435 -- benefits are not reduced for excess earnings in "a non-service month in your grace year";
// the grace year is "the first taxable year in which the beneficiary has a non-service month ... in or after the month
// in which the beneficiary is entitled". 2026 monthly exempt amount $2,040 (SSA 2026 COLA fact sheet).
// Run: node repro_socsec07_grace_year.js
const { single, run, report } = require('./lib.js');
let bad = 0;
// Single, 62, salary 60,000, retires at 62.5 and claims at 62.5. PIA 2,000, 54 months early -> 72.5% -> 1,450/mo.
//   Paid months 62.5-63: 6 * 1,450 = 8,700.  Wages in the row: 30,000 (to 62.5), none after.
//   Law: every entitled month is a non-service month of the grace year -> nothing withheld -> SS 8,700.
//   Engine: (30,000 - 24,480) / 2 = 2,760 withheld -> SS 5,940.
{
  const p = single({ age: 62, years: 2, ssBenefit: 2000, ssClaim: 62.5 });
  p.profile.retireAge = 62.5;
  Object.assign(p.employment, { salary: 60000, growth: 0, contributionStop: 62.5 });
  const r = run(p);
  const ssPaid = r.rows[1].income - 30000; // income = wages + outside income
  bad += report('SS paid in row 62-63 (retired and claimed at 62.5)', 8700, ssPaid);
  console.log('  row 62-63 income ' + r.rows[1].income.toFixed(2) + ' (wages 30,000 + SS)');
}
console.log(`plans run: 1; mismatches: ${bad}`);
