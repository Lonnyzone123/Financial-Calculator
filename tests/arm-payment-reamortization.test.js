'use strict';

// S2 sprint task 4 (ROADMAP_EXTERNAL_REVIEW.md §8 item 8) -- projectDebts()
// modelled an ARM as a single rate step: the rate moves to resetRate at
// nextRateResetAge, but the monthly payment stayed at the household's
// entered paymentMonthly + extraPrincipalMonthly for the WHOLE projection,
// never re-amortised. Real ARMs re-amortise the balance at reset over the
// remaining term -- the payment is what jumps, and payment shock is the
// entire reason a retirement plan would model an ARM rather than a fixed
// loan (debtFlow.retirementPayments feeds requested retirement spending, so
// a reset previously could not move retirement cashflow at all).
//
// ORIGINALLY gated behind advanced.armRecastOnReset (default false, plumbed as projectDebts()'s
// fifth parameter) so S2 could not move output while a whole-model external audit was pending. That
// paragraph called the flag "a transitional migration flag, not a modelling choice".
//
// S5AA TASK 5.1 (Q94, F8) RETIRED IT. The audit landed and found the flag unreachable -- it occurred
// once in the whole shipped page, inside the default plan, with no control to set it -- so the
// transitional state was the only state. projectDebts() takes four arguments now and re-amortises
// unconditionally. Every claim below survives; the CONTROL ARM does not, because there is no longer
// an "off" to compare against. Each is restated against a control that still exists.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);
// engine.js's new branch calls DebtAmortization.monthlyPayment() as a bare
// identifier -- in the browser bundle this resolves to the IIFE-wrapped
// namespace task 3 places in the same script scope; here, mirroring the
// existing global.RULES convention this file follows above, it resolves via
// the global object.
global.DebtAmortization = require('../src/debt-amortization.js');

const engine = require('../src/engine.js');
const { monthlyPayment } = require('../src/debt-amortization.js');

function debt(overrides = {}) {
  return Object.assign({
    type: 'mortgage', balance: 300000, rate: 4, rateType: 'adjustable',
    resetRate: 4, nextRateResetAge: 60, paymentMonthly: 0, extraPrincipalMonthly: 0,
    payoffAge: 85, includePayment: true, includeHousingCosts: false,
  }, overrides);
}

// One-month periods make totalPayments read directly as "the monthly
// payment" (assuming it's not the loan's final payoff month), without
// needing to divide out a period length.
const ONE_MONTH = 1 / 12;

// ---------------------------------------------------------------------------
// 1. The case that was failing before this task: payment shock at reset
// ---------------------------------------------------------------------------

test('projectDebts: an ARM resetting to a materially higher rate raises the payment and moves retirementPayments', () => {
  const principal = 300000, originalRate = 4, resetRate = 8, resetAge = 60, payoffAge = 85;
  const originalPayment = monthlyPayment(principal, originalRate, 360); // a plausible 30-year original payment

  function makeDebt(overrides) {
    return debt(Object.assign({ rate: originalRate, resetRate, nextRateResetAge: resetAge, balance: principal, paymentMonthly: originalPayment, payoffAge }, overrides || {}));
  }

  const periodStart = resetAge + 1; // well after reset, so this is squarely in "at/after reset" territory
  const afterReset = engine.projectDebts([makeDebt()], periodStart, periodStart + ONE_MONTH, ONE_MONTH);

  /* THE CONTROL IS NOW A LOAN THAT HAS NOT RESET, not a switch turned off. The same debt with its
     reset pushed past the projection keeps the entered payment, which is what the payment "should"
     have been under the old default -- so the comparison this test always made is still made, against
     an arm that still exists. */
  const notYetReset = engine.projectDebts([makeDebt({ nextRateResetAge: 999 })], periodStart, periodStart + ONE_MONTH, ONE_MONTH);

  assert.ok(
    Math.abs(notYetReset.totalPayments - originalPayment) < 1e-6,
    'control: before its reset the loan pays the entered paymentMonthly (got ' + notYetReset.totalPayments + ')'
  );

  // The payment must rise, since the balance now amortises at 8% instead of 4% over the remaining term.
  assert.ok(
    afterReset.totalPayments > notYetReset.totalPayments + 1,
    'the payment must rise materially at reset (got ' + afterReset.totalPayments + ' vs ' + notYetReset.totalPayments + ')'
  );
  // ...and that payment shock reaches retirementPayments, which is what feeds requested retirement
  // spending (src/engine.js, the `requested` computation) -- the entire point of modelling an ARM.
  assert.ok(
    afterReset.retirementPayments > notYetReset.retirementPayments + 1,
    'retirementPayments must also move (got ' + afterReset.retirementPayments + ' vs ' + notYetReset.retirementPayments + ')'
  );
});

// ---------------------------------------------------------------------------
// 2. Reset rate == original rate: an exact identity, not merely close
// ---------------------------------------------------------------------------

test('projectDebts: a reset rate equal to the original rate reproduces the entered paymentMonthly exactly, when that payment was itself the amortizing figure', () => {
  const balance = 300000, rate = 4, resetAge = 60, payoffAge = 85;
  const periodStart = resetAge; // exactly at reset
  const remainingTermMonths = Math.round((payoffAge - periodStart) * 12); // 300
  // Constructed so the identity is exact: paymentMonthly IS the amortizing
  // payment for this exact balance/rate/remaining-term combination.
  const exactPayment = monthlyPayment(balance, rate, remainingTermMonths);

  const d = debt({ rate, resetRate: rate, nextRateResetAge: resetAge, balance, paymentMonthly: exactPayment, payoffAge });
  const result = engine.projectDebts([d], periodStart, periodStart + ONE_MONTH, ONE_MONTH);

  assert.ok(
    Math.abs(result.totalPayments - exactPayment) < 1e-6,
    'expected the re-amortized payment to reproduce the entered paymentMonthly exactly (got ' + result.totalPayments + ' vs ' + exactPayment + ')'
  );
});

// ---------------------------------------------------------------------------
// 3. The retired fifth argument is ignored, whatever is passed
// ---------------------------------------------------------------------------

test('projectDebts: a fifth argument is ignored -- the recast is unconditional', () => {
  /* This test used to assert that omitting the fifth argument matched passing false. The argument is
     gone, so what it now guarantees is stronger: an old caller that still passes one gets the same
     answer as one that does not, and neither can turn the recast off. */
  const d = debt({ resetRate: 8, nextRateResetAge: 60, paymentMonthly: 1000, balance: 300000, payoffAge: 85 });
  const withoutArg = engine.projectDebts([Object.assign({}, d)], 61, 62, 1);
  const withFalse = engine.projectDebts([Object.assign({}, d)], 61, 62, 1, false);
  const withTrue = engine.projectDebts([Object.assign({}, d)], 61, 62, 1, true);
  assert.deepEqual(withoutArg, withFalse);
  assert.deepEqual(withoutArg, withTrue);
});

// ---------------------------------------------------------------------------
// 4. A fixed-rate debt is untouched by this code path in either flag state
// ---------------------------------------------------------------------------

test('projectDebts: a fixed-rate debt is byte-for-byte unaffected by the recast, whatever is passed', () => {
  const d = debt({ rateType: 'fixed', balance: 300000, rate: 6, paymentMonthly: monthlyPayment(300000, 6, 360), payoffAge: 85 });
  const flagOff = engine.projectDebts([Object.assign({}, d)], 61, 62, 1, false);
  const flagOn = engine.projectDebts([Object.assign({}, d)], 61, 62, 1, true);
  assert.deepEqual(flagOff, flagOn);
});
