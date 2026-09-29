// CONTRIB-01: the traditional IRA deduction phase-out reduces the CONTRIBUTION, where IRC 219(g)(1) reduces the LIMIT.
// Run: node CONTRIB-01_ira_deduction_tapers_contribution.js
const L = require('./lib.js'); const A = L.account;
// Case A: single, 40, salary 96,000, covered by a 401(k) deferral of 10,000, traditional IRA contribution 4,000.
// MAGI before the IRA deduction = 96,000 - 10,000 = 86,000 (no other income; zero returns and yield).
// Hand (219(g)(2)(A), Notice 2025-67 range 81,000-91,000; Pub 590-A Worksheet 1-2 lines 3, 4, 7):
//   reduced limit = 7,500 x (91,000 - 86,000) / 10,000 = 3,750 (a multiple of $10; above $200)
//   deduction = min(contribution 4,000, reduced limit 3,750, compensation 86,000) = 3,750
//   AGI = 86,000 - 3,750 = 82,250
const a = L.row(L.work({ salary: 96000, accounts: [A('k', 'traditional401k', 0, { contribution: 10000, priority: 1 }), A('ira', 'traditionalIRA', 0, { contribution: 4000, priority: 2 })] }));
const dA = L.report('A single: federal AGI', 82250, a.federalAgi);
console.log('   engine deduction = 86,000 - AGI =', 86000 - a.federalAgi, '(4,000 x 0.5); federal tax overstated by 22% x', dA, '=', +(0.22 * dA).toFixed(2), '(single 22% bracket 50,400-105,700, Rev. Proc. 2025-32 Table 3); engine taxes field', a.taxes);
// Control: at a contribution equal to the full limit the two readings agree.
const c = L.row(L.work({ salary: 96000, accounts: [A('k', 'traditional401k', 0, { contribution: 10000, priority: 1 }), A('ira', 'traditionalIRA', 0, { contribution: 7500, priority: 2 })] }));
L.report('control 7,500 contribution: AGI', 86000 - 3750, c.federalAgi);
// Case B: joint, contributor (spouse) NOT covered, other spouse covered (219(g)(7), range 242,000-252,000).
// Wages 157,000 + 100,000; self 401(k) 10,000 => MAGI 247,000. Spouse IRA contribution 5,000.
//   reduced limit = 7,500 x (252,000 - 247,000) / 10,000 = 3,750; deduction = min(5,000, 3,750) = 3,750; AGI = 243,250
const b = L.row(L.work({ filing: 'mfj', spouseOn: true, salary: 157000, spouseSalary: 100000, accounts: [A('k', 'traditional401k', 0, { owner: 'self', contribution: 10000, priority: 1 }), A('i', 'traditionalIRA', 0, { owner: 'spouse', contribution: 5000, priority: 2 })] }));
L.report('B joint, spouse-only-covered: federal AGI', 243250, b.federalAgi);
console.log('runs', L.runs());
