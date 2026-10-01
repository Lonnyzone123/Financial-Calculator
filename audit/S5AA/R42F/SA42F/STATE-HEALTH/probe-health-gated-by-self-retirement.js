'use strict';
// Observation: health/Medicare costs are gated on the SELF's retired span (retiredDuration), for every person in the household.
const { h, base, income, check, row } = require('./common.js');
// Self 60 still working to 67 (salary 80k); spouse 68, retired, on Medicare.
const p = base({ age: 60, endAge: 63, retireAge: 67, filing: 'mfj', spouseOn: true, spouseAge: 68 });
Object.assign(p.employment, { salary: 80000, contributionStop: 101 });
Object.assign(p.advanced, { healthOn: true, healthCost: 12000, healthInflation: 0 });
const r = check(p);
r.rows.slice(1).forEach(x => console.log('row', x.age, 'spending (health)', x.spending));
// Mirror: self 68 retired, spouse 60 still working with salary.
const q = base({ age: 68, endAge: 71, retireAge: 60, filing: 'mfj', spouseOn: true, spouseAge: 60 });
Object.assign(q.employment, { spouseSalary: 80000, contributionStop: 101 });
Object.assign(q.advanced, { healthOn: true, healthCost: 12000, healthInflation: 0 });
const rq = check(q);
rq.rows.slice(1).forEach(x => console.log('mirror row', x.age, 'spending (health)', x.spending));
