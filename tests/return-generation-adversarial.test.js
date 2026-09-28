'use strict';

// Track B, L5 -- adversarial/boundary-exact pass on accountExpected(),
// accountVolatility(), and accountReturnForPeriod(), following up on
// tests/return-generation.test.js's L2 base coverage. Most of this file
// confirms existing boundaries hold (randomReturn===0, glideOn at
// yearsTo=0, correlation=-1, a zero-total allocation's volatility
// fallback, bondTentOn's exact 5-year strength cutoff, and reserveOn's
// exact age===retireAge boundary).
//
// The first two tests below originally documented finding B-5 (a 100%-
// stock account under glideOn losing expected return to nowhere -- see
// PLATFORM_DEVELOPMENT_ROADMAP.md §11c). B-5 is now FIXED (2026-09-09):
// accountExpected() renormalizes its final weighted-return sum by the
// actual post-glide weight total (mirroring what accountVolatility
// already did), so a class that starts at weight 0 and has nothing to
// redistribute into no longer silently drags the result below both the
// no-glide and correctly-blended values -- it now correctly falls back to
// exactly the no-glide value, since the glide genuinely cannot act on a
// class the account never held. Rewritten (not silently patched) to lock
// in the fixed behavior, per this project's "regenerate deliberately"
// convention.
//
// RE-FIXTURED at S5AA R20 (R18F-01; ChatGPT's R18 full-model audit; the owner, 2026-09-23). B-5's 2026-09-09 repair made
// such an account keep its all-stock return, "since the glide genuinely cannot act on a class the account never
// held". That was an engineering choice, not a decision, and it left the glide inert for an all-stock account (a 60%
// target stayed 100% stock; a 0% target still returned 0%). The owner decided the stock share a glide gives up goes INTO
// BONDS. B-5's defect -- return lost to no asset class -- stays repaired: the freed weight now lands in bonds, so the
// two tests below assert the stock/bonds blend. With no bonds class the account keeps its allocation
// (tests/audit-s5aa-r20-glide-one-allocation-internals.test.js).

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
// REAL FINDING, NOT FIXED: an account allocated 100% to the glide-controlled
// class ("stocks") with 0% in every other class loses expected return under
// glideOn -- not merely "the glide cannot act" (as tests/return-generation
// .test.js's own comment on this corner case put it), but actively WORSE:
// the freed-up weight vanishes into no asset class at all rather than
// either staying in stocks or moving into bonds/cash, so the reported
// expected return ends up below BOTH the no-glide value (pure stock) AND
// what a correctly-redistributed glide would produce.
// ---------------------------------------------------------------------------

test('B-5 fixed, R20: a 100%-stock, 0%-other account under glideOn glides into bonds, instead of losing return to nowhere', () => {
  // Root cause (now fixed): accountExpected's glide step only rescales
  // each *existing* non-stock weight by otherTarget/otherCurrent. When
  // every non-stock weight starts at exactly 0, there is nothing to
  // rescale into, so bonds/cash weight stays 0 regardless of glide
  // progress. The fix renormalizes the final weighted-return sum by the
  // actual post-glide weight total (mirroring accountVolatility, which
  // already did this) -- so the surviving 0.2 stock weight, divided by a
  // weight total of 0.2, correctly reduces to "100% of this account's
  // return comes from stock," i.e. exactly the no-glide value. The glide
  // genuinely cannot de-risk a class the account never held, and now says
  // so honestly instead of returning a below-both-extremes number.
  const p = planFor({
    profile: { age: 60, retireAge: 65 }, // 5 years to retirement
    advanced: {
      assetsOn: true, glideOn: true, retirementStock: 20, // glide target: 20% stock at retirement
      assetClasses: [{ id: 'stocks', returnRate: 10 }, { id: 'bonds', returnRate: 4 }, { id: 'cash', returnRate: 2 }],
    },
  });
  const account = { allocation: { stocks: 100, bonds: 0, cash: 0 } };
  // At the target: 20% stock at 10%, 80% bonds at 4% -> 0.2*0.10 + 0.8*0.04 = 0.052. Not the 0.02 of weight lost to
  // nowhere, and no longer the all-stock 0.10 the 2026-09-09 repair kept.
  const atRetirement = engine.accountExpected(account, p, 5, null); // yearProgress=5 of 5 -> full glide progress
  assert.ok(Math.abs(atRetirement - 0.052) < 1e-9, `expected the 20/80 stock/bond blend 0.052 -- got ${atRetirement}`);
});

test('B-5 fixed, R20, halfway point: the same 100%-stock/0%-other account is halfway to its target, the rest in bonds, not a partial deficit', () => {
  const p = planFor({
    profile: { age: 55, retireAge: 65 }, // 10 years to retirement
    advanced: {
      assetsOn: true, glideOn: true, retirementStock: 20,
      assetClasses: [{ id: 'stocks', returnRate: 10 }, { id: 'bonds', returnRate: 4 }, { id: 'cash', returnRate: 2 }],
    },
  });
  const account = { allocation: { stocks: 100, bonds: 0, cash: 0 } };
  // Halfway (yearProgress 5 of 10): targetStock = 1 + (0.2-1)*0.5 = 0.6, and the 0.4 given up is in bonds:
  // 0.6*0.10 + 0.4*0.04 = 0.076.
  const halfway = engine.accountExpected(account, p, 5, null);
  assert.ok(Math.abs(halfway - 0.076) < 1e-9, `expected 0.076 -- got ${halfway}`);
});

test('a starting allocation with a nonzero (even tiny) weight in every glide-adjacent class does NOT lose weight -- confirms the defect is specific to a starting weight of exactly 0, not glide itself', () => {
  const p = planFor({
    profile: { age: 60, retireAge: 65 },
    advanced: {
      assetsOn: true, glideOn: true, retirementStock: 20,
      assetClasses: [{ id: 'stocks', returnRate: 10 }, { id: 'bonds', returnRate: 4 }],
    },
  });
  // Even a token 1% starting bond weight is enough for the rescale to have
  // something nonzero to work with, so bonds correctly absorbs the freed
  // capital instead of it vanishing.
  const account = { allocation: { stocks: 99, bonds: 1 } };
  const result = engine.accountExpected(account, p, 5, null); // full progress
  const expectedIfWorkingCorrectly = 0.2 * 0.10 + 0.8 * 0.04; // 100% of the "other" bucket now correctly lands in bonds
  assert.ok(Math.abs(result - expectedIfWorkingCorrectly) < 1e-9, `with a nonzero starting bond weight, the glide should fully and correctly redistribute into bonds -- got ${result}, expected ${expectedIfWorkingCorrectly}`);
});

// ---------------------------------------------------------------------------
// accountExpected: randomReturn===0 must still short-circuit (0 is a valid
// override, not "no override" -- a naive `if(randomReturn)` check would get
// this wrong)
// ---------------------------------------------------------------------------

test('accountExpected: a supplied randomReturn of exactly 0 still wins over every other calculation (0 is not treated as "no override")', () => {
  const p = planFor({ advanced: { assetsOn: true, assetClasses: [{ id: 'stocks', returnRate: 10 }] } });
  assert.equal(engine.accountExpected({ allocation: { stocks: 100 } }, p, 0, 0), 0);
});

// ---------------------------------------------------------------------------
// accountExpected: glideOn at yearsTo===0 (already at or past retireAge)
// jumps straight to the target weight regardless of yearProgress
// ---------------------------------------------------------------------------

test('accountExpected: glideOn with age already at retireAge (yearsTo=0) snaps directly to the target stock weight, ignoring yearProgress entirely', () => {
  const p = planFor({
    profile: { age: 65, retireAge: 65 }, // already at retirement -> yearsTo = 0
    advanced: { assetsOn: true, glideOn: true, retirementStock: 30, assetClasses: [{ id: 'stocks', returnRate: 10 }, { id: 'bonds', returnRate: 4 }] },
  });
  const account = { allocation: { stocks: 80, bonds: 20 } };
  const expected = 0.30 * 0.10 + 0.70 * 0.04; // fully at the 30/70 target
  // Pass a yearProgress that would mean "barely started" if yearsTo were
  // nonzero -- must not matter, since yearsTo=0 forces progress=1 directly.
  assert.ok(Math.abs(engine.accountExpected(account, p, 0.001, null) - expected) < 1e-9);
});

// ---------------------------------------------------------------------------
// accountVolatility: a zero-total allocation falls back to the flat
// plan-level volatility, and correlation=-1 can drive blended volatility
// to exactly 0 for an offsetting two-asset mix
// ---------------------------------------------------------------------------

test('accountVolatility: an allocation summing to exactly 0 (every class explicitly 0, not just absent) falls back to the flat plan-level volatility', () => {
  const p = planFor({ assumptions: { volatility: 22 }, advanced: { assetsOn: true, assetClasses: [{ id: 'stocks', volatility: 18 }, { id: 'bonds', volatility: 7 }] } });
  const account = { allocation: { stocks: 0, bonds: 0 } };
  assert.ok(Math.abs(engine.accountVolatility(account, p) - 0.22) < 1e-9);
});

test('accountVolatility: perfect negative correlation (-1) between two equally-weighted-by-risk asset classes drives blended volatility to exactly 0', () => {
  const p = planFor({ advanced: {
    assetsOn: true, correlation: -1,
    assetClasses: [{ id: 'stocks', volatility: 20 }, { id: 'bonds', volatility: 20 }],
  } });
  // Equal weights (50/50) and equal volatility means w1*v1 === w2*v2
  // exactly, so a -1 correlation cancels the variance completely.
  const account = { allocation: { stocks: 50, bonds: 50 } };
  const result = engine.accountVolatility(account, p);
  assert.ok(Math.abs(result - 0) < 1e-9, `perfectly offsetting -1-correlated equal exposures should cancel to 0 volatility -- got ${result}`);
});

// ---------------------------------------------------------------------------
// accountReturnForPeriod: bondTentOn's exact 5-year strength cutoff, and
// reserveOn's exact age===retireAge boundary
// ---------------------------------------------------------------------------

test('accountReturnForPeriod: bondTentOn strength is exactly 0 at precisely 5 years from retireAge (the boundary), and still positive one tick inside it', () => {
  const p = planFor({
    profile: { age: 60, retireAge: 65 }, // exactly 5 years away
    assumptions: { method: 'simple', returnRate: 10, fee: 0 },
    advanced: { bondTentOn: true, bondTent: 100 },
  });
  const ac = { balance: 100000, allocation: {} };
  assert.ok(Math.abs(engine.accountReturnForPeriod(ac, p, 60, 0, 0, null, 100000) - 0.10) < 1e-9, 'exactly 5 years out, strength must be 0 -- no bond-tent blend at all, pure 10% return');

  const pInside = planFor({
    profile: { age: 60.001, retireAge: 65 }, // just inside 5 years
    assumptions: { method: 'simple', returnRate: 10, fee: 0 },
    advanced: { bondTentOn: true, bondTent: 100 },
  });
  const justInside = engine.accountReturnForPeriod(ac, pInside, 60.001, 0, 0, null, 100000);
  assert.notEqual(justInside, 0.10, 'one tick inside the 5-year window, some (small) bond-tent blend must already apply');
});

test('accountReturnForPeriod: reserveOn applies exactly at age===retireAge (">="), the boundary neither of the existing L2 tests pinned down precisely', () => {
  const p = planFor({
    profile: { age: 65, retireAge: 65 }, // exactly at retirement
    assumptions: { method: 'simple', returnRate: 10, fee: 0 },
    retirement: { spending: 40000 },
    advanced: { reserveOn: true, reserveYears: 2 }, // reserve target = 80000
  });
  const ac = { balance: 80000, allocation: {} };
  const portfolioTotal = 200000;
  const share = 80000 / portfolioTotal;
  const expected = 0.10 * (1 - share) + 0.03 * share;
  assert.ok(Math.abs(engine.accountReturnForPeriod(ac, p, 65, 0, 0, null, portfolioTotal) - expected) < 1e-9, 'exactly at retireAge, the reserve blend must already apply, not wait one more year');
});
