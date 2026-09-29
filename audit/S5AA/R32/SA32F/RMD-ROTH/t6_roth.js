const { h, plan, acct, check, row, codes } = require('./lib.js');
function go(label, p) { const r = check(p); console.log(label, JSON.stringify(row(r, 1)), codes(r).join(',')); return r; }
// spouse 55 owns Roth IRA, self 62; spending 20,000 from Roth
go('spouseRoth55', plan({ age: 62, spouseOn: true, spouseAge: 55, spending: 20000, order: 'roth,taxable,preTax,hsa', accounts: [acct('r', 'rothIRA', 100000, { owner: 'spouse' })] }));
// self 62, spouse 55, self Roth -> no flag expected
go('selfRoth62', plan({ age: 62, spouseOn: true, spouseAge: 55, spending: 20000, order: 'roth,taxable,preTax,hsa', accounts: [acct('r', 'rothIRA', 100000)] }));
// self 58 own Roth 401k
go('selfRoth401k58', plan({ age: 58, spending: 20000, order: 'roth,taxable,preTax,hsa', accounts: [acct('r', 'roth401k', 100000)] }));
