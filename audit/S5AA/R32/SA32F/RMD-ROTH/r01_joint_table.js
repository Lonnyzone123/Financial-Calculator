'use strict';
// RMDROTH-01: an owner whose spouse is more than 10 years younger is charged on the Uniform Lifetime Table, never the
// Joint and Last Survivor Table (26 CFR 1.401(a)(9)-5(c)(2); Pub. 590-B, "Sole beneficiary spouse who is more than 10
// years younger": owner 75, spouse 64, applicable denominator 25.3).
// Run: node r01_joint_table.js
const { plan, acct, check, row, codes } = require('./lib.js');

const cases = [
  { label: 'self owns, self 75 / spouse 64, $100,000', age: 75, spouseAge: 64, owner: 'self', bal: 100000 },
  { label: 'self owns, self 75 / spouse 64, $1,000,000', age: 75, spouseAge: 64, owner: 'self', bal: 1000000 },
  { label: 'swapped: spouse 75 owns, self 64, $1,000,000', age: 64, spouseAge: 75, owner: 'spouse', bal: 1000000 },
  { label: 'control: spouse 65 (exactly 10 years younger), $1,000,000', age: 75, spouseAge: 65, owner: 'self', bal: 1000000, uniformIsLaw: true }
];
let mismatches = 0;
for (const c of cases) {
  const p = plan({ age: c.age, endAge: c.age + 1, spouseOn: true, spouseAge: c.spouseAge,
    accounts: [acct('ira', 'traditionalIRA', c.bal, { owner: c.owner })] });
  const r = check(p);
  const x = row(r, 1);
  // Hand expectation: prior balance / 25.3 (Table II, 75 and 64, per Pub. 590-B's own example); the control uses Table III 24.6.
  const expected = +(c.bal / (c.uniformIsLaw ? 24.6 : 25.3)).toFixed(2);
  const diff = +(x.rmd - expected).toFixed(2);
  if (Math.abs(diff) > 0.01) mismatches++;
  console.log(JSON.stringify({ case: c.label, valid: true, status: r.status, engineRmd: x.rmd, expectedRmd: expected, diff,
    engineAgi: x.agi, engineTaxes: x.taxes, verdict: Math.abs(diff) > 0.01 ? 'MISMATCH' : 'PASS', issues: codes(r) }));
}
console.log('mismatches', mismatches);
