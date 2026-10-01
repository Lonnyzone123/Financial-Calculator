'use strict';
const { h, base, income, check } = require('./common.js');
// Self dies at 68 (selfLife 68); spouse lives on. LTC deterministic: start max(65, round(60+10)) = 70 on the SELF's clock.
const p = base({ age: 66, endAge: 76, retireAge: 60, filing: 'mfj', spouseOn: true, spouseAge: 66, selfLife: 68 });
income(p, 'pension', 50000, 'spouse');
Object.assign(p.advanced, { ltcOn: true, ltcCost: 100000, ltcProbability: 100, ltcYears: 3, ltcInsurance: 0, healthInflation: 0 });
const r = check(p);
r.rows.slice(1).forEach(x => console.log('row', x.age, 'spending', x.spending));
