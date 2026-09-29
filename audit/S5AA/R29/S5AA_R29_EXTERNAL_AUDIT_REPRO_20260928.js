'use strict';

// Run from the repository root. An optional argument selects another read-only checkout.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '../../..'));
const shell = fs.readFileSync(path.join(ROOT, 'src/app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools/capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src/engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src/scenario-validator.js'));
const defaults = require(path.join(ROOT, 'tests/lib/golden-scenario-defs.js')).extractDefaultPlan(shell);
const classes = { taxable: 'taxable', traditionalIRA: 'preTax', traditional401k: 'preTax', rothIRA: 'roth', hsa: 'hsa' };

function account(id, type, balance, extra = {}) {
  return Object.assign({ id, name: id, type, taxClass: classes[type], owner: 'self', balance,
    basisPct: type === 'taxable' ? 100 : 0, contribution: 0, contributionMode: 'amount', annualChange: 0,
    annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: { flat: 100 },
    matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: id === 'cash' ? 0 : 2 }, extra);
}

function plan({ years = 1, retireAge = 60, balance = 50000, from = 'taxable', to = 'rothIRA', amount = 50000,
  at = 60.75, pension = 0, yieldRate = 0 } = {}) {
  const p = structuredClone(defaults);
  p.setupComplete = true;
  p.limitPolicy = 'redirect';
  Object.assign(p.profile, { age: 60, retireAge, endAge: 60 + years, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 61 + years });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: yieldRate,
    dividendQualified: 100, dividendGrowth: 0, dividendStart: 60, pension, pensionCola: 0, ssBenefit: 0,
    spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [], withdrawalOrder: 'manual',
    manualOrder: 'taxable,roth,preTax,hsa' });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, ltcOn: false, networthOn: true,
    otherAssets: [], debts: [], assetsOn: true, assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }],
    rule55: false, penaltyException: false, transferOn: true, transferFrom: 'src', transferTo: 'dst',
    transferAmount: amount, transferAge: at });
  p.accounts = [account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} }),
    account('src', from, balance), account('dst', to, 0)];
  return p;
}

function run(p) {
  const v = validateScenario(structuredClone(p));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter(x => x.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  assert.deepEqual((r.issues || []).filter(x => x.severity === 'ERROR'), []);
  return r;
}

function basisPlan() {
  const p = plan({ years: 3, retireAge: 63, balance: 0, from: 'traditionalIRA', to: 'hsa', amount: 5400, at: 61 });
  p.retirement.otherIncomes = [
    { name: 'Basis-year wages', type: 'employment', owner: 'self', amount: 200000, start: 60, end: 61, growth: 0, growthMode: 'fixed' },
    { name: 'Later wages', type: 'employment', owner: 'self', amount: 30000, start: 62, end: 63, growth: 0, growthMode: 'fixed' }
  ];
  Object.assign(p.accounts[1], { contribution: 8600,
    futureChanges: [{ age: 61, mode: 'set', value: 0 }, { age: 62, mode: 'set', value: 2000 }] });
  p.accounts.push(account('work', 'traditional401k', 0, { contribution: 1000,
    futureChanges: [{ age: 61, mode: 'set', value: 0 }], priority: 4 }));
  p.retirement.expenses = [{ name: 'Drain', age: 62, amount: 100000 }];
  p.retirement.manualOrder = 'preTax,taxable,roth,hsa';
  return p;
}

function values(r, index = r.rows.length - 1) {
  const row = r.rows[index];
  return { age: row.age, dividends: row.dividends, agi: row.federalAgi, taxes: row.taxes,
    preTax: row.preTax, roth: row.roth, hsa: row.hsa, total: row.total, warnings: r.limitWarnings };
}

let mismatches = 0;
function compare(label, actual, expected) {
  const wrong = Object.keys(expected).filter(k => !Number.isFinite(actual[k]) || Math.abs(actual[k] - expected[k]) > 0.005);
  if (wrong.length) mismatches++;
  console.log(JSON.stringify({ label, validation: 'PASS', calculationStatus: 'ok',
    verdict: wrong.length ? 'MISMATCH' : 'PASS', wrong, expected, actual }));
}

if (require.main === module) {
  const dividendPlan = plan({ yieldRate: 10, pension: 50000 });
  compare('R29-01 late zero-room transfer', values(run(dividendPlan)),
    { dividends: 5000, agi: 55000, taxes: 4792.5, roth: 0, total: 195207.5 });
  for (const at of [60, 60.5]) {
    const p = structuredClone(dividendPlan);
    p.advanced.transferAge = at;
    compare('R29-01 early control at ' + at, values(run(p)),
      { dividends: 5000, agi: 55000, taxes: 4792.5, roth: 0, total: 195207.5 });
  }
  dividendPlan.advanced.transferOn = false;
  compare('R29-01 no-transfer control', values(run(dividendPlan)),
    { dividends: 5000, agi: 55000, taxes: 4792.5, roth: 0, total: 195207.5 });
  const reinvest = plan({ yieldRate: 10 });
  reinvest.retirement.dividendStart = 65;
  compare('R29-01 reinvested zero-room transfer', values(run(reinvest)), { dividends: 0, agi: 5000, roth: 0 });
  reinvest.advanced.transferOn = false;
  compare('R29-01 reinvested no-transfer control', values(run(reinvest)), { dividends: 0, agi: 5000, roth: 0 });

  const p = basisPlan();
  const r = run(p);
  compare('R29-02 basis creation control', values(r, 1), { agi: 200000, preTax: 9600, hsa: 0 });
  compare('R29-02 funding-year balances', values(r, 2), { agi: 0, preTax: 4200, hsa: 5400 });
  // Funding consumes $5,400 of all-basis IRA money. $3,200 basis remains; the later $2,000 contribution is deductible.
  // The final IRA distribution is $5,200 - $3,200 = $2,000 taxable; the workplace draw adds $1,000.
  compare('R29-02 later liquidation', values(r), { agi: 31000, taxes: 4207.5, preTax: 0, hsa: 5400, total: 181722 });
  p.advanced.transferOn = false;
  compare('R29-02 no-funding control', values(run(p)), { agi: 31000, taxes: 4207.5, preTax: 0, hsa: 0, total: 181722 });
  console.log(JSON.stringify({ mismatchingWitnesses: mismatches, note: 'Three mismatches are expected at the audited tag: two R29-01 variants and one R29-02 witness.' }));
  process.exitCode = mismatches ? 1 : 0;
}

module.exports = { plan, account, basisPlan, run, values };
