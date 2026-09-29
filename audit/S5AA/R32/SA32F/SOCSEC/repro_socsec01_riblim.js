'use strict';
// SOCSEC-01: a survivor of a worker who claimed EARLY is paid the deceased's REDUCED benefit, further reduced for the
// survivor's own age. Law (20 CFR 404.338, POMS RS 00615.320): the widow(er) benefit is 100% of the deceased's PIA,
// reduced for the survivor's age, and then LIMITED to the larger of the deceased's reduced benefit and 82.5% of PIA.
// The engine's figure is BELOW the law in every such case, while its SURVIVOR_BENEFIT_APPROXIMATED warning says the
// missing cap makes an affected result "too high".
// Run: node repro_socsec01_riblim.js
const { couple, run, report } = require('./lib.js');
let bad = 0;
const PIA = 3000;

// Case A: deceased (self) claimed at 62 -> RIB = 3000 * 0.70 = 2100. Self dies at 68.0. Survivor (spouse) is 68 at the
// death (past survivor FRA 67), own benefit 0.
//   Law: min(PIA * 1.00, max(RIB 2100, 0.825 * 3000 = 2475)) = 2475/mo -> 29,700/yr.
{
  const p = couple({ age: 67, spouseAge: 67, ssBenefit: PIA, ssClaim: 62, selfLife: 68 });
  const r = run(p);
  const survivorRow = r.rows[2]; // interval 68-69, the spouse alone
  bad += report('A: deceased claimed at 62, survivor at FRA (row 68-69)', Math.max(2100, 0.825 * PIA) * 12, survivorRow.income);
  const w = (r.issues || []).find(x => x.code === 'SURVIVOR_BENEFIT_APPROXIMATED');
  console.log('  warning says: "' + (w && w.message.match(/so it is NOT applied here and an affected result is too high/)[0]) + '"');
}
// Case B: same deceased, survivor 60 at the death (spouse 59 at plan start, self dies at 68.0 -> spouse 60.0).
//   Law: PIA * 0.715 = 2145; RIB-LIM = max(2100, 2475) = 2475; benefit = min(2145, 2475) = 2145/mo -> 25,740/yr.
//   Engine: RIB 2100 * 0.715 = 1501.50/mo -> 18,018/yr.
{
  const p = couple({ age: 67, spouseAge: 59, ssBenefit: PIA, ssClaim: 62, selfLife: 68 });
  const r = run(p);
  bad += report('B: deceased claimed at 62, survivor starts at 60 (row 68-69)', PIA * 0.715 * 12, r.rows[2].income);
}
// Case C: deceased claimed at 64 (36 months early, RIB = 80% = 2400); survivor at FRA.
//   Law: min(3000, max(2400, 2475)) = 2475/mo -> 29,700/yr. Engine 2400 -> 28,800.
{
  const p = couple({ age: 67, spouseAge: 67, ssBenefit: PIA, ssClaim: 64, selfLife: 68 });
  const r = run(p);
  bad += report('C: deceased claimed at 64, survivor at FRA (row 68-69)', 2475 * 12, r.rows[2].income);
}
console.log(`plans run: 3; mismatches: ${bad}`);
