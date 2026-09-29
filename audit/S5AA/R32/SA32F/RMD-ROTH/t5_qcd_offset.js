const { h, plan, acct, check, row, codes } = require('./lib.js');
// age 71, wages 30,000 in the first year only, deductible IRA contribution 7,000 at 71 (no workplace plan). QCD 10,000 from age 72.
const p = plan({ age: 71, endAge: 74, retireAge: 72, qcd: 0, cash: 100000,
  accounts: [acct('ira', 'traditionalIRA', 100000, { contribution: 7000, futureChanges: [{ age: 72, mode: 'set', value: 0 }] })] });
p.retirement.dividendOn = true; p.retirement.dividendYield = 0;
p.retirement.otherIncomes = [{ name: 'Wages', type: 'employment', owner: 'self', amount: 30000, start: 71, end: 72, growth: 0, growthMode: 'fixed' }];
p.employment.contributionStop = 72;
let r = check(p); console.log('noQCD', JSON.stringify([1, 2, 3].map(i => row(r, i))), codes(r).join(','));
p.advanced.qcd = 10000;
r = check(p); console.log('QCD10k', JSON.stringify([1, 2, 3].map(i => row(r, i))), codes(r).join(','));
