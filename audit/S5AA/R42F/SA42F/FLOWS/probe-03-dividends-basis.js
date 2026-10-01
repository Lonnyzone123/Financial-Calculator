'use strict';
// Dividends and taxable basis: reinvested before the payout start, paid after; retirement and payout start inside rows;
// yield growth; dividends as income offsetting spending; surplus dividends under each policy; basis after a sale.
const { plan, account, run, rows, cmp, summary, h } = require('./flib.js');
const tap = require((require('path').join(__dirname, '..', '..', '..', '..', '..') + "/audit/S5AA/R40/S5AA_R40_CONSERVATION_GRID/lib.js"));

// 1. Taxable 1,000,000 at 100% basis, yield 4%, start 64.5, retire 64, plan 64 -> 66, zero return, no spending.
//    Row 64-65: paid span 65-64.5 = 0.5 -> 20,000 cash; reinvested span 0.5 -> 20,000 (taxed, basis +20,000).
//    Row 65-66: balance 1,000,000 - 20,000 cash (+ retained cash elsewhere) ... policy invest -> cash returns to the taxable account.
{
  const p = plan({ age: 64, retireAge: 64, endAge: 66, spending: 0, dividendOn: true, dividendYield: 4, dividendStart: 64.5,
    surplusBySource: { rmd: 'invest', dividends: 'invest' }, accounts: [account('brok', 'taxable', 1000000, { basisPct: 100 })] });
  p.retirement.dividendQualified = 100;
  const x = tap.runTapped(p);
  const t = x.taps[0];
  cmp('1 row65 dividend cash (0.5 yr paid)', x.r.rows[1].dividends, 20000);
  cmp('1 row65 reinvested (0.5 yr)', t.dividendReinvested, 20000);
  const b = t.balances.find(a => a.id === 'brok');
  console.log('   row65 brok balance', b.b.toFixed(2), 'basis', b.basis.toFixed(2), 'taxes', x.r.rows[1].taxes.toFixed(2), 'outsideDeposit', t.outsideDeposit.toFixed(2));
  // basis: 1,000,000 + 20,000 reinvested + the invested surplus (dividend cash less the tax it paid) -- every dollar is after-tax cash
  cmp('1 row65 basis = 1,000,000 + reinvested + deposited cash', b.basis, 1000000 + 20000 + t.outsideDeposit);
  cmp('1 row65 balance = 1,000,000 - 20,000 + deposited', b.b, 1000000 - 20000 + t.outsideDeposit);
}
// 2. Yield growth: 3% yield, growth 10%/yr from start 64 (retire 64, plan from 66): row 66-67 yield = 3% x 1.1^2 = 3.63%.
{
  const p = plan({ age: 66, retireAge: 64, endAge: 68, spending: 0, dividendOn: true, dividendYield: 3, dividendStart: 64,
    surplusBySource: { rmd: 'invest', dividends: 'invest' }, accounts: [account('brok', 'taxable', 1000000, { basisPct: 100 })] });
  p.retirement.dividendGrowth = 10;
  const r = run(p);
  cmp('2 row67 dividends = 1,000,000 x 3% x 1.1^2', r.rows[1].dividends, 1000000 * 0.03 * 1.21);
}
// 3. Dividends as income: 40,000 spending, 1,000,000 taxable at 4%, start 64: dividends 40,000 pay the spending, no sale.
{
  const p = plan({ age: 64, retireAge: 64, endAge: 65, spending: 40000, dividendOn: true, dividendYield: 4, dividendStart: 64,
    accounts: [account('brok', 'taxable', 1000000, { basisPct: 50 }), account('roth', 'rothIRA', 100000, { priority: 9 })] });
  p.retirement.dividendQualified = 100; p.retirement.manualOrder = 'roth,taxable,preTax,hsa';
  const r = run(p);
  cmp('3 dividends 40,000', r.rows[1].dividends, 40000);
  console.log('   withdrawals', r.rows[1].withdrawals.toFixed(2), 'taxes', r.rows[1].taxes.toFixed(2), '(all withdrawals should be the tax only)');
  cmp('3 withdrawals = taxes (dividends paid the spending)', r.rows[1].withdrawals, r.rows[1].taxes);
}
// 4. Basis carried by a sale: 100,000 at 40% basis (40,000), sell 50,000 -> gain 30,000, basis left 20,000 on 50,000.
{
  const p = plan({ age: 64, retireAge: 64, endAge: 66, spending: 50000, accounts: [account('brok', 'taxable', 100000, { basisPct: 40 }),
    account('roth', 'rothIRA', 500000, { priority: 9 })] });
  p.retirement.manualOrder = 'taxable,roth,preTax,hsa';
  const x = tap.runTapped(p);
  const b = x.taps[0].balances.find(a => a.id === 'brok');
  // dividends off -> imputed 1.5% of the eligible balance at the draw point (100,000 x 0.015 = 1,500) is added to basis first
  console.log('   row65 brok', b.b.toFixed(2), 'basis', b.basis.toFixed(2));
  cmp('4 basis after selling 50,000 of 100,000 with 41,500 basis', b.basis, 41500 * (b.b / 100000));
}
summary();
