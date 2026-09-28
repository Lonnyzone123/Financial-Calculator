'use strict';

// Track F2 -- randomized adversarial properties over the four F2 debt
// modules (debt-amortization, debt-refinance, debt-arm, debt-recast). These
// four have been verified against hand-chosen cases only; this file is
// their randomized layer, the kind of coverage an external auditor asks for
// whenever a sprint adds financial modules.
//
// SEEDING DISCIPLINE, following tests/lib/scenario-generator.js: every case
// is a pure function of one integer seed (the same mulberry32 generator,
// copied locally rather than shared, since that module's `draw` helpers are
// shaped around scenario fields -- ages, balances, enums -- not loan
// parameters). Any failure is reproducible from its seed alone, and every
// assertion message below names it.
//
// SCOPE BOUNDARY: this file asserts properties of the modules. It changes
// none of them. A property that fails here is a FINDING (ground rule 11) --
// a dated SPRINT_QUESTIONS.md entry plus a `todo`-marked reproducing test
// carrying its seed -- never an unplanned repair made from inside this file.

const test = require('node:test');
const assert = require('node:assert/strict');

const { monthlyPayment, amortizationSchedule } = require('../src/debt-amortization.js');
const { refinanceAnalysis } = require('../src/debt-refinance.js');
const { armRatePath, armSchedule, armBrackets } = require('../src/debt-arm.js');
const { recastAnalysis } = require('../src/debt-recast.js');

// --- deterministic randomness, mirroring tests/lib/scenario-generator.js ---

function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDraw(seed) {
  const rng = makeRng(seed);
  return {
    int: (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)),
    float: (lo, hi) => lo + rng() * (hi - lo),
  };
}

// Runs `fn(draw, seed)` for seeds 1..count. `fn` must throw/assert with the
// seed in its own message -- this wrapper adds nothing to the message so a
// failure is never ambiguous about which assertion actually fired.
function forSeeds(count, fn) {
  for (let seed = 1; seed <= count; seed++) {
    fn(makeDraw(seed), seed);
  }
}

const SEEDS = 200;

// ---------------------------------------------------------------------------
// 1. Higher rate, all else equal => strictly more total interest
// ---------------------------------------------------------------------------

test('property: raising the rate (all else equal) strictly increases total interest', () => {
  forSeeds(SEEDS, (d, seed) => {
    const principal = d.float(10000, 2000000);
    const term = d.int(12, 480);
    const rateLow = d.float(0, 12);
    const rateHigh = rateLow + d.float(0.05, 8);

    const low = amortizationSchedule(principal, rateLow, term, 0);
    const high = amortizationSchedule(principal, rateHigh, term, 0);

    assert.ok(
      high.totalInterest > low.totalInterest,
      'seed ' + seed + ': rate ' + rateHigh + '% should cost more interest than ' + rateLow +
      '% (principal ' + principal + ', term ' + term + '): got ' + high.totalInterest + ' <= ' + low.totalInterest
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Longer term, all else equal => lower monthly payment AND more interest
// ---------------------------------------------------------------------------

test('property: a longer term (all else equal, rate > 0) lowers the payment and raises total interest', () => {
  forSeeds(SEEDS, (d, seed) => {
    const principal = d.float(10000, 2000000);
    const rate = d.float(0.5, 15); // rate > 0: at rate 0 total interest is always 0 regardless of term
    const termShort = d.int(12, 240);
    const termLong = termShort + d.int(12, 240);

    const paymentShort = monthlyPayment(principal, rate, termShort);
    const paymentLong = monthlyPayment(principal, rate, termLong);
    assert.ok(
      paymentLong < paymentShort,
      'seed ' + seed + ': ' + termLong + '-month payment (' + paymentLong + ') should be lower than ' +
      termShort + '-month payment (' + paymentShort + ')'
    );

    const interestShort = amortizationSchedule(principal, rate, termShort, 0).totalInterest;
    const interestLong = amortizationSchedule(principal, rate, termLong, 0).totalInterest;
    assert.ok(
      interestLong > interestShort,
      'seed ' + seed + ': ' + termLong + '-month total interest (' + interestLong + ') should exceed ' +
      termShort + '-month total interest (' + interestShort + ')'
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Extra principal, all else equal => payoff no later, interest no greater
// ---------------------------------------------------------------------------

test('property: adding extra monthly principal never delays payoff and never increases total interest', () => {
  forSeeds(SEEDS, (d, seed) => {
    const principal = d.float(10000, 2000000);
    const rate = d.float(0, 15);
    const term = d.int(12, 480);
    const base = monthlyPayment(principal, rate, term);
    const extra = d.float(0, Math.max(1, base * 2));

    const without = amortizationSchedule(principal, rate, term, 0);
    const withExtra = amortizationSchedule(principal, rate, term, extra);

    assert.ok(
      withExtra.payoffMonth <= without.payoffMonth,
      'seed ' + seed + ': extra principal ' + extra + ' should not delay payoff (' +
      withExtra.payoffMonth + ' > ' + without.payoffMonth + ')'
    );
    assert.ok(
      withExtra.totalInterest <= without.totalInterest + 1e-6,
      'seed ' + seed + ': extra principal ' + extra + ' should not increase total interest (' +
      withExtra.totalInterest + ' > ' + without.totalInterest + ')'
    );
  });
});

// ---------------------------------------------------------------------------
// 4. armBrackets() bounds any admissible armRatePath() at every month
// ---------------------------------------------------------------------------

test('property: the worst-case bracket is >= any admissible rate path >= the best-case bracket, at every month', () => {
  forSeeds(SEEDS, (d, seed) => {
    const principal = d.float(50000, 1500000);
    const term = d.int(24, 480);
    const startRate = d.float(1, 10);
    const margin = d.float(0, 4);
    const lifetimeIncreaseCapPct = d.float(1, 8); // ceiling = startRate + this, so ceiling >= startRate always
    const floorPct = d.float(0, startRate); // guarantees floor <= startRate
    const initialCapPct = d.float(0.25, 5);
    const periodicCapPct = d.float(0.25, 5);
    const fixedPeriodMonths = d.int(0, Math.max(0, term - 12));
    const resetEveryMonths = d.int(6, 24);

    const baseCfg = {
      termMonths: term,
      startRatePct: startRate,
      marginPct: margin,
      initialCapPct,
      periodicCapPct,
      lifetimeIncreaseCapPct,
      floorPct,
      fixedPeriodMonths,
      resetEveryMonths,
    };

    // An "admissible" path: same instrument (same caps/margin/floor/schedule),
    // an arbitrary index. armRatePath() clamps internally, so any index -- even
    // one wildly outside [floor, ceiling] -- produces a legally reachable path.
    const midIndex = d.float(-10, startRate + lifetimeIncreaseCapPct + 10);
    const mid = armRatePath(Object.assign({}, baseCfg, { indexRatePct: midIndex }));
    const brackets = armBrackets(principal, baseCfg, term);

    assert.equal(mid.months.length, brackets.worst.ratePath.months.length, 'seed ' + seed + ': month counts must agree');
    for (let i = 0; i < mid.months.length; i++) {
      const worstRate = brackets.worst.ratePath.months[i].rate;
      const bestRate = brackets.best.ratePath.months[i].rate;
      const midRate = mid.months[i].rate;
      assert.ok(
        midRate <= worstRate + 1e-9,
        'seed ' + seed + ' month ' + (i + 1) + ': admissible rate ' + midRate + ' exceeds worst-case ' + worstRate
      );
      assert.ok(
        midRate >= bestRate - 1e-9,
        'seed ' + seed + ' month ' + (i + 1) + ': admissible rate ' + midRate + ' is below best-case ' + bestRate
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Uncapped constant-index ARM reproduces amortizationSchedule() exactly
// ---------------------------------------------------------------------------

test('property: an uncapped ARM with a constant index equal to a fixed rate reproduces amortizationSchedule exactly, across seeds', () => {
  forSeeds(SEEDS, (d, seed) => {
    const principal = d.float(10000, 2000000);
    const term = d.int(12, 480);
    const fixedRate = d.float(0, 15);
    const margin = d.float(0, 5);
    const fixedPeriodMonths = d.int(0, term);
    const resetEveryMonths = d.int(1, 24);

    const arm = armSchedule(principal, {
      startRatePct: fixedRate,
      marginPct: margin,
      indexRatePct: fixedRate - margin, // fully-indexed rate == the fixed rate, always
      fixedPeriodMonths,
      resetEveryMonths,
      // no caps, no lifetime bound at all -> every step and the ceiling are unbounded
    }, term);
    const fixed = amortizationSchedule(principal, fixedRate, term, 0);

    assert.equal(arm.payoffMonth, fixed.payoffMonth, 'seed ' + seed + ': payoff month must match exactly');
    assert.equal(arm.schedule.length, fixed.schedule.length, 'seed ' + seed + ': schedule length must match');
    // Tolerance, not a rounded-off finding: this sweep goes up to $2,000,000
    // over up to 480 months with resets as frequent as every month, so a
    // seed can chain far more re-amortization segments than the hand-written
    // debt-arm.test.js identity (25 resets on a $400,000 balance, 1e-6
    // absolute). Measured directly across all SEEDS draws before picking
    // this bound: worst observed drift ~1.8e-6. 1e-4 is ~50x that headroom
    // and is still a hundredth of a cent against any principal in range.
    for (let i = 0; i < fixed.schedule.length; i++) {
      assert.ok(
        Math.abs(arm.schedule[i].balance - fixed.schedule[i].balance) <= 1e-4,
        'seed ' + seed + ' month ' + (i + 1) + ': balance drift ' +
        (arm.schedule[i].balance - fixed.schedule[i].balance)
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 6. refinanceAnalysis()'s break-even agrees with an independent recompute
// ---------------------------------------------------------------------------

test('property: the reported net-position break-even month agrees with one recomputed from the cumulative cashflow series', () => {
  forSeeds(SEEDS, (d, seed) => {
    const currentBalance = d.float(50000, 1000000);
    const currentRate = d.float(2, 9);
    const currentTerm = d.int(12, 360);
    const replacementRate = d.float(2, 9);
    const replacementTerm = d.int(12, 360);
    const closingCosts = d.float(0, 15000);
    const financeClosingCosts = d.int(0, 1) === 1;
    const cashOut = d.float(0, 100000);

    const a = refinanceAnalysis(
      { balance: currentBalance, annualRatePct: currentRate, remainingTermMonths: currentTerm },
      { annualRatePct: replacementRate, termMonths: replacementTerm, closingCosts, financeClosingCosts, cashOut },
      { includeSeries: true }
    );

    // Independent recompute: the first month whose reported net positions are
    // strictly ordered the reported way -- reading the series data only, never
    // calling refinanceAnalysis()'s own internal break-even logic.
    let recomputed = null;
    for (let i = 0; i < a.series.length; i++) {
      const row = a.series[i];
      if (row.refinanceNetPosition < row.stayNetPosition) { recomputed = i + 1; break; }
    }

    assert.equal(
      a.breakEvenMonth, recomputed,
      'seed ' + seed + ': reported break-even ' + a.breakEvenMonth + ' disagrees with recomputed ' + recomputed
    );
  });
});

// ---------------------------------------------------------------------------
// 7. debt-recast.js's principal-sum identity, across seeds
// ---------------------------------------------------------------------------

test('property: recastAnalysis -- principal paid plus the lump sum equals the original balance, on both branches', () => {
  forSeeds(SEEDS, (d, seed) => {
    const balance = d.float(10000, 2000000);
    const rate = d.float(0, 15);
    const term = d.int(12, 480);
    const lump = d.float(0, balance * 1.2); // deliberately sometimes exceeds the balance

    const a = recastAnalysis(
      { balance, annualRatePct: rate, remainingTermMonths: term },
      lump,
      { includeSchedules: true }
    );

    const recastPrincipal = a.recast.schedule.reduce((s, r) => s + r.principalPaid, 0);
    const curtailmentPrincipal = a.curtailment.schedule.reduce((s, r) => s + r.principalPaid, 0);

    // Same reasoning as the ARM identity above: measured worst-case drift
    // across all SEEDS draws (principal to $2,000,000, term to 480 months)
    // was ~2.6e-5. 1e-3 is ~40x that headroom and is still a tenth of a cent.
    assert.ok(
      Math.abs(recastPrincipal + a.lumpSumApplied - balance) <= 1e-3,
      'seed ' + seed + ': recast principal-sum drift ' + (recastPrincipal + a.lumpSumApplied - balance)
    );
    assert.ok(
      Math.abs(curtailmentPrincipal + a.lumpSumApplied - balance) <= 1e-3,
      'seed ' + seed + ': curtailment principal-sum drift ' + (curtailmentPrincipal + a.lumpSumApplied - balance)
    );
  });
});
