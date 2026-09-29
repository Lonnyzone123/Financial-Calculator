// CONTRIB-11: a spousal IRA contribution stops when the NON-WORKING spouse passes retireAge on their own clock, although
// the joint return still has the working spouse's compensation (IRC 219(c)) and there is no age limit on IRA contributions.
// Run: node CONTRIB-11_spousal_ira_after_spouse_retires.js
const L = require('./lib.js'); const A = L.account;
// Joint. Self 55, salary 100,000, retireAge 65 (self still working). Spouse 66, salary 0 (past 65 on their own clock).
// Spouse Roth IRA 7,500 requested (joint MAGI proxy 100,000: below 242,000, no phase-out).
// Hand: spouse limit = min(7,500 + 1,100 catch-up = 8,600, combined compensation 100,000 - self IRA contributions 0) => 7,500 allowed.
const p = L.work({ age: 55, filing: 'mfj', spouseOn: true, spouseAge: 66, salary: 100000, spouseSalary: 0, retireAge: 65, accounts: [A('r', 'rothIRA', 0, { owner: 'spouse', contribution: 7500, priority: 1 })] });
const x = L.row(p);
L.report('spouse Roth IRA balance', 7500, x.roth);
console.log('   validator warnings', JSON.stringify(x.warnings), 'limit warnings', JSON.stringify(x.limitWarnings), 'taxable', x.taxable);
// Control: the same spouse at 60 (inside the work window) gets the spousal contribution.
const q = L.work({ age: 55, filing: 'mfj', spouseOn: true, spouseAge: 60, salary: 100000, spouseSalary: 0, retireAge: 65, accounts: [A('r', 'rothIRA', 0, { owner: 'spouse', contribution: 7500, priority: 1 })] });
L.report('control, spouse 60: Roth balance', 7500, L.row(q).roth);
console.log('runs', L.runs());
