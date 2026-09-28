'use strict';

// The three internals tests of tests/audit-ra02-destination-growth.test.js, split out at S5 block 2r.
//
// That file guards the repair through runPlan() only. This file holds the three tests that call the
// engine's internal per-account return function directly: the suppressed-draw form consumes no randomness,
// it keeps the expected return, and a cash holding still returns zero. They depend on internal names, so a
// rebuild re-points or retires them with those internals. The tests are moved verbatim, with the setup and
// the account helpers they use.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require('../src/engine.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

function account(o) {
  return Object.assign({
    id: 'a1', name: 'A', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 0, basisPct: 100, contributionMode: 'dollar', contribution: 0, frequency: 12,
    annualChangeMode: 'percent', annualChange: 0, changeTiming: 'annual', contributionPreset: 'none',
    futureChanges: [], priority: 1, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0,
    vesting: 100, allocation: {},
  }, o);
}

const CASH_HOLDING = account({
  id: 'household-cash', name: 'Retained household cash', type: 'customTaxable',
  taxClass: 'taxable', balance: 0, priority: 2, cashHolding: true,
});

// ---------------------------------------------------------------------------
// 4. No new RNG draws -- the constraint that shaped the repair
// ---------------------------------------------------------------------------

test('RA-02: a suppressed-draw return consumes no randomness at all', () => {
  // Pinned at the unit level with a random() that throws. If registering a
  // synthesized destination's rate ever starts drawing, this fails loudly
  // rather than silently shifting every Monte Carlo result downstream.
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.assumptions.method = 'monteCarlo';
  p.assumptions.volatility = 18.5;
  const ac = account({ id: 'x', balance: 1000 });
  const explode = () => { throw new Error('a synthesized destination must not consume an RNG draw'); };

  assert.throws(
    () => engine.accountReturnForPeriod(ac, p, 70, 0.5, 0.05, explode, 1000),
    /RNG draw/,
    'precondition: the normal Monte Carlo path DOES draw, so the guard below means something'
  );
  assert.doesNotThrow(
    () => engine.accountReturnForPeriod(ac, p, 70, 0.5, 0.05, explode, 1000, true),
    'the suppressed-draw form must not call random()'
  );
});

test('RA-02: suppressing the draw returns the expectation, not zero', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.assumptions.method = 'monteCarlo';
  p.assumptions.volatility = 18.5;
  p.assumptions.returnRate = 10;
  p.assumptions.fee = 0;
  p.advanced.bondTentOn = false;
  p.advanced.reserveOn = false;
  const ac = account({ id: 'x', balance: 1000 });
  const rate = engine.accountReturnForPeriod(ac, p, 70, 0.5, 0.05, () => 0.5, 1000, true);
  assert.ok(
    Math.abs(rate - 0.10) < 1e-9,
    'a suppressed draw must leave the expected return in place, got ' + rate
  );
});

test('RA-02: a cash holding still returns zero whether or not the draw is suppressed', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.assumptions.method = 'monteCarlo';
  const cash = JSON.parse(JSON.stringify(CASH_HOLDING));
  assert.equal(engine.accountReturnForPeriod(cash, p, 70, 0.5, 0.05, () => 0.5, 1000), 0);
  assert.equal(engine.accountReturnForPeriod(cash, p, 70, 0.5, 0.05, () => 0.5, 1000, true), 0);
});
