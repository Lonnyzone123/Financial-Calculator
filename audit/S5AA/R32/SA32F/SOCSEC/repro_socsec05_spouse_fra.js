'use strict';
// SOCSEC-05: the spouse's benefit (and earnings test) uses the SELF's full retirement age. ssFullRetirementAge(p) reads
// the one household field retirement.ssFra ("Your full retirement age"); there is no spouse FRA.
// Law (SSA, "Full Retirement and Age 62 Benefit By Year Of Birth"): FRA is set by each person's own birth year:
// 1958 -> 66 and 8 months; 1960 and later -> 67. DRCs 2/3 of 1% a month from FRA to 70 (SSA, Delayed Retirement Credits).
// Run: node repro_socsec05_spouse_fra.js
const { couple, run, report } = require('./lib.js');
let bad = 0;
// Self 60 (born 1966, FRA 67, ssFra 67 correct for the self). Spouse 68 (born 1958, FRA 66y8m), own PIA 2,000.
// Case A: spouse claims at 70. Law: 40 months * 2/3% = 26.667% -> 2533.33/mo -> 30,400/yr.
//   Engine uses FRA 67: 36 months -> 24% -> 2480 -> 29,760.
{
  const r = run(couple({ age: 60, spouseAge: 68, spouseSS: 2000, spouseClaim: 70, ssBenefit: 0, survivor: false }));
  bad += report('A: spouse (born 1958) claims at 70, row self 62-63 / spouse 70-71', 2000 * (1 + 40 * 2 / 300) * 12, r.rows[3].income);
}
// Case B: spouse claimed at 62 (before the plan). Law: 56 months early = 36*5/9% + 20*5/12% = 20% + 8.333% -> 71.667%
//   -> 1433.33/mo -> 17,200/yr. Engine with FRA 67: 60 months -> 70% -> 16,800.
{
  const r = run(couple({ age: 60, spouseAge: 68, spouseSS: 2000, spouseClaim: 62, ssBenefit: 0, survivor: false }));
  bad += report('B: spouse (born 1958) claimed at 62, row self 60-61', 2000 * (1 - 0.20 - 20 * 5 / 1200) * 12, r.rows[1].income);
}
// Swap: the same 68-year-old as the SELF, ssFra entered as 66.6667 (the validator accepts it; the UI rounds to halves).
{
  const p = couple({ age: 68, spouseAge: 60, ssBenefit: 2000, ssClaim: 70, ssFra: 66 + 8 / 12, survivor: false });
  const r = run(p);
  console.log('swap check: same person as SELF with ssFra 66y8m, row 70-71 engine: ' + r.rows[3].income.toFixed(2) +
    ' -- but the 60-year-old spouse (born 1966, FRA 67) is now read at FRA 66y8m');
}
console.log(`plans run: 3; mismatches: ${bad}`);
