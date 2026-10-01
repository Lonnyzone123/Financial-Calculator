// LIFE-EVENTS-01: an IRA owner who dies in the year they first reach the RMD age (before the required beginning date,
// April 1 of the next year) is still charged a required distribution for the year of death.
// Run: node repro-LIFE-EVENTS-01-rmd-death-before-rbd.js
const { run, show, codes, basePlan, account } = require('./lib.js');
function mk(selfLife) {
  const p = basePlan({ couple: true, age: 72, spouseAge: 70, endAge: 77, spending: 0, rmdOn: true, pension: 60000,
    dividendOn: true, dividendYield: 0,
    accounts: [account('ira', 'traditionalIRA', 1000000), account('brok', 'taxable', 100000, { basisPct: 100 })] });
  Object.assign(p.retirement, { ssBenefit: 0, spouseSS: 0, selfLife, spouseLife: 120 });
  p.advanced.qcd = 0;
  return p;
}
for (const sl of [73.5, 120]) {
  console.log('=== selfLife ' + sl + (sl === 120 ? ' (control: owner lives)' : ' (owner born 1954, reaches 73 in tax year 2027 = row 74, dies at 73.5 in that year)'));
  const r = run(mk(sl));
  show(r, ['age', 'income', 'rmd', 'rmdDistributed', 'federalAgi', 'taxes', 'preTax', 'total']);
  console.log('issues: ' + codes(r).join(','));
}
console.log('Expected (hand) for selfLife 73.5, row 74: rmd 0, federalAgi 60,000, taxes 1,840.00 (fed 1,250 + AZ 590);');
console.log('  row 76 (survivor, born 1956, reaches 73 in 2029): rmd = 1,000,000 / 26.5 = 37,735.85.');
