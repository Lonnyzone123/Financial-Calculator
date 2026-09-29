'use strict';
// DMC part (b): the app's historical heat map calls simulatePlan() directly (app-shell renderHeatmap) and classifies with
// classifyHistoricalCell(). Each cell should equal what runPlan() reports for the same start year. Run: node heatmap-probe.js
const path = require('path');
const h = require('../harness.js');
const E = h.engine;
const gd = require(path.join(h.TREE, 'tests/lib/golden-scenario-defs.js'));
const bases = [['golden:baseline', gd.buildScenario(h.defaults, {})], ['golden:guardrails', gd.buildScenario(h.defaults, { retirement: { strategy: 'guardrails' } })],
  ['golden:rmd-conv', gd.buildScenario(h.defaults, { advanced: { rmdOn: true, conversionOn: true, conversionAmount: 20000 }, profile: { age: 68, retireAge: 69 } })]];
const d = h.plan({ years: 30, retireAge: 60 }); d.advanced.transferOn = false; d.retirement.spending = 70000; d.accounts = [h.account('brk', 'taxable', 1200000, { basisPct: 60 })];
d.advanced.debts = [{ id: 'm', type: 'mortgage', name: 'M', owner: 'household', balance: 150000, rate: 5, rateType: 'adjustable', nextRateResetAge: 63, resetRate: 7, paymentMonthly: 1100, payoffAge: 80, includePayment: true, includeHousingCosts: true, annualPropertyTax: 2500, pmiMonthly: 60 }];
bases.push(['debt-arm-30y', d]);
let cells = 0, mism = [];
for (const [name, base] of bases) {
  for (const y of [1929, 1937, 1966, 1973, 2000, 2008]) {
    const p = structuredClone(base); p.assumptions.method = 'historical'; p.assumptions.historyStart = y;
    const testPlan = Object.assign({}, p, { assumptions: Object.assign({}, p.assumptions) });
    const cell = E.classifyHistoricalCell(E.simulatePlan(testPlan, E.rng(testPlan.assumptions.seed), 0, null));
    const r = E.runPlan(structuredClone(p));
    cells++;
    const endR = r.status === 'ok' ? r.rows[r.rows.length - 1].total : null, fundedR = r.status === 'ok' ? !r.failed : null;
    if (cell.invalid !== (r.status !== 'ok') || (!cell.invalid && (Math.abs(cell.end - endR) > 0.005 || cell.funded !== fundedR)))
      mism.push({ name, y, cell, runPlan: { status: r.status, end: endR, funded: fundedR } });
  }
}
console.log(JSON.stringify({ cells, mismatches: mism }, null, 1));
console.log('HEATMAP-PROBE DONE: cells=' + cells + ' mismatches=' + mism.length);
