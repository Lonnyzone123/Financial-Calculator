'use strict';
// FLOWS-01 candidate: an other asset "Available starting at age" 65.5 is not available to the last-resort fallback anywhere in the
// row 65 -> 66, even for an expense dated at 65.75, after the asset became available. The fallback reads the row's OPENING age.
// Run: node repro-FLOWS-01-fallback-available-mid-row.js
const { plan, account, run, rows, cmp, summary } = require('./flib.js');
function mk(availableAge) {
  const p = plan({ age: 64, retireAge: 64, endAge: 67, spending: 0, networthOn: true, fallback: true,
    accounts: [account('roth', 'rothIRA', 10000)],
    expenses: [{ name: 'Roof', kind: 'expense', age: 65.75, amount: 100000 }],
    otherAssets: [{ id: 'home', name: 'Home', type: 'realEstate', owner: 'self', value: 400000, growth: 0, available: true,
      availableAge, accessPct: 50, liquidity: 'illiquid' }] });
  return p;
}
for (const a of [65.5, 65]) {
  const r = run(mk(a));
  console.log('availableAge', a, 'status', r.status, 'successRate', r.successRate, 'firstShortfallAge', r.firstShortfallAge, 'validator warnings', r._warn.join(','));
  rows(r, ['age', 'spending', 'withdrawals', 'nonPortfolioDraw', 'shortfall', 'otherAssets', 'total']).forEach(x => console.log('  ' + x));
}
// Hand: row 65->66 requests the $100,000 expense dated 65.75. The Roth pays its $10,000; $90,000 remains. The home is available
// from 65.5, before the expense's date, and 50% of $400,000 = $200,000 is accessible, so the fallback pays $90,000: shortfall 0,
// success 100. The control (available from 65) does exactly that.
const r = run(mk(65.5));
cmp('row 66 nonPortfolioDraw', r.rows[2].nonPortfolioDraw, 90000);
cmp('row 66 shortfall', r.rows[2].shortfall, 0);
cmp('successRate', r.successRate, 100);
// Variant: recurring spending ($60,000 a year, no expense), an empty Roth, the asset available from 65.5. The year's spending is drawn at
// the row's draw point (monthly timing: half way, 65.5), when the asset is available: under that reading the whole $60,000 is
// fundable; under time proration (the R25 stage rule) the half after 65.5, $30,000. The engine funds none of it.
{
  const p = plan({ age: 64, retireAge: 64, endAge: 67, spending: 60000, networthOn: true, fallback: true,
    accounts: [account('roth', 'rothIRA', 60000)],
    otherAssets: [{ id: 'home', name: 'Home', type: 'realEstate', owner: 'self', value: 400000, growth: 0, available: true,
      availableAge: 65.5, accessPct: 50, liquidity: 'illiquid' }] });
  const r2 = run(p);
  console.log('variant recurring spending:', r2.rows.map(x => `${x.age}: draw ${x.nonPortfolioDraw} short ${x.shortfall}`).join(' | '));
  cmp('variant row 66 fallback draw >= 30,000 (time-prorated lower bound)', Math.min(r2.rows[2].nonPortfolioDraw, 30000), 30000);
}
summary();
