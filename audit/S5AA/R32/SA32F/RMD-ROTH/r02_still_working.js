'use strict';
// RMDROTH-02: a still-employed owner is charged a 401(k) RMD from the applicable age. IRC 401(a)(9)(C)(i): the required
// beginning date is April 1 after the LATER of the year the employee attains the applicable age or the year the employee
// retires; (C)(ii) removes the retirement prong only for a 5-percent owner and for IRAs.
// Run: node r02_still_working.js
const { plan, acct, check, row, codes } = require('./lib.js');

function build(type) {
  // Age 73 in 2026 (born 1953 by the engine's whole-age rule, applicable age 73), working to 76 on a $100,000 salary.
  const p = plan({ age: 73, endAge: 76, retireAge: 76, accounts: [acct('k', type, 500000)] });
  p.employment.salary = 100000; p.employment.contributionStop = 76;
  return p;
}
let mismatches = 0;
for (const type of ['traditional401k', 'traditionalIRA']) {
  const r = check(build(type));
  [1, 2, 3].forEach(i => {
    const x = row(r, i);
    // Hand expectation: 401(k) -> no required distribution while employed (RBD follows retirement); IRA -> balance / Table III.
    const opening = r.rows[i - 1].preTax, div = { 1: 26.5, 2: 25.5, 3: 24.6 }[i];
    const expected = type === 'traditional401k' ? 0 : +(opening / div).toFixed(2);
    const diff = +(x.rmd - expected).toFixed(2);
    if (Math.abs(diff) > 0.01) mismatches++;
    console.log(JSON.stringify({ type, rowEndAge: x.age, working: true, engineRmd: x.rmd, expectedRmd: expected, diff,
      engineAgi: x.agi, engineTaxes: x.taxes, verdict: Math.abs(diff) > 0.01 ? 'MISMATCH' : 'PASS' }));
  });
  console.log(type, 'issues', codes(r).join(',') || '(none)');
}
console.log('mismatches', mismatches);
