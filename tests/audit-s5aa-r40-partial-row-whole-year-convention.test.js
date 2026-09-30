/* S5AA R40 -- A PARTIAL ROW IS TAXED WITH THE WHOLE YEAR'S THRESHOLDS: A DISCLOSED LIMIT, AND WHY R40'S REPAIR OF IT WAS REVERTED.
 *
 * R40 repair 3 (607101a) taxed a row shorter than a year as its share of a year "earning at the row's rate". The audit of PR #35 found
 * that premise annualizes one-time amounts too: a $100,000 one-time expense in a row a tenth of a year long was taxed as if
 * $1,000,000 recurred -- $56,958 against $20,221.85 on the one return a household with no other income files. The owner's decision
 * (2026-09-30): "Revert and disclose". A partial row is again taxed as a whole tax year holding only the row's income, which
 * understates the first year's tax where the household earned before the plan opened; a correct rule needs recurring income told
 * apart from one-time items inside the tax computation, and that design goes to the engine rebuild. These tests pin the disclosed
 * behaviour, and the one-time case that made the repair wrong.
 *
 * By hand (2026 figures, single, no inflation):
 *   A $60,000 pension, a half-year first row: $30,000 against the whole year's figures -- federal (30,000 - 16,100) = 13,900 ->
 *   10% x 12,400 + 12% x 1,500 = 1,420; Arizona 2.5% x 13,900 = 347.50; 1,767.50. (Taxed as half of a $60,000 year it would be
 *   3,058.75: that is the understatement disclosed.)
 *   A $100,000 one-time expense drawn from an IRA, grossed up for its own tax: withdrawal W with W - tax(W) = 100,000 gives
 *   W = 120,221.85; federal on 104,121.85 = 1,240 + 4,560 + 22% x 53,721.85 = 17,618.81; Arizona 2.5% x 104,121.85 = 2,603.05;
 *   20,221.85 -- the same in a whole row and in a row a tenth of a year long. */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const acct = (extra) => Object.assign({ owner: 'self', contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
  frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0, vesting: 100 }, extra);

function firstRowTax({ age, endAge, pension = 0, expense = null, accounts }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age, retireAge: 60, endAge, filing: 'single', spouseOn: false });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 60 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension, pensionCola: 0, ssBenefit: 0,
    spouseSS: 0, survivor: false, stages: [], expenses: expense ? [expense] : [], otherIncomes: [], selfLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false, ltcOn: false });
  p.accounts = accounts;
  assert.ok(validateScenario(p).valid, 'witness must be a valid plan');
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return +r.rows[1].taxes.toFixed(2);
}

const cash = [acct({ id: 'c', name: 'Cash', type: 'taxable', taxClass: 'taxable', balance: 100000, basisPct: 100, cashHolding: true, priority: 1 })];
const iraOnly = [acct({ id: 'ira', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', balance: 1000000, priority: 1 })];

test('R40: a half-year first row holding a pension is taxed against the whole year\'s thresholds (the disclosed limit)', () => {
  assert.strictEqual(firstRowTax({ age: 60.5, endAge: 62, pension: 60000, accounts: cash }), 1767.5);
  assert.strictEqual(firstRowTax({ age: 60, endAge: 62, pension: 60000, accounts: cash }), 6117.5);   // a whole row, for scale
});

test('R40: a one-time expense is taxed once, whatever the row\'s length -- the case that made repair 3 wrong', () => {
  const expense = (age) => ({ name: 'Roof', kind: 'expense', age, amount: 100000 });
  assert.strictEqual(firstRowTax({ age: 60, endAge: 62, expense: expense(60), accounts: iraOnly }), 20221.85);
  assert.strictEqual(firstRowTax({ age: 60.9, endAge: 62, expense: expense(60.9), accounts: iraOnly }), 20221.85);   // repair 3: 56,958.31
});
