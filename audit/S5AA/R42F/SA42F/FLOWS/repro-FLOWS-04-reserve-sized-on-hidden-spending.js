'use strict';
// FLOWS-04 candidate: "Years of spending in reserve" sizes the reserve on retirement.spending -- the "Annual spending in today's
// dollars" field, which the app HIDES unless the strategy is incomeFirst or fixedNominal, and which is never inflated -- rather than
// on the spending the plan actually projects. A guardrails household of $3,000,000 at 4% spends $120,000; with the app's default
// (hidden) $60,000 the "2 years" reserve is one year of its spending; at 3% inflation it shrinks further every year.
// Run: node repro-FLOWS-04-reserve-sized-on-hidden-spending.js
const { plan, account, run, cmp, summary } = require('./flib.js');
const tap = require((require('path').join(__dirname, '..', '..', '..', '..', '..') + "/audit/S5AA/R40/S5AA_R40_CONSERVATION_GRID/lib.js"));
function mk(hiddenSpending) {
  const p = plan({ age: 65, retireAge: 65, endAge: 95, inflation: 3, returnRate: 7, strategy: 'guardrails', spending: hiddenSpending,
    accounts: [account('roth', 'rothIRA', 3000000)] });
  Object.assign(p.retirement, { withdrawalRate: 4, floor: 0, ceiling: 1e9, upperGuardrail: 20, lowerGuardrail: 20, adjustment: 10 });
  Object.assign(p.advanced, { reserveOn: true, reserveYears: 2 });
  return p;
}
for (const s of [60000, 120000, 1000]) {
  const x = tap.runTapped(mk(s)); const r = x.r;
  console.log(`hidden spending ${s}: row66 spending ${r.rows[1].spending.toFixed(2)}  rate ${(x.taps[0].rates[0] * 100).toFixed(4)}%  row80 spending ${r.rows[15].spending.toFixed(2)} rate ${(x.taps[14].rates[0] * 100).toFixed(4)}%  end total ${r.rows[r.rows.length - 1].total.toFixed(0)}`);
}
// Hand, row 65-66: the plan spends 4% of 3,000,000 = 120,000 (the guardrails strategy; the spending field plays no part in it).
// Two years of that spending = 240,000 of the 3,000,000 portfolio = 8% held at 3%: return 7% x 0.92 + 3% x 0.08 = 6.68%.
// Row 79-80 (age 79): spending then is the engine's own row-80 figure; two years of it against that row's opening portfolio.
const x = tap.runTapped(mk(60000));
cmp('row66 blended return (2 years of the projected $120,000)', x.taps[0].rates[0] * 100, (0.07 * 0.92 + 0.03 * 0.08) * 100, 1e-6);
const t14 = x.taps[14];
const want = 2 * x.r.rows[15].spending / t14.portfolioBeforeGrowth;
cmp('row80 reserve share = 2 x row-80 spending / opening portfolio', (0.07 - t14.rates[0]) / 0.04, want, 1e-6);
summary();
