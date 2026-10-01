const { h, acct, work, run } = require('./lib.js');
for (const [age, chAge] of [[45, 46.5], [45.5, 46.5], [45, 47]]) {
  const p = work({ age, salary: 100000, retireAge: 65, endAge: 65, accounts: [acct('brok', 'taxable', 0), acct('k', 'traditional401k', 0, { contribution: 10000, futureChanges: [{ age: chAge, mode: 'set', value: 0 }] })] });
  const { r } = run(p, true);
  const dep = []; for (let i = 1; i < 5; i++) dep.push(`${r.rows[i - 1].age}->${r.rows[i].age}: ${Math.round(r.rows[i].preTax - r.rows[i - 1].preTax)}`);
  console.log('start', age, 'change "set 0" at', chAge, '|', dep.join(' | '));
}
