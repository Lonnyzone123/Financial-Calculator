/* S5AA X01: a credit card stops being projected as a fixed-term loan.
 *
 * X01 carries no question number. It is a row of the X register
 * (Handover temp/S5AA_X_ROW_REGISTER_20260920.md), reproduced at task 0.3 and classified there.
 *
 * `src/debt-revolving.js` has existed since S3 task 6, is bundled as `DebtRevolving`, has its own
 * oracle-verified tests -- and `src/engine.js` named it ZERO times. Every debt, credit cards included,
 * ran through fixed-term amortisation. Positive control: the engine names `DebtAmortization` five
 * times, and `src/app-shell.html` has offered a "Credit card" type at a 20% default rate all along.
 *
 * MEASURED at the start commit, a $10,000 card at 20% with no payment entered, over 40 years:
 *
 *     term-loan model   balance compounds to $27,907,479.93, nothing ever paid
 *     revolving model   $47,918.54 paid, $39,932.12 of interest, $2,013.58 left
 *
 * Three orders of magnitude. The defining mechanic is that a revolving minimum is the GREATER of a
 * percent of the CURRENT balance and a dollar floor, so it falls every month as the balance shrinks --
 * $200.00 in month 1, $164.24 by month 60 -- which is why a card decays geometrically instead of
 * amortising, and why the floor rather than the percent is what eventually retires it.
 *
 * Amendment A-06 permits the wiring, and the owner chose it on 2026-09-20 over the X-row register's own
 * narrower recommendation (disclose the term-loan treatment and carry the mechanic to a new-engine
 * task). This file is why the choice was safe to take: the engine does not REIMPLEMENT the mechanic,
 * it calls the module, and the two are held equal month for month below.
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
const revolving = require(path.join(ROOT, 'src', 'debt-revolving.js'));

const card = (edit) => Object.assign({
  id: 'card', name: 'card', type: 'creditCard', rateType: 'fixed', rate: 20,
  balance: 10000, paymentMonthly: 0, extraPrincipalMonthly: 0, payoffAge: 200,
  includeHousingCosts: false,
}, edit || {});

test('X01: the engine reproduces the module month for month, on the balance and on what was paid', () => {
  /* The claim that makes the wiring safe. The engine does not have its own revolving mechanic; it asks
     the module for the minimum every month, so a schedule computed either way must agree exactly. If
     these ever diverge, there are two models again, which is the failure this wiring exists to end. */
  const module_ = revolving.revolvingProjection({ balance: 10000, annualRatePct: 20, maxMonths: 600 });
  for (const years of [1, 3, 5, 10, 20]) {
    const d = card();
    const flow = engine.projectDebts([d], 40, 40 + years, 0);
    const row = module_.schedule[years * 12 - 1];
    const paid = module_.schedule.slice(0, years * 12).reduce((s, x) => s + x.payment, 0);
    assert.equal(d.balance.toFixed(4), row.balance.toFixed(4), 'balance after ' + years + ' years');
    assert.equal(flow.totalPayments.toFixed(4), paid.toFixed(4), 'paid over ' + years + ' years');
  }
});

test('X01: the payment FALLS as the balance does, which a term loan can never do', () => {
  /* The mechanic itself, read off the engine rather than the module. A fixed-term loan pays a level
     amount; a card pays a percent of what is left. */
  const perYear = [];
  for (let y = 1; y <= 10; y++) {
    const d = card();
    perYear.push(engine.projectDebts([d], 40, 40 + y, 0).totalPayments
      - (y > 1 ? perYear.slice(0, y - 1).reduce((s, x) => s + x, 0) : 0));
  }
  for (let y = 1; y < perYear.length; y++) {
    assert.ok(perYear[y] < perYear[y - 1],
      'year ' + (y + 1) + ' pays less than year ' + y + ': ' + perYear[y].toFixed(2) + ' vs ' + perYear[y - 1].toFixed(2));
  }
  assert.ok(perYear[0] > perYear[9] * 1.1, 'and the fall is material over ten years, not float noise');
});

test('X01: an entered payment LARGER than the minimum is what is paid -- the minimum is a floor, not a ceiling', () => {
  /* The boundary that keeps this from being a behaviour change for anyone who already told the plan
     what they pay. A $500 payment on a $10,000 card at 20% is far above the $200 minimum, so nothing
     about that household moves. */
  const withPayment = card({ paymentMonthly: 500 });
  const flow = engine.projectDebts([withPayment], 40, 41, 0);
  assert.equal(flow.totalPayments.toFixed(2), (500 * 12).toFixed(2), 'twelve payments of $500');
  assert.equal(flow.perDebt[0].revolvingMonthsAtMinimum, 0, 'the minimum never bound');

  /* And below it, the minimum binds instead. $50 is a quarter of the $200 this card owes. */
  const tooLittle = card({ paymentMonthly: 50 });
  const low = engine.projectDebts([tooLittle], 40, 41, 0);
  assert.equal(low.perDebt[0].revolvingMonthsAtMinimum, 12, 'the minimum bound in every month');
  assert.ok(low.totalPayments > 50 * 12, 'so more than the entered $50 a month was paid');
});

test('X01: the dollar floor is what finally retires a card, not the percent', () => {
  /* Straight from the module's header, and now observable through the engine: while the percent binds
     the balance only decays; once the balance is small enough that the $25 floor wins, the card
     actually retires. A small balance therefore pays off and a large one does not. */
  const small = card({ balance: 800 });
  engine.projectDebts([small], 40, 80, 0);
  assert.equal(small.balance.toFixed(2), '0.00', 'an $800 card retires, because $25 beats 2% of it early');

  const large = card({ balance: 10000 });
  engine.projectDebts([large], 40, 80, 0);
  assert.ok(large.balance > 0, 'a $10,000 card at 20% does not, inside forty years');
  assert.ok(large.balance < 10000, 'but it does fall, rather than compounding: $' + large.balance.toFixed(2));
});

test('X01: every other debt type is untouched', () => {
  /* The control that bounds the change. A mortgage, a vehicle loan and a personal loan all still run
     the fixed-term schedule with the entered payment, to the cent. */
  for (const type of ['mortgage', 'autoLoan', 'personalLoan', 'studentLoan', 'heloc']) {
    const d = card({ type, rate: 6, balance: 100000, paymentMonthly: 600 });
    const flow = engine.projectDebts([d], 40, 41, 0);
    assert.equal(flow.totalPayments.toFixed(2), (600 * 12).toFixed(2), type + ' pays its entered payment');
    assert.equal(flow.perDebt[0].revolvingMonthsAtMinimum, 0, type + ' has no revolving minimum');
  }
});

test('X01: extra principal still applies ON TOP of the revolving minimum', () => {
  const plain = card();
  const extra = card({ extraPrincipalMonthly: 100 });
  const a = engine.projectDebts([plain], 40, 41, 0);
  const b = engine.projectDebts([extra], 40, 41, 0);
  const added = b.totalPayments - a.totalPayments;
  /* LESS than $1,200, and the shortfall is the mechanic rather than a defect: the extra payment shrinks
     the balance faster, so the MINIMUM -- a percent of that balance -- falls faster too. A term loan
     would have added exactly $1,200 because its payment does not depend on what is left. */
  assert.ok(added > 0 && added < 1200,
    'a year of $100 extra adds less than $1,200, because the minimum falls with the balance: ' + added.toFixed(2));
  assert.ok(added > 900, 'but most of it: ' + added.toFixed(2));
  assert.ok(extra.balance < plain.balance, 'and it leaves a smaller balance');
});

test('X01: the card is no longer outside the supported domain, and what IS modelled is disclosed', () => {
  /* The exclusion recorded by task 5.5 said a card was projected as a fixed-term loan and carried the
     mechanic to a new-engine task. It is replaced, not deleted: `outsideSupportedDomain` is gone, and
     the conventions the module deliberately does not model are named instead. */
  const p = require('./lib/golden-scenario-defs.js').extractDefaultPlan(SHELL);
  const plan = JSON.parse(JSON.stringify(p));
  plan.setupComplete = true;
  plan.advanced.debts = [card({ payoffAge: 90 })];
  const r = engine.runPlan(plan);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);

  const codes = (r.issues || []).map((i) => i.code);
  assert.ok(!codes.includes('UNSUPPORTED_REVOLVING_DEBT'), 'the exclusion is retired');
  const issue = (r.issues || []).find((i) => i.code === 'REVOLVING_DEBT_MINIMUM_MODELLED');
  assert.ok(issue, 'and a disclosure of the mechanic stands in its place');
  assert.equal(issue.state.outsideSupportedDomain, undefined, 'it is not an exclusion any more');
  assert.equal(issue.state.approximation, true);
  assert.equal(issue.state.minimumPercentOfBalance, revolving.DEFAULT_MINIMUM_PERCENT);
  assert.equal(issue.state.minimumDollarFloor, revolving.DEFAULT_MINIMUM_FLOOR);
  assert.equal(issue.state.interestConvention, 'simple monthly accrual');
  for (const missing of ['average daily balance', 'grace period on a balance paid in full']) {
    assert.ok(issue.state.notModelled.includes(missing), 'names ' + missing);
  }
});
