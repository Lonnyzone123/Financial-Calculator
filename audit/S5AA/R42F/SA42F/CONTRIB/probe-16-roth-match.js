const { h, acct, work, run, bal } = require('./lib.js');
const p = work({ age: 45, salary: 100000, retireAge: 65, endAge: 65, accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('k', 'traditional401k', 0, { contribution: 10000, matchOn: true, matchRate: 50, matchCap: 6, matchRoth: true, vesting: 60, yearsOfService: 4 })] });
const { r } = run(p);
for (let i = 1; i < 5; i++) console.log(JSON.stringify(bal(r, i)));
