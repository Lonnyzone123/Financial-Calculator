// S5AA R30 self-audit sweep: a transfer's dividends follow what moves, each account pays its own, and the draw leaves a late
// taxable transfer its dollars. Expectations are written from the rules, never read from the engine.
//   node audit/S5AA/R30/S5AA_R30_SELF_AUDIT_DIVIDEND_SWEEP.js [another checkout]
// 0 problems at 66c406c (R30); 344 at bf4d3d8, the commit before the dividend repair.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const REPO = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..'));
const SHELL = fs.readFileSync(path.join(REPO, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(REPO, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(REPO, 'src', 'engine.js'));
const { validateScenario } = require(path.join(REPO, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(REPO, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const CLASS = { taxable: 'taxable', traditionalIRA: 'preTax', rothIRA: 'roth', hsa: 'hsa' };
const FIELD = { taxable: 'taxable', preTax: 'preTax', roth: 'roth', hsa: 'hsa' };
function account(id, type, balance, extra) {
  return Object.assign({ id, name: id, type, taxClass: CLASS[type], owner: 'self', balance, basisPct: type === 'taxable' ? 100 : 0,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: { flat: 100 }, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    priority: id === 'cash' ? 0 : 2 }, extra || {});
}
function plan(x) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = x.policy;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: x.timing });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 62 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: x.spending || 0, dividendOn: true, dividendYield: x.y * 100,
    dividendQualified: 100, dividendGrowth: 0, dividendStart: x.dividendStart, pension: 20000, pensionCola: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], withdrawalOrder: 'manual', manualOrder: x.order || 'taxable,preTax,roth,hsa',
    otherIncomes: x.wages ? [{ name: 'Wages', type: 'employment', owner: 'self', amount: x.wages, start: 60, end: 61, growth: 0, growthMode: 'fixed' }] : [] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, ltcOn: false, networthOn: true, otherAssets: [], debts: [],
    assetsOn: true, assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }], rule55: false, penaltyException: true,
    transferOn: x.transferOn !== false, transferFrom: 'src', transferTo: 'dst', transferAmount: x.amount, transferAge: x.at });
  p.accounts = [account('src', x.from, x.balance, x.from === 'hsa' ? { hsaQualifiedPct: 100 } : {}), account('dst', x.to, 0)];
  if (x.cash) p.accounts.unshift(account('cash', 'taxable', x.cash, { cashHolding: true, allocation: {} }));
  if (x.ira) p.accounts.push(account('ira', 'traditionalIRA', x.ira, { priority: 3 }));
  return p;
}
function run(p) {
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r.rows[1];
}
/* The engine's split points: the draw at 0.5 (monthly) or 0.625 (quarterly) of the year; a transfer after it is late. */
const DRAW = { monthly: 0.5, quarterly: 0.625 };
let checks = 0; const problems = [];
function expect(label, actual, expected) {
  checks++;
  if (!(Math.abs(actual - expected) < 0.01)) problems.push(label + ': ' + actual + ' against ' + expected);
}
const FIELDS = ['dividends', 'federalAgi', 'taxes', 'total', 'taxable', 'preTax', 'roth', 'hsa', 'withdrawals', 'shortfall'];
let plans = 0;
for (const timing of ['monthly', 'quarterly']) for (const at of [60.25, 60.5, 60.75, 60.875]) for (const dividendStart of [60, 60.5, 65])
for (const y of [0.04, 0.1]) {
  const span = at - 60, paidSpan = Math.max(0, 1 - Math.max(0, dividendStart - 60)), reinvestSpan = 1 - paidSpan, late = span > DRAW[timing];
  const base = { timing, at, dividendStart, y };
  // 1. NOTHING MOVES (no compensation, redirect): the year is the year without the transfer.
  for (const to of ['rothIRA', 'traditionalIRA', 'hsa']) {
    const p = plan(Object.assign({}, base, { from: 'taxable', to, balance: 50000, amount: 30000, policy: 'redirect', cash: 100000 }));
    if (to === 'hsa') continue; // an HSA's room needs no compensation; it is covered by check 3
    const on = run(p); plans++;
    p.advanced.transferOn = false;
    const off = run(p); plans++;
    for (const k of FIELDS) expect(`zero-move ${to} ${timing} ${at} ds${dividendStart} y${y} ${k}`, on[k], off[k]);
  }
  // 2. A NON-TAXABLE SOURCE LOSES EXACTLY WHAT MOVED: $30,000 of $100,000 into taxable; no spending, taxes from the cash.
  for (const from of ['traditionalIRA', 'rothIRA', 'hsa']) {
    const r = run(plan(Object.assign({}, base, { from, to: 'taxable', balance: 100000, amount: 30000, policy: 'redirect', cash: 1000000 }))); plans++;
    expect(`source keeps ${from} ${timing} ${at} ds${dividendStart} y${y}`, r[FIELD[CLASS[from]]], 70000);
  }
  // 3. A NON-TAXABLE DESTINATION KEEPS ALL IT RECEIVES; A TAXABLE SOURCE MOVES WHAT ITS DIVIDENDS LEAVE.
  //    Warn policy, so the whole asked amount is allowed; $30,000 of $100,000, and all of $50,000.
  for (const to of ['rothIRA', 'hsa']) for (const [balance, amount] of [[100000, 30000], [50000, 50000]]) {
    const r = run(plan(Object.assign({}, base, { from: 'taxable', to, balance, amount, policy: 'warn', cash: 1000000 }))); plans++;
    let cap;
    if (late) {
      // Before the draw the source pays y(B P - m a), a = paid part after the date; it must still hold m: m <= B(1 - yP)/(1 - ya).
      const a = Math.max(0, 1 - Math.max(reinvestSpan, span));
      cap = balance * (1 - y * paidSpan) / (1 - y * a);
    } else {
      // The transfer runs first; the source then pays y((B - m)P + m b), b = paid part before the date: m <= B(1 - yP)/(1 - yP + yb).
      const b = Math.max(0, span - reinvestSpan);
      cap = balance * (1 - y * paidSpan) / (1 - y * paidSpan + y * b);
    }
    expect(`destination keeps ${to} ${timing} ${at} ds${dividendStart} y${y} ${balance}/${amount}`, r[FIELD[CLASS[to]]], Math.min(amount, cap));
  }
  // 4. PROTECT: a late taxable transfer into a Roth IRA with room, and spending that would otherwise take the source. The draw
  //    leaves it; the Roth IRA receives the room ($8,600 of $20,000 of wages), capped by what the dividends leave.
  if (late) {
    const r = run(plan(Object.assign({}, base, { from: 'taxable', to: 'rothIRA', balance: 50000, amount: 8600, policy: 'redirect',
      wages: 20000, spending: 90000, cash: 0, ira: 200000 }))); plans++;
    expect(`protected ${timing} ${at} ds${dividendStart} y${y}`, r.roth, 8600);
  }
}
const byCheck = {}; problems.forEach((x) => { const k = x.split(' ').slice(0, 2).join(' '); byCheck[k] = (byCheck[k] || 0) + 1; });
console.log(JSON.stringify({ plans, checks, problems: problems.length, byCheck }));
problems.slice(0, 30).forEach((x) => console.log('  ' + x));
console.log(problems.length ? 'SWEEP FAILED' : 'SWEEP PASSED');
process.exitCode = problems.length ? 1 : 0;
