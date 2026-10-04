'use strict';
/*
 * Track F2 -- a real adjustable-rate mortgage. Standalone, genuinely new
 * development (Section 0's "build in JS directly" rule -- no Python
 * reference implementation exists for this in the project).
 *
 * DELIBERATELY NOT WIRED, AND IT SUPERSEDES NOTHING YET. The live model's
 * entire ARM treatment is a single step function: one `resetRate` applied at
 * one `nextRateResetAge`, in projectDebts() in src/engine.js and mirrored by
 * effectiveRateNow() in src/debt-strategy-adapter.js. Neither is touched by
 * this file, and neither calls into it. Replacing the single-step model
 * changes simulation output for every existing scenario with an adjustable
 * debt, which is a watched-session decision, not an unattended one.
 *
 * WHAT A REAL ARM ACTUALLY DOES, and what the single-step model misses:
 *   - It resets REPEATEDLY on a schedule (a 5/1 is fixed for 5 years, then
 *     adjusts every year), not once and forever.
 *   - Each new rate is INDEX + MARGIN, not a stored constant.
 *   - Three separate caps and a floor clamp it: an initial cap on the first
 *     adjustment, a periodic cap on each later one, and a lifetime bound.
 *   - It RE-AMORTIZES over the REMAINING term at each reset -- not the
 *     original term. That off-by-one is the single most common way to get an
 *     ARM wrong, and it is what this module's first test exists to pin.
 *
 * ORACLE DISCIPLINE. There is no month-by-month amortization arithmetic in
 * this file. Each constant-rate segment is produced by amortizationSchedule()
 * in src/debt-amortization.js -- already verified against the closed-form
 * annuity formula -- called with the balance carried out of the previous
 * segment and the term still remaining, then truncated at the next reset.
 * The identity test in tests/debt-arm.test.js is what holds this to account:
 * with caps effectively infinite and a constant index equal to a fixed rate,
 * the whole segmented reconstruction must reproduce a plain fixed-rate
 * amortizationSchedule() month for month.
 *
 * A note on that test: this module re-amortizes at EVERY reset, including
 * ones where the rate did not move. Short-circuiting an unchanged rate would
 * be a legitimate optimization, and it would also let the identity test pass
 * without ever executing the loop it exists to prove. Correctness evidence
 * beats a saved multiplication.
 */

const { amortizationSchedule, normalizeTerm } = require('./debt-amortization.js');

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* An unset cap means "no cap", not "a cap of zero" -- a zero cap is a real,
   very different instrument (one that never moves), and both are exercised
   by the tests. */
function capOrUnbounded(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : Infinity;
}

function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}

/*
 * The absolute ceiling on the note rate, from either or both of the two
 * conventions US ARM disclosures use:
 *   lifetimeCapPct          -- an absolute maximum note rate ("never above 11.25%")
 *   lifetimeIncreaseCapPct  -- a maximum RISE over the start rate ("never more
 *                              than 5 points above the initial rate")
 * Both are supported rather than one being guessed at, and when both are
 * present the tighter one binds. Returns Infinity when neither is given,
 * which armBrackets() treats as a refusal rather than as a licence to invent
 * a number.
 */
function lifetimeCeiling(config, startRate) {
  const absolute = num(config.lifetimeCapPct, Infinity);
  const relative = num(config.lifetimeIncreaseCapPct, Infinity);
  const ceiling = Math.min(absolute, startRate + relative);
  /* S5AA R9 round, DeepSeek audit finding 2g/04: a ceiling BELOW ZERO is refused by name, as an absent one is refused by
     armBrackets(). Honoured, clamp(rate, floor >= 0, ceiling) returned the negative ceiling: every row reported a negative
     note rate while amortizationSchedule() charged 0%. A zero ceiling is a real instrument and stays allowed. */
  if (ceiling < 0) {
    throw new RangeError(
      'debt-arm: the lifetime ceiling is below zero (lifetimeCapPct ' + config.lifetimeCapPct +
      ', start rate ' + startRate + ' + lifetimeIncreaseCapPct ' + config.lifetimeIncreaseCapPct + '). ' +
      'A note rate cannot be capped below zero; the loan it describes is not one this module can amortize.'
    );
  }
  return ceiling;
}

/*
 * The index in effect at reset number `resetIndex` (0-based). An explicit
 * `indexPathPct` array is read per reset and its LAST value carries forward
 * past its end, so a short forecast does not silently become a zero index.
 * Otherwise the scalar `indexRatePct` applies to every reset.
 */
function indexAt(config, resetIndex) {
  const path = config.indexPathPct;
  if (Array.isArray(path) && path.length > 0) {
    const i = Math.min(resetIndex, path.length - 1);
    return num(path[i], 0);
  }
  return num(config.indexRatePct, 0);
}

/**
 * The month-by-month rate path.
 *
 * Returns { months, resets, segments, startRatePct, ceilingPct, floorPct }.
 *   months   -- [{ month, rate, isReset }] for months 1..termMonths
 *   resets   -- [{ month, previousRate, indexPct, marginPct, fullyIndexedRate,
 *                  rate, binding }] where `binding` names the constraint that
 *               actually determined the rate: 'initialCap' | 'periodicCap' |
 *               'lifetimeCap' | 'floor' | 'none'
 *   segments -- [{ startMonth, endMonth, rate }], one per constant-rate run
 *
 * POLICY, STATED EXPLICITLY: the caps constrain ADJUSTMENTS, never the
 * contractual initial rate. A lifetime cap below the start rate therefore
 * does not retroactively rewrite the note -- the start rate stands for the
 * whole fixed period, and the first adjustment is what gets pulled down to
 * the cap. The ceiling is applied last, so where a floor and a ceiling
 * conflict the ceiling wins (a lifetime cap is a hard maximum).
 */
function armRatePath(config) {
  const cfg = config || {};
  /* B2: armRatePath walks month-by-month to termMonths, so this is an
     allocation bound too. Same shared contract as recast and refinance. */
  const termMonths = Math.max(0, normalizeTerm(cfg.termMonths, 'armRatePath config.termMonths'));
  const startRate = Math.max(0, num(cfg.startRatePct, 0));
  const margin = num(cfg.marginPct, 0);
  const initialCap = capOrUnbounded(cfg.initialCapPct);
  const periodicCap = capOrUnbounded(cfg.periodicCapPct);
  const floor = Math.max(0, num(cfg.floorPct, 0));
  const ceiling = lifetimeCeiling(cfg, startRate);

  const fixedPeriod = Math.max(0, Math.floor(num(cfg.fixedPeriodMonths, 0)));
  const resetEvery = Math.max(0, Math.floor(num(cfg.resetEveryMonths, 0)));

  const resets = [];
  let rate = startRate;
  let resetIndex = 0;
  // The first adjustment takes effect the month AFTER the fixed period ends.
  for (let month = fixedPeriod + 1; month <= termMonths; ) {
    const indexPct = indexAt(cfg, resetIndex);
    const fullyIndexed = indexPct + margin;
    const cap = resetIndex === 0 ? initialCap : periodicCap;
    const stepped = clamp(fullyIndexed, rate - cap, rate + cap);
    const bounded = clamp(stepped, floor, ceiling);

    let binding = 'none';
    if (ceiling < stepped) binding = 'lifetimeCap';
    else if (floor > stepped) binding = 'floor';
    else if (stepped !== fullyIndexed) binding = resetIndex === 0 ? 'initialCap' : 'periodicCap';

    resets.push({
      month,
      previousRate: rate,
      indexPct,
      marginPct: margin,
      fullyIndexedRate: fullyIndexed,
      rate: bounded,
      binding,
    });
    rate = bounded;
    resetIndex++;
    // A non-positive reset interval means "one adjustment only" -- the same
    // shape the live single-step model assumes.
    if (resetEvery <= 0) break;
    month += resetEvery;
  }

  const segments = [];
  let segRate = startRate;
  let segStart = 1;
  for (const r of resets) {
    if (r.month > segStart) segments.push({ startMonth: segStart, endMonth: r.month - 1, rate: segRate });
    segStart = r.month;
    segRate = r.rate;
  }
  if (termMonths >= segStart) segments.push({ startMonth: segStart, endMonth: termMonths, rate: segRate });

  const resetMonths = new Set(resets.map(function (r) { return r.month; }));
  const months = [];
  for (const seg of segments) {
    for (let m = seg.startMonth; m <= seg.endMonth; m++) {
      months.push({ month: m, rate: seg.rate, isReset: resetMonths.has(m) });
    }
  }

  return { months, resets, segments, startRatePct: startRate, ceilingPct: ceiling, floorPct: floor };
}

/**
 * The full amortization of an ARM, re-amortizing over the REMAINING term at
 * each reset.
 *
 * `termMonths` is the authoritative term; `config.termMonths` is only a
 * fallback for callers that carry it there.
 *
 * Returns { schedule, segments, resets, ratePath, totalInterest, payoffMonth,
 *           initialPayment, finalPayment, minPayment, maxPayment,
 *           minRate, maxRate }.
 * Each `schedule` row is amortizationSchedule()'s row shape plus the `rate`
 * that produced it.
 */
function armSchedule(principal, config, termMonths) {
  const cfg = config || {};
  /* The explicit argument wins; config is the documented fallback. Whichever
     one supplies the value, it goes through the one contract. */
  const term = Math.max(0, normalizeTerm(termMonths === undefined || termMonths === null ? cfg.termMonths : termMonths, 'armSchedule termMonths'));
  const p = Math.max(0, num(principal, 0));
  const extra = Math.max(0, num(cfg.extraMonthlyPrincipal, 0));

  const ratePath = armRatePath(Object.assign({}, cfg, { termMonths: term }));

  const schedule = [];
  const segments = [];
  let balance = p;
  let totalInterest = 0;
  let payoffMonth = 0;

  for (const seg of ratePath.segments) {
    if (balance <= 1e-9 || term <= 0 || p <= 0) break;
    // The lender re-amortizes over the term still remaining on the note --
    // NOT the original term, and not the accelerated payoff that extra
    // principal would imply.
    const remainingTerm = term - seg.startMonth + 1;
    const segmentMonths = seg.endMonth - seg.startMonth + 1;
    const run = amortizationSchedule(balance, seg.rate, remainingTerm, extra);

    segments.push({
      startMonth: seg.startMonth,
      endMonth: seg.endMonth,
      rate: seg.rate,
      openingBalance: balance,
      monthlyPayment: run.monthlyPayment,
      remainingTermMonths: remainingTerm,
    });

    const take = Math.min(segmentMonths, run.schedule.length);
    for (let i = 0; i < take; i++) {
      const row = run.schedule[i];
      const month = seg.startMonth + i;
      schedule.push({
        month,
        rate: seg.rate,
        payment: row.payment,
        principalPaid: row.principalPaid,
        interestPaid: row.interestPaid,
        balance: row.balance,
      });
      totalInterest += row.interestPaid;
      balance = row.balance;
      payoffMonth = month;
      if (balance <= 1e-9) break;
    }
  }

  const payments = schedule.map(function (r) { return r.payment; });
  const rates = schedule.map(function (r) { return r.rate; });

  return {
    schedule,
    segments,
    resets: ratePath.resets,
    ratePath,
    totalInterest,
    payoffMonth,
    initialPayment: segments.length ? segments[0].monthlyPayment : 0,
    finalPayment: payments.length ? payments[payments.length - 1] : 0,
    minPayment: payments.length ? Math.min.apply(null, payments) : 0,
    maxPayment: payments.length ? Math.max.apply(null, payments) : 0,
    minRate: rates.length ? Math.min.apply(null, rates) : 0,
    maxRate: rates.length ? Math.max.apply(null, rates) : 0,
  };
}

/**
 * The worst-case and best-case brackets -- what replaces guessing a single
 * `resetRate`.
 *
 * Worst case pins the index high enough that every adjustment takes the
 * largest step the caps permit, until the lifetime ceiling stops it. Best
 * case pins it low enough that every adjustment takes the largest DOWNWARD
 * step permitted, until the floor stops it. Both still obey the initial and
 * periodic caps, so the brackets are reachable rate paths rather than
 * instantaneous jumps to the extremes.
 *
 * THROWS when the note has no lifetime bound at all (neither an absolute cap
 * nor an increase cap). An unbounded worst case is not a large number, it is
 * an undefined one, and inventing a ceiling here would be exactly the kind of
 * quiet policy answer this module must not give.
 */
function armBrackets(principal, config, termMonths) {
  const cfg = config || {};
  const startRate = Math.max(0, num(cfg.startRatePct, 0));
  const margin = num(cfg.marginPct, 0);
  const floor = Math.max(0, num(cfg.floorPct, 0));
  const ceiling = lifetimeCeiling(cfg, startRate);

  if (!Number.isFinite(ceiling)) {
    throw new Error(
      'armBrackets: this ARM has no lifetime bound -- set lifetimeCapPct (an absolute ' +
      'maximum note rate) or lifetimeIncreaseCapPct (a maximum rise over the start rate). ' +
      'A worst case without a ceiling is undefined, not merely large.'
    );
  }

  // Pinning the FULLY INDEXED rate to each extreme leaves the initial and
  // periodic caps to govern how fast it can actually be reached.
  const pinned = function (target) {
    const c = Object.assign({}, cfg, { indexRatePct: target - margin });
    delete c.indexPathPct;
    return c;
  };

  return {
    worst: armSchedule(principal, pinned(ceiling), termMonths),
    best: armSchedule(principal, pinned(floor), termMonths),
    ceilingPct: ceiling,
    floorPct: floor,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { armRatePath, armSchedule, armBrackets };
}
