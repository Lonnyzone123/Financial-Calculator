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
const SSA = require('./lib/ssa-reference.js');

/* RE-FIXTURED BY INTENT at S5AA R34 (the owner 2026-09-29: "Follow law everywhere"). What moved, and why:
 *   - SA32F-05: full retirement age comes from the birth year. The self at 68 was born 1958 (66 and 8 months); at 72, 1954 (66).
 *     A survivor reads the year two later (20 CFR 404.409): born 1958, 66 and 4 months.
 *   - R32V-03: the PIA is rounded to the dime and each monthly benefit to the dollar (404.212(c), 404.304(f)).
 *   - SA32F-03: a partner who has filed receives the spouse's benefit, half the other's PIA less their own, once the other has filed
 *     too (404.330); the R2-004 fixtures' zero-benefit partner therefore draws $500 a month from the later of the two filings.
 *   - SA32F-02 (with SA32F-01): a survivor's benefit does not require the deceased to have filed. It is the deceased's PIA plus the delayed credits
 *     they had earned by the death (404.338, 404.313(e)), so R2-003(b)'s "no posthumous claim" premise was the defect, and it is
 *     inverted below with its probes kept.
 * Every expectation is worked with tests/lib/ssa-reference.js, never read back from the engine. */
const SELF68_OWN = SSA.floorDollar(1000 * SSA.claimFactor(67.5, SSA.fra(68))) * 12;   /* 10 months of credit: 1,066 a month, 12,792 */
const SPOUSAL_EXCESS = 500 * 12;                                                     /* half of a 1,000 PIA, past full retirement age */
const SELF68_ONE_COLA = SSA.floorDollar(SSA.colaPia(1000, 0.10, 1) * SSA.claimFactor(67.5, SSA.fra(68))) * 12; /* 1,173 a month */

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
  /* The spouse's claim at 68.5 now starts the spouse's benefit on the self's record for the half row left -- 3,000 -- and nothing
     else: the self's own 12,792 is unmoved, where a COLA tick would have added (1,173 - 1,066) x 12 x 0.5 more. */
  const outside = engine.householdSocialSecurityForPeriod(colaIsolationPlan(69.5), 68, 69, 68, 0);
  const inside = engine.householdSocialSecurityForPeriod(colaIsolationPlan(68.5), 68, 69, 68, 0);
  assert.equal(outside, SELF68_OWN, 'the unsplit control must be the self\'s own 12,792, got ' + outside);
  assert.ok(Math.abs(inside - (SELF68_OWN + SPOUSAL_EXCESS * 0.5)) < 1e-6,
    'an unrelated spouse event accelerated the self\'s COLA: expected ' + (SELF68_OWN + SPOUSAL_EXCESS * 0.5) + ', got ' + inside);
});

test('R2-004: the self\'s benefit is invariant across EVERY placement of the unrelated spouse claim inside the row, not just the audit\'s one example', () => {
  const control = engine.householdSocialSecurityForPeriod(colaIsolationPlan(69.5), 68, 69, 68, 0);
  assert.equal(control, SELF68_OWN);
  for (const spouseClaim of [68.1, 68.25, 68.5, 68.75, 68.9]) {
    const actual = engine.householdSocialSecurityForPeriod(colaIsolationPlan(spouseClaim), 68, 69, 68, 0);
    const expected = SELF68_OWN + SPOUSAL_EXCESS * (69 - spouseClaim);   // the self's part never moves; the spouse's runs from the claim
    assert.ok(Math.abs(actual - expected) < 1e-6,
      'spouse claim at ' + spouseClaim + ' gave ' + actual + ', expected ' + expected + ' -- anything else moved the self\'s benefit');
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
  assert.equal(outside, SELF68_OWN, 'the reversed unsplit control must also be 12,792, got ' + outside);
  assert.ok(Math.abs(inside - (outside + SPOUSAL_EXCESS * 0.5)) < 1e-6,
    'an unrelated self event accelerated the spouse\'s COLA: ' + inside + ' vs control ' + outside + ' plus the self\'s half-row spouse\'s benefit');
});

test('R2-004 (zero-COLA control): with COLA switched off the two variants were already equal -- this proves the defect is specifically the COLA clock', () => {
  function zeroCola(spouseClaim) {
    const p = colaIsolationPlan(spouseClaim);
    p.retirement.ssCola = 0;
    return p;
  }
  const outside = engine.householdSocialSecurityForPeriod(zeroCola(69.5), 68, 69, 68, 0);
  const inside = engine.householdSocialSecurityForPeriod(zeroCola(68.5), 68, 69, 68, 0);
  assert.equal(outside, SELF68_OWN);
  assert.ok(Math.abs(inside - (SELF68_OWN + SPOUSAL_EXCESS * 0.5)) < 1e-6);
});

test('R2-004 (no-spouse control): a single-person household is unaffected in either direction', () => {
  const p = planFor({
    profile: { age: 68, spouseAge: 68, spouseOn: false },
    retirement: { ssClaim: 67.5, ssFra: 67, ssBenefit: 1000, ssCola: 10, survivor: false, selfLife: 95 },
  });
  assert.equal(engine.householdSocialSecurityForPeriod(p, 68, 69, 68, 0), SELF68_OWN);
});

test('R2-004: COLA still accrues normally across rows -- isolating it from segmentation must not freeze it', () => {
  const p = colaIsolationPlan(69.5);
  // Row 68-69 sits 0 whole years past the 67.5 claim; row 69-70 sits 1.
  const first = engine.householdSocialSecurityForPeriod(p, 68, 69, 68, 0);
  const second = engine.householdSocialSecurityForPeriod(p, 69, 70, 69, 0);
  assert.equal(first, SELF68_OWN);
  /* The spouse files at 69.5, inside this row: half of the COLA-increased 1,100 PIA, 550 a month, for the half row left. */
  const expected = SELF68_ONE_COLA + SSA.floorDollar(SSA.colaPia(1000, 0.10, 1) / 2) * 12 * 0.5;
  assert.ok(Math.abs(second - expected) < 1e-9,
    'the second row should carry exactly one 10% COLA step (' + expected + ': the PIA to 1,100.00, 1,173 a month, and the spouse\'s 3,300), got ' + second);
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
/* R34: the self at 72 was born 1954 (full retirement age 66) and filed at 67 -- 12 months of credit, 3,240 a month; that is the
   benefit the survivor inherits. A survivor's full retirement age is read two birth years on, so it depends on the survivor's age. */
const DECEASED_BENEFIT = SSA.floorDollar(3000 * SSA.claimFactor(67, SSA.fra(72)));   /* 3,240 */
const survivorAnnual = (survivorAgeNow, widowedAt, original) =>
  SSA.floorDollar((original || DECEASED_BENEFIT) * SSA.survivorFactor(Math.max(60, widowedAt), SSA.survivorFra(survivorAgeNow))) * 12;
const REDUCED_FROM_66 = survivorAnnual(68, 66);   /* 66 and 4 months: 4 of 76 months early, 3,191 a month -- 38,292 */
const REDUCED_FROM_65 = survivorAnnual(67, 65);   /* 66 and 6 months: 18 of 78 months early, 3,026 -- 36,312 */
const REDUCED_FROM_64 = survivorAnnual(66, 64);   /* 66 and 8 months: 32 of 80 months early, 2,870 -- 34,440 */
const SPOUSE68_OWN = SSA.floorDollar(1000 * SSA.claimFactor(67, SSA.fra(68))) * 12;   /* 4 months of credit: 1,026 a month, 12,312 */

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

test('R2-003(b) (superseded by S5AA R34, SA32F-02): a person who died BEFORE filing still leaves a survivor benefit -- on their PIA', () => {
  /* THIS TEST'S PREMISE WAS THE DEFECT. A widow(er)'s benefit is payable on the record of a worker who died fully insured
     (20 CFR 404.335); it does not ask whether the worker filed. The self died at 65, before full retirement age 66, so there
     are no delayed credits: the original benefit is the PIA, 3,000. The spouse was widowed at 61, which starts the benefit, 64 of
     76 months before their survivor full retirement age: 24% off, 2,280 a month, above their own 1,026. */
  const paid = engine.householdSocialSecurityForPeriod(survivorPlan(68, { retirement: { selfLife: 65 } }), 72, 73, 68, 0);
  assert.equal(paid, survivorAnnual(68, 61, 3000), 'expected 27,360, got ' + paid);
  assert.ok(paid > SPOUSE68_OWN, 'and it is more than the survivor\'s own benefit');
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
  assert.equal(engine.householdSocialSecurityForPeriod(reversedSurvivor(68, 67, 65), 68, 69, 72, 0), survivorAnnual(68, 61, 3000),
    'the reversed case: a spouse who died before filing leaves the same survivor benefit on their PIA (R34, SA32F-02)');
});

test('R2-003 (both alive): ordinary both-alive payment is unchanged -- each person is simply paid their own benefit', () => {
  const p = survivorPlan(68, { retirement: { selfLife: 95 } });
  const paid = engine.householdSocialSecurityForPeriod(p, 72, 73, 68, 0);
  /* R34: 38,880 + 12,312, and the spouse's benefit on the self's record -- half of 3,000 less the spouse's own 1,000 PIA, 500 a month,
     unreduced past full retirement age (SA32F-03). */
  assert.equal(paid, DECEASED_BENEFIT * 12 + SPOUSE68_OWN + 6000, 'both alive and claimed should pay 38,880 + 12,312 + 6,000; got ' + paid);
});

test('R2-003 (survivor off): with survivor mode disabled a deceased person simply stops being paid -- no survivor transfer at all', () => {
  const p = survivorPlan(68, { retirement: { survivor: false } });
  const paid = engine.householdSocialSecurityForPeriod(p, 72, 73, 68, 0);
  assert.equal(paid, SPOUSE68_OWN, 'only the living spouse\'s own benefit should be paid; got ' + paid);
});

test('R2-003 (mid-row death segmentation preserved): a death partway through a row still pays the pre-death amounts before it and the survivor amount after', () => {
  // Self dies at 72.5, mid-row. Both are past their claim ages.
  const p = survivorPlan(68, { retirement: { selfLife: 72.5 } });
  const paid = engine.householdSocialSecurityForPeriod(p, 72, 73, 68, 0);
  // First half: both alive and claimed -> (38,880 + 12,312 + 6,000) * 0.5 = 28,596.
  // Second half: widowed at 68.5, past their survivor full retirement age 66 and 4 months -> 38,880 * 0.5 = 19,440.
  const expected = (DECEASED_BENEFIT * 12 + SPOUSE68_OWN + 6000) * 0.5 + survivorAnnual(68, 68.5) * 0.5;
  assert.equal(paid, expected,
    'the accepted mid-death segmentation fix must be preserved: expected ' + expected + ', got ' + paid);
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
  /* R34: 66.999 is a 1960 birth, survivor full retirement age 66 and 8 months. */
  assert.ok(Math.abs(justInside - survivorAnnual(66.999, 64.999)) < 1e-6,
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

test('R2-003 (claim/death coincide) (superseded by S5AA R34, SA32F-02): a person who dies at their claim age leaves their benefit with the credits earned', () => {
  /* The old premise (nothing to pass on) was the defect. Dying at 67 unfiled, the self had earned 12 months of delayed credit past
     full retirement age 66 (404.313(e)): 3,240, the same as filing. Widowed at 63: 40 of 76 months early, 15% off, 2,754 a month. */
  const paid = engine.householdSocialSecurityForPeriod(survivorPlan(68, { retirement: { selfLife: 67 } }), 72, 73, 68, 0);
  assert.equal(paid, survivorAnnual(68, 63), 'expected 33,048, got ' + paid);
});
