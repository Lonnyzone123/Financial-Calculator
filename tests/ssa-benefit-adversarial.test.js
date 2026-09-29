'use strict';

// Track B, L5 -- adversarial/boundary-exact pass on ssaBenefitAtClaim(),
// following up on tests/rules-derived-functions.test.js's L2 base coverage
// (which pinned the "at FRA", "36 months early", "60 months early", spouse-
// path, and advanced-PIA cases). This file targets what that file didn't:
// the exact 36-vs-37-month tier boundary, the final Math.max(0,...) floor
// for a claim far enough below FRA that the reduction factor would
// otherwise go negative, and the half-year-age rounding the app's own
// convention relies on.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);
const RULES = global.RULES;

const engine = require('../src/engine.js');
const SSA = require('./lib/ssa-reference.js');
/* RE-FIXTURED BY INTENT at S5AA R34 (R32V-03; SA32F-25): exact fractions, SSA's rounding (the PIA to the dime, the benefit to the dollar),
   and a full retirement age that comes from the birth year -- these plans have no profile, so the reading is the 1960+ cohort's 67. */

test('ssaBenefitAtClaim: the reduction-tier boundary is exact -- 36 months early uses only the first tier; 37 months early blends in exactly one month of the second tier', () => {
  const at36 = { retirement: { ssBenefit: 3000, ssClaim: 64, ssFra: 67, ssAdvanced: false, aime: 0, spouseSS: 0, spouseClaim: 67 } };
  assert.equal(engine.ssaBenefitAtClaim(at36, 'self'), SSA.floorDollar(3000 * (1 - 36 * 5 / 900)) * 12);

  // 37 months early: fra=67, claim = 67 - 37/12
  const claim37 = 67 - 37 / 12;
  const at37 = { retirement: { ssBenefit: 3000, ssClaim: claim37, ssFra: 67, ssAdvanced: false, aime: 0, spouseSS: 0, spouseClaim: 67 } };
  assert.equal(engine.ssaBenefitAtClaim(at37, 'self'), SSA.floorDollar(3000 * (1 - 36 * 5 / 900 - 1 * 5 / 1200)) * 12, 'the 37th month must use the smaller later-tier rate, not the first-tier rate again');
});

test('ssaBenefitAtClaim: the deepest reduction the law allows is a claim at 62 against a full retirement age of 67 -- 30% -- and an entered ssFra cannot deepen it', () => {
  /* RE-FIXTURED BY INTENT at S5AA R34 (SA32F-25): this case entered a full retirement age of 100 to drive the factor below zero. Full
     retirement age now comes from the birth year (at most 67), so `ssFra` decides nothing and the deepest reduction is 60 months: 30%. */
  const p = { retirement: { ssBenefit: 3000, ssClaim: 62, ssFra: 100, ssAdvanced: false, aime: 0, spouseSS: 0, spouseClaim: 67 } };
  assert.equal(engine.ssaBenefitAtClaim(p, 'self'), SSA.floorDollar(3000 * 0.7) * 12);
  assert.ok(engine.ssaBenefitAtClaim(p, 'self') > 0, 'never negative');
});

test('ssaBenefitAtClaim: half-year claim ages (the app\'s own age convention) round to the nearest whole month, not truncate', () => {
  // fra - claim = 0.5 years exactly -> Math.round(0.5*12) = Math.round(6) = 6 months early, unambiguous.
  const p = { retirement: { ssBenefit: 3000, ssClaim: 66.5, ssFra: 67, ssAdvanced: false, aime: 0, spouseSS: 0, spouseClaim: 67 } };
  assert.equal(engine.ssaBenefitAtClaim(p, 'self'), SSA.floorDollar(3000 * (1 - 6 * 5 / 900)) * 12);
});

test('ssaBenefitAtClaim: claiming at exactly the latest allowed age (70) applies the full delayed-credit rate for a claim 3 years past a 67 FRA', () => {
  const p = { retirement: { ssBenefit: 3000, ssClaim: RULES.socialSecurity.latestClaimAge, ssFra: 67, ssAdvanced: false, aime: 0, spouseSS: 0, spouseClaim: 67 } };
  const yearsLate = RULES.socialSecurity.latestClaimAge - 67;
  const factor = 1 + yearsLate * RULES.socialSecurity.delayedCreditAnnual;
  assert.ok(Math.abs(engine.ssaBenefitAtClaim(p, 'self') - 3000 * factor * 12) < 1e-6);
});

test('ssaBenefitAtClaim: the advanced PIA/AIME path floors correctly at exactly bend1 (only the first tier rate applies, no second/third tier contribution)', () => {
  const bend1 = RULES.socialSecurity.pia.bend1;
  const p = { retirement: { ssBenefit: 1, ssClaim: 67, ssFra: 67, ssAdvanced: true, aime: bend1, spouseSS: 0, spouseClaim: 67 } };
  const expectedBase = SSA.floorDime(0.9 * bend1); // aime===bend1 exactly -> only the first tier; 1,157.40
  assert.equal(engine.ssaBenefitAtClaim(p, 'self'), SSA.floorDollar(expectedBase) * 12);
});
