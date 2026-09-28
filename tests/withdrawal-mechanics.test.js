'use strict';

// Track B, L2 -- unit tests for withdrawFromClass(), moveFunds(), and
// drawFromOtherAssets(): the low-level mechanics that every withdrawal in
// the engine (RMDs, retirement spending, tax gross-ups, Roth conversions)
// ultimately routes through. withdrawFromClass() in particular has never
// been tested in isolation despite being this central -- every prior test
// in this suite that exercises a withdrawal goes through it implicitly via
// a full simulatePlan() run, never checking its own contract (draining
// order, balance capping, gains/penalty bookkeeping) directly.
//
// Deliberately NOT covered here: the "optimized" withdrawal-order scoring
// nuances (optimizedAccountScore's volatility/cash-share/reserve terms) --
// that needs its own dedicated setup (asset classes, allocations, a
// negative prior return) to differentiate accounts meaningfully, and is a
// good candidate for a follow-up test file rather than folding in here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

// ---------------------------------------------------------------------------
// withdrawFromClass
// ---------------------------------------------------------------------------

function planFor(overrides = {}) {
  return {
    retirement: Object.assign({ withdrawalOrder: 'manual' }, overrides.retirement),
    advanced: Object.assign({ penaltyException: false, rule55: false }, overrides.advanced),
  };
}

test('withdrawFromClass: drains accounts of the requested tax class in priority order (lowest priority number first)', () => {
  const accounts = [
    { taxClass: 'taxable', priority: 2, balance: 10000, basisPct: 100 },
    { taxClass: 'taxable', priority: 1, balance: 10000, basisPct: 100 },
    { taxClass: 'preTax', priority: 1, balance: 999999, basisPct: 0 }, // wrong class, must be ignored entirely
  ];
  const result = engine.withdrawFromClass(accounts, 'taxable', 12000, 65, planFor(), 0.05);
  assert.equal(result.amount, 12000);
  assert.equal(accounts[1].balance, 0, 'priority 1 (lower number) must be drained first, and fully');
  assert.equal(accounts[0].balance, 8000, 'priority 2 only supplies the remainder');
  assert.equal(accounts[2].balance, 999999, 'a different tax class must be untouched');
});

test('withdrawFromClass: cannot withdraw more than the class actually holds', () => {
  const accounts = [{ taxClass: 'taxable', priority: 1, balance: 5000, basisPct: 100 }];
  const result = engine.withdrawFromClass(accounts, 'taxable', 50000, 65, planFor(), 0.05);
  assert.equal(result.amount, 5000, 'must be capped at the actually-available balance, not the requested amount');
  assert.equal(accounts[0].balance, 0);
});

test('withdrawFromClass: taxable withdrawals compute gains as the non-basis share of the amount taken', () => {
  const accounts = [{ taxClass: 'taxable', priority: 1, balance: 100000, basisPct: 30 }];
  const result = engine.withdrawFromClass(accounts, 'taxable', 40000, 65, planFor(), 0.05);
  assert.ok(Math.abs(result.gains - 40000 * 0.7) < 1e-9, '70% of the withdrawal (100% - basisPct) must be reported as gains');
});

test('withdrawFromClass: a non-taxable class never reports gains, even with a basisPct field present', () => {
  const accounts = [{ taxClass: 'roth', priority: 1, balance: 100000, basisPct: 0 }];
  const result = engine.withdrawFromClass(accounts, 'roth', 20000, 65, planFor(), 0.05);
  assert.equal(result.gains, 0);
});

test('withdrawFromClass: a preTax withdrawal before 59.5 with no exception incurs exactly a 10% penalty', () => {
  const accounts = [{ taxClass: 'preTax', priority: 1, balance: 100000, basisPct: 0 }];
  const result = engine.withdrawFromClass(accounts, 'preTax', 10000, 50, planFor(), 0.05);
  assert.ok(Math.abs(result.penalty - 1000) < 1e-9);
});

test('withdrawFromClass: penaltyException and rule55 (55+) each independently waive the early-withdrawal penalty', () => {
  const accounts1 = [{ taxClass: 'preTax', priority: 1, balance: 100000, basisPct: 0 }];
  const withException = engine.withdrawFromClass(accounts1, 'preTax', 10000, 50, planFor({ advanced: { penaltyException: true } }), 0.05);
  assert.equal(withException.penalty, 0);

  /* S5AA task 4.1 (Q93): a `type` was added. The Rule of 55 is employer-plan money only, so the rule now
     reads the account; the assertion itself is unchanged. */
  const accounts2 = [{ taxClass: 'preTax', type: 'traditional401k', priority: 1, balance: 100000, basisPct: 0 }];
  const withRule55 = engine.withdrawFromClass(accounts2, 'preTax', 10000, 56, planFor({ advanced: { rule55: true } }), 0.05);
  assert.equal(withRule55.penalty, 0, 'rule55 only waives the penalty at 55+, and 56 qualifies');
});

test('withdrawFromClass: a preTax withdrawal at or after 59.5 never incurs a penalty, exception or not', () => {
  const accounts = [{ taxClass: 'preTax', priority: 1, balance: 100000, basisPct: 0 }];
  const result = engine.withdrawFromClass(accounts, 'preTax', 10000, 59.5, planFor(), 0.05);
  assert.equal(result.penalty, 0);
});

// ---------------------------------------------------------------------------
// moveFunds
// ---------------------------------------------------------------------------

test('moveFunds: moves the requested amount from source to destination', () => {
  const accounts = [{ id: 'a', balance: 50000 }, { id: 'b', balance: 10000 }];
  const moved = engine.moveFunds(accounts, 'a', 'b', 20000);
  assert.equal(moved, 20000);
  assert.equal(accounts[0].balance, 30000);
  assert.equal(accounts[1].balance, 30000);
});

test('moveFunds: is capped at the source account\'s balance', () => {
  const accounts = [{ id: 'a', balance: 5000 }, { id: 'b', balance: 0 }];
  const moved = engine.moveFunds(accounts, 'a', 'b', 20000);
  assert.equal(moved, 5000);
  assert.equal(accounts[0].balance, 0);
  assert.equal(accounts[1].balance, 5000);
});

test('moveFunds: returns 0 and moves nothing when either account id is missing', () => {
  const accounts = [{ id: 'a', balance: 5000 }];
  assert.equal(engine.moveFunds(accounts, 'a', 'missing', 1000), 0);
  assert.equal(accounts[0].balance, 5000, 'the source balance must be untouched when the move cannot happen');
});

// ---------------------------------------------------------------------------
// drawFromOtherAssets
// ---------------------------------------------------------------------------

test('drawFromOtherAssets: drains in liquidity order -- liquid, then limited, then illiquid', () => {
  const assets = [
    { liquidity: 'illiquid', available: true, availableAge: 0, value: 10000, accessPct: 100 },
    { liquidity: 'liquid', available: true, availableAge: 0, value: 10000, accessPct: 100 },
    { liquidity: 'limited', available: true, availableAge: 0, value: 10000, accessPct: 100 },
  ];
  const taken = engine.drawFromOtherAssets(assets, 15000, 65);
  assert.equal(taken, 15000);
  assert.equal(assets[1].value, 0, 'liquid must be drained first, fully');
  assert.equal(assets[2].value, 5000, 'limited supplies the remainder');
  assert.equal(assets[0].value, 10000, 'illiquid must be untouched since liquid+limited already covered the request');
});

test('drawFromOtherAssets: accessPct clamps how much of an asset\'s value can actually be reached', () => {
  const assets = [{ liquidity: 'liquid', available: true, availableAge: 0, value: 100000, accessPct: 20 }];
  const taken = engine.drawFromOtherAssets(assets, 100000, 65);
  assert.equal(taken, 20000, 'only 20% of the asset\'s value must be accessible regardless of how much is requested');
});

test('drawFromOtherAssets: an asset below its availableAge or marked unavailable is skipped entirely', () => {
  const notYetAvailable = [{ liquidity: 'liquid', available: true, availableAge: 70, value: 50000, accessPct: 100 }];
  assert.equal(engine.drawFromOtherAssets(notYetAvailable, 10000, 65), 0);

  const markedUnavailable = [{ liquidity: 'liquid', available: false, availableAge: 0, value: 50000, accessPct: 100 }];
  assert.equal(engine.drawFromOtherAssets(markedUnavailable, 10000, 65), 0);
});
