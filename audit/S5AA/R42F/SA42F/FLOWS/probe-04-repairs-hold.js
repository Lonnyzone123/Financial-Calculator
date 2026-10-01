'use strict';
// R32F FLOWS repairs: do they hold at c67c713?
const { plan, account, run, rows, cmp, summary, h } = require('./flib.js');
// FLOWS-03 (SA32F-?): the fallback's accessible share is a cap on the whole draw: $400,000 at 50% -> at most $200,000.
{
  const p = plan({ age: 60, retireAge: 60, endAge: 72, spending: 60000, networthOn: true, fallback: true,
    accounts: [account('roth', 'rothIRA', 0)],
    otherAssets: [{ id: 'home', name: 'Home', type: 'realEstate', owner: 'self', value: 400000, growth: 0, available: true, availableAge: 60, accessPct: 50, liquidity: 'illiquid' }] });
  const r = run(p);
  const drawn = r.rows.reduce((t, x) => t + x.nonPortfolioDraw, 0);
  cmp('R32F FLOWS-03 total fallback draw <= 200,000', drawn, 200000);
  cmp('R32F FLOWS-03 first shortfall at 64 (60,60,60,20 then short)', r.firstShortfallAge, 64, 0);
}
// with 3% asset growth the accessible share grows with the value: 200,000 x 1.03^t net of draws
{
  const p = plan({ age: 60, retireAge: 60, endAge: 63, spending: 60000, networthOn: true, fallback: true,
    accounts: [account('roth', 'rothIRA', 0)],
    otherAssets: [{ id: 'home', name: 'Home', type: 'realEstate', owner: 'self', value: 400000, growth: 3, available: true, availableAge: 60, accessPct: 50, liquidity: 'illiquid' }] });
  const r = run(p);
  rows(r, ['age', 'spending', 'nonPortfolioDraw', 'shortfall', 'otherAssets']).forEach(x => console.log('  ' + x));
}
// FLOWS-02 / SA32F-36: fixedNominal grows to retirement: age 40, retire 65, 3.5% -> 60,000 x 1.035^25 = 141,794.70 then held.
{
  const p = plan({ age: 40, retireAge: 65, endAge: 67, inflation: 3.5, strategy: 'fixedNominal', spending: 60000,
    accounts: [account('roth', 'rothIRA', 5000000)] });
  const r = run(p);
  const row = r.rows.find(x => x.age === 66), row2 = r.rows.find(x => x.age === 67);
  cmp('SA32F-36 first retired row', row.spending, 60000 * Math.pow(1.035, 25));
  cmp('SA32F-36 held nominal next row', row2.spending, 60000 * Math.pow(1.035, 25));
}
// FLOWS-04 / SA32F-37: VPW paces on the allocation's expected return: 60/40 of 10% / 4.5% = 7.8%, 3.5% inflation, 65 -> 95.
{
  const p = plan({ age: 65, retireAge: 65, endAge: 95, inflation: 3.5, strategy: 'vpw', spending: 0, returnRate: 10,
    accounts: [account('roth', 'rothIRA', 1000000, { allocation: { stocks: 60, bonds: 40 } })] });
  p.advanced.assetClasses = [{ id: 'stocks', name: 'Stocks', returnRate: 10, volatility: 0 }, { id: 'bonds', name: 'Bonds', returnRate: 4.5, volatility: 0 }];
  p.assumptions.returnRate = 10;
  const r = run(p);
  const rr = 1.078 / 1.035 - 1, fac = (1 - Math.pow(1 + rr, -30)) / rr;
  cmp('SA32F-37 VPW year 1', r.rows[1].spending, 1000000 / fac);
}
// FLOWS-06 / SA32F-39: a set-amount stage takes the survivor reduction: 80,000 x 0.75 = 60,000 in survivor rows.
{
  const p = plan({ couple: true, age: 68, spouseAge: 68, retireAge: 68, endAge: 75, strategy: 'incomeFirst', spending: 80000,
    stages: [{ name: 'Set', start: 68, end: 80, mode: 'amount', value: 80000, growthMode: 'none' }],
    accounts: [account('roth', 'rothIRA', 2000000)] });
  Object.assign(p.retirement, { survivor: true, survivorSpendingReduction: 25, selfLife: 70 });
  const r = run(p);
  cmp('SA32F-39 survivor row (opening 71) with a set stage', r.rows.find(x => x.age === 72).spending, 60000);
}
summary();
