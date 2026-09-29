// TAXFED-04: with a spouse modelled (spouseOn) and a non-joint filing status (single or hoh), the validator accepts the plan and
// the engine counts the SPOUSE's age-65 amounts on the non-joint return: a second $6,000 senior deduction (allowed for a spouse
// only "in the case of a joint return", IRC 151(d)(5)(C)(ii)(II)) and a second $2,050 aged addition.
// Run: node repro-TAXFED-04-spouse-on-nonjoint.js
'use strict';
const h = require('../harness.js');
for (const filing of ['single', 'hoh']) {
  const p = h.plan({ years: 1, retireAge: 70, pension: 60000, amount: 0 });
  p.profile.age = 70; p.profile.retireAge = 70; p.profile.endAge = 71; p.profile.filing = filing;
  p.profile.spouseOn = true; p.profile.spouseAge = 70;
  p.employment.contributionStop = 70; Object.assign(p.retirement, { dividendStart: 70, selfLife: 100, spouseLife: 100 });
  p.advanced.transferOn = false;
  p.accounts = [h.account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} })];
  const v = h.validateScenario(structuredClone(p));
  const warn = v.issues.filter(x => /filing|spouse/i.test(JSON.stringify(x))).map(x => x.code);
  const r = h.run(p), row = r.rows[1];
  const std = filing === 'hoh' ? 24150 : 16100;
  const azEngine = .025 * Math.max(0, row.federalAgi - std - 2 * 2100);   // engine's Arizona (state area, not audited here)
  // Hand (the return's only taxpayer is 70): deduction std + 2,050 + 6,000; MAGI 60,000 < 75,000.
  //  single: 16,100 + 8,050 = 24,150; taxable 35,850; tax 1,240 + 12% x 23,450 = 4,054
  //  hoh:    24,150 + 8,050 = 32,200; taxable 27,800; tax 1,770 + 12% x (27,800 - 17,700) = 2,982
  const hand = filing === 'single' ? 4054 : 2982;
  console.log(JSON.stringify({ filing, valid: v.valid, spouseOrFilingIssues: warn, status: r.status, engineFederal: +(row.taxes - azEngine).toFixed(2), handFederal: hand,
    under: +(hand - (row.taxes - azEngine)).toFixed(2) }));
}
// Self/spouse asymmetry control: the same plan with the spouse at 60 (not 65+) gives the hand figure exactly.
const E = h.engine;
const pe = (sa) => ({ profile: { filing: 'single', age: 70, spouseOn: true, spouseAge: sa }, retirement: { selfLife: 110, spouseLife: 110 } });
console.log(JSON.stringify({ direct: { spouse60: E.estimateTaxes(pe(60), 70, 60000, 0, 0, 0, 0, 0, 0, 0, 0, 0).federal, spouse70: E.estimateTaxes(pe(70), 70, 60000, 0, 0, 0, 0, 0, 0, 0, 0, 0).federal } }));
console.log('TERMINATOR repro-TAXFED-04 done');
