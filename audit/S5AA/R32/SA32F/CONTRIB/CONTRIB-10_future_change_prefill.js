// CONTRIB-10: "Add future contribution change" pre-fills mode "set" (dollars) with a.contribution, which in
// "Percent of salary" mode is a PERCENT; the engine then reads it as dollars (src/app-shell.html line 548, engine.js:31).
// Run: node CONTRIB-10_future_change_prefill.js
const L = require('./lib.js'); const A = L.account;
// Single, 40, salary 100,000, 401(k) at 10% of salary. The button adds {age: age+5, mode:'set', value: 10}; here at 41.
const acct = A('k', 'traditional401k', 0, { contributionMode: 'salaryPct', contribution: 10, priority: 1, futureChanges: [{ age: 41, mode: 'set', value: 10 }] });
const { r } = L.check(L.work({ years: 2, salary: 100000, accounts: [acct] }));
// Hand (what the pre-filled row appears to keep: "the same 10%"): 10% x 100,000 = 10,000 in the year from 41.
L.report('contributions in the year from 41', 10000, r.rows[2].contributions);
L.report('control, year 40 (before the change)', 10000, r.rows[1].contributions);
console.log('runs 1');
