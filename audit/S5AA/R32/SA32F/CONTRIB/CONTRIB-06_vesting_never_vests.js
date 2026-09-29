// CONTRIB-06: `vesting` removes the unvested share of every match permanently at deposit; the match never vests further,
// however long the owner keeps working. IRC 411(a)(2)(B)(iii): matching contributions must be 100% nonforfeitable after
// at most 6 years of service (20% at 2 years ... 100% at 6).
// Run: node CONTRIB-06_vesting_never_vests.js
const L = require('./lib.js'); const A = L.account;
// Single, 40, salary 100,000, works 10 years (retireAge 65). 401(k) 10,000 a year; match 100% up to 6% = 6,000 a year; vesting 20%.
// Hand, on the slowest schedule the statute allows and counting service only from the plan's start (the most conservative
// reading): after 6 years of service every match allocated so far is 100% vested, so at the end of year 10 the whole
// 10 x 6,000 = 60,000 of matches is vested. Zero returns: pre-tax balance = 100,000 + 60,000 = 160,000.
const { r } = L.check(L.work({ years: 10, salary: 100000, accounts: [A('k', 'traditional401k', 0, { contribution: 10000, priority: 1, matchOn: true, matchRate: 100, matchCap: 6, vesting: 20 })] }));
L.report('pre-tax balance at 50', 160000, r.rows[10].preTax);
console.log('   engine per-year match =', r.rows[1].contributions - 10000, '(6,000 x 20%)');
console.log('runs 1');
