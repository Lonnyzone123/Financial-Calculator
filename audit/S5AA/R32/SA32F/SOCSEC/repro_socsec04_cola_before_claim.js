'use strict';
// SOCSEC-04: the PIA receives no cost-of-living increase between eligibility (age 62) and the claim.
// Law: 20 CFR 404.271 -- automatic COLAs apply to the PIA of people who become eligible, "beginning with December of the
// year they become eligible"; eligibility is the year of attaining 62 (SSA bend-point table, note a). Filing is not a
// condition. growthFromCola() counts COLA steps only from the CLAIM age.
// Clean case: the AIME path, which builds the PIA from the 2026 bend points -- the PIA of someone attaining 62 in 2026.
// Run: node repro_socsec04_cola_before_claim.js
const { single, run, report } = require('./lib.js');
let bad = 0;
// Person 62 at the plan start (born 1964, eligible 2026), AIME 6,000, claim at 67, COLA assumption 2.8%, inflation 2.8%.
//   PIA(2026) = 0.90*1286 + 0.32*(6000-1286) = 1157.40 + 1508.48 = 2665.88 (2665.80 after SSA's round-down to the dime;
//   the engine does not round -- 0.08/mo, noted, not counted).
//   COLAs effective Dec 2026, 2027, 2028, 2029, 2030 = 5 before the claim at 67 (2031): x 1.028^5 = 1.148066.
//   Law at claim: 2665.88 * 1.148066 = 3060.60/mo -> 36,727.17/yr (unrounded, to compare like with like).
//   Engine: 2665.88 * 12 = 31,990.56 (no COLA until a year after the claim).
{
  const p = single({ age: 62, years: 7, ssClaim: 67, ssCola: 2.8, inflation: 2.8 });
  Object.assign(p.retirement, { ssAdvanced: true, aime: 6000, ssBenefit: 0 });
  const r = run(p);
  const pia = 0.9 * 1286 + 0.32 * (6000 - 1286);
  bad += report('AIME path, claim 67, row 67-68', pia * Math.pow(1.028, 5) * 12, r.rows[6].income);
  bad += report('AIME path, claim 67, row 68-69 (one COLA after claim; law has 6)', pia * Math.pow(1.028, 6) * 12, r.rows[7].income);
}
// Same mechanism on the entered-figure path: a $2,000 "benefit at full retirement age" entered at 62 is paid as
// $24,000 at 67 in a nominal projection with 2.8% inflation.
{
  const p = single({ age: 62, years: 6, ssBenefit: 2000, ssClaim: 67, ssCola: 2.8, inflation: 2.8 });
  const r = run(p);
  console.log('entered-figure path, row 67-68 engine income: ' + r.rows[6].income.toFixed(2) +
    ' (with 5 COLAs from eligibility it would be ' + (24000 * Math.pow(1.028, 5)).toFixed(2) + ')');
}
console.log(`plans run: 2; mismatches: ${bad}`);
