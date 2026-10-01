const { h, acct, work, run, bal } = require('./lib.js');
const p = work({ age: 45, couple: true, spouseAge: 45, retireAge: 65, endAge: 65, salary: 200000, spouseSalary: 100000, spouseLife: 45.5,
  accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('roth', 'rothIRA', 0, { contribution: 7500, priority: 1 })] });
const { r } = run(p);
for (let i = 1; i < 4; i++) console.log(JSON.stringify(bal(r, i)));
