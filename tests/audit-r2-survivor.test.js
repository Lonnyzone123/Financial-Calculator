'use strict';

/**
 * R2-T03 -- RESTORE SS ELIGIBILITY (R2-003) AND ISOLATE COLA FROM PAYMENT
 * SEGMENTATION (R2-004).
 *
 * Both findings are regressions introduced by T04's survivor repair
 * (AUD-002), and both are the SAME structural mistake seen from opposite
 * sides. householdSocialSecurityForPeriod() splits a row into
 * sub-intervals at every claim-age and death-age crossing for EITHER
 * spouse, then recomputes everything per sub-interval. A row split exists
 * to answer one question -- who is paid, and for how long -- and was being
 * made to answer two others it has no business answering:
 *
 *   R2-004 (the AMOUNT axis). growthFromCola() floors elapsed whole years
 *   since claim, and was evaluated at each segment's start. A boundary
 *   introduced by the SPOUSE therefore ticks the SELF's COLA counter over.
 *   The audit's direct helper comparison: both age 68, row 68-69, self
 *   claims at 67.5 with FRA 67 and $1,000/month, 10% COLA, survivor off,
 *   spouse benefit zero. Spouse claim 69.5 yields $12,480; changing ONLY
 *   the spouse's claim age to 68.5 yields $13,104 -- an unexplained $624
 *   increase driven entirely by an event that cannot affect the self.
 *
 *   R2-003 (the ELIGIBILITY axis). The survivor branch checks only who is
 *   alive and then pays max(selfAmount, spouseAmount). Two separate holes:
 *     (a) the recipient's own claim gate was dropped, so a 50-year-old
 *         spouse whose claim age is 67 collects a survivor benefit 17
 *         years early;
 *     (b) entitlement is tested by comparing an ADVANCING segment age with
 *         a claim age, with nothing establishing that a claim existed
 *         before death -- so a person who died at 65 with a scheduled
 *         claim age of 67 acquires a posthumous claim at 67.
 *
 * FIX BOUNDARY, per the audit and per ROADMAP ground rule 8. This repair
 * restores the NARROW prior boundary. It does not invent survivor
 * eligibility policy: the recipient gate keys on whether the recipient has
 * reached their OWN selected claim age, which is the project's previously
 * accepted behavior, and deliberately NOT on whether they have a nonzero
 * own benefit -- that distinction is exactly what separates the age-50
 * case (zero) from the zero-own-benefit-but-past-claim-age case (paid).
 * Claim ages, FRA factors, the simplified larger-benefit rule, historical
 * COLA lookup and mid-death payment durations are all untouched.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

function planFor(overrides) {
  overrides = overrides || {};
  const p = JSON.parse(JSON.stringify(defaultPlan));
  Object.assign(p.profile, overrides.profile || {});
  Object.assign(p.retirement, overrides.retirement || {});
  Object.assign(p.assumptions, overrides.assumptions || {});
  return p;
}

// =====================================================================
// R2-004 -- COLA must not be recalculated by an unrelated spouse event.
// =====================================================================

/** The audit's exact configuration. `spouseClaim` is the only thing that
 *  varies between the two variants, and the spouse's own benefit is zero,
 *  so the spouse contributes nothing to the household total either way. */
function colaIsolationPlan(spouseClaim) {
  return planFor({
    profile: { age: 68, spouseAge: 68, spouseOn: true },
    retirement: {
      ssClaim: 67.5, ssFra: 67, ssBenefit: 1000, ssCola: 10, survivor: false,
      spouseSS: 0, spouseClaim: spouseClaim, selfLife: 95, spouseLife: 95,
    },
  });
}

test('R2-004: a spouse claim date OUTSIDE the row and one INSIDE it produce the same self benefit -- $12,480 either way, on the preserved row clock', () => {
  // 69.5 falls outside the 68-69 row, so no split occurs; 68.5 falls
  // inside it and splits the row. Neither can affect the self's benefit.
  const outside = engine.householdSocialSecurityForPeriod(colaIsolationPlan(69.5), 68, 69, 68, 0);
  const inside = engine.householdSocialSecurityForPeriod(colaIsolationPlan(68.5), 68, 69, 68, 0);
  assert.equal(outside, 12480, 'the unsplit control must be the audit\'s $12,480, got ' + outside);
  assert.equal(inside, 12480,
    'an unrelated spouse event accelerated the self\'s COLA: expected 12480, got ' + inside +
    ' (a $' + (inside - 12480) + ' unexplained increase)');
});

test('R2-004: the self\'s benefit is invariant across EVERY placement of the unrelated spouse claim inside the row, not just the audit\'s one example', () => {
  const control = engine.householdSocialSecurityForPeriod(colaIsolationPlan(69.5), 68, 69, 68, 0);
  for (const spouseClaim of [68.1, 68.25, 68.5, 68.75, 68.9]) {
    const actual = engine.householdSocialSecurityForPeriod(colaIsolationPlan(spouseClaim), 68, 69, 68, 0);
    assert.equal(actual, control,
      'spouse claim at ' + spouseClaim + ' moved the self benefit to ' + actual + ' (control ' + control + ')');
  }
});

test('R2-004 (symmetry): the reversed case must hold too -- an unrelated SELF claim date cannot accelerate the SPOUSE\'s COLA', () => {
  function reversed(selfClaim) {
    return planFor({
      profile: { age: 68, spouseAge: 68, spouseOn: true },
      retirement: {
        ssClaim: selfClaim, ssFra: 67, ssBenefit: 0, ssCola: 10, survivor: false,
        spouseSS: 1000, spouseClaim: 67.5, selfLife: 95, spouseLife: 95,
      },
    });
  }
  const outside = engine.householdSocialSecurityForPeriod(reversed(69.5), 68, 69, 68, 0);
  const inside = engine.householdSocialSecurityForPeriod(reversed(68.5), 68, 69, 68, 0);
  assert.equal(outside, 12480, 'the reversed unsplit control must also be $12,480, got ' + outside);
  assert.equal(inside, outside,
    'an unrelated self event accelerated the spouse\'s COLA: ' + inside + ' vs control ' + outside);
});

test('R2-004 (zero-COLA control): with COLA switched off the two variants were already equal -- this proves the defect is specifically the COLA clock', () => {
  function zeroCola(spouseClaim) {
    const p = colaIsolationPlan(spouseClaim);
    p.retirement.ssCola = 0;
    return p;
  }
  const outside = engine.householdSocialSecurityForPeriod(zeroCola(69.5), 68, 69, 68, 0);
  const inside = engine.householdSocialSecurityForPeriod(zeroCola(68.5), 68, 69, 68, 0);
  assert.equal(outside, 12480);
  assert.equal(inside, 12480);
});

test('R2-004 (no-spouse control): a single-person household is unaffected in either direction', () => {
  const p = planFor({
    profile: { age: 68, spouseAge: 68, spouseOn: false },
    retirement: { ssClaim: 67.5, ssFra: 67, ssBenefit: 1000, ssCola: 10, survivor: false, selfLife: 95 },
  });
  assert.equal(engine.householdSocialSecurityForPeriod(p, 68, 69, 68, 0), 12480);
});

test('R2-004: COLA still accrues normally across rows -- isolating it from segmentation must not freeze it', () => {
  const p = colaIsolationPlan(69.5);
  // Row 68-69 sits 0 whole years past the 67.5 claim; row 69-70 sits 1.
  const first = engine.householdSocialSecurityForPeriod(p, 68, 69, 68, 0);
  const second = engine.householdSocialSecurityForPeriod(p, 69, 70, 69, 0);
  assert.equal(first, 12480);
  assert.ok(Math.abs(second - 12480 * 1.10) < 1e-9,
    'the second row should carry exactly one 10% COLA step (' + (12480 * 1.10) + '), got ' + second);
});

// =====================================================================
// R2-003 -- restore the recipient claim gate; no posthumous claims.
// =====================================================================

/** The audit's exact configuration: self claimed at 67 with a $3,000/month
 *  benefit and died at 70; the surviving spouse has a $1,000/month own
 *  benefit and a claim age of 67. Only the spouse's CURRENT age varies. */
/* S5AA task 4.7 (Q92, F6) REDUCES A SURVIVOR BENEFIT FOR THE AGE IT STARTS AT, and these fixtures
   widow their survivor at spouseAge - 2 (the self is 72 and died at 70). The factor is
   1 - 0.285 * (months before survivor full retirement age) / 84. Written out, not read back from the
   engine, so each remains an independent assertion. */
const REDUCED_FROM_66 = 36000 * (1 - 0.285 * 12 / 84);   /* 34534.285714285714 */
const REDUCED_FROM_65 = 36000 * (1 - 0.285 * 24 / 84);   /* 33068.571428571428 */
const REDUCED_FROM_64 = 36000 * (1 - 0.285 * 36 / 84);   /* 31602.857142857145 */

function survivorPlan(spouseAgeNow, overrides) {
  return planFor({
    profile: { age: 72, spouseAge: spouseAgeNow, spouseOn: true },
    retirement: Object.assign({
      survivor: true, ssClaim: 67, ssFra: 67, ssBenefit: 3000, ssCola: 0,
      selfLife: 70, spouseSS: 1000, spouseClaim: 67, spouseLife: 95,
    }, (overrides || {}).retirement || {}),
  });
}

test('R2-003(a): a 50-year-old survivor whose own claim age is 67 receives NOTHING -- the recipient claim gate is restored', () => {
  const paid = engine.householdSocialSecurityForPeriod(survivorPlan(50), 72, 73, 50, 0);
  assert.equal(paid, 0,
    'the survivor collected a benefit 17 years before their own claim age: got ' + paid);
});

test('R2-003: a survivor who HAS reached their own claim age still receives the larger benefit -- $36,000, the deceased\'s established amount', () => {
  const paid = engine.householdSocialSecurityForPeriod(survivorPlan(68), 72, 73, 68, 0);
  assert.ok(Math.abs(paid - REDUCED_FROM_66) < 1e-6,
    'the both-claimed survivor case is an accepted T04 fix and must be preserved -- the SELECTION of the '
    + 'larger benefit is the claim, and it holds; only the amount is now reduced for a survivor widowed at '
    + '66. expected ' + REDUCED_FROM_66 + ', got ' + paid);
});

test('R2-003: a ZERO-own-benefit survivor already past their selected claim age still receives the larger benefit -- the gate keys on reaching the claim age, NOT on having an own benefit', () => {
  const paid = engine.householdSocialSecurityForPeriod(survivorPlan(68, { retirement: { spouseSS: 0 } }), 72, 73, 68, 0);
  assert.ok(Math.abs(paid - REDUCED_FROM_66) < 1e-6,
    'a survivor with no benefit of their own must still receive the deceased\'s established benefit, now '
    + 'reduced for having been widowed at 66; got ' + paid);
});

test('R2-003(b): a person who died BEFORE their scheduled claim age acquires no posthumous claim -- the survivor gets their own $12,000, not the deceased\'s never-established $36,000', () => {
  const paid = engine.householdSocialSecurityForPeriod(survivorPlan(68, { retirement: { selfLife: 65 } }), 72, 73, 68, 0);
  assert.equal(paid, 12000,
    'a claim was manufactured for someone who died at 65 with a claim age of 67: expected the survivor\'s own 12000, got ' + paid);
});

test('R2-003 (reversed owners): the same two holes must be closed when it is the SPOUSE who died', () => {
  function reversedSurvivor(selfAgeNow, selfClaim, spouseLife) {
    return planFor({
      profile: { age: selfAgeNow, spouseAge: 72, spouseOn: true },
      retirement: {
        survivor: true, ssClaim: selfClaim, ssFra: 67, ssBenefit: 1000, ssCola: 0,
        selfLife: 95, spouseSS: 3000, spouseClaim: 67, spouseLife: spouseLife,
      },
    });
  }
  // (a) surviving self is 50, own claim age 67 -> nothing.
  assert.equal(engine.householdSocialSecurityForPeriod(reversedSurvivor(50, 67, 70), 50, 51, 72, 0), 0,
    'the reversed 50-year-old survivor case must also pay zero');
  // Control: past their own claim age, they receive the larger benefit.
  /* The spouse died at 70, which is self-age 66, so the surviving SELF is a survivor widowed at 66 --
     the mirror of the case above, and reduced by the same factor. */
  assert.ok(Math.abs(engine.householdSocialSecurityForPeriod(reversedSurvivor(68, 67, 70), 68, 69, 72, 0)
    - REDUCED_FROM_66) < 1e-6,
    'the reversed both-claimed survivor must still receive the larger benefit');
  // (b) spouse died at 65 with a claim age of 67 -> no posthumous claim.
  assert.equal(engine.householdSocialSecurityForPeriod(reversedSurvivor(68, 67, 65), 68, 69, 72, 0), 12000,
    'the reversed posthumous-claim hole must also be closed');
});

test('R2-003 (both alive): ordinary both-alive payment is unchanged -- each person is simply paid their own benefit', () => {
  const p = survivorPlan(68, { retirement: { selfLife: 95 } });
  const paid = engine.householdSocialSecurityForPeriod(p, 72, 73, 68, 0);
  assert.equal(paid, 48000, 'both alive and claimed should pay 36000 + 12000; got ' + paid);
});

test('R2-003 (survivor off): with survivor mode disabled a deceased person simply stops being paid -- no survivor transfer at all', () => {
  const p = survivorPlan(68, { retirement: { survivor: false } });
  const paid = engine.householdSocialSecurityForPeriod(p, 72, 73, 68, 0);
  assert.equal(paid, 12000, 'only the living spouse\'s own benefit should be paid; got ' + paid);
});

test('R2-003 (mid-row death segmentation preserved): a death partway through a row still pays the pre-death amounts before it and the survivor amount after', () => {
  // Self dies at 72.5, mid-row. Both are past their claim ages.
  const p = survivorPlan(68, { retirement: { selfLife: 72.5 } });
  const paid = engine.householdSocialSecurityForPeriod(p, 72, 73, 68, 0);
  // First half: both alive and claimed -> (36000 + 12000) * 0.5 = 24000.
  // Second half: survivor, both past claim age -> 36000 * 0.5 = 18000.
  assert.equal(paid, 42000,
    'the accepted mid-death segmentation fix must be preserved: expected 42000, got ' + paid);
});

test('R2-003 (superseded by S5AA 4.7): the survivor benefit no longer waits for the survivor\'s OWN claim age', () => {
  /* THIS TEST'S PREMISE WAS THE DEFECT. It asserted that a survivor is paid only from their own
     RETIREMENT claim age, and that one who has not reached it is paid NOTHING for the whole row. That
     is exactly F6: a survivor benefit is a different benefit with a different clock, payable from 60.
     S5AA task 4.7 supersedes the premise, so the three probes are kept and what they prove is
     inverted. The zero this test used to require is now the thing that would be wrong.

     The fixture widows the survivor at spouseAge - 2, so all three are ALREADY past 60 and are paid
     for the whole row, each reduced for the age they were widowed at. */
  const at = engine.householdSocialSecurityForPeriod(survivorPlan(67), 72, 73, 67, 0);
  assert.ok(Math.abs(at - REDUCED_FROM_65) < 1e-6,
    'widowed at 65, paid for the whole row at 65\'s reduction; got ' + at);

  const justInside = engine.householdSocialSecurityForPeriod(survivorPlan(66.999), 72, 73, 66.999, 0);
  assert.ok(Math.abs(justInside - 36000 * (1 - 0.285 * (2.001 * 12) / 84)) < 1e-6,
    'widowed at 64.999 -- a thousandth of a year younger, a thousandth more reduced, and STILL the '
    + 'whole row: the own-claim-age sliver that used to cost 0.1% of the year costs nothing now, '
    + 'because it never governed this benefit. got ' + justInside);
  assert.ok(justInside < at, 'a younger widow is reduced more');

  const notYet = engine.householdSocialSecurityForPeriod(survivorPlan(66), 72, 73, 66, 0);
  assert.ok(Math.abs(notYet - REDUCED_FROM_64) < 1e-6,
    'THE DEFECT ITSELF: this row used to pay ZERO because the survivor had not reached their own '
    + 'retirement claim age. Widowed at 64 and now 66, they are owed the whole row at 64\'s '
    + 'reduction; got ' + notYet);
  assert.ok(notYet > 0, 'and above all, not nothing');
});

test('R2-003 (claim/death coincide): a person whose claim age equals their death age established no claim', () => {
  const paid = engine.householdSocialSecurityForPeriod(survivorPlan(68, { retirement: { selfLife: 67 } }), 72, 73, 68, 0);
  assert.equal(paid, 12000,
    'dying at the very moment of claiming establishes no benefit to pass on; got ' + paid);
});
