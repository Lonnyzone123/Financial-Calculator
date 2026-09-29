// CONTRIB-09: for a JOINT account in "Percent of salary" mode, the Accounts page total uses both salaries
// (src/app-shell.html line 553) while the engine and the validator use the self's salary only.
// Run: node CONTRIB-09_joint_salary_pct_ui_total.js
const L = require('./lib.js'); const A = L.account;
const p = L.work({ filing: 'mfj', spouseOn: true, salary: 100000, spouseSalary: 60000, accounts: [A('j', 'taxable', 0, { owner: 'joint', contributionMode: 'salaryPct', contribution: 10, priority: 1 })] });
// The UI's own formula (app-shell.html:553), executed with the engine's accountPlannedContribution():
const uiSalary = (a) => a.owner === 'spouse' ? p.employment.spouseSalary : a.owner === 'joint' ? p.employment.salary + p.employment.spouseSalary : p.employment.salary;
const uiTotal = p.accounts.reduce((s, a) => s + L.engine.accountPlannedContribution(a, uiSalary(a), p.profile.age, p), 0);
const x = L.row(p);
console.log('UI "contribution total" =', uiTotal, '(10% of 160,000)');
L.report('engine first-year contributions vs the UI total', uiTotal, x.contributions);
console.log('runs', L.runs());
