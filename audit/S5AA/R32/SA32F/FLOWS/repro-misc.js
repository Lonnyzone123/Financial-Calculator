'use strict';
// Repros for FLOWS-02 .. FLOWS-07. Run: node repro-misc.js
const L = require('./lib.js');
const { account } = L;
function run(p) { const v = L.h.validateScenario(structuredClone(p)); if (!v.valid) throw new Error(JSON.stringify(v.issues.filter(i => i.severity === 'ERROR'))); const r = L.h.engine.runPlan(structuredClone(p)); if (r.status !== 'ok') throw new Error(r.status + ' ' + r.calculationErrorCode); return { r, warnings: v.issues.map(i => i.code) }; }
const log = (id, o) => console.log(id + ' ' + JSON.stringify(o));
const roth = b => [account('roth', 'rothIRA', b)];

// FLOWS-02: fixedNominal's input is labelled "Annual spending in today's dollars", but a deferred retirement spends it
// uninflated. Plan: age 40, retire 65, 3.5% inflation, $60,000.
for (const strategy of ['fixedNominal', 'incomeFirst']) {
  const { r } = run(L.basePlan({ age: 40, retireAge: 65, endAge: 66, inflation: 3.5, spending: 60000, strategy, accounts: roth(3e6) }));
  const row = r.rows.find(x => x.age === 66);
  log('FLOWS-02', { strategy, firstRetiredYearSpending: +row.spending.toFixed(2), handTodaysDollars: +(60000 * Math.pow(1.035, 25)).toFixed(2), realValueOfWhatIsSpent: +(row.spending / row.inflationFactor * 1.035).toFixed(2) });
}

// FLOWS-03: the other-asset fallback. "Accessible share" 50% of a $400,000 asset (the app's own "Potentially accessible"
// total is value x share = $200,000). No portfolio, $60,000 a year of spending, zero growth.
{ const p = L.basePlan({ age: 60, endAge: 70, spending: 60000, accounts: [account('cash', 'taxable', 0, { cashHolding: true, allocation: {}, priority: 1 })],
    networthOn: true, fallback: true, otherAssets: [{ id: 'home', name: 'Home', type: 'realEstate', value: 400000, growth: 0, available: true, availableAge: 60, accessPct: 50, liquidity: 'illiquid' }] });
  const { r } = run(p);
  log('FLOWS-03', { drawnTotal: r.rows.reduce((t, x) => t + x.nonPortfolioDraw, 0), handAccessible: 200000, perYear: r.rows.slice(1).map(x => x.nonPortfolioDraw),
    shortfallPerYear: r.rows.slice(1).map(x => Math.round(x.shortfall)), firstShortfallAge: r.firstShortfallAge, assetLeft: r.rows[r.rows.length - 1].otherAssets }); }

// FLOWS-04: VPW's "expected real return" reads assumptions.returnRate (the default 10%) even when account allocations are on
// and every account earns its classes' return. One 60/40 account: expected 0.6 x 10% + 0.4 x 4.5% = 7.8%.
{ const p = L.basePlan({ age: 65, endAge: 95, inflation: 3.5, strategy: 'vpw', returnRate: 10, accounts: [account('roth', 'rothIRA', 1e6, { allocation: { stocks: 60, bonds: 40 } })] });
  p.advanced.assetClasses = [{ id: 'stocks', name: 'US stocks', returnRate: 10, volatility: 18.5 }, { id: 'bonds', name: 'Bonds', returnRate: 4.5, volatility: 7 }];
  const { r } = run(p);
  const pmt = (rate, n) => 1e6 / ((1 - Math.pow(1 + rate, -n)) / rate);
  const realHand = 1.078 / 1.035 - 1, realField = 1.10 / 1.035 - 1;
  log('FLOWS-04', { engineYear1: +r.rows[1].spending.toFixed(2), handAt7_8pct: +pmt(realHand, 30).toFixed(2), handAtField10pct: +pmt(realField, 30).toFixed(2),
    growthCheckEndOfYear1: +r.rows[1].total.toFixed(2) }); }

// FLOWS-05: a one-time expense dated at the projection's end age is accepted and never charged.
{ const p = L.basePlan({ age: 60, endAge: 65, spending: 0, accounts: roth(1e6), expenses: [{ name: 'Final', age: 65, amount: 50000 }] });
  const { r, warnings } = run(p);
  log('FLOWS-05', { spendingCharged: r.rows.reduce((t, x) => t + x.spending, 0), endTotal: r.rows[r.rows.length - 1].total, validatorIssues: warnings }); }

// FLOWS-06: a "Set annual spending" stage replaces the survivor-reduced amount, so the survivor reduction vanishes;
// a percent stage keeps it. Couple, self dies at 70 (selfLife 70), 25% survivor reduction, $80,000 incomeFirst.
for (const mode of ['amount', 'percent']) {
  const p = L.basePlan({ couple: true, age: 68, spouseAge: 68, endAge: 74, spending: 80000, strategy: 'incomeFirst', accounts: roth(3e6),
    stages: [{ name: 'Stage', start: 68, end: 80, mode, value: mode === 'amount' ? 80000 : 100, growthMode: 'none', annualChange: 0 }] });
  Object.assign(p.retirement, { survivor: true, survivorSpendingReduction: 25, selfLife: 70, spouseLife: 100 });
  const { r } = run(p);
  log('FLOWS-06', { stageMode: mode, spendingByRow: r.rows.slice(1).map(x => [x.age, x.spending]), handSurvivorYears: 60000 });
}

// FLOWS-07: strategies described as withdrawing a percentage of the portfolio withdraw less when outside income exists
// (MODEL_ASSUMPTIONS 3). constantPercent 4% of $1,000,000 with a $30,000 pension.
{ const p = L.basePlan({ age: 67, endAge: 68, strategy: 'constantPercent', pension: 30000, accounts: roth(1e6) }); p.retirement.withdrawalRate = 4;
  const { r } = run(p); log('FLOWS-07', { spending: r.rows[1].spending, withdrawals: +r.rows[1].withdrawals.toFixed(2), describedWithdrawal: 40000 }); }
