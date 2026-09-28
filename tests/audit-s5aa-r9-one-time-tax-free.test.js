/* S5AA R9 round, the owner's decision Q5 (2026-09-21): ONE-TIME INCOME CAN BE MARKED TAX-FREE; IT IS TAXED BY DEFAULT.
 *
 * A one-time income was always taxed as ordinary income. Its branch in otherIncomeFor() carried a tax-free check,
 * `if(i.type!=="taxFree")`, inside `if(i.type==="oneTime")` -- so it could never be false, and the app offered no other
 * way to say a lump sum is not income. An inheritance or a gift entered as one-time income was taxed in full (IRC 102(a)
 * excludes both from gross income).
 *
 * The option is an income type, "oneTimeTaxFree" ("One-time tax-free income (gift, inheritance)"), beside the existing
 * recurring "taxFree" -- the same shape the app already uses for that choice, so an existing plan cannot change meaning
 * and nothing new is a boolean flag. It pays once, at its start age, exactly as "oneTime" does, needs no end age, and adds
 * nothing to ordinary income. "oneTime" is unchanged: taxed.
 * Tested through runPlan and validateScenario.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

function plan(income) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 63, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [], dividendOn: false,
    otherIncomes: income ? [income] : [] });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = [];
  return p;
}
function run(income) {
  const r = engine.runPlan(plan(income));
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const row = (r, label) => r.rows.find((x) => Math.abs(x.age - label) < 1e-9);
const lump = (type) => ({ name: 'Inheritance', type, owner: 'self', amount: 200000, start: 61 });

test('Q5: a one-time TAX-FREE income is received at its start age and is not income for tax', () => {
  const r = run(lump('oneTimeTaxFree'));
  assert.equal(Number(row(r, 62).income), 200000, 'received in the row opening at 61');
  assert.equal(Number(row(r, 62).magi), 0, 'and none of it is taxable income');
  assert.equal(Number(row(r, 62).taxes), 0);
  assert.equal(Number(row(r, 61).income), 0, 'only once');
  assert.equal(Number(row(r, 63).income), 0, 'only once');
});

test('Q5: a plain one-time income is still taxed -- the default does not change', () => {
  const r = run(lump('oneTime'));
  assert.equal(Number(row(r, 62).income), 200000);
  assert.equal(Number(row(r, 62).magi), 200000, 'taxed as ordinary income, as before');
  assert.ok(Number(row(r, 62).taxes) > 0);
});

test('Q5: the validator accepts the new type with no end age, as it does a one-time income', () => {
  for (const type of ['oneTime', 'oneTimeTaxFree']) {
    const issues = validateScenario(plan(lump(type))).issues;
    const errors = issues.filter((i) => i.severity === 'ERROR');
    assert.deepEqual(errors.map((e) => e.code + ' ' + e.path), [], type + ' is valid without an end age');
  }
  const recurring = validateScenario(plan({ name: 'x', type: 'taxFree', owner: 'self', amount: 1000, start: 61 }));
  const list = recurring.issues;
  assert.ok(list.some((i) => i.severity === 'ERROR' && /end/.test(i.path)), 'CONTROL: a recurring income still needs an end age');
});

test('Q5: the app offers the option', () => {
  assert.ok(SHELL.includes('["oneTimeTaxFree","One-time tax-free income (gift, inheritance)"]'), 'the income type list names it');
});
