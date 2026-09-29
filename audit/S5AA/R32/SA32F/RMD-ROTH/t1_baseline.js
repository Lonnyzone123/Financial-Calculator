const { plan, acct, check, row, codes } = require('./lib.js');
// 1. single, 75, $100,000 IRA
let r = check(plan({ age: 75, endAge: 77, accounts: [acct('ira', 'traditionalIRA', 100000)] }));
console.log('single75', row(r, 1), row(r, 2), codes(r));
// 2. couple self 75 spouse 64 (11 years younger), self IRA $100,000
r = check(plan({ age: 75, endAge: 76, spouseOn: true, spouseAge: 64, accounts: [acct('ira', 'traditionalIRA', 100000)] }));
console.log('couple75/64', row(r, 1), codes(r));
