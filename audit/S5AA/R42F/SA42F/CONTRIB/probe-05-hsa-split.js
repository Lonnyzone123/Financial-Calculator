const { h, acct, work, run, bal } = require('./lib.js');
for (const order of [['sp', 'me'], ['me', 'sp']]) {
  const pri = { sp: order.indexOf('sp') + 1, me: order.indexOf('me') + 1 };
  const p = work({ age: 44, couple: true, spouseAge: 45, retireAge: 45.5, stop: 70, endAge: 46, salary: 100000, spouseSalary: 100000,
    accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('hsaSp', 'hsa', 0, { owner: 'spouse', contribution: 8750, priority: pri.sp }), acct('hsaMe', 'hsa', 0, { contribution: 8750, priority: pri.me })] });
  const { v, r } = run(p);
  console.log('order', order.join('>'), v.issues.filter(i => i.severity !== 'INFO').map(i => i.severity + ':' + i.code).join(' '));
  console.log(JSON.stringify(bal(r, 1)));
}
