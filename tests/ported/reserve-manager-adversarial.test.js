'use strict';

/**
 * Adversarial/edge-case stress test for the reserve manager port, added
 * during a Phase 6/7 audit pass. See fixtures/generate_reserve_manager_
 * adversarial_fixtures.py for why these specific cases were chosen -- most
 * directly, a code-review pass found the average()/_average_tail slicing
 * diverged from Python at length=0 (fixed in src/ported/reserve-manager.js;
 * the "adv_trailing_average_years_zero_*" cases below are the regression
 * test for that exact bug).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createReserveManager } = require('../../src/ported/reserve-manager');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'reserve-manager-adversarial.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const manager = createReserveManager(fixtures.config);
const managerLengthZero = createReserveManager(fixtures.config_trailing_average_years_zero);

function toJsState(pyState) {
  return {
    retirementYear: pyState.retirement_year,
    spendingReal: pyState.spending_real,
    trailingSpendingReal: pyState.trailing_spending_real,
    trailingTaxReal: pyState.trailing_tax_real,
    equityDrawdown: pyState.equity_drawdown,
    reserveReal: pyState.reserve_real,
    reserveMonths: pyState.reserve_months,
    portfolioReal: pyState.portfolio_real,
    trend15yReal: pyState.trend_15y_real,
  };
}

const EPS = 1e-9;
function assertClose(actual, expected, msg) {
  assert.ok(
    Math.abs(actual - expected) <= EPS * Math.max(1, Math.abs(expected)),
    `${msg}: expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected)})`
  );
}

test('reserve manager ADVERSARIAL: target() matches Python on extreme/boundary inputs', () => {
  for (const c of fixtures.target_cases) {
    const state = toJsState(c.input.state);
    const m = c.trailing_average_years_zero ? managerLengthZero : manager;
    const result = m.target(state);
    assertClose(result.rawTargetReal, c.output.raw_target_real, `${c.name}.rawTargetReal`);
    assertClose(result.deliberateFundingTargetReal, c.output.deliberate_funding_target_real, `${c.name}.deliberateFundingTargetReal`);
    assertClose(result.protectedFloorReal, c.output.protected_floor_real, `${c.name}.protectedFloorReal`);
    assertClose(result.annualNeedBasisReal, c.output.annual_need_basis_real, `${c.name}.annualNeedBasisReal`);
    assert.equal(result.phase, c.output.phase, `${c.name}.phase`);
  }
});

test('reserve manager ADVERSARIAL: draw() matches Python on extreme/boundary inputs', () => {
  for (const c of fixtures.draw_cases) {
    const state = toJsState(c.input.state);
    const result = manager.draw({ state, cashNeedReal: c.input.cash_need_real, emergency: c.input.emergency });
    assertClose(result.recommendedDrawReal, c.output.recommended_draw_real, `${c.name}.recommendedDrawReal`);
    assertClose(result.maximumDrawReal, c.output.maximum_draw_real, `${c.name}.maximumDrawReal`);
    assertClose(result.drawShare, c.output.draw_share, `${c.name}.drawShare`);
    assert.equal(result.reason, c.output.reason, `${c.name}.reason`);
  }
});

test('reserve manager ADVERSARIAL: refill() matches Python on extreme/boundary inputs', () => {
  for (const c of fixtures.refill_cases) {
    const state = toJsState(c.input.state);
    const result = manager.refill({
      state,
      availableCapacityReal: c.input.available_capacity_real,
      reserveDrawReal: c.input.reserve_draw_real,
    });
    assertClose(result.refillReal, c.output.refill_real, `${c.name}.refillReal`);
    assertClose(result.refillScore, c.output.refill_score, `${c.name}.refillScore`);
    assert.equal(result.allowed, c.output.allowed, `${c.name}.allowed`);
    assert.equal(result.reason, c.output.reason, `${c.name}.reason`);
  }
});
