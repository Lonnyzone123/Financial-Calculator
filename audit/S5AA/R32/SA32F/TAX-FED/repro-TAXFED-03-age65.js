// TAXFED-03: the age-65 deductions (IRC 63(f) aged addition and the 151(d)(5)(C) senior deduction) test each person's age at the
// row's OPENING. Both statutes test the age attained before the close of the taxable year, and the model treats each row as a
// tax year closing at its own end (R32, "Use the year-end age", applied to catch-ups only). The row in which a person turns
// 65 gets neither deduction.   Run: node repro-TAXFED-03-age65.js
'use strict';
const h = require('../harness.js');
function single(openAge) {
  const p = h.plan({ years: 1, retireAge: openAge, pension: 60000, amount: 0 });
  p.profile.age = openAge; p.profile.retireAge = openAge; p.profile.endAge = openAge + 1;
  p.employment.contributionStop = openAge; p.retirement.dividendStart = openAge; p.retirement.selfLife = 100;
  p.advanced.transferOn = false;
  p.accounts = [h.account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} })];
  return p;
}
const out = [];
for (const openAge of [64, 65]) {
  const p = single(openAge), v = h.validateScenario(structuredClone(p)), r = h.run(p), row = r.rows[1];
  // Arizona part as the engine computes it (its age-65 exemption follows the same opening age; state area, not audited here)
  const azEngine = .025 * Math.max(0, row.federalAgi - 16100 - (openAge >= 65 ? 2100 : 0));
  out.push({ openAge, closeAge: row.age, valid: v.valid, status: r.status, engineFederal: +(row.taxes - azEngine).toFixed(2) });
}
// Hand (row closing at 65, a tax year by the model's own convention): AGI 60,000; deduction 16,100 + 2,050 + 6,000 = 24,150
// (MAGI 60,000 < 75,000, no phaseout); taxable 35,850; tax 1,240 + 12% x (35,850 - 12,400) = 4,054.
out[0].handFederal = 4054; out[0].over = +(out[0].engineFederal - 4054).toFixed(2);
out[1].handFederal = 4054; out[1].over = +(out[1].engineFederal - 4054).toFixed(2);
out.forEach(o => console.log(JSON.stringify(o)));
// Couple: both open the row at 64 (MFJ, pension 90,000). Hand: 32,200 + 2 x 1,650 + 2 x 6,000 = 47,500; taxable 42,500;
// tax 2,480 + 12% x (42,500 - 24,800) = 4,604. Without the age amounts: taxable 57,800; tax 2,480 + 12% x 33,000 = 6,440.
const c = single(64); c.profile.filing = 'mfj'; c.profile.spouseOn = true; c.profile.spouseAge = 64; c.retirement.spouseLife = 100; c.retirement.pension = 90000;
const vc = h.validateScenario(structuredClone(c)), rc = h.run(c), rowc = rc.rows[1];
const azc = .025 * Math.max(0, rowc.federalAgi - 32200);
console.log(JSON.stringify({ couple: true, valid: vc.valid, status: rc.status, engineFederal: +(rowc.taxes - azc).toFixed(2), handFederal: 4604, over: +(rowc.taxes - azc - 4604).toFixed(2) }));
// Direct: the engine's deduction switches on only when the OPENING age is 65
const E = h.engine;
for (const a of [64, 64.99, 65]) {
  const e = E.estimateTaxes({ profile: { filing: 'single', age: a, spouseOn: false }, retirement: { selfLife: 110 } }, a, 60000, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  console.log(JSON.stringify({ directOpeningAge: a, engineFederal: e.federal }));
}
console.log('TERMINATOR repro-TAXFED-03 done');
