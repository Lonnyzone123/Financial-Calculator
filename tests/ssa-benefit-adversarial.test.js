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

test('ssaBenefitAtClaim: the reduction-tier boundary is exact -- 36 months early uses only the first tier; 37 months early blends in exactly one month of the second tier', () => {
  const at36 = { retirement: { ssBenefit: 3000, ssClaim: 64, ssFra: 67, ssAdvanced: false, aime: 0, spouseSS: 0, spouseClaim: 67 } };
  const factor36 = 1 - 36 * RULES.socialSecurity.earlyReduction.first36MonthlyPercent;
  assert.ok(Math.abs(engine.ssaBenefitAtClaim(at36, 'self') - 3000 * factor36 * 12) < 1e-6);

  // 37 months early: fra=67, claim = 67 - 37/12
  const claim37 = 67 - 37 / 12;
  const at37 = { retirement: { ssBenefit: 3000, ssClaim: claim37, ssFra: 67, ssAdvanced: false, aime: 0, spouseSS: 0, spouseClaim: 67 } };
  const factor37 = 1 - 36 * RULES.socialSecurity.earlyReduction.first36MonthlyPercent - 1 * RULES.socialSecurity.earlyReduction.laterMonthlyPercent;
  assert.ok(Math.abs(engine.ssaBenefitAtClaim(at37, 'self') - 3000 * factor37 * 12) < 1e-6, 'the 37th month must use the smaller later-tier rate, not the first-tier rate again');
});

test('ssaBenefitAtClaim: a claim far enough below FRA that the raw reduction factor would go negative is floored at exactly 0, not a negative benefit', () => {
  /* Since 2026-09-14 a claim age is credited no earlier than 62, so an absurd claim age no longer reaches a negative
     raw factor. The earliest credited claim, 62, against a full retirement age far above it still does. */
  const p = { retirement: { ssBenefit: 3000, ssClaim: 62, ssFra: 100, ssAdvanced: false, aime: 0, spouseSS: 0, spouseClaim: 67 } };
  const months = Math.round((100 - 62) * 12); // 456 months early
  const rawFactor = 1 - 36 * RULES.socialSecurity.earlyReduction.first36MonthlyPercent - (months - 36) * RULES.socialSecurity.earlyReduction.laterMonthlyPercent;
  assert.ok(rawFactor < 0, 'test assumption: this claim genuinely drives the raw factor negative');
  assert.equal(engine.ssaBenefitAtClaim(p, 'self'), 0, 'the final Math.max(0, ...) must floor the benefit at exactly 0, not a negative annual benefit');
});

test('ssaBenefitAtClaim: half-year claim ages (the app\'s own age convention) round to the nearest whole month, not truncate', () => {
  // fra - claim = 0.5 years exactly -> Math.round(0.5*12) = Math.round(6) = 6 months early, unambiguous.
  const p = { retirement: { ssBenefit: 3000, ssClaim: 66.5, ssFra: 67, ssAdvanced: false, aime: 0, spouseSS: 0, spouseClaim: 67 } };
  const factor = 1 - 6 * RULES.socialSecurity.earlyReduction.first36MonthlyPercent;
  assert.ok(Math.abs(engine.ssaBenefitAtClaim(p, 'self') - 3000 * factor * 12) < 1e-6);
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
  const expectedBase = 0.9 * bend1; // aime===bend1 exactly -> the min(a,b1) term caps at bend1, and max(0,min(a,b2)-b1) is exactly 0
  assert.ok(Math.abs(engine.ssaBenefitAtClaim(p, 'self') - expectedBase * 12) < 1e-6);
});
