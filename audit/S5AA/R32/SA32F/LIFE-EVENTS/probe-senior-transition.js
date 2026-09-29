'use strict';
// Declared-behaviour check at 70: the year of death keeps both age-65 amounts on a joint return; the survivor is single after.
const L = require('./lib.js');
for (const who of ['spouse', 'self']) {
  const p = L.couple({ profile: { age: 70, spouseAge: 70, retireAge: 60, endAge: 74 },
    retirement: { selfLife: who === 'self' ? 71 : 95, spouseLife: who === 'spouse' ? 71 : 95,
      otherIncomes: [{ name: 'Annuity', type: 'pension', owner: 'household', amount: 100000, start: 0, end: 200, growth: 0, growthMode: 'fixed' }] } });
  const r = L.run(p);
  // hand joint: ded 32,200+2*1,650+2*6,000=47,500 -> TI 52,500 -> 2,480+12%*27,700=5,804; AZ (100,000-32,200-4,200)*2.5%=1,590 -> 7,394
  // hand single: ded 16,100+2,050+(6,000-6%*25,000=4,500)=22,650 -> TI 77,350 -> 5,800+22%*26,950=11,729; AZ (100,000-16,100-2,100)*2.5%=2,045 -> 13,774
  console.log(who, 'dies at 71:', r.rows.slice(1).map(x => x.age + ':' + x.taxes.toFixed(2)).join('  '), '| hand 71,72: 7394 ; 73,74: 13774');
}
