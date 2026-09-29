'use strict';

// Track B, L5 -- adversarial/boundary-exact pass on withdrawFromClass() and
// drawFromOtherAssets(), following up on tests/withdrawal-mechanics.test.js's
// L2 base coverage. Targets: the rule55 age boundary at exactly 55 (the L2
// file only checked 56), basisPct at its exact 0/100 extremes and outside
// the UI's normal [0,100] clamp (ties directly to the scenario-validator's
// OUT_OF_RANGE warning for the same field), amount=0 and a negative amount
// as true no-ops (the latter turned out to already be safe by construction
// -- see that test's own note for what was actually assumed vs. confirmed),
// sort stability under a missing priority, and drawFromOtherAssets' own
// availableAge/value/accessPct boundaries.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

/* RE-FIXTURED BY INTENT at S5AA R35 (SA32F-22): the Rule of 55 now also needs the separation it is named for -- the owner has left
   work, in or after the year they turn 55 (IRC 72(t)(2)(A)(v)). These fixtures test other things (the age boundary, the account type,
   the ordering nudge), so they state a qualifying separation: a profile whose owner left at 55. */
function planFor(overrides = {}) {
  return {
    retirement: Object.assign({ withdrawalOrder: 'manual' }, overrides.retirement),
    advanced: Object.assign({ penaltyException: false, rule55: false }, overrides.advanced),
    profile: Object.assign({ age: 55, retireAge: 55 }, overrides.profile),
  };
}

// ---------------------------------------------------------------------------
// withdrawFromClass
// ---------------------------------------------------------------------------

test('withdrawFromClass: rule55 at exactly age 55 waives the penalty; one tick below (54.999) it does not', () => {
/* S5AA task 4.1 (Q93): these fixtures gained a `type`. The Rule of 55 is EMPLOYER-PLAN money only
     (IRC 72(t)(2)(A)(v)), so the rule now reads the account and an untyped one cannot claim the
     exemption. The assertions below are unchanged; the fixture simply says what kind of pre-tax money
     it is, which it did not need to before. The untyped case is asserted on its own, further down. */
  const at55 = [{ taxClass: 'preTax', type: 'traditional401k', priority: 1, balance: 100000, basisPct: 0 }];
  const resultAt55 = engine.withdrawFromClass(at55, 'preTax', 10000, 55, planFor({ advanced: { rule55: true } }), 0.05);
  assert.equal(resultAt55.penalty, 0, 'age exactly 55 with rule55 must waive the penalty');

  const below55 = [{ taxClass: 'preTax', type: 'traditional401k', priority: 1, balance: 100000, basisPct: 0 }];
  const resultBelow55 = engine.withdrawFromClass(below55, 'preTax', 10000, 54.999, planFor({ advanced: { rule55: true } }), 0.05);
  assert.ok(Math.abs(resultBelow55.penalty - 1000) < 1e-9, 'one tick below 55, rule55 must not yet waive the penalty');
});

test('S5AA 4.1 (Q93): the Rule of 55 reads the ACCOUNT -- an IRA, and an untyped account, are not exempt', () => {
  /* IRC 72(t)(2)(A)(v) exempts a distribution from a qualified EMPLOYER plan after separation from
     service in or after the year the employee turns 55. It does not reach an IRA. The old gate read the
     tax class and a household flag and never the account, so it exempted both.
     An account with NO type cannot be identified as employer-plan money, so it does not get the
     exemption either -- the safe direction, and the reason the two fixtures above now carry a type. */
  const plan55 = planFor({ advanced: { rule55: true } });
  const ira = [{ taxClass: 'preTax', type: 'traditionalIRA', priority: 1, balance: 100000, basisPct: 0 }];
  assert.ok(Math.abs(engine.withdrawFromClass(ira, 'preTax', 10000, 57, plan55, 0.05).penalty - 1000) < 1e-9,
    'an IRA draw at 57 with rule55 on still owes the 10%');

  const untyped = [{ taxClass: 'preTax', priority: 1, balance: 100000, basisPct: 0 }];
  assert.ok(Math.abs(engine.withdrawFromClass(untyped, 'preTax', 10000, 57, plan55, 0.05).penalty - 1000) < 1e-9,
    'an account with no type cannot claim an employer-plan exemption');

  const workplace = [{ taxClass: 'preTax', type: 'traditional401k', priority: 1, balance: 100000, basisPct: 0 }];
  assert.equal(engine.withdrawFromClass(workplace, 'preTax', 10000, 57, plan55, 0.05).penalty, 0,
    'CONTROL: workplace money at 57 with rule55 on IS exempt, or this test proves nothing');
});

test('withdrawFromClass: basisPct of exactly 100 reports zero gains; exactly 0 reports the full amount as gains', () => {
  const fullBasis = [{ taxClass: 'taxable', priority: 1, balance: 100000, basisPct: 100 }];
  const fullBasisResult = engine.withdrawFromClass(fullBasis, 'taxable', 40000, 65, planFor(), 0.05);
  assert.equal(fullBasisResult.gains, 0);

  const zeroBasis = [{ taxClass: 'taxable', priority: 1, balance: 100000, basisPct: 0 }];
  const zeroBasisResult = engine.withdrawFromClass(zeroBasis, 'taxable', 40000, 65, planFor(), 0.05);
  assert.equal(zeroBasisResult.gains, 40000);
});

test('withdrawFromClass: a basisPct above 100 (outside the UI\'s own clamp, e.g. from a corrupted import) produces NEGATIVE reported gains -- a real consequence, which is exactly why the scenario validator flags an out-of-range basisPct as a WARNING', () => {
  const account = [{ taxClass: 'taxable', priority: 1, balance: 100000, basisPct: 150 }];
  const result = engine.withdrawFromClass(account, 'taxable', 40000, 65, planFor(), 0.05);
  assert.ok(result.gains < 0, `basisPct=150 must yield negative gains (1-1.5=-0.5 share); got ${result.gains}`);
  assert.ok(Math.abs(result.gains - 40000 * -0.5) < 1e-9);
});

test('withdrawFromClass: amount of exactly 0 is a true no-op -- no account is touched, nothing is taken', () => {
  const accounts = [{ taxClass: 'taxable', priority: 1, balance: 100000, basisPct: 50 }];
  const result = engine.withdrawFromClass(accounts, 'taxable', 0, 65, planFor(), 0.05);
  assert.equal(result.amount, 0);
  assert.equal(result.gains, 0);
  assert.equal(accounts[0].balance, 100000);
});

test('withdrawFromClass: a negative `amount` is a safe no-op, not a deposit -- the forEach loop\'s own `taken >= amount` guard (0 >= a negative amount) short-circuits before any account is ever touched', () => {
  // Worth pinning down explicitly: it would be easy to assume (as an
  // earlier draft of this very test did, before running it) that a
  // negative `amount` slips past the Math.min/balance--w arithmetic and
  // ends up depositing money instead of withdrawing it. It does not --
  // the guard clause at the top of every forEach iteration already
  // reads `taken(0) >= amount(negative)` as true and returns immediately,
  // so no account is ever reached. Confirmed empirically rather than by
  // re-reading the source a second time.
  const accounts = [{ taxClass: 'taxable', priority: 1, balance: 100000, basisPct: 100 }];
  const result = engine.withdrawFromClass(accounts, 'taxable', -5000, 65, planFor(), 0.05);
  assert.equal(accounts[0].balance, 100000, 'a negative amount must leave every account untouched');
  assert.equal(result.amount, 0, 'reported taken amount stays 0, not the negative input');
});

test('withdrawFromClass: a missing (undefined) priority on some accounts does not throw, and every account of the requested class is still drained to satisfy the amount', () => {
  const accounts = [
    { taxClass: 'taxable', balance: 5000, basisPct: 100 }, // no priority field
    { taxClass: 'taxable', priority: 1, balance: 5000, basisPct: 100 },
  ];
  assert.doesNotThrow(() => engine.withdrawFromClass(accounts, 'taxable', 8000, 65, planFor(), 0.05));
  const total = accounts[0].balance + accounts[1].balance;
  assert.equal(total, 2000, 'regardless of sort order among undefined priorities, 8000 must still be drained in total across both accounts');
});

// ---------------------------------------------------------------------------
// drawFromOtherAssets
// ---------------------------------------------------------------------------

test('drawFromOtherAssets: age exactly equal to availableAge is included (">="), one tick below is excluded', () => {
  const atAge = [{ liquidity: 'liquid', available: true, availableAge: 60, value: 50000, accessPct: 100 }];
  assert.equal(engine.drawFromOtherAssets(atAge, 10000, 60), 10000, 'exactly at availableAge, the asset must be reachable');

  const belowAge = [{ liquidity: 'liquid', available: true, availableAge: 60, value: 50000, accessPct: 100 }];
  assert.equal(engine.drawFromOtherAssets(belowAge, 10000, 59.999), 0, 'one tick before availableAge, the asset must be entirely unreachable');
});

test('drawFromOtherAssets: a value of exactly 0 is excluded by the strict ">0" filter, even if otherwise fully available', () => {
  const zeroValue = [{ liquidity: 'liquid', available: true, availableAge: 0, value: 0, accessPct: 100 }];
  assert.equal(engine.drawFromOtherAssets(zeroValue, 10000, 65), 0);
});

test('drawFromOtherAssets: accessPct of exactly 0 makes an asset\'s value entirely unreachable; exactly 100 makes it fully reachable', () => {
  const zeroAccess = [{ liquidity: 'liquid', available: true, availableAge: 0, value: 50000, accessPct: 0 }];
  assert.equal(engine.drawFromOtherAssets(zeroAccess, 10000, 65), 0);

  const fullAccess = [{ liquidity: 'liquid', available: true, availableAge: 0, value: 50000, accessPct: 100 }];
  assert.equal(engine.drawFromOtherAssets(fullAccess, 10000, 65), 10000);
});

test('drawFromOtherAssets: an accessPct above 100 or below 0 is clamped, not applied raw', () => {
  const over100 = [{ liquidity: 'liquid', available: true, availableAge: 0, value: 50000, accessPct: 250 }];
  assert.equal(engine.drawFromOtherAssets(over100, 100000, 65), 50000, 'accessPct clamped to 100 -- cannot exceed the asset\'s full value');

  const negative = [{ liquidity: 'liquid', available: true, availableAge: 0, value: 50000, accessPct: -50 }];
  assert.equal(engine.drawFromOtherAssets(negative, 10000, 65), 0, 'accessPct clamped to 0, not treated as "more restricted than 0"');
});

test('drawFromOtherAssets: liquidity rank ties keep filter/sort stable and still sum correctly across same-rank assets', () => {
  const assets = [
    { liquidity: 'liquid', available: true, availableAge: 0, value: 3000, accessPct: 100 },
    { liquidity: 'liquid', available: true, availableAge: 0, value: 4000, accessPct: 100 },
  ];
  assert.equal(engine.drawFromOtherAssets(assets, 5000, 65), 5000);
  const totalRemaining = assets[0].value + assets[1].value;
  assert.equal(totalRemaining, 7000 - 5000);
});
