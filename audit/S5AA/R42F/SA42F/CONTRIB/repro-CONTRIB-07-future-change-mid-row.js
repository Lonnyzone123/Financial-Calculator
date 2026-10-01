// CONTRIB-07 (P3): a future contribution change dated inside a row (the form's "At age" takes half-years) is applied only from the
// next row, so the row containing it credits a whole row at the old amount.
'use strict';
const { h, acct, work, run } = require('./lib.js');
for (const chAge of [46.5, 47]) {
  const p = work({ age: 45, salary: 100000, retireAge: 65, endAge: 65,
    accounts: [acct('brok', 'taxable', 0), acct('k', 'traditional401k', 0, { contribution: 10000, futureChanges: [{ age: chAge, mode: 'set', value: 0 }] })] });
  const { r } = run(p);
  const out = []; for (let i = 1; i <= 3; i++) out.push(`${r.rows[i - 1].age}->${r.rows[i].age}: ${Math.round(r.rows[i].preTax - r.rows[i - 1].preTax)}`);
  console.log(`"set to $0 at ${chAge}": ${out.join(' | ')}   expected row 46->47: ${chAge === 46.5 ? 5000 : 10000}`);
}
