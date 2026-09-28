'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createReserveManager } = require('../../src/ported/reserve-manager');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'reserve-manager.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

const manager = createReserveManager(fixtures.config);

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

test('reserve manager port: target() matches the Python oracle on every fixture case', () => {
  for (const c of fixtures.target_cases) {
    const state = toJsState(c.input.state);
    const result = manager.target(state);
    assertClose(result.rawTargetReal, c.output.raw_target_real, `${c.name}.rawTargetReal`);
    assertClose(result.deliberateFundingTargetReal, c.output.deliberate_funding_target_real, `${c.name}.deliberateFundingTargetReal`);
    assertClose(result.protectedFloorReal, c.output.protected_floor_real, `${c.name}.protectedFloorReal`);
    assertClose(result.annualNeedBasisReal, c.output.annual_need_basis_real, `${c.name}.annualNeedBasisReal`);
    assert.equal(result.phase, c.output.phase, `${c.name}.phase`);
  }
});

test('reserve manager port: draw() matches the Python oracle on every fixture case', () => {
  for (const c of fixtures.draw_cases) {
    const state = toJsState(c.input.state);
    const result = manager.draw({ state, cashNeedReal: c.input.cash_need_real, emergency: c.input.emergency });
    assertClose(result.recommendedDrawReal, c.output.recommended_draw_real, `${c.name}.recommendedDrawReal`);
    assertClose(result.maximumDrawReal, c.output.maximum_draw_real, `${c.name}.maximumDrawReal`);
    assertClose(result.protectedFloorReal, c.output.protected_floor_real, `${c.name}.protectedFloorReal`);
    assertClose(result.drawShare, c.output.draw_share, `${c.name}.drawShare`);
    assert.equal(result.emergency, c.output.emergency, `${c.name}.emergency`);
    assert.equal(result.reason, c.output.reason, `${c.name}.reason`);
  }
});

test('reserve manager port: refill() matches the Python oracle on every fixture case', () => {
  for (const c of fixtures.refill_cases) {
    const state = toJsState(c.input.state);
    const result = manager.refill({
      state,
      availableCapacityReal: c.input.available_capacity_real,
      reserveDrawReal: c.input.reserve_draw_real,
    });
    assertClose(result.refillReal, c.output.refill_real, `${c.name}.refillReal`);
    assertClose(result.targetReal, c.output.target_real, `${c.name}.targetReal`);
    assertClose(result.gapReal, c.output.gap_real, `${c.name}.gapReal`);
    assertClose(result.refillScore, c.output.refill_score, `${c.name}.refillScore`);
    assert.equal(result.allowed, c.output.allowed, `${c.name}.allowed`);
    assert.equal(result.reason, c.output.reason, `${c.name}.reason`);
    for (const key of Object.keys(c.output.score_components)) {
      assertClose(result.scoreComponents[key], c.output.score_components[key], `${c.name}.scoreComponents.${key}`);
    }
  }
});
