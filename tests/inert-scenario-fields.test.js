/* S5 block 2e -- inert scenario fields, held in both directions.
 *
 * Five fields are accepted in a plan and change nothing in a result. Three of
 * them -- debt.taxDeductible, expenses[].kind and debt.owner -- are real inputs
 * with a control in the app. The owner decided on 2026-09-13 to implement them in
 * S103 and, until then, to declare them inert in MODEL_ASSUMPTIONS.md section 9.
 * The other two do nothing by design: returnPreset only fills in the real
 * return fields, and glideOn has nothing to act on while asset classes are off.
 *
 * Each test fails in whichever direction a silent change would take:
 *   - the field starts to move a result (implemented, or wired by accident):
 *     update section 9 and this test together;
 *   - section 9 stops naming a field that still does nothing: the field has
 *     gone silently inert again.
 * Every "identical" is paired with a control on the same object that must move
 * the result, so the comparison is able to fail.
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

const ASSUMPTIONS = fs.readFileSync(path.join(ROOT, 'MODEL_ASSUMPTIONS.md'), 'utf8');
const SECTION_9 = ASSUMPTIONS.split(/\n## /).find((s) => s.startsWith('9. ')) || '';

function base() {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 6, inflation: 2.5, fee: 0, volatility: 0 });
  Object.assign(p.profile, { age: 55, retireAge: 60, endAge: 80, spouseOn: true, spouseAge: 53 });
  Object.assign(p.employment, { salary: 90000, contributionStop: 60 });
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 600000, contribution: 5000, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: { stocks: 70, bonds: 25, cash: 5 }, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  p.advanced.networthOn = true;
  p.advanced.otherAssets = [];
  p.advanced.debts = [{
    id: 'd1', type: 'mortgage', name: 'Mortgage', owner: 'self', balance: 200000, rate: 6, paymentMonthly: 1500,
    payoffAge: 75, includePayment: true, includeHousingCosts: false, taxDeductible: true,
    mortgageType: 'conventional', rateType: 'fixed', extraPrincipalMonthly: 0,
    annualPropertyTax: 0, annualInsurance: 0, hoaMonthly: 0, pmiMonthly: 0,
  }];
  p.retirement.expenses = [{ id: 'e1', name: 'Roof', kind: 'expense', age: 65, amount: 30000 }];
  return p;
}

const resultOf = (edit) => { const p = base(); edit(p); return engine.runPlan(p); };

const CASES = [
  {
    field: 'debt.taxDeductible', declared: '`debt.taxDeductible`',
    a: (p) => { p.advanced.debts[0].taxDeductible = true; },
    b: (p) => { p.advanced.debts[0].taxDeductible = false; },
    control: [(p) => { p.advanced.debts[0].balance = 200000; }, (p) => { p.advanced.debts[0].balance = 260000; }],
    controlLabel: 'the same debt at a larger balance',
  },
  {
    field: 'expenses[].kind', declared: '`expenses[].kind`',
    a: (p) => { p.retirement.expenses[0].kind = 'expense'; },
    b: (p) => { p.retirement.expenses[0].kind = 'withdrawal'; },
    control: [(p) => { p.retirement.expenses[0].amount = 30000; }, (p) => { p.retirement.expenses[0].amount = 60000; }],
    controlLabel: 'the same expense at a larger amount',
  },
  {
    field: 'debt.owner', declared: '`debt.owner`',
    a: (p) => { p.advanced.debts[0].owner = 'self'; },
    b: (p) => { p.advanced.debts[0].owner = 'spouse'; },
    control: [(p) => { p.advanced.debts[0].rate = 6; }, (p) => { p.advanced.debts[0].rate = 8; }],
    controlLabel: 'the same debt at a higher rate',
  },
  {
    field: 'debt.mortgageType', declared: '`debt.mortgageType`',
    a: (p) => { p.advanced.debts[0].mortgageType = 'conventional'; },
    b: (p) => { p.advanced.debts[0].mortgageType = 'interestOnly'; },
    control: [(p) => { p.advanced.debts[0].paymentMonthly = 1500; }, (p) => { p.advanced.debts[0].paymentMonthly = 2500; }],
    controlLabel: 'the same mortgage at a larger monthly payment',
  },
  {
    field: 'debt.originalAmount', declared: '`debt.originalAmount`',
    a: (p) => { p.advanced.debts[0].originalAmount = 300000; },
    b: (p) => { p.advanced.debts[0].originalAmount = 900000; },
    control: [(p) => { p.advanced.debts[0].balance = 200000; }, (p) => { p.advanced.debts[0].balance = 260000; }],
    controlLabel: 'the same debt at a larger balance',
  },
  {
    field: 'debt.propertyValue', declared: '`debt.propertyValue`',
    a: (p) => { p.advanced.debts[0].propertyValue = 500000; },
    b: (p) => { p.advanced.debts[0].propertyValue = 250000; },
    control: [(p) => { p.advanced.debts[0].balance = 200000; }, (p) => { p.advanced.debts[0].balance = 260000; }],
    controlLabel: 'the same debt at a larger balance',
  },
  {
    field: 'debt.loanTermYears', declared: '`debt.loanTermYears`',
    a: (p) => { p.advanced.debts[0].loanTermYears = 30; },
    b: (p) => { p.advanced.debts[0].loanTermYears = 15; },
    control: [(p) => { p.advanced.debts[0].payoffAge = 75; }, (p) => { p.advanced.debts[0].payoffAge = 70; }],
    controlLabel: 'a different payoff age',
  },
  {
    field: 'assumptions.returnPreset', declared: '`assumptions.returnPreset`',
    a: (p) => { p.assumptions.returnPreset = 'standard'; },
    b: (p) => { p.assumptions.returnPreset = 'custom'; },
    control: [(p) => { p.assumptions.returnRate = 6; }, (p) => { p.assumptions.returnRate = 7; }],
    controlLabel: 'the return rate the preset would have written',
  },
  {
    field: 'advanced.glideOn with asset classes off', declared: '`advanced.glideOn`',
    a: (p) => { p.advanced.assetsOn = false; p.advanced.glideOn = false; p.advanced.retirementStock = 30; },
    b: (p) => { p.advanced.assetsOn = false; p.advanced.glideOn = true; p.advanced.retirementStock = 30; },
    control: [
      (p) => { p.advanced.assetsOn = true; p.advanced.glideOn = false; p.advanced.retirementStock = 30; },
      (p) => { p.advanced.assetsOn = true; p.advanced.glideOn = true; p.advanced.retirementStock = 30; },
    ],
    controlLabel: 'the same glideOn flip with asset classes on',
  },
];

for (const c of CASES) {
  test('inert field ' + c.field + ': the whole result is identical either way, and MODEL_ASSUMPTIONS.md section 9 declares it', () => {
    const x = resultOf(c.control[0]), y = resultOf(c.control[1]);
    assert.equal(x.status, 'ok', 'CONTROL: the fixture runs');
    assert.equal(y.status, 'ok', 'CONTROL: the fixture runs');
    assert.notEqual(JSON.stringify(x), JSON.stringify(y),
      'CONTROL: ' + c.controlLabel + ' must move the result, or "identical" below measures nothing');

    const ra = resultOf(c.a), rb = resultOf(c.b);
    assert.equal(ra.status, 'ok');
    assert.equal(rb.status, 'ok');
    assert.equal(JSON.stringify(ra), JSON.stringify(rb),
      c.field + ' now changes the result. If it was implemented, update MODEL_ASSUMPTIONS.md section 9 and this test together.');

    assert.ok(SECTION_9.includes(c.declared),
      'MODEL_ASSUMPTIONS.md section 9 does not name ' + c.declared + ', yet the field still does nothing: that is a silently inert field.');
  });
}

test('MODEL_ASSUMPTIONS.md section 9 records the decision, the S103 destination, and the tests that hold it', () => {
  assert.ok(SECTION_9, 'MODEL_ASSUMPTIONS.md has no section 9');
  assert.match(SECTION_9, /Decided 2026-09-13/, 'the decision and its date');
  assert.match(SECTION_9, /S103/, 'where the three fields are to be implemented');
  assert.ok(SECTION_9.includes('tests/inert-scenario-fields.test.js'), 'the section names the test that holds it to the engine');
});
