'use strict';

// Track B, L2 -- unit tests for accountExpected(), accountVolatility(), and
// accountReturnForPeriod(): the functions that decide what return rate and
// volatility a given account earns each year, including multi-asset-class
// weighting, the retirement glide path, the bond-tent de-risking overlay,
// and the reserve-bucket blend. The last three calculator-native functions
// in the withdrawal/growth pipeline with no isolated coverage.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

function planFor(overrides = {}) {
  return {
    profile: Object.assign({ age: 50, retireAge: 65 }, overrides.profile),
    assumptions: Object.assign({ returnRate: 8, volatility: 15, fee: 0, method: 'simple' }, overrides.assumptions),
    retirement: Object.assign({ spending: 60000 }, overrides.retirement),
    advanced: Object.assign({
      assetsOn: false, assetClasses: [], glideOn: false, retirementStock: 60,
      bondTentOn: false, bondTent: 50, reserveOn: false, reserveYears: 2, correlation: 0.25,
    }, overrides.advanced),
  };
}

// ---------------------------------------------------------------------------
// accountExpected
// ---------------------------------------------------------------------------

test('accountExpected: a supplied randomReturn always wins, bypassing every other calculation', () => {
  const p = planFor({ advanced: { assetsOn: true } });
  assert.equal(engine.accountExpected({ allocation: {} }, p, 0, 0.42), 0.42);
});

test('accountExpected: with assetsOn false, returns the flat plan-level return rate regardless of allocation', () => {
  const p = planFor({ assumptions: { returnRate: 7 }, advanced: { assetsOn: false } });
  assert.equal(engine.accountExpected({ allocation: { stocks: 100 } }, p, 0, null), 0.07);
});

test('accountExpected: with assetsOn true and a zero-total allocation, falls back to the flat plan-level rate', () => {
  const p = planFor({ assumptions: { returnRate: 7 }, advanced: { assetsOn: true, assetClasses: [{ id: 'stocks', returnRate: 10 }] } });
  assert.equal(engine.accountExpected({ allocation: {} }, p, 0, null), 0.07);
});

test('accountExpected: with assetsOn true, blends asset-class returns by allocation weight', () => {
  const p = planFor({ advanced: {
    assetsOn: true,
    assetClasses: [{ id: 'stocks', returnRate: 10 }, { id: 'bonds', returnRate: 4 }],
  } });
  const account = { allocation: { stocks: 70, bonds: 30 } };
  const expected = 0.7 * 0.10 + 0.3 * 0.04;
  assert.ok(Math.abs(engine.accountExpected(account, p, 0, null) - expected) < 1e-9);
});

test('accountExpected: the glide path shifts the stock weight toward retirementStock, proportional to progress toward retireAge', () => {
  const p = planFor({
    profile: { age: 50, retireAge: 60 }, // 10 years to retirement
    advanced: {
      assetsOn: true, glideOn: true, retirementStock: 20,
      assetClasses: [{ id: 'stocks', returnRate: 10 }, { id: 'bonds', returnRate: 4 }],
    },
  });
  // Starts 80/20 stock/bond, not 100/0 -- the glide formula proportionally
  // rescales the *existing* non-stock weights toward their target share,
  // so a starting allocation with zero non-stock weight has nothing to
  // rescale and the glide cannot act (a real corner case in the formula,
  // not a test bug; worth a follow-up note if picked up).
  const account = { allocation: { stocks: 80, bonds: 20 } };
  // Halfway to retirement (yearProgress 5 of 10): stock weight should have
  // moved halfway from 80% toward the 20% glide target, i.e. to 50%.
  const halfway = engine.accountExpected(account, p, 5, null);
  const expectedStockWeight = 0.8 + (0.20 - 0.8) * 0.5; // 0.50
  const expected = expectedStockWeight * 0.10 + (1 - expectedStockWeight) * 0.04;
  assert.ok(Math.abs(halfway - expected) < 1e-6);

  // At retirement (progress = 1), stock weight must equal the target exactly.
  const atRetirement = engine.accountExpected(account, p, 10, null);
  const expectedAtRetirement = 0.20 * 0.10 + 0.80 * 0.04;
  assert.ok(Math.abs(atRetirement - expectedAtRetirement) < 1e-6);
});

// ---------------------------------------------------------------------------
// accountVolatility
// ---------------------------------------------------------------------------

test('accountVolatility: with assetsOn false, returns the flat plan-level volatility', () => {
  const p = planFor({ assumptions: { volatility: 12 }, advanced: { assetsOn: false } });
  assert.equal(engine.accountVolatility({ allocation: {} }, p), 0.12);
});

test('accountVolatility: a single fully-allocated asset class reduces to that class\'s own volatility', () => {
  const p = planFor({ advanced: { assetsOn: true, assetClasses: [{ id: 'stocks', volatility: 18 }] } });
  const result = engine.accountVolatility({ allocation: { stocks: 100 } }, p);
  assert.ok(Math.abs(result - 0.18) < 1e-9);
});

test('accountVolatility: two perfectly correlated asset classes (correlation 1) reduce to the weighted-average volatility', () => {
  const p = planFor({ advanced: {
    assetsOn: true, correlation: 1,
    assetClasses: [{ id: 'stocks', volatility: 20 }, { id: 'bonds', volatility: 8 }],
  } });
  const result = engine.accountVolatility({ allocation: { stocks: 60, bonds: 40 } }, p);
  const expected = 0.6 * 0.20 + 0.4 * 0.08; // weighted average, when correlation is 1
  assert.ok(Math.abs(result - expected) < 1e-9);
});

test('accountVolatility: two uncorrelated asset classes (correlation 0) diversify below the weighted-average volatility', () => {
  const p = planFor({ advanced: {
    assetsOn: true, correlation: 0,
    assetClasses: [{ id: 'stocks', volatility: 20 }, { id: 'bonds', volatility: 8 }],
  } });
  const result = engine.accountVolatility({ allocation: { stocks: 60, bonds: 40 } }, p);
  const expected = Math.sqrt(Math.pow(0.6 * 0.20, 2) + Math.pow(0.4 * 0.08, 2)); // no cross term at correlation 0
  assert.ok(Math.abs(result - expected) < 1e-9);
  const weightedAverage = 0.6 * 0.20 + 0.4 * 0.08;
  assert.ok(result < weightedAverage, 'diversification benefit: blended volatility must be strictly below the naive weighted average');
});

// ---------------------------------------------------------------------------
// accountReturnForPeriod
// ---------------------------------------------------------------------------

test('accountReturnForPeriod: historical mode returns the supplied histRate directly (before fee), simple mode uses accountExpected', () => {
  const p = planFor({ assumptions: { method: 'historical', fee: 0 } });
  const ac = { balance: 100000, allocation: {} };
  assert.ok(Math.abs(engine.accountReturnForPeriod(ac, p, 50, 0, 0.15, null, 100000) - 0.15) < 1e-9);

  const pSimple = planFor({ assumptions: { method: 'simple', returnRate: 6, fee: 0 } });
  assert.ok(Math.abs(engine.accountReturnForPeriod(ac, pSimple, 50, 0, 0.15, null, 100000) - 0.06) < 1e-9, 'simple mode must ignore histRate entirely');
});

test('accountReturnForPeriod: the plan fee is subtracted from the raw return', () => {
  const p = planFor({ assumptions: { method: 'simple', returnRate: 8, fee: 1 } });
  const ac = { balance: 100000, allocation: {} };
  assert.ok(Math.abs(engine.accountReturnForPeriod(ac, p, 50, 0, 0, null, 100000) - 0.07) < 1e-9);
});

test('accountReturnForPeriod: bondTentOn blends toward 4.5% in proportion to closeness to retireAge', () => {
  const p = planFor({
    profile: { age: 65, retireAge: 65 }, // exactly at retirement -> maximum bond-tent strength
    assumptions: { method: 'simple', returnRate: 10, fee: 0 },
    advanced: { bondTentOn: true, bondTent: 100 }, // 100% bond share at max strength
  });
  const ac = { balance: 100000, allocation: {} };
  // At retireAge exactly, strength = 1 - |0|/5 = 1, bondShare = 100%*1 = 100% -> fully replaced by 4.5%.
  assert.ok(Math.abs(engine.accountReturnForPeriod(ac, p, 65, 0, 0, null, 100000) - 0.045) < 1e-9);
});

test('accountReturnForPeriod: reserveOn blends toward 3% only once retired, proportional to the reserve\'s share of the portfolio', () => {
  const p = planFor({
    profile: { age: 66, retireAge: 65 }, // already retired
    assumptions: { method: 'simple', returnRate: 10, fee: 0 },
    retirement: { spending: 40000 },
    advanced: { reserveOn: true, reserveYears: 2 }, // reserve target = 80000
  });
  const ac = { balance: 80000, allocation: {} }; // exactly enough to fully fund the reserve
  const portfolioTotal = 200000;
  const share = 80000 / portfolioTotal; // reserve = min(balance, target) = 80000
  const expected = 0.10 * (1 - share) + 0.03 * share;
  assert.ok(Math.abs(engine.accountReturnForPeriod(ac, p, 66, 0, 0, null, portfolioTotal) - expected) < 1e-9);
});

test('accountReturnForPeriod: reserveOn has no effect before retirement, even with a reserve-eligible balance', () => {
  const p = planFor({
    profile: { age: 60, retireAge: 65 }, // not yet retired
    assumptions: { method: 'simple', returnRate: 10, fee: 0 },
    advanced: { reserveOn: true, reserveYears: 2 },
  });
  const ac = { balance: 80000, allocation: {} };
  assert.ok(Math.abs(engine.accountReturnForPeriod(ac, p, 60, 0, 0, null, 200000) - 0.10) < 1e-9, 'pre-retirement, the reserve blend must not apply at all');
});

test('accountReturnForPeriod: the final return is always clamped to [-0.95, 2]', () => {
  const extremeHigh = planFor({ assumptions: { method: 'simple', returnRate: 500, fee: 0 } });
  const ac = { balance: 100000, allocation: {} };
  assert.equal(engine.accountReturnForPeriod(ac, extremeHigh, 50, 0, 0, null, 100000), 2);

  const extremeLow = planFor({ assumptions: { method: 'historical', fee: 0 } });
  assert.equal(engine.accountReturnForPeriod(ac, extremeLow, 50, 0, -10, null, 100000), -0.95);
});
