'use strict';
// Form 8606 basis across a working year (nondeductible contribution) and a retired year with QCD + RMD + conversion,
// then a liquidation year that exposes the closing basis.
const { h, plan, acct, check, row, codes } = require('./lib.js');

function build({ qcd = 2000, conv = 10000, liquidate = true, owner = 'self' } = {}) {
  const spouseOn = owner === 'spouse';
  const p = plan({ age: 72, endAge: liquidate ? 75 : 74, retireAge: 73, spouseOn, spouseAge: 72, qcd,
    conversionOn: conv > 0, conversionAmount: conv, cash: 200000, order: 'taxable,preTax,roth,hsa',
    accounts: [
      acct('a', 'traditionalIRA', 0, { owner, contribution: 8600, futureChanges: [{ age: 73, mode: 'set', value: 0 }] }),
      acct('b', 'traditionalIRA', 91400, { owner, priority: 3 }),
      acct('k', 'traditional401k', 0, { owner, contribution: 1000, futureChanges: [{ age: 73, mode: 'set', value: 0 }], priority: 4 }),
      acct('roth', 'rothIRA', 0, { owner })] });
  p.retirement.dividendOn = true; p.retirement.dividendYield = 0;
  p.retirement.otherIncomes = [{ name: 'Wages', type: 'employment', owner, amount: 200000, start: 72, end: 73, growth: 0, growthMode: 'fixed' }];
  p.employment.contributionStop = 73;
  return p;
}
module.exports = { build };
if (require.main === module) {
  for (const owner of ['self', 'spouse']) {
    const p = build({ owner });
    const r = check(p);
    console.log(owner, JSON.stringify([1, 2, 3].map(i => row(r, i)), null, 0), codes(r).join(','));
  }
}
