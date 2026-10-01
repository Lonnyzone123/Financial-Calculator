// CONTRIB-04: the shared HSA family base is consumed at an owner's annual RATE, not at the dollars that owner deposits over their
// window. A spouse whose window is half the row takes the whole $8,750 of base and deposits $4,375; the full-year owner is left none.
// The household HSA then depends on account priority: $4,375 or $8,750.
'use strict';
const { h, acct, work, run } = require('./lib.js');
for (const spouseFirst of [true, false]) {
  const p = work({ age: 44, couple: true, spouseAge: 45, retireAge: 45.5, stop: 70, endAge: 46, salary: 100000, spouseSalary: 100000,
    accounts: [acct('brok', 'taxable', 0, { priority: 9 }),
      acct('hsaSpouse', 'hsa', 0, { owner: 'spouse', contribution: 8750, priority: spouseFirst ? 1 : 2 }),
      acct('hsaSelf', 'hsa', 0, { contribution: 8750, priority: spouseFirst ? 2 : 1 })] });
  const { v, r } = run(p);
  const row = r.rows[1];
  console.log(`${spouseFirst ? 'spouse HSA first' : 'self HSA first  '}: household HSA ${row.hsa}, redirected to taxable ${row.taxable}, AGI ${row.federalAgi}, taxes ${row.taxes}  (expected HSA 8750, taxable 4375)`);
}
