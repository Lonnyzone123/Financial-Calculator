'use strict';

// Finding B-6 FIXED (2026-09-09): projectDebts() previously compounded the
// entire opening balance for a whole row before subtracting that row's
// payments (`opening*(Math.pow(1+rate,duration)-1)`), rather than reducing
// the balance progressively as each month's payment was actually applied --
// an approximation that compounded to a materially wrong payoff balance
// over a loan's life (see PLATFORM_DEVELOPMENT_ROADMAP.md §11c, finding
// B-6, for the original discovery and magnitude). projectDebts() now steps
// through real monthly compounding internally, so this file has been
// rewritten (per this project's "regenerate deliberately, review the diff"
// convention -- not silently deleted) to lock in the FIXED behavior as a
// permanent regression test, using the same exact src/debt-amortization.js
// oracle that originally exposed the bug.
//
// simulatePlan()'s actual row loop (engine.js, the `boundaries` array) only
// ever calls projectDebts() with a duration of at most 1 year -- so this
// file drives projectDebts() the same way, one year at a time, rather than
// with an artificially large multi-year duration.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');
const { amortizationSchedule, monthlyPayment } = require('../src/debt-amortization.js');

function stepProjectDebtsAnnually(debt, years) {
  let age = 0;
  for (let year = 1; year <= years; year++) {
    engine.projectDebts([debt], age, age + 1, 0);
    age += 1;
  }
  return debt.balance;
}

test('B-6 fixed: after one single annual step, projectDebts() now matches the exact schedule to a tight tolerance (was ~$100 off)', () => {
  const principal = 300000, rate = 6, termMonths = 360;
  const payment = monthlyPayment(principal, rate, termMonths);
  const { schedule } = amortizationSchedule(principal, rate, termMonths, 0);

  const debt = { balance: principal, rate, paymentMonthly: payment, extraPrincipalMonthly: 0, payoffAge: 9999, includeHousingCosts: false, includePayment: false, rateType: 'fixed', type: 'other' };
  engine.projectDebts([debt], 0, 1, 0);

  const exactAfter1Year = schedule[11].balance;
  assert.ok(Math.abs(debt.balance - exactAfter1Year) < 1e-6, `expected projectDebts()'s one-year balance to match the exact schedule -- got ${debt.balance.toFixed(6)} vs oracle ${exactAfter1Year.toFixed(6)}`);
});

test('B-6 fixed: stepped annually (matching simulatePlan()\'s own row granularity) over the loan\'s full term, the loan reaches exactly $0 at its true payoff year (was ~$16,670 off)', () => {
  const principal = 300000, rate = 6, termMonths = 360;
  const payment = monthlyPayment(principal, rate, termMonths);

  const debt = { balance: principal, rate, paymentMonthly: payment, extraPrincipalMonthly: 0, payoffAge: 9999, includeHousingCosts: false, includePayment: false, rateType: 'fixed', type: 'other' };
  const balanceAtYear30 = stepProjectDebtsAnnually(debt, 30);

  assert.ok(Math.abs(balanceAtYear30) < 1e-6, `expected the loan to be fully retired (balance 0) at its true 30-year payoff point -- got $${balanceAtYear30.toFixed(2)}`);
});

test('B-6 fixed: stepped annually against the exact oracle year by year, the balance matches at every year, not just at the end (no residual compounding drift)', () => {
  const principal = 300000, rate = 6, termMonths = 360;
  const payment = monthlyPayment(principal, rate, termMonths);
  const { schedule } = amortizationSchedule(principal, rate, termMonths, 0);

  const debt = { balance: principal, rate, paymentMonthly: payment, extraPrincipalMonthly: 0, payoffAge: 9999, includeHousingCosts: false, includePayment: false, rateType: 'fixed', type: 'other' };
  let age = 0;
  for (let year = 1; year <= 30; year++) {
    engine.projectDebts([debt], age, age + 1, 0);
    age += 1;
    const exactBalance = schedule[year * 12 - 1] ? schedule[year * 12 - 1].balance : 0;
    assert.ok(Math.abs(debt.balance - exactBalance) < 1e-6, `year ${year}: expected ${exactBalance.toFixed(6)}, got ${debt.balance.toFixed(6)}`);
  }
});

test('B-6 fixed: the mortgage\'s true final payoff year no longer shows a spurious spike -- the modeled cash need matches a normal year\'s payment (was a 77% spike)', () => {
  const principal = 300000, rate = 6, termMonths = 360;
  const payment = monthlyPayment(principal, rate, termMonths);
  const debt = { balance: principal, rate, paymentMonthly: payment, extraPrincipalMonthly: 0, payoffAge: 30, includeHousingCosts: false, includePayment: true, rateType: 'fixed', type: 'other' };

  let age = 0, finalYearRetirementPayments = 0;
  for (let year = 1; year <= 30; year++) {
    const result = engine.projectDebts([debt], age, age + 1, 1); // retiredDuration=1 -> fully counted toward retirementPayments
    age += 1;
    if (year === 30) finalYearRetirementPayments = result.retirementPayments;
  }
  const normalAnnualPayment = payment * 12;
  assert.ok(Math.abs(finalYearRetirementPayments - normalAnnualPayment) < 1e-6, `the payoff year's modeled cash need (${finalYearRetirementPayments.toFixed(2)}) must now match a normal year's payment (${normalAnnualPayment.toFixed(2)}) exactly -- the mortgage simply ends, no catch-up spike`);
});

// ---------------------------------------------------------------------------
// Negative amortization: unpaid interest capitalizes onto the balance
// (this is what the loop's Math.min(monthlyPayment, balance+interest)
// applied-payment form buys over a naive "clamp principal at 0" approach,
// which would have silently forgiven unpaid interest instead of accruing it)
// ---------------------------------------------------------------------------

test('B-6 fixed: a payment smaller than the accruing interest correctly capitalizes the shortfall onto the balance (real negative amortization), not silently dropped', () => {
  const debt = { balance: 300000, rate: 6, paymentMonthly: 500, extraPrincipalMonthly: 0, payoffAge: 9999, includeHousingCosts: false, includePayment: false, rateType: 'fixed', type: 'mortgage' };
  // Monthly interest on $300k at 6% is $1,500 -- a $500 payment covers none
  // of it, so the $1,000/month shortfall must accrue onto the balance.
  engine.projectDebts([debt], 0, 1, 0);
  let oracle = 300000;
  for (let i = 0; i < 12; i++) {
    const interest = oracle * (0.06 / 12);
    const applied = Math.min(500, oracle + interest);
    oracle = Math.max(0, oracle + interest - applied);
  }
  assert.ok(debt.balance > 300000, 'the balance must grow, not shrink or stay flat, under a payment smaller than the accruing interest');
  assert.ok(Math.abs(debt.balance - oracle) < 1e-6);
});
