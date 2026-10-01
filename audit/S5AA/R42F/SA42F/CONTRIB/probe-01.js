const { h, acct, work, run, bal } = require('./lib.js');
const p = work({ age: 45, salary: 100000, accounts: [acct('brok', 'taxable', 0), acct('k', 'traditional401k', 0, { contribution: 30000 }), acct('ira','traditionalIRA',0,{contribution:7500}), acct('roth','rothIRA',0,{contribution:7500})] });
const { r } = run(p);
for (let i = 0; i < r.rows.length; i++) console.log(JSON.stringify(bal(r, i)));
console.log(r.limitWarnings);
console.log(Object.keys(r.rows[1]).join(' '));
