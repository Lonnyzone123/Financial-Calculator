// CONTRIB-05: employment.contributionStop is read on the SELF's age for the spouse's accounts too, while the spouse's
// wages run on the spouse's own clock; swapping the two people changes the result.
// Run: node CONTRIB-05_contribution_stop_on_self_clock.js
const L = require('./lib.js'); const A = L.account;
const mk = (selfAge, spouseAge, owner) => L.work({ age: selfAge, years: 7, filing: 'mfj', spouseOn: true, spouseAge, salary: 100000, spouseSalary: 100000, retireAge: 65, accounts: [A('k', 'traditional401k', 0, { owner, contribution: 10000, priority: 1 })] });
const { r: ra } = L.check(mk(60, 50, 'spouse'));   // the younger person is the SPOUSE and owns the 401(k)
const { r: rb } = L.check(mk(50, 60, 'self'));     // mirror: the younger person is the SELF and owns the 401(k)
// Hand (symmetry, and the app's own rule that each person works to retireAge on their own clock): in both plans the
// younger person, aged 55-57 in rows 6-7, is still working (wages in AGI) and below the stop age 65, so contributes 10,000 a year.
for (const i of [6, 7]) {
  L.report('row ' + i + ' younger spouse, contributions', 10000, ra.rows[i].contributions);
  L.report('row ' + i + ' mirror (younger self), contributions', 10000, rb.rows[i].contributions);
  console.log('   row', i, 'AGI spouse-plan', ra.rows[i].federalAgi, 'mirror', rb.rows[i].federalAgi, '; taxes', ra.rows[i].taxes, 'vs', rb.rows[i].taxes);
}
L.report('pre-tax balance after 7 years, spouse-owned', 70000, ra.rows[7].preTax);
L.report('pre-tax balance after 7 years, mirror', 70000, rb.rows[7].preTax);
console.log('runs 2');
