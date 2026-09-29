'use strict';
// SOCSEC-02: a worker who dies before their planned claim age leaves the survivor NO survivor benefit.
// Law: 20 CFR 404.335 requires only that the insured "died fully insured"; 404.338 pays the survivor the insured's
// primary insurance amount (reduced for the survivor's age). Filing by the deceased is not a condition, and RIB-LIM
// (POMS RS 00615.320) cannot apply because the deceased was never entitled to a reduced benefit.
// Run: node repro_socsec02_death_before_claim.js
const { couple, run, report } = require('./lib.js');
let bad = 0;

// Case A: self PIA 3000, planned claim 67, dies at 65.0 (never claimed). Spouse is 67 at the death (survivor FRA 67,
// factor 1.0), own benefit 0. Law: 3000/mo -> 36,000/yr. Row 65-66 (spouse alone).
{
  const r = run(couple({ age: 64, spouseAge: 66, ssBenefit: 3000, ssClaim: 67, selfLife: 65 }));
  bad += report('A: deceased never claimed, survivor 67 at death, own benefit 0 (row 65-66)', 36000, r.rows[2].income);
}
// Case B: as A, but the survivor has an own benefit of 1,000 at FRA, claimed at 67 (already claimed: survivor is 67).
// Law: own 1000 + excess survivor (3000 - 1000) = 3000/mo total -> 36,000. Engine pays own only.
{
  const r = run(couple({ age: 64, spouseAge: 66, ssBenefit: 3000, ssClaim: 67, spouseSS: 1000, spouseClaim: 67, selfLife: 65 }));
  bad += report('B: deceased never claimed, survivor with own 1,000 (row 65-66)', 36000, r.rows[2].income);
}
// Control: identical to A but the deceased claimed at 64 (before death at 65): engine pays the survivor (RIB 2400 -> 28,800).
{
  const r = run(couple({ age: 64, spouseAge: 66, ssBenefit: 3000, ssClaim: 64, selfLife: 65 }));
  console.log('control, deceased claimed at 64 then died at 65 -> row 65-66 engine income: ' + r.rows[2].income.toFixed(2));
}
console.log(`plans run: 3; mismatches: ${bad}`);
