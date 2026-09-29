// CONTRIB-03: the Roth IRA phase-out omits the $200 minimum and the $10 rounding that 408A(c)(3)(A) imports from 219(g)(2).
// Run: node CONTRIB-03_roth_phaseout_no_200_minimum.js
const L = require('./lib.js'); const A = L.account;
// Single, 40, Roth IRA 7,500 requested, salary proxy for MAGI (declared).
// Case A: MAGI 167,800. reduction = 7,500 x 14,800 / 15,000 = 7,400 (a multiple of $10); limit = 100;
//   219(g)(2): not reduced below $200 unless reduced to zero => 200.
const a = L.row(L.work({ salary: 167800, accounts: [A('r', 'rothIRA', 0, { contribution: 7500, priority: 1 })] }));
L.report('A MAGI 167,800: Roth balance', 200, a.roth);
// Case B: MAGI 160,501. reduction = 7,500 x 7,501 / 15,000 = 3,750.50 -> rounded to the next lowest $10 = 3,750; limit 3,750.
const b = L.row(L.work({ salary: 160501, accounts: [A('r', 'rothIRA', 0, { contribution: 7500, priority: 1 })] }));
L.report('B MAGI 160,501: Roth balance', 3750, b.roth);
// Control: MAGI 167,999 -> reduction 7,499.50 -> rounded down to 7,490 -> limit 10 -> $200 minimum -> 200.
const c = L.row(L.work({ salary: 167999, accounts: [A('r', 'rothIRA', 0, { contribution: 7500, priority: 1 })] }));
L.report('C MAGI 167,999: Roth balance', 200, c.roth);
console.log('runs', L.runs());
