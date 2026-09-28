'use strict';

/*
 * S3 task 6 -- tests for src/debt-revolving.js.
 *
 * THE DEFECT THIS MODULE ANSWERS. projectDebts() runs every debt through
 * fixed-term amortization regardless of type, while DEBT_TYPES already
 * defines creditCard at a 20% default rate and the UI already offers it. The
 * first test below measures how wrong that is, and the answer is worse than
 * "somewhat optimistic".
 *
 * NOT WIRED. This module is bundled and reachable; projectDebts() is
 * unchanged. S3's engine budget belongs to task 5 (ground rule 9).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  revolvingProjection, additionalPaymentBenefit, minimumPaymentFor,
  DEFAULT_MINIMUM_PERCENT, DEFAULT_MINIMUM_FLOOR, DEFAULT_MAX_MONTHS,
} = require('../src/debt-revolving.js');
const { monthlyPayment, amortizationSchedule } = require('../src/debt-amortization.js');

/** A realistic US card: high rate, 2% minimum, $25 floor. */
const REALISTIC_CARD = {
  balance: 8000, annualRatePct: 22,
  minimumPercentOfBalance: 2, minimumDollarFloor: 25,
};

/** The amortizing term whose payment matches a given starting payment. */
function termMatchingPayment(balance, ratePct, targetPayment) {
  let best = 1;
  for (let n = 1; n <= 600; n++) {
    if (Math.abs(monthlyPayment(balance, ratePct, n) - targetPayment) <
        Math.abs(monthlyPayment(balance, ratePct, best) - targetPayment)) best = n;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Criterion 1 -- the gap, in both quantities, in one test
// ---------------------------------------------------------------------------

test('revolving: a card modelled as an amortizing loan is dramatically optimistic', () => {
  const card = revolvingProjection(REALISTIC_CARD);
  const startingPayment = card.schedule[0].payment;
  assert.equal(startingPayment, 160, '2% of $8,000, above the $25 floor');

  const term = termMatchingPayment(REALISTIC_CARD.balance, REALISTIC_CARD.annualRatePct, startingPayment);
  const asLoan = amortizationSchedule(REALISTIC_CARD.balance, REALISTIC_CARD.annualRatePct, term);

  /* MONTHS. The amortizing model says 137 months. The revolving model says
     the card does not retire AT ALL inside a 600-month (50-year) cap -- which
     is the honest answer, not a cap that is too tight: while the percent term
     binds, the balance decays by only ~0.167% a month (2% paid, 1.833%
     consumed by interest), so reaching the floor-binding zone alone takes
     roughly 1,100 months. This is what "minimum payment" means on a
     high-rate card and it is the whole reason the module exists. */
  assert.ok(asLoan.payoffMonth > 0 && asLoan.payoffMonth < 200,
    'the amortizing model should retire this in well under 200 months; got ' + asLoan.payoffMonth);
  assert.equal(card.retired, false,
    'minimum-only payments on a 22% card with a 2% minimum do NOT retire the balance within ' +
    DEFAULT_MAX_MONTHS + ' months, while the amortizing model claims ' + asLoan.payoffMonth);
  assert.match(card.nonPayoffReason, /did not reach zero within/);

  /* INTEREST. Both quantities in one test, as the criterion requires: even
     truncated at the cap -- with the balance still outstanding -- the
     revolving model has already charged multiples of the amortizing model's
     entire lifetime interest. */
  assert.ok(card.totalInterest > asLoan.totalInterest * 3,
    'revolving interest within the cap (' + card.totalInterest.toFixed(2) + ') should dwarf the ' +
    'amortizing total (' + asLoan.totalInterest.toFixed(2) + ')');
});

test('revolving: even a card that DOES retire takes far longer than amortization predicts', () => {
  /* The same comparison where both sides terminate, so "later" and "more" are
     directly comparable numbers rather than one being unbounded. */
  const card = revolvingProjection(Object.assign({}, REALISTIC_CARD, { minimumPercentOfBalance: 4 }));
  assert.equal(card.retired, true, 'a 4% minimum does retire this card');

  const startingPayment = card.schedule[0].payment;
  const term = termMatchingPayment(REALISTIC_CARD.balance, REALISTIC_CARD.annualRatePct, startingPayment);
  const asLoan = amortizationSchedule(REALISTIC_CARD.balance, REALISTIC_CARD.annualRatePct, term);

  assert.ok(card.payoffMonth > asLoan.payoffMonth * 3,
    'revolving payoff ' + card.payoffMonth + ' should be several times the amortizing ' +
    asLoan.payoffMonth + ' at the same starting payment');
  assert.ok(card.totalInterest > asLoan.totalInterest * 2,
    'revolving interest ' + card.totalInterest.toFixed(2) + ' vs amortizing ' +
    asLoan.totalInterest.toFixed(2));
});

// ---------------------------------------------------------------------------
// Criterion 2 -- ARCH-01 locally: sources equal uses
// ---------------------------------------------------------------------------

test('revolving: principal paid sums to the opening balance on every retiring path', () => {
  const cases = [
    { balance: 8000, annualRatePct: 22, minimumPercentOfBalance: 4, minimumDollarFloor: 25 },
    { balance: 1200, annualRatePct: 12, minimumPercentOfBalance: 2, minimumDollarFloor: 25 },
    { balance: 500, annualRatePct: 0, minimumPercentOfBalance: 0, minimumDollarFloor: 0, additionalMonthlyPayment: 75 },
    { balance: 25000, annualRatePct: 18, minimumPercentOfBalance: 5, minimumDollarFloor: 35 },
    { balance: 300, annualRatePct: 29.99, minimumPercentOfBalance: 3, minimumDollarFloor: 30 },
  ];
  cases.forEach((options, i) => {
    const run = revolvingProjection(options);
    assert.equal(run.retired, true, 'case ' + i + ' must retire for this identity to apply');
    const summed = run.schedule.reduce((s, m) => s + m.principalPaid, 0);
    assert.ok(Math.abs(summed - options.balance) < 1e-6,
      'case ' + i + ': principal paid ' + summed + ' != opening balance ' + options.balance);
    // ...and the reported total agrees with the schedule it summarises.
    assert.ok(Math.abs(run.totalPrincipal - summed) < 1e-9, 'case ' + i + ': totalPrincipal disagrees with its own schedule');
    const paid = run.schedule.reduce((s, m) => s + m.payment, 0);
    assert.ok(Math.abs(run.totalPaid - paid) < 1e-9, 'case ' + i + ': totalPaid disagrees with its own schedule');
    assert.ok(Math.abs(run.totalPaid - (run.totalPrincipal + run.totalInterest)) < 1e-6,
      'case ' + i + ': paid must equal principal plus interest');
  });
});

// ---------------------------------------------------------------------------
// Criterion 3 -- with the qualifier that makes it correct
// ---------------------------------------------------------------------------

test('revolving: a zero-interest card with a FIXED payment retires in exactly ceil(balance/payment)', () => {
  /* The qualifier matters. Under the percent-of-a-SHRINKING-balance mechanic a
     0% card decays geometrically and never retires except via the floor, so
     the naive form of this criterion would fail a CORRECT implementation.
     Both minimum terms are therefore disabled and the payment comes entirely
     from additionalMonthlyPayment. */
  [[1000, 150], [1000, 100], [999, 100], [1, 100], [12345.67, 1000]].forEach(([balance, payment]) => {
    const run = revolvingProjection({
      balance, annualRatePct: 0,
      minimumPercentOfBalance: 0, minimumDollarFloor: 0,
      additionalMonthlyPayment: payment,
    });
    assert.equal(run.retired, true, balance + ' at ' + payment + '/mo must retire');
    assert.equal(run.payoffMonth, Math.ceil(balance / payment),
      balance + ' at ' + payment + '/mo: expected ' + Math.ceil(balance / payment) +
      ' months, got ' + run.payoffMonth);
    assert.ok(Math.abs(run.totalInterest) < 1e-12, 'a 0% card must accrue no interest');
  });

  // CONTROL: with the percent minimum ENABLED, the same 0% card does NOT
  // retire on that schedule -- which is why the qualifier above exists.
  const geometric = revolvingProjection({
    balance: 1000, annualRatePct: 0, minimumPercentOfBalance: 2, minimumDollarFloor: 0,
  });
  assert.equal(geometric.retired, false,
    'a 0% card paying 2% of a shrinking balance decays geometrically and never reaches zero; ' +
    'if this retires, the percent minimum is not being taken of the CURRENT balance');
});

// ---------------------------------------------------------------------------
// Criterion 4 -- monotonicity, three ways
// ---------------------------------------------------------------------------

test('revolving: higher rate means more interest', () => {
  const base = { balance: 5000, minimumPercentOfBalance: 3, minimumDollarFloor: 25 };
  let previous = -Infinity;
  [6, 12, 18, 24].forEach((rate) => {
    const run = revolvingProjection(Object.assign({}, base, { annualRatePct: rate }));
    assert.ok(run.totalInterest > previous,
      'rate ' + rate + '% produced ' + run.totalInterest.toFixed(2) +
      ', not more than the previous rate\'s ' + previous.toFixed(2));
    previous = run.totalInterest;
  });
});

test('revolving: a higher minimum percent means earlier payoff and less interest', () => {
  const base = { balance: 8000, annualRatePct: 22, minimumDollarFloor: 25 };
  let previousMonth = Infinity;
  let previousInterest = Infinity;
  [3, 4, 5, 6].forEach((percent) => {
    const run = revolvingProjection(Object.assign({}, base, { minimumPercentOfBalance: percent }));
    assert.equal(run.retired, true, percent + '% should retire this card');
    assert.ok(run.payoffMonth < previousMonth,
      percent + '%: payoff month ' + run.payoffMonth + ' is not earlier than ' + previousMonth);
    assert.ok(run.totalInterest < previousInterest,
      percent + '%: interest ' + run.totalInterest.toFixed(2) + ' is not less than ' +
      previousInterest.toFixed(2));
    previousMonth = run.payoffMonth;
    previousInterest = run.totalInterest;
  });
});

test('revolving: a larger additional payment never pays off later or costs more', () => {
  const base = { balance: 8000, annualRatePct: 22, minimumPercentOfBalance: 3, minimumDollarFloor: 25 };
  let previousMonth = Infinity;
  let previousInterest = Infinity;
  [0, 25, 50, 100, 250, 1000].forEach((extra) => {
    const run = revolvingProjection(Object.assign({}, base, { additionalMonthlyPayment: extra }));
    assert.equal(run.retired, true, 'extra ' + extra + ' should retire');
    assert.ok(run.payoffMonth <= previousMonth,
      'extra ' + extra + ': payoff ' + run.payoffMonth + ' is later than ' + previousMonth);
    assert.ok(run.totalInterest <= previousInterest + 1e-9,
      'extra ' + extra + ': interest ' + run.totalInterest.toFixed(2) + ' exceeds ' +
      previousInterest.toFixed(2));
    previousMonth = run.payoffMonth;
    previousInterest = run.totalInterest;
  });
});

// ---------------------------------------------------------------------------
// Criterion 5 -- non-convergence is a stated outcome
// ---------------------------------------------------------------------------

test('revolving: a minimum that never exceeds the interest returns a stated non-payoff', () => {
  /* 24% APR is exactly 2% a month, so a 2% minimum with no floor pays precisely
     the interest and not one cent of principal, forever. */
  const run = revolvingProjection({
    balance: 5000, annualRatePct: 24, minimumPercentOfBalance: 2, minimumDollarFloor: 0,
  });
  assert.equal(run.retired, false);
  assert.equal(run.payoffMonth, null, 'payoffMonth must be null, never a truncated month number');
  assert.equal(typeof run.nonPayoffReason, 'string');
  assert.match(run.nonPayoffReason, /does not exceed the monthly interest/);
  assert.equal(run.monthsSimulated, run.cap, 'the loop must stop at the stated cap, not run away');
  assert.equal(run.schedule.length, run.cap);
  assert.ok(Math.abs(run.schedule[0].principalPaid) < 1e-9, 'no principal is retired at all');
  assert.ok(Math.abs(run.schedule[run.cap - 1].balance - 5000) < 1e-6,
    'the balance is unchanged after ' + run.cap + ' months');

  // CONTROL: the same card with a floor above the interest DOES retire, so the
  // non-payoff above is a property of the inputs and not of the module.
  const withFloor = revolvingProjection({
    balance: 5000, annualRatePct: 24, minimumPercentOfBalance: 2, minimumDollarFloor: 400,
  });
  assert.equal(withFloor.retired, true, 'CONTROL: a floor above the interest must retire the card');
});

test('revolving: a payment smaller than the interest lets the balance GROW, and says so', () => {
  const run = revolvingProjection({
    balance: 5000, annualRatePct: 30, minimumPercentOfBalance: 1, minimumDollarFloor: 0,
  });
  assert.equal(run.retired, false);
  assert.ok(run.schedule[run.schedule.length - 1].balance > run.openingBalance,
    'a 1% minimum against a 2.5%/month rate must leave the balance HIGHER than it started; ' +
    'clamping principal at zero here would hide a compounding card behind a stalled one');
});

// ---------------------------------------------------------------------------
// Criterion 6 -- the floor binds
// ---------------------------------------------------------------------------

test('revolving: the dollar floor binds once the percent falls below it', () => {
  // 2% of $1,000 is $20, below the $25 floor -- so the floor binds immediately.
  const run = revolvingProjection({
    balance: 1000, annualRatePct: 12, minimumPercentOfBalance: 2, minimumDollarFloor: 25,
  });
  assert.equal(run.schedule[0].floorBound, true, '2% of 1000 = 20 < 25, so the floor must bind');
  const bound = run.schedule.filter((m) => m.floorBound);
  assert.ok(bound.length > 0);
  bound.forEach((m) => {
    assert.ok(m.minimumPayment <= 25 + 1e-9,
      'a floor-bound month should pay the floor (or the payoff amount), got ' + m.minimumPayment);
  });

  // CONTROL: a large balance is percent-bound, so `floorBound` can report false.
  const percentBound = revolvingProjection({
    balance: 10000, annualRatePct: 12, minimumPercentOfBalance: 2, minimumDollarFloor: 25,
  });
  assert.equal(percentBound.schedule[0].floorBound, false,
    'CONTROL: 2% of 10,000 = 200 > 25, so the percent binds and floorBound must be false');

  // And the helper is assertable on its own, which is why it is exported.
  assert.equal(minimumPaymentFor(1000, 10, { minimumPercentOfBalance: 2, minimumDollarFloor: 25 }).amount, 25);
  assert.equal(minimumPaymentFor(10000, 100, { minimumPercentOfBalance: 2, minimumDollarFloor: 25 }).amount, 200);
  // Never more than what clears the account.
  const tiny = minimumPaymentFor(5, 0.05, { minimumPercentOfBalance: 2, minimumDollarFloor: 25 });
  assert.ok(Math.abs(tiny.amount - 5.05) < 1e-9, 'the minimum must clamp to the payoff amount, got ' + tiny.amount);
  assert.equal(tiny.clampedToPayoff, true);
});

// ---------------------------------------------------------------------------
// The additional-payment benefit
// ---------------------------------------------------------------------------

test('revolving: additionalPaymentBenefit reports what the extra buys, and refuses when it cannot', () => {
  const base = { balance: 5000, annualRatePct: 18, minimumPercentOfBalance: 3, minimumDollarFloor: 25 };
  const benefit = additionalPaymentBenefit(base, 100);
  assert.equal(benefit.baselineRetires, true);
  assert.ok(benefit.monthsSaved > 0, 'an extra $100/mo must shorten the payoff');
  assert.ok(benefit.interestSaved > 0, 'and reduce interest');
  assert.equal(benefit.monthsSaved, benefit.minimumOnly.payoffMonth - benefit.accelerated.payoffMonth);

  // Zero extra is an exact no-op.
  const none = additionalPaymentBenefit(base, 0);
  assert.equal(none.monthsSaved, 0);
  assert.ok(Math.abs(none.interestSaved) < 1e-12);

  /* When the baseline never retires, "saved N months" is an artifact of the
     cap, not a number. It must be refused rather than reported. */
  const trap = additionalPaymentBenefit(REALISTIC_CARD, 200);
  assert.equal(trap.baselineRetires, false);
  assert.equal(trap.acceleratedRetires, true, 'the extra payment does retire it');
  assert.equal(trap.monthsSaved, null,
    'months saved against a baseline that never finishes would just be reporting the cap');
  assert.equal(trap.interestSaved, null);
});

// ---------------------------------------------------------------------------
// Criterion 7 -- seeded property coverage, seeds in the messages
// ---------------------------------------------------------------------------

/** The same small LCG tests/debt-modules-properties.test.js uses. */
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const PROPERTY_SEEDS = 200;

test('revolving: seeded properties hold across ' + PROPERTY_SEEDS + ' random cards', () => {
  for (let seed = 1; seed <= PROPERTY_SEEDS; seed++) {
    const rng = makeRng(seed);
    const options = {
      balance: Math.round(rng() * 40000 * 100) / 100 + 50,
      annualRatePct: Math.round(rng() * 3500) / 100,
      minimumPercentOfBalance: Math.round(rng() * 800) / 100,
      minimumDollarFloor: Math.round(rng() * 100),
      additionalMonthlyPayment: rng() < 0.5 ? 0 : Math.round(rng() * 500),
    };
    const where = 'seed ' + seed + ' ' + JSON.stringify(options);
    const run = revolvingProjection(options);

    assert.ok(run.monthsSimulated <= run.cap, where + ': ran past the cap');
    assert.ok(run.totalInterest >= 0, where + ': negative interest');
    assert.equal(run.retired, run.payoffMonth !== null, where + ': retired and payoffMonth disagree');
    assert.equal(run.schedule.length, run.monthsSimulated, where + ': schedule length disagrees with monthsSimulated');

    run.schedule.forEach((m) => {
      assert.ok(m.interestPaid >= 0, where + ' month ' + m.month + ': negative interest');
      assert.ok(m.balance >= -1e-9, where + ' month ' + m.month + ': negative balance');
      assert.ok(Math.abs(m.payment - (m.interestPaid + m.principalPaid)) < 1e-6,
        where + ' month ' + m.month + ': payment must equal interest plus principal');
    });

    if (run.retired) {
      const summed = run.schedule.reduce((s, m) => s + m.principalPaid, 0);
      assert.ok(Math.abs(summed - options.balance) < 1e-6,
        where + ': principal ' + summed + ' != opening ' + options.balance);
      assert.ok(Math.abs(run.schedule[run.schedule.length - 1].balance) < 1e-9,
        where + ': retired but the final balance is not zero');
    } else {
      assert.equal(typeof run.nonPayoffReason, 'string', where + ': a non-payoff must state its reason');
    }

    // A larger extra payment never pays off later. Same seed, one input changed.
    const more = revolvingProjection(Object.assign({}, options, {
      additionalMonthlyPayment: options.additionalMonthlyPayment + 50,
    }));
    if (run.retired) {
      assert.equal(more.retired, true, where + ': paying MORE stopped it retiring');
      assert.ok(more.payoffMonth <= run.payoffMonth, where + ': paying more paid off later');
      assert.ok(more.totalInterest <= run.totalInterest + 1e-9, where + ': paying more cost more interest');
    }
  }
});

test('revolving: documented defaults are what the module actually uses', () => {
  assert.equal(DEFAULT_MINIMUM_PERCENT, 2);
  assert.equal(DEFAULT_MINIMUM_FLOOR, 25);
  assert.equal(DEFAULT_MAX_MONTHS, 600);
  const explicit = revolvingProjection({ balance: 3000, annualRatePct: 20, minimumPercentOfBalance: 2, minimumDollarFloor: 25 });
  const defaulted = revolvingProjection({ balance: 3000, annualRatePct: 20 });
  assert.equal(defaulted.schedule[0].payment, explicit.schedule[0].payment,
    'omitting the minimum options must give the documented defaults, not zero');
  assert.equal(defaulted.cap, DEFAULT_MAX_MONTHS);
});

/* S3-15. This test used to run [0, -5, undefined, null, NaN] through one loop
   and assert all five were "trivially retired". Three of those are a debt of
   zero; two are not a debt at all. Asserting `payoffMonth: 0` for `NaN` is the
   module stating a financial outcome -- THIS CARD IS PAID OFF -- about input it
   could not read, which is the defect the card names. The two halves are now
   separate tests because they are separate claims. */

test('revolving: a zero or absent balance is retired immediately, not an empty error', () => {
  [0, undefined, null].forEach((balance) => {
    const run = revolvingProjection({ balance, annualRatePct: 20 });
    assert.equal(run.status, 'ok', JSON.stringify(balance) + ' is a valid zero, not a refusal');
    assert.equal(run.retired, true, JSON.stringify(balance) + ' should be trivially retired');
    assert.equal(run.payoffMonth, 0);
    assert.deepEqual(run.schedule, []);
    assert.equal(run.totalInterest, 0);
  });
});

test('revolving: an unreadable or out-of-domain balance is refused, never reported as paid off', () => {
  [NaN, Infinity, -Infinity, 'bad', '', true, {}, [], -5].forEach((balance) => {
    const run = revolvingProjection({ balance, annualRatePct: 20 });
    assert.equal(run.status, 'invalid_input',
      JSON.stringify(balance) + ' must be refused, not coerced to a zero balance');
    assert.equal(run.invalidField, 'balance', 'the refusal must name the field');
    assert.equal(run.retired, false, 'a refusal is not a retirement');
    assert.equal(run.payoffMonth, null,
      'payoffMonth 0 would assert that an unreadable debt is paid off');
    /* Null rather than zero throughout: a caller summing these must not get a
       plausible-looking total out of a refusal. */
    assert.equal(run.totalInterest, null);
    assert.equal(run.totalPrincipal, null);
    assert.equal(run.totalPaid, null);
  });
});

test('revolving: a corrupt rate is refused rather than silently becoming 0%', () => {
  const run = revolvingProjection({ balance: 3000, annualRatePct: 'bad', minimumDollarFloor: 50 });
  assert.equal(run.status, 'invalid_input');
  assert.equal(run.invalidField, 'annualRatePct');
  /* The pre-repair behaviour returned totalInterest 0 here, which is
     indistinguishable from a genuine interest-free card. */
  assert.equal(run.totalInterest, null);
});

test('revolving: maxMonths is bounded before any schedule is allocated (S3-16)', () => {
  const { MAX_SUPPORTED_MONTHS } = require('../src/debt-revolving.js');
  const card = { balance: 5000, annualRatePct: 24, minimumPercentOfBalance: 2, minimumDollarFloor: 0 };

  /* The reproduction: a finite request that is not a horizon, it is an
     allocation instruction. Before the bound this exhausted the heap. */
  const huge = revolvingProjection(Object.assign({}, card, { maxMonths: 1e12 }));
  assert.equal(huge.status, 'invalid_input');
  assert.equal(huge.invalidField, 'maxMonths');
  assert.deepEqual(huge.schedule, [], 'nothing may be allocated before the refusal');

  [Infinity, NaN, 12.5, 0, -1, 'bad', MAX_SUPPORTED_MONTHS + 1].forEach((maxMonths) => {
    const run = revolvingProjection(Object.assign({}, card, { maxMonths }));
    assert.equal(run.status, 'invalid_input', JSON.stringify(maxMonths) + ' must be refused');
    assert.equal(run.invalidField, 'maxMonths');
  });

  /* Controls: the bound itself and the module's own default span both run.
     600 matters specifically -- a bound chosen by assuming plans end within
     50 years would have rejected the default. */
  [1, 12, 600, MAX_SUPPORTED_MONTHS].forEach((maxMonths) => {
    const run = revolvingProjection(Object.assign({}, card, { maxMonths }));
    assert.equal(run.status, 'ok', maxMonths + ' is a supported horizon');
    assert.equal(run.cap, maxMonths);
  });
});

test('revolving: finite inputs that produce a non-finite projection fail as arithmetic, not as money', () => {
  /* Every input here is a finite number, so input validation cannot catch it.
     With both minimum terms at zero the payment is zero, the balance compounds,
     and it leaves the representable range partway through the run. */
  const run = revolvingProjection({
    balance: 1e308, annualRatePct: 24,
    minimumPercentOfBalance: 0, minimumDollarFloor: 0, maxMonths: 100,
  });
  assert.equal(run.status, 'arithmetic_error',
    'a projection that stops being finite is not a projection');
  assert.equal(run.totalInterest, null, 'no total may escape a failed projection');
  assert.equal(run.payoffMonth, null);
  assert.match(run.invalidReason, /month \d+/, 'the reason must say where it failed');
});

test('revolving: invalidity propagates through both benefit branches (S3-15)', () => {
  const card = { balance: 3000, annualRatePct: 20, minimumDollarFloor: 50 };

  /* A corrupt extra payment used to be coerced to zero, so the comparison
     reported "no benefit" -- a finding manufactured from unreadable input. */
  const corruptExtra = additionalPaymentBenefit(card, 'bad');
  assert.equal(corruptExtra.status, 'invalid_input');
  assert.equal(corruptExtra.invalidField, 'additionalMonthlyPayment');
  assert.equal(corruptExtra.monthsSaved, null);
  assert.equal(corruptExtra.interestSaved, null);
  assert.equal(corruptExtra.baselineRetires, null,
    'null, not false -- "does not retire" is a claim, this is the absence of one');

  /* A corrupt shared option fails the baseline branch too. */
  const corruptShared = additionalPaymentBenefit({ balance: NaN, annualRatePct: 20 }, 100);
  assert.equal(corruptShared.status, 'invalid_input');
  assert.equal(corruptShared.invalidField, 'balance');
  assert.equal(corruptShared.monthsSaved, null);

  /* Control: the same call on valid inputs still produces a real comparison. */
  const valid = additionalPaymentBenefit(card, 100);
  assert.equal(valid.status, 'ok');
  assert.equal(typeof valid.monthsSaved, 'number');
  assert.ok(valid.monthsSaved > 0, 'paying more must retire the card sooner');
});

// ---------------------------------------------------------------------------
// Criterion 8 -- bundled and reachable, built to a SCRATCH path only
// ---------------------------------------------------------------------------

test('revolving: the module is registered in build.js and resolves in the built output', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const vm = require('node:vm');
  const builder = require('../build.js');

  const entry = builder.DEBT_MODULES.find((m) => m.file === 'debt-revolving.js');
  assert.ok(entry, 'debt-revolving.js must be registered in build.js DEBT_MODULES');
  assert.equal(entry.namespace, 'DebtRevolving');

  // GROUND RULE 2: scratch path only. investment-calculator-v2c.html is stale
  // by design and this sprint never rebuilds it.
  const scratch = path.join(os.tmpdir(), 'debt-revolving-build-' + process.pid + '.html');
  const shippedBefore = fs.statSync(path.join(__dirname, '..', 'investment-calculator-v2c.html')).mtimeMs;
  let output;
  try {
    output = builder.build(scratch).output;
  } finally {
    try { fs.unlinkSync(scratch); } catch (e) { /* scratch cleanup only */ }
  }
  assert.equal(
    fs.statSync(path.join(__dirname, '..', 'investment-calculator-v2c.html')).mtimeMs, shippedBefore,
    'the shipped artifact must be untouched -- build() was given a scratch path');

  // The namespace must actually RESOLVE in the built output, not merely appear
  // in it. Evaluating the factory is the only way to know that.
  const start = output.indexOf('function __debtModulesFactory(){');
  assert.ok(start >= 0, 'the built output should contain __debtModulesFactory');
  const invoke = output.indexOf('var __debtModules=__debtModulesFactory();', start);
  assert.ok(invoke > start);
  const end = output.indexOf(';', invoke + 'var __debtModules=__debtModulesFactory()'.length) + 1;
  const ctx = vm.createContext({});
  vm.runInContext(output.slice(start, end), ctx);
  assert.equal(vm.runInContext('typeof __debtModules.DebtRevolving', ctx), 'object',
    'DebtRevolving must resolve out of the bundled factory');
  assert.equal(vm.runInContext('typeof __debtModules.DebtRevolving.revolvingProjection', ctx), 'function');

  // And it must compute the same numbers inside the bundle as it does in Node,
  // or the IIFE wrapping has changed its behaviour.
  const bundled = vm.runInContext(
    '__debtModules.DebtRevolving.revolvingProjection(' +
    JSON.stringify({ balance: 8000, annualRatePct: 22, minimumPercentOfBalance: 4, minimumDollarFloor: 25 }) +
    ')', ctx);
  const direct = revolvingProjection({ balance: 8000, annualRatePct: 22, minimumPercentOfBalance: 4, minimumDollarFloor: 25 });
  assert.equal(bundled.payoffMonth, direct.payoffMonth, 'bundled and Node payoff months must agree');
  assert.ok(Math.abs(bundled.totalInterest - direct.totalInterest) < 1e-9,
    'bundled and Node interest must agree');
});

/* Q33, CLOSED by decision-register P10 (2026-09-10).

   AS FOUND: buildWorkerSource() in src/app-shell.html hand-maintained its own
   list of the six names to destructure out of __debtModules -- a SECOND
   definition of "which debt namespaces exist", next to build.js's generated
   one. Measured then: `typeof DebtRevolving` was "undefined" inside the real
   built worker while `typeof __debtModules.DebtRevolving` was "object". The
   code shipped; only the binding was missing. Harmless until someone wired the
   module into projectDebts(), at which point it is a ReferenceError -- Q15
   exactly, one module later.

   THE REPAIR: the binding list is now derived, `Object.keys(__debtModules)`,
   from the factory's own output. The two definitions cannot drift because
   there is only one.

   THIS TEST IS NOW THE GUARD, not the record of a defect. It must keep
   passing; if it fails, a second definition has reappeared. The todo marker it
   used to carry said "src/app-shell.html is not editable this sprint", which
   stopped being true when P10 edited it -- the marker outlived its repair by a
   day and made the gate report nine todos where eight were real. */
test('Q33 CLOSED (P10): every bundled namespace is bound in the Worker, from one derived list',
  async () => {
    const vm = require('node:vm');
    const { liveWorkerSource, cleanup } = require('./lib/worker-source.js');
    const source = await liveWorkerSource();
    const ctx = vm.createContext({ self: { postMessage() {} } });
    vm.runInContext(source, ctx);
    try {
      const { BUNDLED_MODULES, EXCLUDED_MODULES } = require('../build.js');

      /* Read from the registry rather than a literal list. A hand-written list
         here would be a third definition of the same set, which is the defect
         this test exists to prevent. */
      assert.ok(BUNDLED_MODULES.length > 0, 'precondition: something must be bundled');
      for (const { namespace } of BUNDLED_MODULES) {
        assert.equal(vm.runInContext('typeof __debtModules.' + namespace, ctx), 'object',
          namespace + ' must be in the worker bundle');
        assert.equal(vm.runInContext('typeof ' + namespace, ctx), 'object',
          namespace + ' is bundled but not BOUND in the worker. That is Q33 returning: ' +
          'buildWorkerSource() derives its bindings from Object.keys(__debtModules), so a ' +
          'missing binding means a second, hand-maintained definition has reappeared.');
      }

      /* The other half of P19: an excluded module must be absent from BOTH,
         or the worker would carry a namespace the artifact does not ship. */
      for (const { namespace } of EXCLUDED_MODULES) {
        assert.equal(vm.runInContext('typeof ' + namespace, ctx), 'undefined',
          namespace + ' is excluded and must not be bound in the worker');
      }

      /* DebtRevolving by name, because it is the module this file is about and
         the one the original finding measured as undefined. */
      assert.equal(vm.runInContext('typeof DebtRevolving', ctx), 'object',
        'the namespace whose absence was Q33 must resolve');
    } finally {
      cleanup();
    }
  });
