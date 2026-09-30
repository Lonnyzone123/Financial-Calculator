'use strict';
// Money-conservation grid: generated plans (fixed seed), method simple, zero volatility, varied features. S5AA R40: the same
// generator as audit/S5AA/R32/SA32F/FLOWS/grid.js, run on the R40 lib.js (see its header).
// Usage: node grid.js [count] [seed]
const L = require('./lib.js');
const { account } = L;
const N = Number(process.argv[2] || 300), SEED = Number(process.argv[3] || 12345);
function rng(seed) { let x = seed >>> 0; return () => { x += 0x6D2B79F5; let t = x; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(SEED);
const pick = a => a[Math.floor(R() * a.length)];
const chance = q => R() < q;
const STRATS = ['constantPercent', 'fixedNominal', 'fixedReal', 'floorCeiling', 'guardrails', 'guyton', 'incomeFirst', 'rmd', 'vpw'];
const ORDERS = ['optimized', 'taxable,preTax,roth,hsa', 'preTax,taxable,roth,hsa', 'taxable,roth,preTax,hsa'];

function genPlan(k) {
  const couple = chance(0.5);
  const age = pick([55, 58.5, 60, 62, 64.5, 67, 70, 72]);
  const working = chance(0.35);
  const retireAge = working ? age + pick([1, 2.5, 5]) : age;
  const o = { couple, age, retireAge, endAge: Math.min(age + pick([10, 20, 30.5]), 104), spouseAge: age - pick([-3, 0, 2, 5]),
    returnRate: pick([0, 0, 5, 7, -3]), inflation: pick([0, 2.5, 3.5]), fee: pick([0, 0, 0.5]),
    timing: pick(['monthly', 'quarterly', 'annual']), strategy: pick(STRATS), spending: pick([20000, 45000, 80000, 150000]),
    dividendOn: chance(0.5), dividendYield: pick([0, 2, 4]), dividendStart: pick([0, retireAge, retireAge + 3]),
    order: 'manual', rmdOn: chance(0.6), healthOn: chance(0.3), flexibility: pick([0, 10]),
    surplus: pick(['retain', 'invest', 'spend']), surplusBySource: pick([{ rmd: 'invest' }, { rmd: 'retain' }, { rmd: 'spend', pension: 'invest' }, {}]),
    salary: working ? pick([0, 60000, 150000]) : 0, spouseSalary: working && couple ? pick([0, 40000]) : 0 };
  const ord = pick(ORDERS);
  if (ord === 'optimized') o.order = 'optimized'; else o.manualOrder = ord;
  const accts = [];
  const bal = () => pick([0, 5000, 50000, 250000, 800000]);
  if (chance(0.8)) accts.push(account('brok', 'taxable', bal(), { basisPct: pick([20, 60, 100, 130]), priority: 1 }));
  if (chance(0.4)) accts.push(account('cash', 'taxable', pick([0, 20000]), { cashHolding: true, allocation: {}, priority: 0 }));
  if (chance(0.8)) accts.push(account('ira', 'traditionalIRA', bal(), { priority: 2 }));
  if (chance(0.3)) accts.push(account('k401', 'traditional401k', bal(), { priority: 3, contribution: working ? 10000 : 0 }));
  if (chance(0.6)) accts.push(account('roth', 'rothIRA', bal(), { priority: 4 }));
  if (chance(0.4)) accts.push(account('hsa', 'hsa', bal(), { priority: 5, qualifiedMedicalPct: pick([100, 100, 50]) }));
  if (couple) {
    if (chance(0.7)) accts.push(account('sira', 'traditionalIRA', bal(), { owner: 'spouse', priority: 2 }));
    if (chance(0.5)) accts.push(account('sroth', 'rothIRA', bal(), { owner: 'spouse', priority: 4 }));
    if (chance(0.3)) accts.push(account('joint', 'taxable', bal(), { owner: 'joint', basisPct: 50, priority: 1 }));
  }
  if (!accts.length) accts.push(account('brok', 'taxable', 100000, { priority: 1 }));
  o.accounts = accts;
  if (chance(0.5)) o.expenses = [{ name: 'Roof', age: age + pick([1, 3.5, 7]), amount: pick([15000, 60000]) }];
  if (chance(0.5)) o.stages = [pick([
    { name: 'Go-go', start: retireAge, end: retireAge + 4, mode: 'percent', value: 120 },
    { name: 'Slow', start: retireAge + 5.5, end: retireAge + 12, mode: 'percent', value: 70 },
    { name: 'Set', start: retireAge + 2, end: retireAge + 6, mode: 'amount', value: 30000, growthMode: 'inflation' },
    { name: 'SetFixed', start: retireAge + 1.5, end: retireAge + 3, mode: 'amount', value: 50000, growthMode: 'fixed', annualChange: 2 }])];
  const incomes = [];
  if (chance(0.5)) incomes.push({ name: 'Rent', type: 'rental', owner: 'self', amount: pick([12000, 60000]), start: age, end: age + 15, growth: 2, growthMode: 'fixed' });
  if (chance(0.3)) incomes.push({ name: 'Consult', type: 'employment', owner: couple && chance(0.5) ? 'spouse' : 'self', amount: 30000, start: age, end: age + 3.5, growth: 0, growthMode: 'fixed' });
  if (chance(0.3)) incomes.push({ name: 'Gift', type: pick(['oneTime', 'oneTimeTaxFree']), owner: 'self', amount: 50000, start: age + 2, end: age + 2, growth: 0, growthMode: 'fixed' });
  if (chance(0.2)) incomes.push({ name: 'Annuity', type: 'other', owner: couple ? 'household' : 'self', amount: 20000, start: age + 1, end: age + 25, growth: 0, growthMode: 'inflation' });
  if (chance(0.2)) incomes.push({ name: 'TaxFree', type: 'taxFree', owner: 'self', amount: 8000, start: age, end: age + 10, growth: 0, growthMode: 'fixed' });
  o.otherIncomes = incomes;
  if (chance(0.4)) o.pension = pick([15000, 70000]);
  if (chance(0.5)) { o.ssBenefit = pick([1500, 3500]); if (couple) o.spouseSS = pick([0, 1200]); }
  if (chance(0.3)) { o.networthOn = true; o.fallback = true; o.otherAssets = [{ id: 'home', name: 'Home', type: 'realEstate', value: 400000, growth: 3, available: true, availableAge: age + 5, accessPct: 50, liquidity: 'illiquid' }]; }
  const p = L.basePlan(o); // EXTRA_FEATURES
  if (chance(0.3)) p.accounts.forEach(a => { a.balance = Math.round(a.balance * 0.08); });
  if (chance(0.3)) { p.advanced.networthOn = true; p.advanced.debts = [{ id: 'd1', name: 'Loan', type: 'otherDebt', owner: 'household',
    balance: pick([10000, 80000]), rate: pick([0, 6]), rateType: 'fixed', paymentMonthly: pick([300, 900]), extraPrincipalMonthly: 0,
    payoffAge: age + pick([3, 8.5, 40]), includePayment: chance(0.7), includeHousingCosts: false }]; }
  if (chance(0.25) && p.accounts.some(a => a.taxClass === 'preTax') && p.accounts.some(a => a.type === 'rothIRA' && a.owner !== 'spouse')) {
    p.advanced.conversionOn = true; p.advanced.conversionAmount = pick([10000, 40000]); }
  if (chance(0.2)) { p.advanced.ltcOn = true; p.advanced.ltcCost = 80000; p.advanced.ltcProbability = 100; p.advanced.ltcYears = 2; p.advanced.ltcInsurance = 0; }
  return p;
}

if (require.main !== module) { module.exports = { genPlan }; return; }
const stats = { plans: 0, invalid: 0, notOk: 0, rows: 0, worst: { portfolio: 0, household: 0, combined: 0 }, fails: [], issueCodes: {}, invalidCodes: {}, cls: {} };
for (let k = 0; k < N; k++) {
  const p = genPlan(k);
  let x;
  try { x = L.runTapped(p); } catch (e) { stats.fails.push({ k, crash: String(e && e.stack || e).slice(0, 300) }); continue; }
  if (!x.valid) { stats.invalid++; x.invalid.forEach(i => stats.invalidCodes[i.code] = (stats.invalidCodes[i.code] || 0) + 1); continue; }
  stats.plans++;
  (x.r.issues || []).forEach(i => stats.issueCodes[i.code] = (stats.issueCodes[i.code] || 0) + 1);
  if (x.r.status !== 'ok') { stats.notOk++; stats.fails.push({ k, status: x.r.status, code: x.r.calculationErrorCode }); continue; }
  const rec = L.reconcile(x.r, x.taps, p);
  (function totalsCheck(r) {
    const rows = r.rows, bad = [];
    const sT = rows.reduce((t, z) => t + z.taxSettled, 0), sC = rows.reduce((t, z) => t + z.contributions, 0);
    const sCR = rows.reduce((t, z) => t + z.contributions / z.inflationFactor, 0);
    if (Math.abs(sT - r.lifetimeTaxes) > 0.01) bad.push('lifetimeTaxes');
    if (Math.abs(sC - r.lifetimeContributions) > 0.01) bad.push('lifetimeContributions');
    if (Math.abs(sCR - r.lifetimeContributionsReal) > 0.01) bad.push('lifetimeContributionsReal');
    let first = null, sus = null, streak = 0;
    rows.slice(1).forEach(z => { if (z.shortfall > 0.01) { if (first === null) first = z.age; streak++; if (streak >= 2 && sus === null) sus = z.age; } else streak = 0; });
    if (first !== r.firstShortfallAge) bad.push('firstShortfallAge ' + first + ' vs ' + r.firstShortfallAge);
    if (sus !== r.sustainedFailureAge) bad.push('sustainedFailureAge ' + sus + ' vs ' + r.sustainedFailureAge);
    if (r.failureAge !== r.sustainedFailureAge) bad.push('failureAge alias');
    const failed = rows.some(z => z.shortfall > 0.01);
    if (failed !== r.failed || r.successRate !== (failed ? 0 : 100)) bad.push('failed/successRate');
    let infl = 1;
    rows.forEach((z, i) => {
      if (Math.abs(z.realTotal - z.total / z.inflationFactor) > 1e-6 * Math.max(1, Math.abs(z.total))) bad.push('realTotal@' + z.age);
      if (Math.abs(z.total - (z.taxable + z.preTax + z.roth + z.hsa)) > 0.01) bad.push('class@' + z.age);
      if (i > 0) { infl *= Math.pow(1 + p.assumptions.inflation / 100, z.age - rows[i - 1].age); if (Math.abs(z.inflationFactor - infl) > 1e-9 * infl) bad.push('inflationFactor@' + z.age); }
      const nw = z.total + (p.advanced.networthOn ? z.otherAssets - z.debtBalance : 0) - z.taxOutstanding;
      if (Math.abs(z.networth - nw) > 0.01) bad.push('networth@' + z.age);
    });
    if (bad.length) stats.fails.push({ k, totals: bad.slice(0, 5) });
    stats.totalsChecked = (stats.totalsChecked || 0) + 1;
  })(x.r);
  stats.rows += rec.length;
  rec.forEach(q => {
    ['portfolio', 'household', 'combined'].forEach(f => {
      if (Math.abs(q[f]) > stats.worst[f]) stats.worst[f] = Math.abs(q[f]);
      if (Math.abs(q[f]) > q.tol) { const cls = (f !== 'portfolio' && Math.abs(Math.abs(q[f]) - q.clampGap) <= q.tol) ? 'WAGE_TAX_CLAMP' : 'LEAK'; stats.cls[cls] = (stats.cls[cls] || 0) + 1; if (cls === 'LEAK') stats.fails.push({ k, age: q.age, kind: f, residual: q[f] }); }
    });
  });
}
console.log(JSON.stringify({ N, SEED, plansRun: stats.plans, invalid: stats.invalid, invalidCodes: stats.invalidCodes, notOk: stats.notOk, rows: stats.rows,
  worst: stats.worst, classes: stats.cls, failCount: stats.fails.length, totalsChecked: stats.totalsChecked, firstFails: stats.fails.slice(0, 25), issueCodes: stats.issueCodes }, null, 1));
module.exports = { genPlan };
