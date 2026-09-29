// CONTRIB-02: in the Roth phase-out band, a traditional IRA contribution is subtracted from the REDUCED Roth limit;
// IRC 408A(c)(2)/(3)(A) and Pub 590-A Worksheet 2-2 take the smaller of the reduced limit and (limit - other IRAs).
// Run: node CONTRIB-02_roth_phaseout_after_traditional.js
const L = require('./lib.js'); const A = L.account;
// Single, 40, salary 160,500 (the engine's declared salary MAGI proxy; no workplace plan, so the traditional IRA is fully
// deductible and not in dispute). Traditional IRA 3,000 (priority 1), Roth IRA 7,500 requested (priority 2). Redirect policy.
// Hand: ratio = (160,500 - 153,000) / 15,000 = 0.5 (Notice 2025-67: 153,000-168,000)
//   Worksheet 2-2 line 8: 7,500 - 7,500 x 0.5 = 3,750 (multiple of $10, above $200)
//   line 10: 7,500 - 3,000 = 4,500;  line 11 = min(3,750, 4,500) = 3,750
//   Roth balance 3,750; redirected to taxable 7,500 - 3,750 = 3,750; taxable 100,000 + 3,750 = 103,750
const x = L.row(L.work({ salary: 160500, accounts: [A('t', 'traditionalIRA', 0, { contribution: 3000, priority: 1 }), A('r', 'rothIRA', 0, { contribution: 7500, priority: 2 })] }));
L.report('Roth IRA balance', 3750, x.roth);
L.report('taxable balance (redirected excess)', 103750, x.taxable);
L.report('traditional IRA balance (control)', 3000, x.preTax);
// Control: Roth first (priority 1), traditional second. Law: Roth 3,750; traditional room 7,500 - 3,750 = 3,750 >= 3,000.
const y = L.row(L.work({ salary: 160500, accounts: [A('t', 'traditionalIRA', 0, { contribution: 3000, priority: 2 }), A('r', 'rothIRA', 0, { contribution: 7500, priority: 1 })] }));
L.report('control, Roth first: Roth balance', 3750, y.roth);
L.report('control, Roth first: traditional balance', 3000, y.preTax);
console.log('runs', L.runs());
