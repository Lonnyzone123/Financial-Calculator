// LIFE-EVENTS-04: with no spouse included (profile.spouseOn false), an IRA whose owner is "spouse" (valid, no warning) is read
// three ways: the 10% early-withdrawal tax reads the hidden spouse age (accountOwnerAge() has no spouseOn test); the RMD owes
// nothing at all (rmdObligations() lists only the self when no spouse is on, and filters the spouse's accounts out); while
// incomes, the Rule of 55 and vesting read a "spouse" owner as the self when no spouse is on.
// Run: node repro-LIFE-EVENTS-04-spouse-owned-account-no-spouse.js
const { run, show, basePlan, account, h } = require('./lib.js');
function mk(owner, age, spouseAge, rmdOn) {
  const p = basePlan({ age, endAge: age + 2, spending: rmdOn ? 0 : 40000, rmdOn, dividendOn: true, dividendYield: 0,
    accounts: [account('ira', 'traditionalIRA', 500000, { owner }), account('cash', 'taxable', 1000, { basisPct: 100 })],
    manualOrder: 'preTax,taxable,roth,hsa' });
  p.profile.spouseAge = spouseAge; p.advanced.qcd = 0;
  return p;
}
for (const [label, p] of [['A1 self 65, IRA owner "self" (control)', mk('self', 65, 50, false)],
                          ['A2 self 65, IRA owner "spouse", spouseOn false, spouseAge 50', mk('spouse', 65, 50, false)],
                          ['B1 self 75, IRA owner "self", RMD on (control)', mk('self', 75, 50, true)],
                          ['B2 self 75, IRA owner "spouse", spouseOn false, RMD on', mk('spouse', 75, 50, true)]]) {
  const v = h.validateScenario(structuredClone(p));
  console.log('=== ' + label + ' | validator issues: ' + JSON.stringify(v.issues.map(i => i.code)));
  show(run(p, true), ['age', 'withdrawals', 'rmd', 'federalAgi', 'taxes']);
}
console.log('Hand (A, single, 65, $40,000 spending from the IRA, zero return): no 10% tax applies at 65 on the self reading;');
console.log('  gross draw G with tax T = federal + AZ on G: G - T = 40,000. At G = 42,571.93: federal taxable 42,571.93 - (16,100 + 2,050 + 6,000) = 18,421.93,');
console.log('  1,240 + 12% x 6,021.93 = 1,962.63; AZ 2.5% x (42,571.93 - 16,100 - 2,100) = 609.30; T = 2,571.93. G - T = 40,000.00.');
console.log('Hand (B, 75, born 1951, RMD age 73): 500,000 / 24.6 (Uniform, 75) = 20,325.20 a year.');
