'use strict';

// FM-05 and FM-06 (whole-model audit, 2026-09-10) -- both P2, both against
// S2's own ARM payment-shock work, repaired together because they are the
// same payment's lifecycle.
//
// FM-05 -- THE PREMISE S2 NAMED AND GOT WRONG. S2 recomputed the scheduled
// payment from the current balance and remaining term at EVERY period after
// the single reset, justified by the level-payment identity: recomputing PMT
// at any point along an exactly-amortising schedule reproduces the same
// payment. S2's own package flagged that premise as the thing to test. It
// does not hold once `extraPrincipalMonthly` is paid, because voluntary
// prepayment moves the balance OFF the schedule the identity assumes. The
// balance falls faster, so the recomputed payment falls too -- the loan
// silently recasts every year, without any modelled reset.
//
// Audit's figures: $300,000 at reset, 8%, 300 months remaining, $500/month
// extra. Correct payment $2,815.448658; next modelled year $2,766.766078 --
// understated by $48.68/month.
//
// FM-06 -- A MID-PERIOD RESET IS POSTPONED. The `periodStart >=
// nextRateResetAge` test sits OUTSIDE the monthly loop, so a reset at 65.5
// inside the 65-66 period uses the old rate and payment for all twelve
// months and only takes effect when the next period opens. The engine
// supports half-year ages, and the loop is already monthly, so this is a
// placement problem rather than a resolution limit.
//
// D-3 (user decision): FIX IT, regardless of flag state. The flag-off rate
// timing was wrong too, and two timing rules for one instrument is the sort
// of divergence this codebase has been bitten by before. That moves output
// for existing adjustable-debt scenarios and the fixture protocol covers it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);
global.DebtAmortization = require('../src/debt-amortization.js');

const engine = require('../src/engine.js');
const { monthlyPayment } = require('../src/debt-amortization.js');

function debt(overrides) {
  return Object.assign({
    type: 'mortgage', balance: 300000, rate: 4, rateType: 'adjustable',
    resetRate: 8, nextRateResetAge: 65, paymentMonthly: 0, extraPrincipalMonthly: 0,
    payoffAge: 90, includePayment: true, includeHousingCosts: false,
    annualPropertyTax: 0, annualInsurance: 0, hoaMonthly: 0, pmiMonthly: 0,
  }, overrides || {});
}

// ---------------------------------------------------------------------------
// FM-05 -- the payment must be held between resets
// ---------------------------------------------------------------------------

test('FM-05: with extra principal, the payment must NOT drift downward year after year', () => {
  const EXTRA = 500;
  const RESET_AGE = 65;
  const PAYOFF = 90;

  // The payment the reset itself establishes: balance at reset, reset rate,
  // remaining term. Computed here from the oracle, not from the engine.
  const remainingMonths = Math.max(1, Math.round((PAYOFF - RESET_AGE) * 12));
  const resetPayment = monthlyPayment(300000, 8, remainingMonths);

  // One month at a time, so totalPayments reads directly as the payment.
  const ONE_MONTH = 1 / 12;
  const d = debt({ nextRateResetAge: RESET_AGE, payoffAge: PAYOFF, extraPrincipalMonthly: EXTRA, paymentMonthly: 1400 });

  // Step through the first year so the balance is genuinely reduced by the
  // extra principal, then read the payment the NEXT year would use.
  engine.projectDebts([d], RESET_AGE, RESET_AGE + 1, 1, true);
  const nextYear = engine.projectDebts([d], RESET_AGE + 1, RESET_AGE + 1 + ONE_MONTH, ONE_MONTH, true);

  const observed = nextYear.totalPayments - EXTRA; // strip the voluntary extra
  assert.ok(
    Math.abs(observed - resetPayment) < 1.0,
    'the scheduled payment drifted to ' + observed.toFixed(6) + ' against the reset payment ' +
    resetPayment.toFixed(6) + ' -- extra principal is silently recasting the loan every period'
  );
});

test('FM-05: the zero-extra control still reproduces a constant payment exactly', () => {
  const RESET_AGE = 65, PAYOFF = 90, ONE_MONTH = 1 / 12;
  const remainingMonths = Math.max(1, Math.round((PAYOFF - RESET_AGE) * 12));
  const resetPayment = monthlyPayment(300000, 8, remainingMonths);

  const d = debt({ nextRateResetAge: RESET_AGE, payoffAge: PAYOFF, extraPrincipalMonthly: 0, paymentMonthly: 1400 });
  engine.projectDebts([d], RESET_AGE, RESET_AGE + 1, 1, true);
  const nextYear = engine.projectDebts([d], RESET_AGE + 1, RESET_AGE + 1 + ONE_MONTH, ONE_MONTH, true);

  assert.ok(
    Math.abs(nextYear.totalPayments - resetPayment) < 1.0,
    'with no extra principal the payment must stay at ' + resetPayment.toFixed(6) +
    ', got ' + nextYear.totalPayments.toFixed(6) + ' -- this control passing is what made FM-05 look correct'
  );
});

test('FM-05: repartitioning the projection must not create extra recalculation events', () => {
  // The signature of the defect: if the payment is re-derived per period,
  // slicing the same span into more periods changes the answer. If it is
  // held between resets, it cannot.
  const RESET_AGE = 65, PAYOFF = 90, EXTRA = 500;

  function runPartitioned(steps) {
    const d = debt({ nextRateResetAge: RESET_AGE, payoffAge: PAYOFF, extraPrincipalMonthly: EXTRA, paymentMonthly: 1400 });
    let total = 0;
    const span = 2, step = span / steps;
    for (let i = 0; i < steps; i++) {
      total += engine.projectDebts([d], RESET_AGE + i * step, RESET_AGE + (i + 1) * step, step, true).totalPayments;
    }
    return { total, balance: d.balance };
  }

  const annual = runPartitioned(2);
  const monthly = runPartitioned(24);
  assert.ok(
    Math.abs(annual.total - monthly.total) < 5,
    'payments over the same two years differ by partitioning: ' + annual.total.toFixed(2) +
    ' vs ' + monthly.total.toFixed(2) + ' -- the payment is being re-derived per period'
  );
});

// ---------------------------------------------------------------------------
// FM-06 -- a mid-period reset must land on its own month
// ---------------------------------------------------------------------------

test('FM-06: a reset at 65.5 takes effect mid-period, not at the next period boundary', () => {
  const PAYOFF = 90;
  const entered = monthlyPayment(300000, 4, 300);

  const whole = debt({ rate: 4, resetRate: 8, nextRateResetAge: 65.5, payoffAge: PAYOFF, paymentMonthly: entered });
  const oneCall = engine.projectDebts([whole], 65, 66, 0, false);

  // Independent oracle: the same span, split at the actual reset moment.
  const split = debt({ rate: 4, resetRate: 8, nextRateResetAge: 65.5, payoffAge: PAYOFF, paymentMonthly: entered });
  const firstHalf = engine.projectDebts([split], 65, 65.5, 0, false);
  const secondHalf = engine.projectDebts([split], 65.5, 66, 0, false);
  const splitTotal = firstHalf.totalPayments + secondHalf.totalPayments;

  assert.ok(
    Math.abs(oneCall.totalPayments - splitTotal) < 1.0,
    'one annual call paid ' + oneCall.totalPayments.toFixed(2) + ' but splitting at the reset pays ' +
    splitTotal.toFixed(2) + ' -- the reset is being postponed to the next period boundary'
  );
  assert.ok(
    Math.abs(whole.balance - split.balance) < 1.0,
    'ending debt disagrees: ' + whole.balance.toFixed(2) + ' vs ' + split.balance.toFixed(2)
  );
});

test('FM-06 / D-3: the timing correction applies with the flag OFF too', () => {
  const entered = monthlyPayment(300000, 4, 300);
  const whole = debt({ nextRateResetAge: 65.5, paymentMonthly: entered });
  const oneCall = engine.projectDebts([whole], 65, 66, 0, false);

  const split = debt({ nextRateResetAge: 65.5, paymentMonthly: entered });
  engine.projectDebts([split], 65, 65.5, 0, false);
  engine.projectDebts([split], 65.5, 66, 0, false);

  assert.ok(
    Math.abs(whole.balance - split.balance) < 1.0,
    'flag-off ending debt must also respect the true reset month: ' +
    whole.balance.toFixed(2) + ' vs ' + split.balance.toFixed(2)
  );
});

test('FM-06: a reset exactly at a period boundary is unchanged', () => {
  const entered = monthlyPayment(300000, 4, 300);
  for (const flag of [false, true]) {
    const a = debt({ nextRateResetAge: 65, paymentMonthly: entered });
    const b = debt({ nextRateResetAge: 65, paymentMonthly: entered });
    const ra = engine.projectDebts([a], 65, 66, 0, flag);
    const rb = engine.projectDebts([b], 65, 66, 0, flag);
    assert.ok(Math.abs(ra.totalPayments - rb.totalPayments) < 1e-9, 'determinism check, flag=' + flag);
    assert.ok(a.balance > 0, 'the loan should not be paid off in one year');
  }
});

// ---------------------------------------------------------------------------
// Controls that must not move
// ---------------------------------------------------------------------------

test('FM-05/06: a fixed-rate debt is untouched in either flag state', () => {
  const entered = monthlyPayment(300000, 6, 360);
  const off = debt({ rateType: 'fixed', rate: 6, paymentMonthly: entered, nextRateResetAge: 65.5 });
  const on = debt({ rateType: 'fixed', rate: 6, paymentMonthly: entered, nextRateResetAge: 65.5 });
  const rOff = engine.projectDebts([off], 65, 66, 0, false);
  const rOn = engine.projectDebts([on], 65, 66, 0, true);
  assert.ok(Math.abs(rOff.totalPayments - rOn.totalPayments) < 1e-9, 'a fixed debt must ignore the flag entirely');
  assert.ok(Math.abs(off.balance - on.balance) < 1e-9);
});

test('FM-05/06: retirement attribution still splits payments at the retirement boundary', () => {
  const entered = monthlyPayment(300000, 4, 300);
  const d = debt({ nextRateResetAge: 65.5, paymentMonthly: entered });
  const r = engine.projectDebts([d], 65, 66, 0.5, true);
  assert.ok(r.retirementPayments > 0, 'half the period is retired, so some payments must be attributed there');
  assert.ok(r.retirementPayments < r.totalPayments, 'and not all of them');
});
