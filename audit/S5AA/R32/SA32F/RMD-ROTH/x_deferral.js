const { h, plan, acct, check, row, codes } = require('./lib.js');
for (const via of ['salary', 'otherIncome']) {
  const p = plan({ age: 62, endAge: 63, retireAge: 63, rmdOn: false, cash: 0, accounts: [acct('k', 'traditional401k', 0, { contribution: 10000 })] });
  p.retirement.dividendOn = true; p.retirement.dividendYield = 0; p.employment.contributionStop = 63;
  if (via === 'salary') p.employment.salary = 100000;
  else p.retirement.otherIncomes = [{ name: 'Wages', type: 'employment', owner: 'self', amount: 100000, start: 62, end: 63, growth: 0, growthMode: 'fixed' }];
  const r = check(p); console.log(via, JSON.stringify(row(r, 1)), codes(r).join(','));
}
