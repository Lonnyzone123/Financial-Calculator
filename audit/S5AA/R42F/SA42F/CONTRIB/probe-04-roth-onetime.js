const { h, acct, work, run, bal } = require('./lib.js');
// R41F-04's witness shape: joint; self 44 salary 0; spouse 45 salary 260,000; common retirement 45.5 (spouse works half the row)
function mk(mode) {
  const p = work({ age: 44, couple: true, spouseAge: 45, retireAge: 45.5, stop: 55, endAge: 45, salary: 0, spouseSalary: 260000,
    accounts: [acct('brok', 'taxable', 50000), acct('roth', 'rothIRA', 0, { contribution: mode === 'planned' ? 7500 : 0 })] });
  if (mode === 'once') Object.assign(p.advanced, { transferOn: true, transferFrom: 'brok', transferTo: 'roth', transferAmount: 7500, transferAge: 44.5 });
  return p;
}
for (const m of ['planned', 'once']) {
  const { v, r } = run(mk(m));
  console.log(m, v.issues.filter(i => i.severity !== 'INFO').map(i => i.severity + ':' + i.code).join(' '));
  console.log(JSON.stringify(bal(r, 1)), JSON.stringify(r.limitWarnings), (r.issues||[]).map(i=>i.code).join(','));
}
