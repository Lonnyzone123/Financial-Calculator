const { h, plan, acct, check, row, codes } = require('./lib.js');
function show(label, p) { try { const r = check(p); console.log(label); r.rows.slice(1).forEach((x, i) => console.log('  ', x.age, 'rmd', x.rmd.toFixed(2), 'dist', x.rmdDistributed.toFixed(2), 'preTax', x.preTax.toFixed(2), 'agi', x.federalAgi.toFixed(2))); console.log('  ', codes(r).join(',')); } catch (e) { console.log(label, 'ERR', e.message.slice(0, 300)); } }
// self 80 dies at 82; spouse 70
let p = plan({ age: 80, endAge: 86, spouseOn: true, spouseAge: 70, accounts: [acct('ira', 'traditionalIRA', 100000)] });
p.retirement.selfLife = 82; p.retirement.spouseLife = 120;
show('self80 dies82, spouse70', p);
// swap: spouse 80 owns IRA, dies at 82 (spouseLife is age of spouse), self 70
p = plan({ age: 70, endAge: 76, spouseOn: true, spouseAge: 80, accounts: [acct('ira', 'traditionalIRA', 100000, { owner: 'spouse' })] });
p.retirement.selfLife = 120; p.retirement.spouseLife = 82;
show('spouse80 dies82, self70', p);
// swap owners for Joint-table case: spouse 75 owns IRA, self 64
p = plan({ age: 64, endAge: 65, spouseOn: true, spouseAge: 75, accounts: [acct('ira', 'traditionalIRA', 100000, { owner: 'spouse' })] });
show('spouse75 owns, self64', p);
