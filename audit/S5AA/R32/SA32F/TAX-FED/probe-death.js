// Filing status and age-65 amounts in the year of a death and after (MFJ couple, both 70; self dies at 72.5, then at 72).
'use strict';
const h = require('../harness.js');
const ref = require('./ref.js');
for (const [who, life] of [['self', 72.5], ['self', 72], ['spouse', 72.5]]) {
  const p = h.plan({ years: 5, retireAge: 70, pension: 80000, amount: 0 });
  p.profile.age = 70; p.profile.retireAge = 70; p.profile.endAge = 75; p.profile.filing = 'mfj'; p.profile.spouseOn = true; p.profile.spouseAge = 70;
  p.employment.contributionStop = 70; Object.assign(p.retirement, { dividendStart: 70, selfLife: 100, spouseLife: 100 });
  if (who === 'self') p.retirement.selfLife = life; else p.retirement.spouseLife = life;
  p.advanced.transferOn = false;
  p.accounts = [h.account('cash', 'taxable', 500000, { cashHolding: true, allocation: {} })];
  const v = h.validateScenario(structuredClone(p)); const r = h.run(p);
  r.rows.slice(1).forEach((row, i) => {
    const open = 70 + i;
    const deadOpen = life < open;           // engine rule
    const f = deadOpen ? 'single' : 'mfj', ages = deadOpen ? [70 + i, -1] : [70 + i, 70 + i];
    const fed = ref.federal({ f, ages, ordinary: row.federalAgi }).incomeTax;
    const az = .025 * Math.max(0, row.federalAgi - (f === 'mfj' ? 32200 : 16100) - 2100 * ages.filter(a => a >= 65).length);
    console.log(JSON.stringify({ who, life, rowOpen: open, valid: v.valid, agi: row.federalAgi, engineTaxes: row.taxes, handStatus: f, handTaxes: +(fed + az).toFixed(2), diff: +(row.taxes - fed - az).toFixed(2) }));
  });
}
console.log('TERMINATOR probe-death done');
