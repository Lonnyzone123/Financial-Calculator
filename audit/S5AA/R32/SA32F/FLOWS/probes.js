'use strict';
// Targeted hand checks of growth timing, fees, strategies, stages, inflation and the other-asset fallback.
const L = require('./lib.js');
const { account } = L;
const out = [];
function run(p) { const v = L.h.validateScenario(structuredClone(p)); if (!v.valid) return { invalid: v.issues.filter(i => i.severity === 'ERROR') }; const r = L.h.engine.runPlan(structuredClone(p)); return r; }
function cmp(label, actual, expected) { const d = actual - expected; out.push({ label, actual: +actual.toFixed(4), expected: +expected.toFixed(4), diff: +d.toFixed(4), verdict: Math.abs(d) < 0.01 ? 'PASS' : 'MISMATCH' }); }
const roth = (b) => [account('roth', 'rothIRA', b)];

// 1. Growth timing and a single fee: Roth $1,000,000, return 5%, fee 1%, $40,000 fixed nominal.
for (const [timing, f] of [['monthly', 0.5], ['quarterly', 0.625], ['annual', 1]]) {
  const r = run(L.basePlan({ age: 60, endAge: 61, returnRate: 5, fee: 1, timing, spending: 40000, accounts: roth(1e6) }));
  const g = 1.04; const exp = (1e6 * Math.pow(g, f) - 40000) * Math.pow(g, 1 - f);
  cmp('growth ' + timing + ' (net 4%, draw at ' + f + ')', r.rows[1].total, exp);
}
// 2. incomeFirst inflates from the plan start; fixedNominal does not (label: "Annual spending in today's dollars").
for (const strategy of ['incomeFirst', 'fixedNominal']) {
  const r = run(L.basePlan({ age: 60, retireAge: 65, endAge: 66, inflation: 3, spending: 40000, strategy, accounts: roth(1e6) }));
  cmp(strategy + ' first retired year spending, $40,000 today\'s dollars, retire in 5 yrs at 3%', r.rows[6].spending, 40000 * Math.pow(1.03, 5));
}
// 3. fixedReal: 4% of the retirement balance, then +3%/yr.
{ const p = L.basePlan({ age: 60, endAge: 63, inflation: 3, strategy: 'fixedReal', accounts: roth(1e6) }); p.retirement.withdrawalRate = 4;
  const r = run(p); cmp('fixedReal yr1', r.rows[1].spending, 40000); cmp('fixedReal yr2', r.rows[2].spending, 41200); cmp('fixedReal yr3', r.rows[3].spending, 42436); }
// 4. guardrails: 5% of $1M, -10% returns, upper guardrail 20% (6%), 10% cut, no floor.
{ const p = L.basePlan({ age: 60, endAge: 63, returnRate: -10, strategy: 'guardrails', accounts: roth(1e6) });
  Object.assign(p.retirement, { withdrawalRate: 5, upperGuardrail: 20, lowerGuardrail: 20, adjustment: 10, floor: 0, ceiling: 1e7 });
  const r = run(p); const g = 0.9;
  const B1 = (1e6 * Math.sqrt(g) - 50000) * Math.sqrt(g); const s2 = 50000; // 50000/B1 = 5.86% < 6%
  const B2 = (B1 * Math.sqrt(g) - s2) * Math.sqrt(g); const s3 = 50000 / B2 > 0.06 ? 45000 : 50000;
  cmp('guardrails yr1', r.rows[1].spending, 50000); cmp('guardrails yr2', r.rows[2].spending, s2); cmp('guardrails yr3', r.rows[3].spending, s3); }
// 5. constantPercent 4% of the balance at the row opening.
{ const p = L.basePlan({ age: 60, endAge: 62, returnRate: 5, strategy: 'constantPercent', accounts: roth(1e6) }); p.retirement.withdrawalRate = 4;
  const r = run(p); const B1 = (1e6 * Math.sqrt(1.05) - 40000) * Math.sqrt(1.05);
  cmp('constantPercent yr2', r.rows[2].spending, B1 * 0.04); }
// 6. rmd strategy: balance / remaining years (horizon 70 - age), multiplier 100%.
{ const p = L.basePlan({ age: 60, endAge: 70, strategy: 'rmd', accounts: roth(1e6) });
  const r = run(p); cmp('rmd-style yr1 (1e6/10)', r.rows[1].spending, 100000); cmp('rmd-style yr2 (900k/9)', r.rows[2].spending, 100000); }
// 7. vpw: real rate (5-0)/(1+0) -> PMT over 10 years, end-of-period annuity factor.
{ const p = L.basePlan({ age: 60, endAge: 70, returnRate: 5, strategy: 'vpw', accounts: roth(1e6) });
  const r = run(p); const f = (1 - Math.pow(1.05, -10)) / 0.05; cmp('vpw yr1', r.rows[1].spending, 1e6 / f); }
// 8. floorCeiling: 4% of $1M = 40,000 clamped to floor 50,000 x inflation factor.
{ const p = L.basePlan({ age: 60, endAge: 62, inflation: 3, strategy: 'floorCeiling', accounts: roth(1e6) });
  Object.assign(p.retirement, { withdrawalRate: 4, floor: 50000, ceiling: 90000 });
  const r = run(p); cmp('floorCeiling yr1', r.rows[1].spending, 50000); cmp('floorCeiling yr2', r.rows[2].spending, 51500); }
// 9. stage "percent" 50% from 62 to 63 on $40,000 incomeFirst: covers years opening 62 and 63 (continuous [62,64)).
{ const p = L.basePlan({ age: 60, endAge: 66, strategy: 'fixedNominal', accounts: roth(1e6), stages: [{ name: 'Half', start: 62, end: 63, mode: 'percent', value: 50 }] });
  const r = run(p); cmp('stage 62-63 year 61-62', r.rows[2].spending, 40000); cmp('stage 62-63 year 62-63', r.rows[3].spending, 20000);
  cmp('stage 62-63 year 63-64', r.rows[4].spending, 20000); cmp('stage 62-63 year 64-65', r.rows[5].spending, 40000); }
// 10. stage half-year boundary 62.5 to 63: prorated -> year 62-63: 0.5*40k+0.5*20k; 63-64: 20k.
{ const p = L.basePlan({ age: 60, endAge: 66, strategy: 'fixedNominal', accounts: roth(1e6), stages: [{ name: 'Half', start: 62.5, end: 63, mode: 'percent', value: 50 }] });
  const r = run(p); cmp('stage 62.5-63 year 62-63', r.rows[3].spending, 30000); cmp('stage 62.5-63 year 63-64', r.rows[4].spending, 20000); cmp('stage 62.5-63 year 64-65', r.rows[5].spending, 40000); }
// 11. one-time expense at the projection's end age: is it charged anywhere?
{ const p = L.basePlan({ age: 60, endAge: 65, strategy: 'fixedNominal', spending: 0, accounts: roth(1e6), expenses: [{ name: 'Last', age: 65, amount: 50000 }] });
  const v = L.h.validateScenario(structuredClone(p)); const r = run(p);
  cmp('expense at endAge charged (sum of spending)', r.rows.reduce((t, x) => t + x.spending, 0), 50000);
  out.push({ label: 'expense at endAge validator issues', issues: v.issues.map(i => i.code + ':' + i.severity) }); }
// 12. other-asset fallback: accessible share 50% of a $400,000 asset, no growth; portfolio empty.
{ const p = L.basePlan({ age: 60, endAge: 70, strategy: 'fixedNominal', spending: 60000, accounts: [account('cash', 'taxable', 0, { cashHolding: true, allocation: {}, priority: 0 })],
    networthOn: true, fallback: true, otherAssets: [{ id: 'home', name: 'Home', type: 'realEstate', value: 400000, growth: 0, available: true, availableAge: 60, accessPct: 50, liquidity: 'illiquid' }] });
  const r = run(p); const drawn = r.rows.reduce((t, x) => t + x.nonPortfolioDraw, 0);
  cmp('fallback total drawn vs accessible share 50% x 400,000', drawn, 200000);
  out.push({ label: 'fallback per year', draws: r.rows.slice(1).map(x => Math.round(x.nonPortfolioDraw)), shortfall: r.rows.slice(1).map(x => Math.round(x.shortfall)) }); }
console.log(out.map(o => JSON.stringify(o)).join('\n'));
