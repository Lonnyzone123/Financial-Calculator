const { h, plan, acct, check, row, codes } = require('./lib.js');
const p = plan({ age: 72, endAge: 74, retireAge: 73, spouseOn: true, spouseAge: 72, conversionOn: true, conversionAmount: 10000, cash: 200000,
  accounts: [
    acct('a', 'traditionalIRA', 0, { contribution: 8600, futureChanges: [{ age: 73, mode: 'set', value: 0 }], priority: 5 }),
    acct('k', 'traditional401k', 0, { contribution: 1000, futureChanges: [{ age: 73, mode: 'set', value: 0 }], priority: 6 }),
    acct('s', 'traditionalIRA', 100000, { owner: 'spouse', priority: 1 }),
    acct('sr', 'rothIRA', 0, { owner: 'spouse' })] });
p.retirement.dividendOn = true; p.retirement.dividendYield = 0;
p.retirement.otherIncomes = [{ name: 'Wages', type: 'employment', owner: 'self', amount: 200000, start: 72, end: 73, growth: 0, growthMode: 'fixed' }];
p.employment.contributionStop = 73;
const r = check(p);
console.log(JSON.stringify([1, 2].map(i => row(r, i))), codes(r).join(','));
console.log('hand year-2 AGI: spouse RMD 100000/26.5 =', (100000 / 26.5).toFixed(2), '+ spouse conversion 10000 + self RMD 8600/26.5 all basis 0 + 401k RMD 1000/26.5 =', (1000 / 26.5).toFixed(2), '=>', (100000 / 26.5 + 10000 + 1000 / 26.5).toFixed(2));
