// CONTRIB-05: R42 (R41F-04) made the planned Roth IRA phase-out read each salary at its worked share, but the mirrored one-time
// path (a transfer from a taxable account into a Roth IRA, a contribution since R29) still passes the annual salary rates to
// rothContributionLimit(). Same row, same household: a planned $7,500 is allowed, a one-time $7,500 is refused.
'use strict';
const { h, acct, work, run } = require('./lib.js');
// R41F-04's witness: joint; self 44, salary 0; spouse 45, salary rate $260,000; common retirement age 45.5 (spouse works half the row)
function mk(mode) {
  const p = work({ age: 44, couple: true, spouseAge: 45, retireAge: 45.5, stop: 55, endAge: 46, salary: 0, spouseSalary: 260000,
    accounts: [acct('brok', 'taxable', 50000), acct('roth', 'rothIRA', 0, { contribution: mode === 'planned' ? 7500 : 0 })] });
  if (mode === 'one-time') Object.assign(p.advanced, { transferOn: true, transferFrom: 'brok', transferTo: 'roth', transferAmount: 7500, transferAge: 44.5 });
  return p;
}
for (const m of ['planned', 'one-time']) {
  const { r } = run(mk(m));
  const row = r.rows[1];
  console.log(`${m.padEnd(8)}: row ${row.age} wages/income ${row.income}, AGI ${row.federalAgi.toFixed(2)}, Roth IRA ${row.roth}  (expected 7500)`);
  if (r.limitWarnings.length) console.log('   ', r.limitWarnings.join(' | '));
}
