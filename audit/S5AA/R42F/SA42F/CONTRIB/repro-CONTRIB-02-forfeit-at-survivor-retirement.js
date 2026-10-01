// CONTRIB-02: a deceased owner's unvested employer money is forfeited at the SURVIVOR's retirement, on the survivor's clock,
// with "service" accruing after the death. Declared (R38 §6; R40 unrepaired list): "A death before separation forfeits nothing
// and vests nothing: the model has no separation at death."
'use strict';
const { h, acct, work, run } = require('./lib.js');
function plan(selfLife) {
  return work({ age: 45, couple: true, spouseAge: 45, retireAge: 50, stop: 50, endAge: 52, salary: 100000, spouseSalary: 50000, selfLife,
    accounts: [acct('brok', 'taxable', 0), acct('k', 'traditional401k', 0, { contribution: 10000, matchOn: true, matchRate: 100, matchCap: 10, vesting: 0, yearsOfService: 0 })] });
}
for (const life of [47, 120]) {
  const { r } = run(plan(life));
  console.log(`selfLife ${life}:`);
  for (let i = 1; i < r.rows.length; i++) { const w = r.rows[i]; console.log(`  row ${w.age}: preTax ${w.preTax.toFixed(2)}  contributions ${w.contributions.toFixed(2)}`); }
}
