const { h, acct, work, run } = require('./lib.js');
for (const [age, ret] of [[54, 56], [54, 54.5], [59, 61]]) {
  const p = work({ age, salary: 400000, retireAge: ret, endAge: Math.max(ret, age + 1), accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('k', 'traditional401k', 0, { contribution: 50000, matchOn: true, matchRate: 100, matchCap: 10, profitShare: 10 })] });
  const { r } = run(p);
  console.log(age, '->', r.rows[1].age, 'retire', ret, 'preTax', r.rows[1].preTax, 'taxable(excess)', r.rows[1].taxable);
}
