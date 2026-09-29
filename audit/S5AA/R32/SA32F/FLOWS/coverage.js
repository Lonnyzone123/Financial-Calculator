// Feature coverage of the grid for one seed: node coverage.js <count> <seed>
process.argv[1] = 'x';
const g = require('./grid.js'); const L = require('./lib.js');
const N = Number(process.argv[2] || 700);
const c = { plans: 0, couple: 0, debts: 0, conversion: 0, ltc: 0, fallback: 0, dividendOn: 0, rmdOn: 0, working: 0, rowsShortfall: 0, rowsNPD: 0, rowsRmd: 0, rowsDebt: 0, rowsSurplusSpent: 0, rowsOutsideDeposit: 0, strategies: {}, orders: {}, timing: {} };
for (let k = 0; k < N; k++) {
  const p = g.genPlan(k); const x = L.runTapped(p); if (!x.valid || x.r.status !== 'ok') continue;
  c.plans++; if (p.profile.spouseOn) c.couple++; if (p.advanced.debts.length) c.debts++; if (p.advanced.conversionOn) c.conversion++;
  if (p.advanced.ltcOn) c.ltc++; if (p.retirement.homeEquityFallback) c.fallback++; if (p.retirement.dividendOn) c.dividendOn++; if (p.advanced.rmdOn) c.rmdOn++;
  if (p.profile.retireAge > p.profile.age) c.working++;
  c.strategies[p.retirement.strategy] = (c.strategies[p.retirement.strategy] || 0) + 1;
  const o = p.retirement.withdrawalOrder === 'manual' ? p.retirement.manualOrder : 'optimized'; c.orders[o] = (c.orders[o] || 0) + 1;
  c.timing[p.assumptions.withdrawalTiming] = (c.timing[p.assumptions.withdrawalTiming] || 0) + 1;
  x.r.rows.slice(1).forEach((z, i) => { if (z.shortfall > 0.01) c.rowsShortfall++; if (z.nonPortfolioDraw > 0) c.rowsNPD++; if (z.rmdDistributed > 0) c.rowsRmd++; if (z.debtPaymentsTotal > 0) c.rowsDebt++;
    if (x.taps[i].surplusSpent > 0) c.rowsSurplusSpent++; if (x.taps[i].outsideDeposit > 0) c.rowsOutsideDeposit++; });
}
console.log(JSON.stringify(c));
