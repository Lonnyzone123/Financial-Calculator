'use strict';

// Track B, L2 -- unit tests for optimizedAccountScore(): the scoring function
// that ranks accounts within a tax class when withdrawalOrder is "optimized"
// (withdrawFromClass() sorts ascending by this score and drains the lowest
// first). Flagged as the last calculator-native function with no isolated
// coverage in tests/withdrawal-mechanics.test.js and tests/return-generation
// .test.js's headers -- both explicitly deferred it here since it needs its
// own asset-class/allocation/negative-prior-return setup to differentiate
// accounts meaningfully.

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
    advanced: Object.assign({
      assetsOn: false, assetClasses: [], correlation: 0.25, reserveOn: false,
    }, overrides.advanced),
  };
}

// ---------------------------------------------------------------------------
// Base score: a.priority, with priorReturn >= 0 and no reserve adjustment
// ---------------------------------------------------------------------------

test('optimizedAccountScore: with priorReturn >= 0 and reserveOn false, the score is exactly the account\'s priority', () => {
  const p = planFor();
  assert.equal(engine.optimizedAccountScore({ priority: 3 }, p, 0), 3);
  assert.equal(engine.optimizedAccountScore({ priority: 3 }, p, 5), 3, 'a positive prior return must not trigger the volatility term either');
});

test('optimizedAccountScore: a numeric-string priority is coerced to a number', () => {
  const p = planFor();
  assert.equal(engine.optimizedAccountScore({ priority: '7' }, p, 0), 7);
});

test('optimizedAccountScore: a missing priority defaults to 1', () => {
  const p = planFor();
  assert.equal(engine.optimizedAccountScore({}, p, 0), 1);
});

test('optimizedAccountScore: a priority of exactly 0 also defaults to 1 -- a real formula quirk, not a test bug', () => {
  // Number(0) || 1 evaluates the falsy 0 and substitutes 1, exactly like a
  // missing priority. An account explicitly prioritized at 0 is therefore
  // indistinguishable from one with no priority set at all.
  const p = planFor();
  assert.equal(engine.optimizedAccountScore({ priority: 0 }, p, 0), 1);
});

// ---------------------------------------------------------------------------
// The volatility/cash-share term: only applies on a down year, and only when
// assetsOn is true
// ---------------------------------------------------------------------------

test('optimizedAccountScore: a negative priorReturn has no effect when assetsOn is false', () => {
  const p = planFor({ advanced: { assetsOn: false } });
  assert.equal(engine.optimizedAccountScore({ priority: 2 }, p, -0.1), 2);
});

test('optimizedAccountScore: priorReturn of exactly 0 does not trigger the volatility term (only strictly negative does)', () => {
  const p = planFor({ advanced: { assetsOn: true, assetClasses: [{ id: 'stocks', volatility: 20 }] } });
  assert.equal(engine.optimizedAccountScore({ priority: 2, allocation: { stocks: 100 } }, p, 0), 2);
});

test('optimizedAccountScore: on a down year with assetsOn true, adds volatility*25 minus cashShare*8', () => {
  const p = planFor({ advanced: {
    assetsOn: true, assetClasses: [{ id: 'stocks', volatility: 20 }, { id: 'bonds', volatility: 8 }],
  } });
  const account = { priority: 2, allocation: { stocks: 60, bonds: 40 } };
  const volatility = engine.accountVolatility(account, p);
  const expected = 2 + volatility * 25; // no cash allocation -> cashShare 0
  assert.ok(Math.abs(engine.optimizedAccountScore(account, p, -0.1) - expected) < 1e-9);
});

test('optimizedAccountScore: a larger cash allocation lowers the score (all else equal), reflecting lower drawdown risk', () => {
  const p = planFor({ advanced: {
    assetsOn: true, assetClasses: [{ id: 'stocks', volatility: 20 }, { id: 'cash', volatility: 0 }],
  } });
  const lowCash = { priority: 2, allocation: { stocks: 90, cash: 10 } };
  const highCash = { priority: 2, allocation: { stocks: 50, cash: 50 } };
  const lowCashScore = engine.optimizedAccountScore(lowCash, p, -0.1);
  const highCashScore = engine.optimizedAccountScore(highCash, p, -0.1);
  assert.ok(highCashScore < lowCashScore, 'more cash should score lower (drawn first) on a down year than a more volatile, low-cash twin');
});

test('optimizedAccountScore: a negative cash allocation is clamped to a zero cashShare, not a negative one', () => {
  const p = planFor({ advanced: { assetsOn: true, assetClasses: [{ id: 'stocks', volatility: 20 }] } });
  const account = { priority: 2, allocation: { stocks: 100, cash: -50 } };
  const volatility = engine.accountVolatility(account, p);
  const expected = 2 + volatility * 25; // clamped cashShare of 0, not -0.5*8 added back
  assert.ok(Math.abs(engine.optimizedAccountScore(account, p, -0.1) - expected) < 1e-9);
});

test('optimizedAccountScore: cashShare\'s own guard tolerates a missing allocation, but accountVolatility (called first) does not -- a missing allocation on an assetsOn-scored account throws, not silently degrades', () => {
  // optimizedAccountScore's cashShare line defensively guards with
  // `a.allocation && a.allocation.cash`, but it unconditionally calls
  // accountVolatility(a, p) first, whose own assetClasses.forEach reads
  // `a.allocation[ac.id]` with no such guard. Every account object the app
  // ever constructs carries an allocation field (confirmed: accountExpected
  // has the identical unguarded-`a.allocation` precondition), so this is a
  // documented precondition, not a reachable bug -- recorded here so the
  // precondition is enforced by a test rather than only assumed.
  const p = planFor({ advanced: { assetsOn: true, assetClasses: [{ id: 'stocks', volatility: 20 }] } });
  assert.throws(() => engine.optimizedAccountScore({ priority: 1 }, p, -0.1), TypeError);
});

// ---------------------------------------------------------------------------
// The reserve adjustment: only applies to taxable accounts, only when
// reserveOn is set, independent of priorReturn
// ---------------------------------------------------------------------------

test('optimizedAccountScore: reserveOn subtracts 2 from a taxable account\'s score, regardless of priorReturn sign', () => {
  const p = planFor({ advanced: { reserveOn: true } });
  assert.equal(engine.optimizedAccountScore({ priority: 5, taxClass: 'taxable' }, p, 1), 3);
  assert.equal(engine.optimizedAccountScore({ priority: 5, taxClass: 'taxable' }, p, -1), 3);
});

test('optimizedAccountScore: reserveOn has no effect on a non-taxable account', () => {
  const p = planFor({ advanced: { reserveOn: true } });
  assert.equal(engine.optimizedAccountScore({ priority: 5, taxClass: 'preTax' }, p, 0), 5);
});

test('optimizedAccountScore: taxClass "taxable" without reserveOn is unaffected', () => {
  const p = planFor({ advanced: { reserveOn: false } });
  assert.equal(engine.optimizedAccountScore({ priority: 5, taxClass: 'taxable' }, p, 0), 5);
});

test('optimizedAccountScore: the volatility term and the reserve adjustment stack together', () => {
  const p = planFor({ advanced: {
    assetsOn: true, reserveOn: true,
    assetClasses: [{ id: 'stocks', volatility: 20 }],
  } });
  const account = { priority: 5, taxClass: 'taxable', allocation: { stocks: 100 } };
  const volatility = engine.accountVolatility(account, p);
  const expected = 5 + volatility * 25 - 2;
  assert.ok(Math.abs(engine.optimizedAccountScore(account, p, -0.1) - expected) < 1e-9);
});

// ---------------------------------------------------------------------------
// Integration: the score actually changes withdrawFromClass()'s draw order
// ---------------------------------------------------------------------------

test('optimizedAccountScore: under "optimized" withdrawal order, a down year drains the lower-volatility, higher-cash account first', () => {
  // withdrawFromClass sorts ascending by score and drains front-to-back, so
  // the LOWER score is what gets drawn first. Volatility adds to the score
  // (pushing an account later/preserved) and cash subtracts from it (pushing
  // an account earlier/spent first) -- i.e. the formula prefers spending
  // down stable cash before touching volatile stock in a down year, which
  // is the opposite pairing from a naive "sell the loser first" reading.
  const p = {
    retirement: { withdrawalOrder: 'optimized' },
    advanced: {
      assetsOn: true, reserveOn: false, penaltyException: false, rule55: false, correlation: 0.25,
      assetClasses: [{ id: 'stocks', volatility: 25 }, { id: 'cash', volatility: 0 }],
    },
  };
  const volatileAccount = {
    id: 'volatile', taxClass: 'taxable', priority: 1, basisPct: 0, balance: 100,
    allocation: { stocks: 100 },
  };
  const steadyAccount = {
    id: 'steady', taxClass: 'taxable', priority: 1, basisPct: 0, balance: 100,
    allocation: { cash: 100 },
  };
  const accounts = [volatileAccount, steadyAccount];
  engine.withdrawFromClass(accounts, 'taxable', 100, 50, p, -0.1);
  assert.equal(steadyAccount.balance, 0, 'the all-cash account should be drained first on a down year, preserving the volatile one');
  assert.equal(volatileAccount.balance, 100, 'the fully-stock account should be left untouched');
});
