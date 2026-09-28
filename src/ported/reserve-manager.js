'use strict';
/*
 * Ported from the Financial Projection V2.1.2 (M5 PASS) Python engine's
 * retirement_model_v2/reserve_manager.py. Faithful line-by-line
 * translation, verified against Python-generated fixtures in
 * fixtures/reserve-manager.fixtures.json (see
 * tests/ported/reserve-manager.test.js).
 *
 * Deterministic countercyclical reserve draw and recovery-aware refill
 * policy -- no randomness anywhere.
 *
 * KnownState shape expected by this module (only the fields it actually
 * reads; see the fixture generator for the full Python dataclass):
 *   { retirementYear, spendingReal, trailingSpendingReal, trailingTaxReal,
 *     equityDrawdown, reserveReal, reserveMonths, portfolioReal,
 *     trend15yReal }
 *
 * Uses preciseMean (see precise-math.js) for _average_tail's fmean() call
 * and preciseSum for refill()'s score = sum(...) -- discovered during a
 * Phase 8 audit pass (of a different module) that Python's sum()/fmean()
 * use compensated summation, not naive sequential addition, and that the
 * difference can flip a boundary comparison even with very few terms.
 */

const { preciseSum, preciseMean } = require('./precise-math');

function average(values, length, fallback) {
  // Mirrors Python's `values[-length:]` exactly, INCLUDING its edge cases:
  // JS Array.slice(-length) has the same negative-index semantics as
  // Python slicing (length=0 -> the whole array, since -0 === 0; length
  // greater than the array -> also the whole array). An earlier version of
  // this port used slice(Math.max(0, values.length - length)), which
  // silently returned an empty array (and so the fallback) for length=0
  // instead of the whole trailing history Python's _average_tail actually
  // returns in that case. trailing_average_years is never 0 in the current
  // config, so this never fired in practice, but the port must match the
  // source exactly regardless of what today's config happens to pass.
  const selected = values.slice(-length);
  if (selected.length === 0) return fallback;
  return preciseMean(selected);
}

function createReserveManager(config) {
  function target(state) {
    const trailingAverageYears = Math.trunc(config.trailing_average_years);
    const spendingAverage = average(state.trailingSpendingReal, trailingAverageYears, state.spendingReal);
    const taxAverage = average(state.trailingTaxReal, trailingAverageYears, 0.0);

    let annualNeed;
    let raw;
    let phase;
    if (state.retirementYear <= Math.trunc(config.first_fixed_years)) {
      annualNeed = spendingAverage;
      raw = Number(config.first_fixed_target_real);
      phase = 'fixed_years_1_5';
    } else if (state.retirementYear <= Math.trunc(config.sequence_sensitive_years)) {
      annualNeed = spendingAverage;
      raw = Number(config.target_years) * annualNeed;
      phase = 'lifestyle_only_years_6_12';
    } else {
      annualNeed = spendingAverage + (config.include_taxes_after_sequence_period ? taxAverage : 0.0);
      raw = Number(config.target_years) * annualNeed;
      phase = 'lifestyle_plus_tax_year_13_plus';
    }
    const fundedTarget = Math.min(raw, Number(config.deliberate_refill_cap_real));
    const protectedFloor = (annualNeed * Number(config.protected_final_months)) / 12.0;
    return {
      rawTargetReal: raw,
      deliberateFundingTargetReal: fundedTarget,
      protectedFloorReal: protectedFloor,
      annualNeedBasisReal: annualNeed,
      phase,
    };
  }

  function draw({ state, cashNeedReal, emergency }) {
    emergency = !!emergency;
    const t = target(state);
    const need = Math.max(0, cashNeedReal);
    const reserve = Math.max(0, state.reserveReal);
    const accessible = emergency ? reserve : Math.max(0, reserve - t.protectedFloorReal);

    let drawShare = Number(config.normal_draw_fraction);
    drawShare += Math.min(1, Math.max(0, state.equityDrawdown)) * Number(config.drawdown_draw_multiplier);
    if (state.retirementYear <= Math.trunc(config.sequence_sensitive_years)) {
      drawShare *= Number(config.sequence_draw_multiplier);
    }
    drawShare = Math.min(1, Math.max(0, drawShare));

    const softStart = Number(config.soft_protection_starts_months);
    const hardFloor = Number(config.protected_final_months);
    if (!emergency && state.reserveMonths < softStart) {
      const cautiousFraction = Math.max(0, (state.reserveMonths - hardFloor) / Math.max(1e-9, softStart - hardFloor));
      drawShare *= cautiousFraction;
    }
    if (emergency) drawShare = 1.0;

    const recommended = Math.min(need * drawShare, accessible);
    const maximum = emergency ? Math.min(need, accessible) : recommended;
    let reason;
    if (emergency) {
      reason = 'genuine cash emergency permits use of the protected final months';
    } else if (accessible <= 0) {
      reason = 'protected reserve floor blocks further discretionary draw';
    } else if (state.equityDrawdown >= Number(config.material_drawdown)) {
      reason = 'material equity decline shifts more of the cash burden to T-bills';
    } else {
      reason = 'normal countercyclical reserve participation';
    }

    return {
      recommendedDrawReal: recommended,
      maximumDrawReal: maximum,
      protectedFloorReal: t.protectedFloorReal,
      drawShare,
      emergency,
      reason,
    };
  }

  function refillResult(t, gap, score, refill, allowed, reason, components) {
    return {
      refillReal: refill,
      targetReal: t.deliberateFundingTargetReal,
      gapReal: gap,
      refillScore: score,
      allowed,
      reason,
      scoreComponents: components,
    };
  }

  function refill({ state, availableCapacityReal, reserveDrawReal }) {
    reserveDrawReal = reserveDrawReal || 0;
    const t = target(state);
    const gap = Math.max(0, t.deliberateFundingTargetReal - state.reserveReal);
    if (gap <= 0) {
      return refillResult(t, gap, 1.0, 0.0, false, 'reserve already meets its deliberate-funding target', {});
    }
    if (reserveDrawReal > 0 && !config.same_year_deliberate_refill_after_draw) {
      return refillResult(t, gap, 0.0, 0.0, false, 'same-year deliberate refill is deferred after a reserve draw', {
        same_year_draw: 1.0,
      });
    }
    const recoveryLimit = Number(config.recovery_drawdown);
    if (state.equityDrawdown > recoveryLimit) {
      return refillResult(t, gap, 0.0, 0.0, false, 'refill deferred during a material equity drawdown', {
        market_recovery: 0.0,
      });
    }

    const targetGap = Math.min(1, gap / Math.max(1, t.deliberateFundingTargetReal));
    const marketRecovery = Math.max(0, Math.min(1, 1.0 - state.equityDrawdown / Math.max(1e-9, recoveryLimit)));
    const liquidityYears = state.portfolioReal / Math.max(1, t.annualNeedBasisReal);
    const liquidity = Math.max(0, Math.min(1, (liquidityYears - 8.0) / 12.0));
    const trend = state.trend15yReal;
    const longRealTrend = trend === null || trend === undefined ? 0.5 : Math.max(0, Math.min(1, 0.5 + trend / 0.08));

    const rawComponents = {
      target_gap: targetGap,
      market_recovery: marketRecovery,
      liquidity,
      long_real_trend: longRealTrend,
    };
    const weights = config.refill_score_weights;
    const score = preciseSum(Object.keys(rawComponents).map((key) => rawComponents[key] * Number(weights[key])));
    const allowed = score >= Number(config.refill_score_threshold);
    const annualCap = state.spendingReal * Number(config.annual_refill_cap_spending_years);
    const refillAmount = allowed ? Math.min(gap, Math.max(0, availableCapacityReal), annualCap) : 0.0;
    const reason =
      refillAmount > 0
        ? 'reserve gap and recovered-market conditions support a controlled refill'
        : 'refill score or available capacity is insufficient';

    return refillResult(t, gap, score, refillAmount, allowed && refillAmount > 0, reason, rawComponents);
  }

  return { target, draw, refill };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createReserveManager };
}
