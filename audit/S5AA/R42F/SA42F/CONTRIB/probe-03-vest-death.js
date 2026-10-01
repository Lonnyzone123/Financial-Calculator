const { h, acct, work, run, bal } = require('./lib.js');
for (const life of [47, 120]) {
const p = work({ age: 45, couple: true, spouseAge: 45, retireAge: 50, endAge: 52, salary: 100000, spouseSalary: 50000, selfLife: life,
  accounts: [acct('brok', 'taxable', 0), acct('k', 'traditional401k', 0, { contribution: 10000, matchOn: true, matchRate: 100, matchCap: 10, vesting: 0, yearsOfService: 0 })] });
const { v, r } = run(p);
console.log('selfLife', life, v.issues.filter(i=>i.severity!=='INFO').map(i=>i.severity+':'+i.code).join(' '));
for (let i = 1; i < r.rows.length; i++) console.log(JSON.stringify(bal(r, i)));
}
