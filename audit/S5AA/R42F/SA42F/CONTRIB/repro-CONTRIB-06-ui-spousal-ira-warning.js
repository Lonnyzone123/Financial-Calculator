// CONTRIB-06 (P3): the app's "Contribution limit" cards call auditContributions() with ownerContributionEligibility()'s {self, spouse}
// booleans (src/app-shell.html, results guidance), which drop R33's spousal-IRA flags (selfIra/spouseIra). A non-working spouse's IRA
// funded by the working spouse's pay is therefore "ineligible" in the app's check: its over-limit request draws no warning, while the
// projection redirects the excess.
'use strict';
const { h, acct, work, run } = require('./lib.js');
const E = h.engine;
// self 55 working ($100,000); spouse 66, past the shared retirement age 65, no pay; joint return; spouse IRA $10,000 requested
const p = work({ age: 55, couple: true, spouseAge: 66, retireAge: 65, stop: 70, endAge: 65, salary: 100000, spouseSalary: 0,
  accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('iraP', 'traditionalIRA', 0, { owner: 'spouse', contribution: 10000, priority: 1 })] });
const { r } = run(p);
console.log('engine row', r.rows[1].age, ': spouse IRA deposited', r.rows[1].preTax, '; excess redirected to taxable', r.rows[1].taxable.toFixed(2));
// exactly the app's call (src/app-shell.html): auditContributions(p, age, salary, spouseSalary, ownerContributionEligibility(p, age, spouseAge, 1))
const ui = E.auditContributions(p, p.profile.age, p.employment.salary, p.employment.spouseSalary, E.ownerContributionEligibility(p, p.profile.age, p.profile.spouseAge, 1));
console.log('app check: item allowed', ui.items[0].allowed, ', excess', ui.items[0].excess, ', warnings', JSON.stringify(ui.warnings));
const eng = E.auditContributions(p, p.profile.age, p.employment.salary, p.employment.spouseSalary, E.ownerContributionWindow(p, p.profile.age, p.profile.spouseAge, 1));
console.log('engine window: item allowed', eng.items[0].allowed, ', excess', eng.items[0].excess, ', warnings', JSON.stringify(eng.warnings));
