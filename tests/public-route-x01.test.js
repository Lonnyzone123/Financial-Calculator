/* X01 through the PUBLIC ROUTE -- runPlan() and the rows and issues it reports.
 *
 * `tests/audit-s5aa-revolving-debt.test.js` reaches the repair through projectDebts() and the module,
 * which is what makes it implementation-coupled. This file asks only what a household would see: with
 * the same card, the same rate and the same payment, does the plan report a different debt?
 *
 * It reports a very different one. A $10,000 card at 20% with nothing entered used to compound to
 * $27,907,479.93 over forty years with nothing ever paid against it.
 *
 * Nothing here names an internal function.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

/* Flat returns, no inflation, no fees, plenty of cash. The debt is the only thing that can move. */
function plan(debt) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 40, retireAge: 65, endAge: 80, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 20000, dividendOn: false, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [],
  });
  Object.assign(p.advanced, {
    rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, networthOn: true,
    debts: [Object.assign({
      id: 'card', name: 'card', type: 'creditCard', rateType: 'fixed', rate: 20,
      balance: 10000, paymentMonthly: 0, extraPrincipalMonthly: 0, payoffAge: 95,
      includeHousingCosts: false, includePayment: true,
    }, debt || {})],
  });
  p.accounts = [{
    id: 'cash', name: 'cash', type: 'brokerage', taxClass: 'taxable', owner: 'self', balance: 3000000,
    basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }];
  return p;
}
const run = (debt) => {
  const r = engine.runPlan(plan(debt));
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
};
const debtAt = (r, age) => Number(r.rows.find((row) => row.age === age).debtBalance);

test('X01 public route: a card left at its minimum FALLS instead of compounding', () => {
  /* The whole finding in one assertion. Before the repair this household's reported debt at 80 was
     over twenty-seven million dollars, because nothing was ever paid against a 20% balance. */
  const r = run();
  assert.equal(debtAt(r, 40).toFixed(2), '10000.00', 'CONTROL: it opens at $10,000');
  for (const age of [50, 60, 70, 80]) {
    assert.ok(debtAt(r, age) < 10000, 'at ' + age + ' the balance has fallen: $' + debtAt(r, age).toFixed(2));
  }
  assert.ok(debtAt(r, 80) < debtAt(r, 70), 'and it keeps falling');
  assert.ok(debtAt(r, 80) < 5000,
    'less than half the opening balance after forty years: $' + debtAt(r, 80).toFixed(2));
});

test('X01 public route: the plan reports payments being made, where it used to report none', () => {
  /* A zero entered payment no longer means no payment: the card owes its minimum. */
  const r = run();
  const paid = r.rows.reduce((s, row) => s + Number(row.debtPaymentsTotal || 0), 0);
  assert.ok(paid > 40000, 'forty years of minimums is real money: $' + paid.toFixed(2));
  const interest = r.rows.reduce((s, row) => s + Number(row.debtInterest || 0), 0);
  assert.ok(interest > 30000 && interest < paid,
    'most of it is interest, which is the point of the finding: $' + interest.toFixed(2));
});

test('X01 public route: a household that already says what it pays sees no change at all', () => {
  /* The boundary. $500 a month is far above this card's $200 minimum, so the minimum never binds and
     the projection is the fixed schedule it always was. */
  const r = run({ paymentMonthly: 500 });
  const firstYear = Number(r.rows[1].debtPaymentsTotal);
  assert.equal(firstYear.toFixed(2), (500 * 12).toFixed(2), 'twelve payments of $500');
  assert.equal(debtAt(r, 43).toFixed(2), '0.00', 'and the card retires on its own schedule');
});

test('X01 public route: every other debt type is untouched', () => {
  for (const type of ['mortgage', 'autoLoan', 'personalLoan', 'studentLoan']) {
    const r = run({ type, rate: 6, balance: 100000, paymentMonthly: 600, payoffAge: 95 });
    assert.equal(Number(r.rows[1].debtPaymentsTotal).toFixed(2), (600 * 12).toFixed(2),
      type + ' still pays what was entered');
  }
});

test('X01 public route: the card is no longer reported as outside the supported domain', () => {
  /* Task 5.5 recorded a credit card as an EXCLUSION -- projected as a fixed-term loan, carried to a
     new-engine task. It is not one any more, and the entry that replaces it says what the mechanic
     does model and what it still does not. */
  const r = run();
  const codes = (r.issues || []).map((i) => i.code);
  assert.ok(!codes.includes('UNSUPPORTED_REVOLVING_DEBT'), 'the exclusion is gone');
  const issue = (r.issues || []).find((i) => i.code === 'REVOLVING_DEBT_MINIMUM_MODELLED');
  assert.ok(issue, 'and the household is told how its card IS modelled');
  assert.equal(issue.severity, 'WARNING');
  assert.equal(issue.state.outsideSupportedDomain, undefined);
  assert.equal(issue.state.approximation, true);
  assert.equal(issue.state.cards, 1);
  for (const missing of ['average daily balance', 'grace period on a balance paid in full']) {
    assert.ok(issue.state.notModelled.includes(missing), 'names ' + missing + ' as still unmodelled');
  }
  assert.ok(/floor, never a ceiling/.test(issue.message),
    'and says that an entered payment above the minimum is what is paid');
});

test('X01 public route: a plan with no credit card is told nothing about one', () => {
  const r = run({ type: 'autoLoan', rate: 6, paymentMonthly: 300 });
  assert.equal((r.issues || []).filter((i) => i.code === 'REVOLVING_DEBT_MINIMUM_MODELLED').length, 0);
});
