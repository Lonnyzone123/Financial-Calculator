'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..'));
const shell = fs.readFileSync(path.join(root, 'src/app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(root, 'tools/capture-baseline.js')).installDebtModules();
const engine = require(path.join(root, 'src/engine.js'));
const validator = require(path.join(root, 'src/scenario-validator.js'));
const defaults = require(path.join(root, 'tests/lib/golden-scenario-defs.js')).extractDefaultPlan(shell);
const clone = x => JSON.parse(JSON.stringify(x));
function account(id, type, taxClass, balance, priority, cls = 'flat') {
  return { id, name: id, type, taxClass, owner: 'self', balance, priority, basisPct: taxClass === 'taxable' ? 100 : 0,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
    changeTiming: 'year', futureChanges: [], allocation: { [cls]: 100 }, matchOn: false, matchCap: 0,
    matchRate: 0, profitShare: 0, vesting: 100 };
}
function base() {
  const p = clone(defaults);
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, volatility: 0, inflation: 0, fee: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, pension: 0, ssBenefit: 0, spouseSS: 0,
    dividendOn: true, dividendYield: 0, dividendGrowth: 0, dividendStart: 60, survivor: false,
    stages: [], expenses: [], otherIncomes: [], withdrawalOrder: 'manual', manualOrder: 'taxable,roth,preTax,hsa' });
  Object.assign(p.advanced, { assetsOn: true, assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }],
    transferOn: false, conversionOn: false, rmdOn: false, healthOn: false, networthOn: true,
    otherAssets: [], debts: [], reserveOn: false, bondTentOn: false, glideOn: false });
  return p;
}
function inspect(name, p, expected) {
  const valid = validator.validateScenario(clone(p));
  const r = engine.runPlan(p);
  const row = r.rows && r.rows[1];
  console.log(JSON.stringify({ name, valid: valid.valid, validatorIssues: valid.issues.map(i => i.code), status: r.status,
    error: r.calculationErrorCode, expected, actual: row && { total: row.total, hsa: row.hsa, roth: row.roth,
      taxable: row.taxable, federalAgi: row.federalAgi, taxes: row.taxes, shortfall: row.shortfall },
    issues: r.issues.map(i => i.code) }));
  return { r, row, valid };
}
const hsa = base();
hsa.accounts = [Object.assign(account('source', 'hsa', 'hsa', 10000, 2), { qualifiedMedicalPct: 0 }), account('destination', 'taxable', 'taxable', 0, 1)];
Object.assign(hsa.advanced, { transferOn: true, transferFrom: 'source', transferTo: 'destination', transferAge: 60.5, transferAmount: 10000 });
const hsaWitness = inspect('HSA nonmedical transfer', hsa, { federalAgi: 10000, additionalTax: 2000, total: 8000 });
assert.equal(hsaWitness.valid.valid, true);
assert.equal(hsaWitness.r.status, 'ok');
assert.equal(hsaWitness.row.federalAgi, 0, 'PCF-01 reproduced: the nonmedical distribution is omitted');
assert.equal(hsaWitness.row.total, 10000);
const contribution = base();
contribution.accounts = [account('source', 'taxable', 'taxable', 50000, 2), account('destination', 'rothIRA', 'roth', 0, 1)];
Object.assign(contribution.advanced, { transferOn: true, transferFrom: 'source', transferTo: 'destination', transferAge: 60.5, transferAmount: 50000 });
const rothWitness = inspect('Roth contribution with no compensation', contribution, { roth: 0, action: 'refuse or apply the contribution limit' });
assert.equal(rothWitness.valid.valid, true);
assert.equal(rothWitness.r.status, 'ok');
assert.equal(rothWitness.row.roth, 50000, 'PCF-02 reproduced: the zero compensation ceiling is bypassed');
const floor = base();
floor.accounts = [account('cash', 'rothIRA', 'roth', 10000, 1)];
floor.retirement.spending = 12000;
const floorControl = inspect('Exhausted balance floor', floor, { total: 0, shortfall: 2000 });
assert.equal(floorControl.row.total, 0);
assert.equal(floorControl.row.shortfall, 2000);
const overflow = base();
overflow.accounts = [account('large1', 'rothIRA', 'roth', 1e308, 1), account('large2', 'rothIRA', 'roth', 1e308, 2)];
const overflowControl = inspect('Finite inputs with an overflowing total', overflow, { status: 'calculation_error', referenceFigures: null });
assert.equal(overflowControl.r.status, 'calculation_error');
assert.equal(overflowControl.r.rows, null);
for (const destination of ['destination', '__proto__', 'constructor', 'toString']) {
  const p = base();
  p.retirement.dividendYield = 10;
  p.accounts = [account('source', 'rothIRA', 'roth', 300000, 2), account(destination, 'taxable', 'taxable', 0, 1)];
  Object.assign(p.advanced, { transferOn: true, transferFrom: 'source', transferTo: destination, transferAge: 60.5, transferAmount: 300000 });
  const { row } = inspect('Dividend ownership destination ' + destination, p, { dividends: 15000, federalAgi: 15000 });
  console.log(JSON.stringify({ destination, dividends: row && row.dividends }));
  assert.equal(row.dividends, destination === '__proto__' ? 30000 : 15000, 'PCF-03 and its identifier controls');
}

const partial = base();
Object.assign(partial.profile, { age: 40, retireAge: 40.5, endAge: 41 });
partial.limitPolicy = 'redirect';
partial.employment.contributionStop = 55;
partial.retirement.dividendStart = 40;
partial.retirement.otherIncomes = [{ name: 'Wages', type: 'employment', owner: 'self', amount: 6000,
  start: 40, end: 40.5, growth: 0, growthMode: 'fixed' }];
partial.accounts = [account('cash', 'taxable', 'taxable', 100000, 9),
  Object.assign(account('ira', 'rothIRA', 'roth', 0, 1), { contribution: 7000 })];
const partialControl = inspect('Partial-year IRA compensation cap', partial, { roth: 3000 });
assert.equal(partialControl.valid.valid, true);
assert.equal(partialControl.row.roth, 3000, '6000 times half a year, capped once');

const basisAccount = account('loss', 'taxable', 'taxable', 10000, 1);
basisAccount.basisDollars = 15000;
const basisDraw = engine.withdrawFromClass([basisAccount], 'taxable', 10000, 60, base(), 0);
assert.equal(basisDraw.gains, -5000);
assert.equal(basisAccount.balance, 0);
assert.equal(basisAccount.basisDollars, 0);
console.log(JSON.stringify({ lossBasisControl: { expectedGains: -5000, actualGains: basisDraw.gains } }));

const loan = { id: 'loan', type: 'loan', balance: 1000, annualRate: 0, paymentMonthly: 200,
  extraMonthlyPrincipal: 0, payoffAge: 70, includePayment: true };
const debtFlow = engine.projectDebts([loan], 60, 61, 1);
assert.equal(loan.balance, 0);
assert.equal(debtFlow.totalPayments, 1000);
assert.equal(debtFlow.totalInterest, 0);
console.log(JSON.stringify({ debtPaymentCeilingControl: { paid: debtFlow.totalPayments, interest: debtFlow.totalInterest, balance: loan.balance } }));

// The oracle keeps balances on their actual dates; it never calls an engine arithmetic helper.
function ledger(srcRate, destRate, at, amount, spend, draw) {
  const balances = [100000, 0, 10000];
  const rates = [1 + srcRate / 100, 1 + destRate / 100, 1];
  let now = 0, unmet = 0;
  const events = [{ at, kind: 'transfer' }, { at: draw, kind: 'spend' }].sort((a, b) => a.at - b.at || (a.kind === 'transfer' ? -1 : 1));
  for (const event of [...events, { at: 1, kind: 'end' }]) {
    for (let i = 0; i < 3; i++) balances[i] *= Math.pow(rates[i], event.at - now);
    now = event.at;
    if (event.kind === 'transfer') { const moved = Math.min(amount, balances[0]); balances[0] -= moved; balances[1] += moved; }
    if (event.kind === 'spend') {
      let need = spend;
      for (const i of [1, 2, 0]) { const take = Math.min(need, balances[i]); balances[i] -= take; need -= take; }
      unmet = need;
    }
  }
  return { total: balances.reduce((a, b) => a + b, 0), shortfall: unmet };
}
let cases = 0, misses = 0;
const examples = [];
for (const timing of ['monthly', 'quarterly', 'annual']) for (const srcRate of [-95, -10, 0, 10, 200])
for (const destRate of [-95, -10, 0, 10, 200]) for (const at of [.25, .5, .75])
for (const amount of [0, 10000, 100000, 200000]) for (const spend of [0, 50000, 105000, 112000, 300000]) {
  const p = base();
  p.assumptions.withdrawalTiming = timing;
  p.retirement.spending = spend;
  p.advanced.assetClasses = [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 },
    { id: 'source', name: 'Source', returnRate: srcRate, volatility: 0 }, { id: 'destination', name: 'Destination', returnRate: destRate, volatility: 0 }];
  p.accounts = [account('source', 'rothIRA', 'roth', 100000, 3, 'source'), account('destination', 'rothIRA', 'roth', 0, 1, 'destination'), account('cash', 'rothIRA', 'roth', 10000, 2)];
  Object.assign(p.advanced, { transferOn: true, transferAge: 60 + at, transferAmount: amount, transferFrom: 'source', transferTo: 'destination' });
  const r = engine.runPlan(p), row = r.rows && r.rows[1];
  const expected = ledger(srcRate, destRate, at, amount, spend, timing === 'annual' ? 1 : timing === 'quarterly' ? .625 : .5);
  cases++;
  if (!row || Math.abs(row.total - expected.total) > .005 || Math.abs(row.shortfall - expected.shortfall) > .005) {
    misses++;
    if (examples.length < 10) examples.push({ timing, srcRate, destRate, at, amount, spend, status: r.status, expected,
      actual: row && { total: row.total, shortfall: row.shortfall } });
  }
}
console.log(JSON.stringify({ transferDatedLedger: { cases, misses, examples } }));
assert.equal(misses, 0, 'Every dated ledger case must agree within half a cent');

