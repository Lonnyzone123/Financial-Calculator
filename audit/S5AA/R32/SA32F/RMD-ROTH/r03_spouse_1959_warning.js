'use strict';
// RMDROTH-03: PROPOSED_RULE_USED is raised only when the SELF is born in 1959. A spouse born in 1959 is charged RMDs from 73
// on the same proposed-regulation row, with no warning.
// Run: node r03_spouse_1959_warning.js
const { plan, acct, check, row, codes } = require('./lib.js');

function run(label, selfAge, spouseAge, owner) {
  const p = plan({ age: selfAge, endAge: selfAge + 8, spouseOn: true, spouseAge,
    accounts: [acct('ira', 'traditionalIRA', 100000, { owner })] });
  const r = check(p);
  const firstRmdRow = r.rows.findIndex((x, i) => i > 0 && x.rmd > 0);
  const ownerAgeAtFirstRmd = (owner === 'spouse' ? spouseAge - selfAge : 0) + r.rows[firstRmdRow - 1].age;
  const has = codes(r).includes('PROPOSED_RULE_USED');
  console.log(JSON.stringify({ label, owner, ownerBirthYearByEngine: 2026 - Math.floor(owner === 'spouse' ? spouseAge : selfAge),
    firstRmdOwnerAge: ownerAgeAtFirstRmd, firstRmd: row(r, firstRmdRow).rmd, expectedFirstRmd: +(100000 / 26.5).toFixed(2),
    proposedRuleWarning: has, expectedWarning: true, verdict: has ? 'PASS' : 'MISMATCH' }));
  return has;
}
let mismatches = 0;
if (!run('self born 1959 (control)', 67, 60, 'self')) mismatches++;
if (!run('spouse born 1959, spouse owns the IRA', 60, 67, 'spouse')) mismatches++;
console.log('mismatches', mismatches);
