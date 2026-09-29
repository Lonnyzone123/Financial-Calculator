// CONTRIB-08: under limitPolicy "warn" the deferral above the 402(g) limit is still excluded from income.
// IRC 402(g)(1)(A): deferrals are included in gross income "to the extent" they exceed the applicable dollar amount.
// Run: node CONTRIB-08_warn_policy_deducts_excess.js
const L = require('./lib.js'); const A = L.account;
// Single, 40 (year-end 41: no catch-up), salary 100,000, traditional 401(k) 30,000 requested; limit 24,500; excess 5,500.
// Hand: excluded deferral 24,500; AGI = 100,000 - 24,500 = 75,500 (the policy may let the money sit in the plan, but it is not excluded).
const p = L.work({ salary: 100000, accounts: [A('k', 'traditional401k', 0, { contribution: 30000, priority: 1 })] }); p.limitPolicy = 'warn';
const w = L.row(p);
const d = L.report('warn policy: federal AGI', 75500, w.federalAgi);
console.log('   federal tax understated by 22% x', -d, '=', +(0.22 * -d).toFixed(2), '(single 22% bracket); pre-tax balance', w.preTax);
const q = structuredClone(p); q.limitPolicy = 'redirect';
L.report('control redirect: federal AGI', 75500, L.row(q).federalAgi);
console.log('runs', L.runs());
