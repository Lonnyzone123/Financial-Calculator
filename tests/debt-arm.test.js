'use strict';

// Track F2 -- oracle-verified tests for src/debt-arm.js, a new standalone
// adjustable-rate-mortgage module (not wired into the app).
//
// What it replaces, and does NOT yet supersede: the live model's entire ARM
// treatment is a single step function -- one `resetRate` at one
// `nextRateResetAge` (src/engine.js, projectDebts(); mirrored by
// effectiveRateNow() in src/debt-strategy-adapter.js). A real 5/1 ARM resets
// ANNUALLY after year 5, from index + margin, clamped by three separate caps
// and a floor, re-amortizing over the REMAINING term each time. This module
// models that. Neither live caller is touched.
//
// THE IDENTITY TEST IS FIRST AND IS THE LOAD-BEARING ONE: an ARM whose caps
// are effectively infinite and whose index is constant at (fixed rate -
// margin) must reproduce amortizationSchedule() -- same payment, same total
// interest, same payoff month. Every reset in it recomputes a payment from a
// carried balance over a shrinking term, so if the re-amortization loop is
// wrong anywhere, that single test catches it. It was confirmed failing
// before the module existed.
//
// "Exactly" here means to within double-precision representation noise. The
// module deliberately re-amortizes at EVERY reset rather than short-circuiting
// when the rate is unchanged: short-circuiting would make this test pass
// without ever executing the loop it exists to prove.
//
// The identity test was additionally confirmed to CATCH the specific defect it
// targets, not merely to pass. Against a scratch copy of the module whose
// re-amortization used the ORIGINAL term instead of the remaining one, the
// same 360-month loan ended maturity with $278,059.39 still owed and reported
// $626,667.65 of interest against the correct $486,632.77. A green test that
// has never been observed failing for the right reason is not evidence.

const test = require('node:test');
const assert = require('node:assert/strict');
const { armRatePath, armSchedule, armBrackets } = require('../src/debt-arm.js');
const { amortizationSchedule, monthlyPayment } = require('../src/debt-amortization.js');

function close(actual, expected, tol) {
  const t = tol === undefined ? 1e-9 : tol;
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= t * scale,
    'expected ' + expected + ', got ' + actual + ' (drift ' + (actual - expected) + ')'
  );
}

const PRINCIPAL = 400000;
const TERM = 360;

// A conventional 5/1 ARM: 5 years fixed, then annual resets, 2/2/5 caps.
function fiveOneArm(overrides) {
  return Object.assign({
    startRatePct: 6.25,
    fixedPeriodMonths: 60,
    resetEveryMonths: 12,
    marginPct: 2.75,
    indexRatePct: 4.5,
    initialCapPct: 2,
    periodicCapPct: 2,
    lifetimeCapPct: 11.25,
    floorPct: 0,
    termMonths: TERM,
  }, overrides || {});
}

// ---------------------------------------------------------------------------
// 1. The identity test (written first)
// ---------------------------------------------------------------------------

test('armSchedule: uncapped, constant index equal to a fixed rate reproduces amortizationSchedule exactly', () => {
  const FIXED = 6.25;
  const MARGIN = 2.75;
  const arm = armSchedule(PRINCIPAL, {
    startRatePct: FIXED,
    fixedPeriodMonths: 60,
    resetEveryMonths: 12,
    marginPct: MARGIN,
    indexRatePct: FIXED - MARGIN, // fully-indexed rate == the fixed rate
    // no caps at all -> unbounded steps, unbounded ceiling
  }, TERM);
  const fixed = amortizationSchedule(PRINCIPAL, FIXED, TERM);

  assert.equal(arm.payoffMonth, fixed.payoffMonth, 'payoff month must match exactly');
  assert.equal(arm.schedule.length, fixed.schedule.length);
  close(arm.initialPayment, fixed.monthlyPayment);
  close(arm.totalInterest, fixed.totalInterest);

  // ...and not merely in aggregate: every single month agrees. Compared on an
  // ABSOLUTE money tolerance rather than a relative one, because the final
  // row's balance is a float residue near zero (amortizationSchedule()'s loop
  // exits on `balance > 1e-9`), against which a relative bound is meaningless.
  // A millionth of a dollar is still ~1000x tighter than the drift 25
  // successive re-amortizations of a $400,000 balance can accumulate.
  const closeAbs = function (actual, expected, label) {
    assert.ok(
      Math.abs(actual - expected) <= 1e-6,
      label + ': expected ' + expected + ', got ' + actual
    );
  };
  for (let i = 0; i < fixed.schedule.length; i++) {
    closeAbs(arm.schedule[i].payment, fixed.schedule[i].payment, 'payment m' + (i + 1));
    closeAbs(arm.schedule[i].principalPaid, fixed.schedule[i].principalPaid, 'principal m' + (i + 1));
    closeAbs(arm.schedule[i].interestPaid, fixed.schedule[i].interestPaid, 'interest m' + (i + 1));
    closeAbs(arm.schedule[i].balance, fixed.schedule[i].balance, 'balance m' + (i + 1));
  }

  // The resets genuinely happened -- the loop was executed, not skipped.
  assert.ok(arm.resets.length >= 25, 'expected annual resets after year 5, got ' + arm.resets.length);
  assert.ok(arm.segments.length === arm.resets.length + 1);
});

// ---------------------------------------------------------------------------
// 2. Re-amortization over the REMAINING term -- the off-by-one this exists for
// ---------------------------------------------------------------------------

test('armSchedule: the payment after the first reset re-amortizes over the REMAINING term, not the original one', () => {
  const cfg = fiveOneArm();
  const arm = armSchedule(PRINCIPAL, cfg, TERM);

  // Independent oracle for the balance at the end of the fixed period.
  const fixedPart = amortizationSchedule(PRINCIPAL, cfg.startRatePct, TERM);
  const balanceAt60 = fixedPart.schedule[59].balance;
  close(arm.schedule[59].balance, balanceAt60);

  // Fully indexed 4.5 + 2.75 = 7.25, a +1.00 step, inside the 2-point initial cap.
  const newRate = 7.25;
  assert.equal(arm.resets[0].month, 61);
  close(arm.resets[0].rate, newRate);

  const correct = monthlyPayment(balanceAt60, newRate, TERM - 60); // 300 months left
  const offByTerm = monthlyPayment(balanceAt60, newRate, TERM);    // the wrong answer
  close(arm.schedule[60].payment, correct);
  assert.ok(Math.abs(correct - offByTerm) > 100, 'the two candidate payments must be far apart');
  assert.ok(Math.abs(arm.schedule[60].payment - offByTerm) > 100, 'must not re-amortize over the ORIGINAL term');
});

test('armSchedule: the loan still matures on its original maturity month however the rate moves', () => {
  const rising = armSchedule(PRINCIPAL, fiveOneArm({ indexRatePct: 9 }), TERM);
  const falling = armSchedule(PRINCIPAL, fiveOneArm({ indexRatePct: 0 }), TERM);
  assert.equal(rising.payoffMonth, TERM);
  assert.equal(falling.payoffMonth, TERM);
  close(rising.schedule[TERM - 1].balance, 0, 1e-6);
  close(falling.schedule[TERM - 1].balance, 0, 1e-6);
});

// ---------------------------------------------------------------------------
// 3. Principal-sum identity (ARCH-01 applied locally)
// ---------------------------------------------------------------------------

test('armSchedule: principal paid sums to exactly the original principal, on a rising and a falling path', () => {
  for (const index of [9, 0, 4.5]) {
    const arm = armSchedule(PRINCIPAL, fiveOneArm({ indexRatePct: index }), TERM);
    const sum = arm.schedule.reduce(function (s, r) { return s + r.principalPaid; }, 0);
    close(sum, PRINCIPAL, 1e-9);
  }
});

test('armSchedule: interest paid sums to the reported total interest', () => {
  const arm = armSchedule(PRINCIPAL, fiveOneArm({ indexRatePct: 9 }), TERM);
  const sum = arm.schedule.reduce(function (s, r) { return s + r.interestPaid; }, 0);
  close(sum, arm.totalInterest, 1e-9);
});

// ---------------------------------------------------------------------------
// 4. The three caps and the floor, each isolated
// ---------------------------------------------------------------------------

test('armRatePath: the INITIAL cap binds only the first reset; the PERIODIC cap binds the rest', () => {
  // Fully indexed 32.75 against a 6.25 start, so the caps -- not the index --
  // are what limits every step. (An index only modestly above the start rate
  // would let a later reset reach its fully-indexed level inside the periodic
  // cap, in which case `binding` is correctly 'none'; the next test covers
  // that a cap is not asserted where none binds.)
  const path = armRatePath(fiveOneArm({ indexRatePct: 30, initialCapPct: 5, periodicCapPct: 2, lifetimeCapPct: 99 }));
  close(path.resets[0].rate, 6.25 + 5);   // initial cap, not periodic
  assert.equal(path.resets[0].binding, 'initialCap');
  close(path.resets[1].rate, 6.25 + 5 + 2); // periodic cap thereafter
  assert.equal(path.resets[1].binding, 'periodicCap');
  close(path.resets[2].rate, 6.25 + 5 + 2 + 2);
  assert.equal(path.resets[2].binding, 'periodicCap');
});

test('armRatePath: a reset that reaches its fully-indexed rate inside the cap reports no binding constraint', () => {
  // Fully indexed 12.75: the first reset is cap-limited to 11.25, but the
  // second only needs +1.50 to arrive, which the 2-point cap permits.
  const path = armRatePath(fiveOneArm({ indexRatePct: 10, initialCapPct: 5, periodicCapPct: 2, lifetimeCapPct: 99 }));
  close(path.resets[0].rate, 11.25);
  assert.equal(path.resets[0].binding, 'initialCap');
  close(path.resets[1].rate, 12.75);
  assert.equal(path.resets[1].binding, 'none');
  close(path.resets[1].fullyIndexedRate, 12.75);
});

test('armRatePath: the LIFETIME cap is an absolute ceiling on the note rate and is never exceeded', () => {
  const path = armRatePath(fiveOneArm({ indexRatePct: 20, lifetimeCapPct: 11.25 }));
  for (const r of path.resets) assert.ok(r.rate <= 11.25 + 1e-12, 'rate ' + r.rate + ' exceeded the lifetime cap');
  const last = path.resets[path.resets.length - 1];
  close(last.rate, 11.25);
  assert.equal(last.binding, 'lifetimeCap');
});

test('armRatePath: lifetimeIncreaseCapPct bounds the RISE over the start rate, and the tighter of the two bounds wins', () => {
  const byIncrease = armRatePath(fiveOneArm({ indexRatePct: 20, lifetimeCapPct: undefined, lifetimeIncreaseCapPct: 5 }));
  for (const r of byIncrease.resets) assert.ok(r.rate <= 6.25 + 5 + 1e-12);
  close(byIncrease.resets[byIncrease.resets.length - 1].rate, 11.25);

  // Both supplied: the tighter one binds.
  const both = armRatePath(fiveOneArm({ indexRatePct: 20, lifetimeCapPct: 9, lifetimeIncreaseCapPct: 5 }));
  close(both.resets[both.resets.length - 1].rate, 9);
});

test('armRatePath: the FLOOR bounds the fall, and a zero index leaves the margin alone above it', () => {
  const floored = armRatePath(fiveOneArm({ indexRatePct: 0, floorPct: 3.5 }));
  const last = floored.resets[floored.resets.length - 1];
  close(last.rate, 3.5);
  assert.equal(last.binding, 'floor');

  // With no floor above it, a zero index settles at exactly the margin.
  const bare = armRatePath(fiveOneArm({ indexRatePct: 0, floorPct: 0 }));
  close(bare.resets[bare.resets.length - 1].rate, 2.75);
});

// ---------------------------------------------------------------------------
// 5. Adversarial boundaries named in the brief
// ---------------------------------------------------------------------------

test('armSchedule: a reset landing on the final payment month produces a one-month final segment, not an error', () => {
  const cfg = fiveOneArm({ fixedPeriodMonths: TERM - 1, resetEveryMonths: 12, indexRatePct: 9 });
  const arm = armSchedule(PRINCIPAL, cfg, TERM);
  assert.equal(arm.resets.length, 1);
  assert.equal(arm.resets[0].month, TERM);
  assert.equal(arm.segments.length, 2);
  assert.equal(arm.segments[1].startMonth, TERM);
  assert.equal(arm.segments[1].endMonth, TERM);
  assert.equal(arm.payoffMonth, TERM);
  close(arm.schedule[TERM - 1].balance, 0, 1e-6);
  const sum = arm.schedule.reduce(function (s, r) { return s + r.principalPaid; }, 0);
  close(sum, PRINCIPAL, 1e-9);
});

test('armRatePath: a lifetime cap BELOW the start rate clamps adjustments down but never rewrites the note rate', () => {
  const path = armRatePath(fiveOneArm({ indexRatePct: 20, lifetimeCapPct: 5 }));
  // The contractual start rate stands for the whole fixed period...
  assert.equal(path.months[0].rate, 6.25);
  assert.equal(path.months[59].rate, 6.25);
  // ...and the first ADJUSTED rate is pulled down to the cap, not up to the index.
  close(path.resets[0].rate, 5);
  assert.equal(path.resets[0].binding, 'lifetimeCap');
  for (const r of path.resets) assert.ok(r.rate <= 5 + 1e-12);
});

test('armRatePath: a periodic cap of zero freezes the rate after the first reset', () => {
  const path = armRatePath(fiveOneArm({ indexRatePct: 20, periodicCapPct: 0, initialCapPct: 2, lifetimeCapPct: 99 }));
  close(path.resets[0].rate, 8.25);
  for (const r of path.resets) close(r.rate, 8.25);
});

test('armRatePath: an initial cap of zero freezes the rate for the whole term', () => {
  const path = armRatePath(fiveOneArm({ indexRatePct: 20, initialCapPct: 0, periodicCapPct: 0, lifetimeCapPct: 99 }));
  for (const r of path.resets) close(r.rate, 6.25);
});

test('armRatePath: a zero-rate index with a zero margin and zero floor gives a genuine 0% adjusted rate', () => {
  const path = armRatePath(fiveOneArm({ indexRatePct: 0, marginPct: 0, floorPct: 0, periodicCapPct: 99, initialCapPct: 99 }));
  close(path.resets[0].rate, 0);
  const arm = armSchedule(PRINCIPAL, fiveOneArm({ indexRatePct: 0, marginPct: 0, floorPct: 0, periodicCapPct: 99, initialCapPct: 99 }), TERM);
  // After the reset the loan charges no interest at all.
  close(arm.schedule[TERM - 1].interestPaid, 0, 1e-9);
  assert.equal(arm.payoffMonth, TERM);
});

// ---------------------------------------------------------------------------
// 6. An index PATH rather than a constant index
// ---------------------------------------------------------------------------

test('armRatePath: an explicit index path is read per reset month and its last value carries forward', () => {
  const cfg = fiveOneArm({ indexRatePct: undefined, indexPathPct: [4.5, 5.5, 6.5], initialCapPct: 9, periodicCapPct: 9, lifetimeCapPct: 99 });
  const path = armRatePath(cfg);
  close(path.resets[0].fullyIndexedRate, 4.5 + 2.75);
  close(path.resets[1].fullyIndexedRate, 5.5 + 2.75);
  close(path.resets[2].fullyIndexedRate, 6.5 + 2.75);
  close(path.resets[3].fullyIndexedRate, 6.5 + 2.75, 1e-12); // carried forward
});

// ---------------------------------------------------------------------------
// 7. Worst / best case brackets
// ---------------------------------------------------------------------------

test('armBrackets: the worst case is never below, and the best case never above, any realized path', () => {
  const cfg = fiveOneArm();
  const { worst, best } = armBrackets(PRINCIPAL, cfg, TERM);
  const actual = armSchedule(PRINCIPAL, cfg, TERM);

  assert.ok(worst.totalInterest >= actual.totalInterest);
  assert.ok(best.totalInterest <= actual.totalInterest);
  assert.ok(worst.totalInterest > best.totalInterest);
  for (let i = 0; i < TERM; i++) {
    assert.ok(worst.schedule[i].rate >= actual.schedule[i].rate - 1e-12, 'worst dipped below actual at month ' + (i + 1));
    assert.ok(best.schedule[i].rate <= actual.schedule[i].rate + 1e-12, 'best rose above actual at month ' + (i + 1));
  }
});

test('armBrackets: the worst case climbs to the lifetime cap only as fast as the caps allow', () => {
  const cfg = fiveOneArm({ initialCapPct: 2, periodicCapPct: 2, lifetimeCapPct: 11.25 });
  const { worst } = armBrackets(PRINCIPAL, cfg, TERM);
  close(worst.resets[0].rate, 8.25);   // 6.25 + 2
  close(worst.resets[1].rate, 10.25);  // + 2
  close(worst.resets[2].rate, 11.25);  // capped, not 12.25
  close(worst.resets[3].rate, 11.25);
});

test('armBrackets: the best case falls to the floor only as fast as the caps allow', () => {
  const cfg = fiveOneArm({ initialCapPct: 2, periodicCapPct: 2, floorPct: 3 });
  const { best } = armBrackets(PRINCIPAL, cfg, TERM);
  close(best.resets[0].rate, 4.25); // 6.25 - 2
  close(best.resets[1].rate, 3);    // floored, not 2.25
  close(best.resets[2].rate, 3);
});

test('armBrackets: refuses to invent a ceiling when the note has no lifetime bound at all', () => {
  const cfg = fiveOneArm({ lifetimeCapPct: undefined, lifetimeIncreaseCapPct: undefined });
  assert.throws(
    function () { armBrackets(PRINCIPAL, cfg, TERM); },
    /lifetime/i,
    'an unbounded worst case must be refused, not fabricated'
  );
});

// ---------------------------------------------------------------------------
// 8. Degenerate inputs
// ---------------------------------------------------------------------------

test('armSchedule: a zero principal or non-positive term returns an empty schedule rather than throwing', () => {
  const zero = armSchedule(0, fiveOneArm(), TERM);
  assert.equal(zero.schedule.length, 0);
  close(zero.totalInterest, 0);
  const noTerm = armSchedule(PRINCIPAL, fiveOneArm(), 0);
  assert.equal(noTerm.schedule.length, 0);
  close(noTerm.totalInterest, 0);
});

test('armSchedule: a fixed period at or beyond the term never resets and equals a plain fixed loan', () => {
  const arm = armSchedule(PRINCIPAL, fiveOneArm({ fixedPeriodMonths: TERM, indexRatePct: 20 }), TERM);
  const fixed = amortizationSchedule(PRINCIPAL, 6.25, TERM);
  assert.equal(arm.resets.length, 0);
  close(arm.totalInterest, fixed.totalInterest);
  assert.equal(arm.payoffMonth, fixed.payoffMonth);
});

test('armSchedule: every schedule row carries the rate that produced it, and none is non-finite', () => {
  const arm = armSchedule(PRINCIPAL, fiveOneArm({ indexRatePct: 9 }), TERM);
  for (const row of arm.schedule) {
    assert.ok(Number.isFinite(row.rate), 'row rate not finite');
    assert.ok(Number.isFinite(row.payment) && Number.isFinite(row.balance));
  }
  for (let m = 1; m <= 60; m++) close(arm.schedule[m - 1].rate, 6.25);
  assert.ok(arm.schedule[60].rate > 6.25);
});
