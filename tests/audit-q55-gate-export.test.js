/* Q55's gate, tested at the export level (S5 block 2i; split out at S5 block 2r).
 *
 * tests/audit-q55-list-shape-refusal.test.js guards Q55 through runPlan(), runScenario() and the
 * Worker only. This file holds the one test that calls the engine's exported gate function directly:
 * exported, null-safe on malformed containers, and claiming no null, undefined, empty or valid list.
 * It depends on the gate's name, so a rebuild re-points or retires it with that internal. The test is
 * moved verbatim, with the setup, fixture and site list it uses.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const account = (o) => Object.assign({
  id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 400000, contribution: 5000,
  contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: { stocks: 60, bonds: 30, cash: 10 }, matchOn: false, matchCap: 0,
  matchRate: 0, profitShare: 0, vesting: 100,
}, o);

/* Validator-clean, and it exercises every list: both accounts carry futureChanges
   arrays, asset classes are on, and the withdrawal order is manual. */
function fixture() {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 5, inflation: 2, fee: 0, volatility: 0 });
  Object.assign(p.profile, { age: 55, retireAge: 60, endAge: 85, spouseOn: true, spouseAge: 55 });
  Object.assign(p.employment, { salary: 90000, contributionStop: 60 });
  p.accounts = [
    account({ futureChanges: [{ age: 57, mode: 'dollar', value: 500 }] }),
    account({ id: 'a2', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', balance: 300000, contribution: 0, basisPct: 0, priority: 2 }),
  ];
  p.advanced.assetsOn = true;
  p.advanced.networthOn = true;
  p.advanced.otherAssets = [{ id: 'o1', type: 'primaryResidence', name: 'Home', value: 400000, available: true, accessPct: 50 }];
  p.advanced.debts = [{ id: 'd1', type: 'mortgage', name: 'Mortgage', owner: 'self', balance: 150000, rate: 6, paymentMonthly: 1200, payoffAge: 75, includePayment: true, includeHousingCosts: false, taxDeductible: true, mortgageType: 'conventional', rateType: 'fixed', extraPrincipalMonthly: 0, annualPropertyTax: 0, annualInsurance: 0, hoaMonthly: 0, pmiMonthly: 0 }];
  Object.assign(p.retirement, {
    withdrawalOrder: 'manual', manualOrder: 'taxable,preTax,roth,hsa',
    stages: [{ start: 70, end: 80, mode: 'percent', value: -10 }],
    expenses: [{ age: 65, amount: 20000, kind: 'expense' }],
    otherIncomes: [{ type: 'pension', owner: 'self', amount: 10000, start: 65, end: 85, growth: 0, growthMode: 'fixed' }],
  });
  return p;
}

const SITES = [
  ['accounts', (p, v) => { p.accounts = v; }],
  ['accounts[0].futureChanges', (p, v) => { p.accounts[0].futureChanges = v; }],
  ['retirement.stages', (p, v) => { p.retirement.stages = v; }],
  ['retirement.expenses', (p, v) => { p.retirement.expenses = v; }],
  ['retirement.otherIncomes', (p, v) => { p.retirement.otherIncomes = v; }],
  ['advanced.assetClasses', (p, v) => { p.advanced.assetClasses = v; }],
  ['advanced.otherAssets', (p, v) => { p.advanced.otherAssets = v; }],
  ['advanced.debts', (p, v) => { p.advanced.debts = v; }],
  ['retirement.manualOrder', (p, v) => { p.retirement.manualOrder = v; }, 'string'],
];

test('Q55 gate: exported, null-safe on malformed containers, and it claims no null, undefined, empty or valid list', () => {
  const gate = engine.nonArrayListInputCode;
  assert.equal(typeof gate, 'function', 'the gate must be exported, or the assertions below measure nothing');
  for (const p of [null, undefined, 5, {}, { retirement: 5 }, { advanced: null }, { accounts: [5, null] }, { accounts: [{ futureChanges: null }] }]) {
    assert.doesNotThrow(() => gate(p), 'the gate threw on ' + JSON.stringify(p));
    assert.equal(gate(p), null, 'the gate claimed ' + JSON.stringify(p));
  }
  assert.equal(gate(fixture()), null, 'the valid fixture is not claimed');
  for (const [site, set, shape] of SITES) {
    for (const v of (shape === 'string' ? [null, undefined, 'taxable'] : [null, undefined, []])) {
      const p = fixture();
      set(p, v);
      assert.equal(gate(p), null, site + ' = ' + JSON.stringify(v) + ' is not a non-list value');
    }
  }
});
