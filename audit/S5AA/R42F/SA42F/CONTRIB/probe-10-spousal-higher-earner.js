const { h, acct, work, run } = require('./lib.js');
for (const [sal, ssal, rq, rqs] of [[4000, 3000, 7500, 0], [3000, 4000, 7500, 0], [10000, 0, 7500, 7500]]) {
  const p = work({ age: 45, couple: true, spouseAge: 45, retireAge: 46, endAge: 46, salary: sal, spouseSalary: ssal,
    accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('iraS', 'traditionalIRA', 0, { contribution: rq, priority: 1 }), acct('iraP', 'traditionalIRA', 0, { owner: 'spouse', contribution: rqs, priority: 2 })] });
  const { r } = run(p);
  console.log({ sal, ssal, rq, rqs }, 'IRA total', r.rows[1].preTax, 'taxable', r.rows[1].taxable, 'AGI', r.rows[1].federalAgi);
}
