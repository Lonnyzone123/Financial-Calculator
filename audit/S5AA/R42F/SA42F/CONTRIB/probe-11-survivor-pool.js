const { h, acct, work, run, bal } = require('./lib.js');
for (const type of ['employment', 'selfEmployment', 'pension']) {
const p = work({ age: 45, couple: true, spouseAge: 45, retireAge: 60, endAge: 49, salary: 0, spouseSalary: 0, spouseLife: 46,
  accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('roth', 'rothIRA', 0, { contribution: 7500, priority: 1 })] });
p.retirement.otherIncomes = [{ name: 'job', type, owner: 'spouse', amount: 50000, start: 45, end: 60, growth: 0, growthMode: 'fixed' }];
const { r, v } = run(p);
console.log(type, v.issues.filter(i=>i.severity!=='INFO').map(i=>i.code).join(','));
for (let i = 1; i < r.rows.length; i++) console.log(JSON.stringify(bal(r, i)));
}
