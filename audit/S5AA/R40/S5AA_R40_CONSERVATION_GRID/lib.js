'use strict';
// FLOWS audit helpers: a tapped in-memory engine variant (read-only taps, output-neutrality asserted per run),
// a plan builder, and the money-conservation reconciler.
// S5AA R40: copied from audit/S5AA/R32/SA32F/FLOWS/lib.js (Claude's R32F conservation grid, left as it was) and brought up to
// the model after R35. ChatGPT's R38 audit ran that grid and found household flags from its assumption that wages never fund
// retirement spending; since R35 (6c37633, SA32F-19) the net pay earned after the retirement date pays spending before the
// portfolio (`retiredPaySpent`). Two changes, marked "R40" below: the tap reads retiredPaySpent, and the household and combined
// balances count those dollars as funding spending instead of leaving the model with the rest of the wages.
const path = require('path');
const h = require('../../R32/SA32F/harness.js');
const { loadEngineVariant } = require(path.join(h.TREE, 'tests/lib/engine-variant.js'));

const TAP = 'if(globalThis.__FT)globalThis.__FT({row:row,growth:growthTotal,wages:wages,baseline:baseline.total,employer:employer,' +
  'contributions:contributions,outsideDeposit:outsideDepositToPortfolio,qcdCash:Math.min(qcd,rmdGross),dividendReinvested:dividendReinvested,' +
  'retiredDuration:retiredDuration,annualSpend:annualSpend,oneTime:oneTime,health:health,ltc:ltc,surplusSpent:surplusSpent,rmdGross:rmdGross,' +
  'taxNeed:taxNeed,preTaxDeferrals:preTaxDeferrals,duration:duration,age:age,iraTrueUp:iraTrueUp,trueUpDue:trueUpDue,pension:pension,ss:ss,' +
  'otherCash:other.cash,rates:rates.slice(),preGrowth:preGrowth,portfolioBeforeGrowth:portfolioBeforeGrowth,retireBalance:retireBalance,' +
  'priorSpend:priorSpend,priorReturn:priorReturn,inflationFactorOpen:inflationFactor,taxesTotal:taxes.total,penalties:penalties,' +
  'retiredPaySpent:retiredPaySpent,' +  // R40
  'balances:accounts.map(function(a){return {id:a.id,t:a.taxClass,b:a.balance,basis:a.basisDollars}})});';
const variant = loadEngineVariant([{ id: 'flows-tap', marker: 'rows.push(row);if(issues)checkRowInvariants(', replace: TAP + 'rows.push(row);if(issues)checkRowInvariants(' }]);

// Run a plan on the tapped variant and the real engine; assert identical rows; return {r, taps}.
function runTapped(p, opts = {}) {
  const v = h.validateScenario(structuredClone(p));
  const errs = v.issues.filter(x => x.severity === 'ERROR');
  if (!v.valid) return { invalid: errs };
  const taps = [];
  globalThis.__FT = t => taps.push(JSON.parse(JSON.stringify(t)));
  let rv;
  try { rv = variant.runPlan(structuredClone(p)); } finally { globalThis.__FT = null; }
  const r = h.engine.runPlan(structuredClone(p));
  if (JSON.stringify(r.rows) !== JSON.stringify(rv.rows)) throw new Error('tap is not output-neutral');
  return { r, taps, valid: true };
}

const classes = { taxable: 'taxable', traditionalIRA: 'preTax', traditional401k: 'preTax', rothIRA: 'roth', roth401k: 'roth', hsa: 'hsa' };
function account(id, type, balance, extra = {}) {
  return Object.assign({ id, name: id, type, taxClass: classes[type], owner: 'self', balance,
    basisPct: type === 'taxable' ? 100 : 0, contribution: 0, contributionMode: 'amount', annualChange: 0,
    annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: { flat: 100 },
    matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 2 }, extra);
}

// A retired single or couple plan, zero return/inflation/fee by default.
function basePlan(o = {}) {
  const p = structuredClone(h.defaults);
  p.setupComplete = true;
  p.limitPolicy = 'redirect';
  const couple = !!o.couple;
  Object.assign(p.profile, { age: o.age ?? 60, retireAge: o.retireAge ?? (o.age ?? 60), endAge: o.endAge ?? 90,
    spouseOn: couple, spouseAge: o.spouseAge ?? (o.age ?? 60) - 2, filing: couple ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: o.returnRate ?? 0, inflation: o.inflation ?? 0, fee: o.fee ?? 0,
    volatility: 0, withdrawalTiming: o.timing ?? 'monthly', seed: 7 });
  Object.assign(p.employment, { salary: o.salary ?? 0, spouseSalary: o.spouseSalary ?? 0, growth: 0, contributionStop: o.retireAge ?? (o.age ?? 60) });
  Object.assign(p.retirement, { strategy: o.strategy ?? 'fixedNominal', spending: o.spending ?? 40000, dividendOn: !!o.dividendOn,
    dividendYield: o.dividendYield ?? 3, dividendQualified: 80, dividendGrowth: 0, dividendStart: o.dividendStart ?? 0,
    pension: o.pension ?? 0, pensionCola: 0, ssBenefit: o.ssBenefit ?? 0, ssClaim: 67, spouseSS: o.spouseSS ?? 0, spouseClaim: 67,
    survivor: false, stages: o.stages ?? [], expenses: o.expenses ?? [], otherIncomes: o.otherIncomes ?? [],
    withdrawalOrder: o.order ?? 'manual', manualOrder: o.manualOrder ?? 'taxable,preTax,roth,hsa', flexibility: o.flexibility ?? 0,
    homeEquityFallback: !!o.fallback, selfLife: 120, spouseLife: 120 });
  Object.assign(p.advanced, { rmdOn: !!o.rmdOn, conversionOn: false, healthOn: !!o.healthOn, ltcOn: false, networthOn: !!o.networthOn,
    otherAssets: o.otherAssets ?? [], debts: [], assetsOn: true, glideOn: false,
    assetClasses: [{ id: 'flat', name: 'Flat', returnRate: o.returnRate ?? 0, volatility: 0 }],
    transferOn: false, surplusPolicy: o.surplus ?? 'retain', surplusPolicyBySource: o.surplusBySource ?? { rmd: 'invest' } });
  p.accounts = o.accounts ?? [account('brok', 'taxable', 300000, { basisPct: 60 }), account('ira', 'traditionalIRA', 300000)];
  return p;
}

// Money conservation, per row i >= 1, from row fields plus the taps.
//   portfolio: total_i - total_{i-1} = contributions + growth + outsideDeposit - dividends - withdrawals
//   household (exact, wages and the wage-only baseline tax included):
//     (income - dividends) + (withdrawals + dividends) + nonPortfolioDraw
//       = (spending - shortfall) + taxes + (contributions - employer) + outsideDeposit + qcdCash + (debtPaymentsTotal - debtPayments)
//       + [wages - (contributions - employer) - baseline]      <- the pre-retirement boundary (Q59), unused wages
//   combined (no taps except growth/wages/baseline): total change from row fields only.
function reconcile(r, taps, plan) {
  const out = [];
  const rows = r.rows;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i], prev = rows[i - 1], t = taps[i - 1];
    const tol = Math.max(0.01, 1e-9 * Math.max(Math.abs(row.total), Math.abs(row.spending), Math.abs(row.income), Math.abs(row.withdrawals)));
    const last = i === rows.length - 1;
    // the terminal row's unpaid final true-up is booked as shortfall without being a spending shortfall
    const unpaidFinal = last && row.taxOutstanding > 0.005 ? Math.max(0, row.taxOutstanding - Math.max(0, row.total)) : 0;
    const shortfall = row.shortfall - (unpaidFinal > 0.01 ? unpaidFinal : 0);
    const portfolio = (row.total - prev.total) - (t.contributions + t.employer + t.growth + t.outsideDeposit - row.dividends - row.withdrawals);
    const employee = row.contributions - t.employer;
    const debtOutside = row.debtPaymentsTotal - row.debtPayments;
    const sources = (row.income - row.dividends) + (row.withdrawals + row.dividends) + row.nonPortfolioDraw;
    // wages fund only their own baseline tax in the engine; employee contributions are funded from outside the model
    // R40: the pay that funds spending (R35) does not leave the model with the rest of the wages.
    const uses = (row.spending - shortfall) + (row.taxes - t.baseline) + t.outsideDeposit + t.qcdCash + (t.wages - t.retiredPaySpent);
    const household = sources - uses;
    const combined = (row.total - prev.total) - (t.contributions + t.employer + t.growth + (row.income - row.dividends - t.wages + t.retiredPaySpent)
      + row.nonPortfolioDraw - (row.spending - shortfall) - (row.taxes - t.baseline) - t.qcdCash);
    const clampGap = Math.max(0, t.baseline - t.taxesTotal);
    out.push({ age: row.age, portfolio, household, combined, tol, employee, debtOutside, clampGap, wages: t.wages });
  }
  return out;
}

module.exports = { h, variant, runTapped, account, basePlan, reconcile };
