const { h, plan, acct, check, row, codes } = require('./lib.js');
// basis 8,600 in a 10,000 pool; QCD 5,000 at 73 -> 1,400 qualified, 3,600 basis; remaining 5,000 is all basis.
const p = plan({ age: 72, endAge: 75, retireAge: 73, qcd: 0, cash: 0, order: 'taxable,roth,preTax,hsa',
  accounts: [
    acct('a', 'traditionalIRA', 0, { contribution: 8600, futureChanges: [{ age: 73, mode: 'set', value: 0 }] }),
    acct('b', 'traditionalIRA', 1400, { priority: 3 }),
    acct('rk', 'roth401k', 0, { contribution: 1000, futureChanges: [{ age: 73, mode: 'set', value: 0 }], priority: 9 })] });
p.retirement.dividendOn = true; p.retirement.dividendYield = 0;
p.retirement.otherIncomes = [{ name: 'Wages', type: 'employment', owner: 'self', amount: 200000, start: 72, end: 73, growth: 0, growthMode: 'fixed' }];
p.employment.contributionStop = 73;
p.advanced.qcd = 0;
// QCD only from 73: use a plan-level QCD (constant); so start the QCD in year 1 is unavoidable -> set it and account for year 1 too
p.advanced.qcd = 5000;
const r = check(p);
console.log(JSON.stringify([1, 2, 3].map(i => row(r, i))), codes(r).join(','));
