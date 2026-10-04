/* S5AA R37 (SA32F-50; Claude's R32F full-model audit DMC-06, confirmed by ChatGPT's R32V) -- FOUR MORTGAGE FIELDS CHANGE NOTHING,
 * AND THE DEBT PAGE NOW SAYS SO.
 *
 * R32V: "mortgageType, originalAmount, propertyValue and loanTermYears do not change the exercised engine path, although not in
 * the inert-input disclosure list. Interest-only naming is particularly misleading if the path still amortizes ... List ignored
 * fields or implement their stated semantics."
 * Listed: the debt page carries a note beside its deductibility note, and MODEL_ASSUMPTIONS.md section 9 goes to eb in the
 * relay (tests/inert-scenario-fields.test.js binds that section; these four join it when eb places the text). The projection
 * runs on the balance, rate, payment and payoff age; an interest-only loan is modelled by entering its interest-only payment.
 * (remainingTermYears is not inert in the form -- it sets the payoff age there -- and the engine reads the payoff age.)
 *
 * Held to the engine: each field changed alone leaves the whole result identical, beside a control on the same plan (the
 * payment) that must move it. */
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
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function resultWith(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 62, endAge: 80, filing: 'single', spouseOn: false });
  p.accounts = [{ id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 800000, basisPct: 100, contribution: 0 }];
  p.advanced.debts = [{ id: 'd1', type: 'mortgage', name: 'Mortgage', owner: 'household', balance: 200000, rate: 6, paymentMonthly: 1500,
    payoffAge: 78, rateType: 'fixed', includePayment: true, includeHousingCosts: false, mortgageType: 'conventional', originalAmount: 300000,
    propertyValue: 500000, loanTermYears: 30, remainingTermYears: 18 }];
  edit(p.advanced.debts[0]);
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok');
  return JSON.stringify({ rows: r.rows, success: r.successRate, taxes: r.lifetimeTaxes });
}

test('R37 SA32F-50: mortgageType, originalAmount, propertyValue and loanTermYears change nothing', () => {
  const base = resultWith(() => {});
  assert.notStrictEqual(resultWith((d) => { d.paymentMonthly = 2500; }), base, 'CONTROL: the payment moves the result');
  for (const [field, value] of [['mortgageType', 'interestOnly'], ['originalAmount', 900000], ['propertyValue', 250000], ['loanTermYears', 15]]) {
    assert.strictEqual(resultWith((d) => { d[field] = value; }), base, field + ' now changes the result: update the debt page\'s note and this test');
  }
});

/* S5AA R49 (AA1-34; the owner's AA1 decision, 2026-10-03): the program and the original and remaining terms now set when a conventional
   loan's PMI stops, when no PMI end age is entered (pmiStopAge() in engine.js); the plan above charges no PMI, so they still change
   nothing in it. The note says so. */
test('R37 SA32F-50: the debt page lists them', () => {
  assert.match(shell, /<p class="v2-note">The original loan amount and property value are recorded for reference and do not change the projection, which runs on the balance, rate, monthly payment and payoff age\. The mortgage program and the original and remaining terms change one thing: when no PMI end age is entered, a conventional loan's PMI stops after the midpoint of its original term\. An interest-only loan is modelled by entering its interest-only payment\.<\/p>/);
});
