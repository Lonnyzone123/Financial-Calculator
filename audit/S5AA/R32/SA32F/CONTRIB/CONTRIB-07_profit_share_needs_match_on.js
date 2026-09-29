// CONTRIB-07: profitShare is paid only when matchOn is true; a profit-sharing contribution with the match switched off is dropped.
// Run: node CONTRIB-07_profit_share_needs_match_on.js
const L = require('./lib.js'); const A = L.account;
// Single, 40, salary 100,000, 401(k) 10,000, no match, profit sharing 5% of pay.
// Hand: employer contribution 5% x 100,000 = 5,000 (within 415(c): 10,000 + 5,000 <= 72,000). Pre-tax balance 15,000.
const off = L.row(L.work({ salary: 100000, accounts: [A('k', 'traditional401k', 0, { contribution: 10000, priority: 1, matchOn: false, matchRate: 100, matchCap: 0, profitShare: 5 })] }));
L.report('match off, profit share 5%: pre-tax balance', 15000, off.preTax);
const on = L.row(L.work({ salary: 100000, accounts: [A('k', 'traditional401k', 0, { contribution: 10000, priority: 1, matchOn: true, matchRate: 0, matchCap: 0, profitShare: 5 })] }));
L.report('control, match on at 0%: pre-tax balance', 15000, on.preTax);
console.log('runs', L.runs());
