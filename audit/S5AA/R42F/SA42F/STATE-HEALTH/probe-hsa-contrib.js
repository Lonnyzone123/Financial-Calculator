'use strict';
const { h, base, income, check, row } = require('./common.js');
// single, working, salary 100k, HSA contribution 4,400 (self limit 2026), age 50 -> 51.
function mk(age, contrib, salary=100000){
  const p = base({ age, endAge: age+2, retireAge: age+5 });
  Object.assign(p.employment, { salary, contributionStop: 101 });
  p.accounts.push(h.account('hsa', 'hsa', 0, { contribution: contrib }));
  return p;
}
for (const [age, c] of [[50,4400],[64,5400],[66,5400]]) {
  const r = check(mk(age, c));
  r.rows.slice(1).forEach(x => console.log('age', age, 'row', x.age, 'contrib', x.contributions, 'hsa', x.hsa, 'agi', x.federalAgi, 'taxes', x.taxes));
  console.log(' issues', (r.issues||[]).map(i=>i.code).join(','), 'limitWarnings', JSON.stringify(r.limitWarnings||[]).slice(0,300));
}
