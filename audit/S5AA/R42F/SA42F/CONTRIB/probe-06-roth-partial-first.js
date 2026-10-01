const { h, acct, work, run, bal } = require('./lib.js');
for (const age of [45.5, 45]) {
  const p = work({ age, salary: 200000, retireAge: 65, endAge: 47,
    accounts: [acct('brok', 'taxable', 0), acct('roth', 'rothIRA', 0, { contribution: 7500 })] });
  const { v, r } = run(p);
  console.log('start', age, v.issues.filter(i => i.severity !== 'INFO').map(i => i.severity + ':' + i.code).join(' '));
  for (let i = 1; i < r.rows.length; i++) console.log(JSON.stringify(bal(r, i)));
}
