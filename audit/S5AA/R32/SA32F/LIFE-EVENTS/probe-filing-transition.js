'use strict';
// Declared-behaviour check: joint in the year of death, single after; survivor spending reduction from the next year.
const L = require('./lib.js');
const p = L.couple({ profile: { age: 60, spouseAge: 58, retireAge: 55, endAge: 64 },
  retirement: { spouseLife: 59, spending: 50000, strategy: 'fixedNominal', survivorSpendingReduction: 20,
    otherIncomes: [{ name: 'Annuity', type: 'pension', owner: 'household', amount: 100000, start: 0, end: 200, growth: 0, growthMode: 'fixed' }] } });
console.log(JSON.stringify(L.check(p)));
const r = L.run(p);
// hand: MFJ fed (100000-32200)=67800 -> 2480+0.12*43000=7640; AZ 2.5%*(100000-32200)=1695 -> 9335
//       single fed (100000-16100)=83900 -> 1240+4560+0.22*33500=7370 -> 13170; AZ 2.5%*83900=2097.5 -> 15267.5
r.rows.forEach(x => console.log(x.age, 'taxes', x.taxes.toFixed(2), 'spending', x.spending.toFixed(2), 'income', x.income, 'total', x.total.toFixed(2)));
