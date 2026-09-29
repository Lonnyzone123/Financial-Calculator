// CONTRIB-04: a workplace elective deferral larger than the owner's compensation is deposited and excluded from income in full.
// IRC 415(c)(1)(B) caps annual additions (which include elective deferrals, 415(c)(2)) at 100% of the participant's
// compensation from the employer, and 415(c)(3)(D) counts elective deferrals as compensation, so the deferral cannot exceed pay.
// Run: node CONTRIB-04_deferral_above_compensation.js
const L = require('./lib.js'); const A = L.account;
// Joint, both 40. Self salary 100,000 (no plan). Spouse salary 15,000; spouse traditional 401(k) 24,500 (dollar amount).
// Hand: spouse deferral capped at compensation 15,000. AGI = 100,000 + 15,000 - 15,000 = 100,000.
//   Federal: MFJ 12% bracket 24,800-100,800 (Rev. Proc. 2025-32 Table 1); taxable income moves by 9,500 inside it.
const p = L.work({ filing: 'mfj', spouseOn: true, spouseAge: 40, salary: 100000, spouseSalary: 15000, accounts: [A('k', 'traditional401k', 0, { owner: 'spouse', contribution: 24500, priority: 1 })] });
const x = L.row(p);
const d = L.report('federal AGI', 100000, x.federalAgi);
L.report('pre-tax balance', 15000, x.preTax);
console.log('   federal tax understated by 12% x', -d, '=', +(0.12 * -d).toFixed(2), '; validator warnings:', JSON.stringify(x.warnings), '; limit warnings:', JSON.stringify(x.limitWarnings));
console.log('runs', L.runs());
