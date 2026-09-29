'use strict';

// FM-01 (whole-model audit, 2026-09-10) -- P1, live historical-information
// leak.
//
// THE DEFECT. growthFromCola() picks its history year with
//
//     startHistoryIndex + Math.floor(startAge - p.profile.age) + i
//
// `startAge` is whichever person's claim age the caller passed.
// `p.profile.age` is always the SELF's opening age. For a spouse call those
// are two different age scales, so the expression computes the AGE GAP
// BETWEEN TWO PEOPLE and spends it as ELAPSED CALENDAR TIME.
//
// A spouse two years older than the self therefore reads COLA two calendar
// years further down the history than the simulation has actually reached --
// future data reaching an earlier payment.
//
// NOT MERELY A COUNTERFACTUAL. On the shipped COLA data, a household with
// self 65 / spouse 67 claiming at 67 shows a second-period payment of
// $13,044 = $12,000 x 1.087, which is 2022's real COLA applied to a 2021
// payment. The synthetic edit below only isolates it.
//
// THE REPAIR. growthFromCola() takes the OWNER's opening age explicitly, so
// each person's claim offset is measured against their own start while both
// advance on one shared simulation calendar. Not a clamp: capping the bad
// index at the current year would suppress the symptom while still applying
// the wrong past COLA.
//
// Expected values here are computed from HIST_COLA directly in this file,
// never by calling the function under test.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

const HIST_START = 2020;

/* RE-FIXTURED BY INTENT at S5AA R34. (1) SA32F-03: a partner with no benefit of their own now draws the spouse's benefit on the
   other's record once both have filed; these tests isolate the COLA calendar, so that partner files at 70, outside the rows tested.
   (2) SA32F-05 and R32V-03: the benefit holder's factor comes from their birth year, and SSA rounds the PIA to the dime and the
   benefit to the dollar -- expectations are worked with tests/lib/ssa-reference.js. */
const SSA = require('./lib/ssa-reference.js');
function household({ age, spouseAge, selfClaim, spouseClaim, selfBenefit, spouseBenefit }) {
  if (!selfBenefit) selfClaim = 70;
  if (!spouseBenefit) spouseClaim = 70;
  return {
    profile: { filing: 'mfj', state: 'AZ', age, spouseAge, spouseOn: true, retireAge: age, endAge: 95 },
    assumptions: { method: 'historical', historyStart: HIST_START, inflation: 0, returnRate: 0, volatility: 0, fee: 0, seed: 1, runs: 1 },
    retirement: {
      ssBenefit: selfBenefit, ssClaim: selfClaim, ssFra: 67, ssCola: 0,
      spouseSS: spouseBenefit, spouseClaim, ssAdvanced: false, aime: 0,
      survivor: false, selfLife: 95, spouseLife: 95, pension: 0, pensionCola: 0,
      otherIncomes: [],
    },
    advanced: {},
  };
}

function startHistoryFor(p) { return engine.historyIndex(p, 0); }

/** The COLA of the Nth projection year, read straight from the tables. */
function colaOfProjectionYear(p, n) {
  const idx = (startHistoryFor(p) + n) % engine.HIST_RETURNS.length;
  const year = engine.HIST_RETURNS[idx][0];
  const c = engine.HIST_COLA[year];
  return c === undefined ? 0 : c;
}

function withColaOverrides(overrides, fn) {
  const saved = {};
  Object.keys(overrides).forEach((y) => { saved[y] = engine.HIST_COLA[y]; engine.HIST_COLA[y] = overrides[y]; });
  try { return fn(); } finally {
    Object.keys(saved).forEach((y) => {
      if (saved[y] === undefined) delete engine.HIST_COLA[y];
      else engine.HIST_COLA[y] = saved[y];
    });
  }
}

// ---------------------------------------------------------------------------
// 1. The first-failing case: a future COLA must not reach an earlier payment
// ---------------------------------------------------------------------------

test('FM-01: editing a FUTURE year\'s COLA must not change an earlier period\'s payment', () => {
  const make = () => household({ age: 65, spouseAge: 67, selfClaim: 65, spouseClaim: 67, selfBenefit: 0, spouseBenefit: 1000 });
  const sh = startHistoryFor(make());

  // Silence the first two projection years so any movement is unambiguous.
  const base = withColaOverrides({ 2020: 0, 2021: 0, 2022: 0 }, () => ({
    y1: engine.householdSocialSecurityForPeriod(make(), 65, 66, 67, sh),
    y2: engine.householdSocialSecurityForPeriod(make(), 66, 67, 68, sh),
  }));

  const perturbed = withColaOverrides({ 2020: 0, 2021: 0, 2022: 0.10 }, () => ({
    y1: engine.householdSocialSecurityForPeriod(make(), 65, 66, 67, sh),
    y2: engine.householdSocialSecurityForPeriod(make(), 66, 67, 68, sh),
  }));

  assert.equal(perturbed.y1, base.y1, 'the first period must not see a 2022 COLA');
  assert.equal(
    perturbed.y2, base.y2,
    'the 2021 period moved from ' + base.y2 + ' to ' + perturbed.y2 + ' when only 2022 changed -- ' +
    'the spouse is 2 years older than the self, and that age gap is being spent as elapsed calendar time'
  );
});

test('FM-01: on the shipped data, the second period uses the FIRST projection year\'s COLA', () => {
  const p = household({ age: 65, spouseAge: 67, selfClaim: 65, spouseClaim: 67, selfBenefit: 0, spouseBenefit: 1000 });
  const sh = startHistoryFor(p);
  /* The spouse (67, born 1959, full retirement age 66 and 10 months) claimed at 67: two months of delayed credit. */
  const f = SSA.claimFactor(67, SSA.fra(67));
  const expected = SSA.floorDollar(SSA.floorDime(1000 * (1 + colaOfProjectionYear(p, 0))) * f) * 12;

  const actual = engine.householdSocialSecurityForPeriod(p, 66, 67, 68, sh);
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    'expected ' + expected.toFixed(2) + ' (base x the first projection year\'s COLA), got ' + actual.toFixed(2) +
    ' -- 13044.00 would be 2022\'s COLA applied to a 2021 payment'
  );
});

// ---------------------------------------------------------------------------
// 2. Positive control -- observed past COLA MUST still apply
// ---------------------------------------------------------------------------

test('FM-01: an OBSERVED past COLA still moves a later benefit, by exactly one step', () => {
  const make = () => household({ age: 65, spouseAge: 67, selfClaim: 65, spouseClaim: 67, selfBenefit: 0, spouseBenefit: 1000 });
  const sh = startHistoryFor(make());

  const base = withColaOverrides({ 2020: 0, 2021: 0, 2022: 0 }, () =>
    engine.householdSocialSecurityForPeriod(make(), 66, 67, 68, sh));
  const bumped = withColaOverrides({ 2020: 0.10, 2021: 0, 2022: 0 }, () =>
    engine.householdSocialSecurityForPeriod(make(), 66, 67, 68, sh));

  const f = SSA.claimFactor(67, SSA.fra(67));
  assert.ok(Math.abs(base - SSA.floorDollar(1000 * f) * 12) < 1e-9, 'control: zero COLA gives the flat benefit, got ' + base);
  assert.ok(
    Math.abs(bumped - SSA.floorDollar(1100 * f) * 12) < 1e-9,
    'the first projection year\'s COLA must raise the second period to 13200, got ' + bumped +
    ' -- suppressing the leak must not also suppress legitimate indexing'
  );
});

// ---------------------------------------------------------------------------
// 3. The age relationship must not matter at all
// ---------------------------------------------------------------------------

test('FM-01: older spouse, younger spouse and equal ages all index the same calendar', () => {
  // Each household claims exactly at its own opening age, so in every case
  // zero calendar time has elapsed at claim and the second period must apply
  // exactly one projection year of COLA.
  const cases = [
    { label: 'spouse 2 years older', age: 65, spouseAge: 67 },
    { label: 'spouse 2 years younger', age: 67, spouseAge: 65 },
    { label: 'equal ages', age: 66, spouseAge: 66 },
    { label: 'spouse 10 years older', age: 60, spouseAge: 70 },
  ];

  for (const c of cases) {
    const make = () => household({
      age: c.age, spouseAge: c.spouseAge,
      selfClaim: c.age, spouseClaim: c.spouseAge,
      selfBenefit: 0, spouseBenefit: 1000,
    });
    const sh = startHistoryFor(make());
    // The base is derived, not hardcoded (and ssaBenefitAtClaim is already an
    // ANNUAL figure). Claiming at 65 against an FRA of 67
    // reduces the benefit ~13.3%, which is a claim-age adjustment and has
    // nothing to do with the calendar defect under test. Isolating it keeps
    // this test about COLA indexing only.
    const base = engine.ssaBenefitAtClaim(make(), 'spouse');
    assert.ok(base > 0, c.label + ': precondition -- the spouse must actually have a benefit');
    const actual = withColaOverrides({ 2020: 0.10, 2021: 0, 2022: 0, 2023: 0, 2024: 0 }, () =>
      engine.householdSocialSecurityForPeriod(make(), c.age + 1, c.age + 2, c.spouseAge + 1, sh));
    const f = SSA.claimFactor(c.spouseAge, SSA.fra(c.spouseAge));
    assert.equal(base, SSA.floorDollar(1000 * f) * 12, c.label + ': the base at the claim');
    const expected = SSA.floorDollar(SSA.floorDime(1000 * 1.10) * f) * 12;
    assert.ok(
      Math.abs(actual - expected) < 1e-6,
      c.label + ': expected ' + expected.toFixed(2) + ' (base x one projection year at 10%), got ' + actual.toFixed(2)
    );
  }
});

test('FM-01: self and spouse are symmetric -- swapping who holds the benefit changes nothing', () => {
  const sh = startHistoryFor(household({ age: 65, spouseAge: 67, selfClaim: 65, spouseClaim: 67, selfBenefit: 0, spouseBenefit: 1000 }));

  const spouseHolds = withColaOverrides({ 2020: 0.10, 2021: 0, 2022: 0 }, () =>
    engine.householdSocialSecurityForPeriod(
      household({ age: 65, spouseAge: 67, selfClaim: 65, spouseClaim: 67, selfBenefit: 0, spouseBenefit: 1000 }), 66, 67, 68, sh));

  const selfHolds = withColaOverrides({ 2020: 0.10, 2021: 0, 2022: 0 }, () =>
    engine.householdSocialSecurityForPeriod(
      household({ age: 67, spouseAge: 65, selfClaim: 67, spouseClaim: 65, selfBenefit: 1000, spouseBenefit: 0 }), 68, 69, 66, sh));

  assert.ok(Math.abs(spouseHolds - selfHolds) < 1e-9,
    'the same household economics must give the same answer regardless of which partner holds the benefit: ' +
    spouseHolds + ' vs ' + selfHolds);
});

// ---------------------------------------------------------------------------
// 4. growthFromCola directly, including half-year claims
// ---------------------------------------------------------------------------

test('FM-01: growthFromCola measures each owner\'s claim against that owner\'s own opening age', () => {
  const p = household({ age: 65, spouseAge: 67, selfClaim: 65, spouseClaim: 67, selfBenefit: 1000, spouseBenefit: 1000 });
  const sh = startHistoryFor(p);

  withColaOverrides({ 2020: 0.10, 2021: 0.20, 2022: 0.40 }, () => {
    // Self: claims at their own opening age, one year elapsed -> first year only.
    const self = engine.growthFromCola(p, 65, 66, sh, p.profile.age);
    assert.ok(Math.abs(self - 1.10) < 1e-12, 'self after one year should be 1.10, got ' + self);

    // Spouse: also claims at their own opening age, one year elapsed -> the
    // SAME first projection year, despite being two years older.
    const spouse = engine.growthFromCola(p, 67, 68, sh, p.profile.spouseAge);
    assert.ok(Math.abs(spouse - 1.10) < 1e-12, 'spouse after one year should also be 1.10, got ' + spouse);
  });
});

test('FM-01: a half-year claim age accrues whole COLA steps on the owner\'s own clock', () => {
  const p = household({ age: 65, spouseAge: 67.5, selfClaim: 65, spouseClaim: 67.5, selfBenefit: 0, spouseBenefit: 1000 });
  withColaOverrides({ 2020: 0.10, 2021: 0.20, 2022: 0.40 }, () => {
    const sh = startHistoryFor(p);
    // Half a year after claim: no whole year elapsed, no COLA step yet.
    assert.equal(engine.growthFromCola(p, 67.5, 68, sh, p.profile.spouseAge), 1);
    // One and a half years after claim: exactly one step, the FIRST year's.
    const oneStep = engine.growthFromCola(p, 67.5, 69, sh, p.profile.spouseAge);
    assert.ok(Math.abs(oneStep - 1.10) < 1e-12, 'expected one step of the first projection year, got ' + oneStep);
  });
});

// ---------------------------------------------------------------------------
// 5. otherIncomeFor's COLA streams -- the same helper, the same defect
// ---------------------------------------------------------------------------

test('FM-01: a spouse-owned COLA income stream indexes on the spouse\'s own clock', () => {
  const p = household({ age: 65, spouseAge: 70, selfClaim: 65, spouseClaim: 70, selfBenefit: 0, spouseBenefit: 0 });
  p.retirement.otherIncomes = [
    { type: 'recurring', owner: 'spouse', amount: 10000, start: 70, end: 95, growthMode: 'cola', growth: 0 },
  ];
  const sh = startHistoryFor(p);

  const got = withColaOverrides({ 2020: 0.10, 2021: 0, 2022: 0, 2023: 0, 2024: 0, 2025: 0 }, () =>
    engine.otherIncomeFor(p, 66, 67, 1, sh));

  // The spouse starts the stream at their own opening age, so one projection
  // year later exactly one COLA step (the FIRST year's 10%) has accrued.
  assert.ok(
    Math.abs(got.cash - 11000) < 1e-6,
    'expected 11000 after one projection year at 10%, got ' + got.cash +
    ' -- a 5-year age gap must not fast-forward the stream 5 years into the COLA table'
  );
});

// ---------------------------------------------------------------------------
// 6. A claim that predates the projection (documented, see SPRINT_QUESTIONS Q16)
// ---------------------------------------------------------------------------

test('Q16 CLOSED (P1): a pre-projection claim indexes at the CONFIGURED rate, not on borrowed history', () => {
  /* THE RESIDUAL FM-01 LEFT. In historical mode the COLA index offset clamped
     at zero, so a benefit claimed before the projection opens was grown on the
     projection's OWN FIRST HISTORY YEARS -- borrowing later calendar years to
     reconstruct earlier ones, which is FM-01's shape one level down.

     "Just stop growing" was not available. ssaBenefitAtClaim() treats the
     entered figure as an FRA-referenced PIA, and COLA from the claim forward is
     how the model brings it to the current year; an earlier R3 revision tried
     stopping and silently cut a legitimate year of indexing, moving
     golden:rmd-and-roth-conversion by exactly $1,008.

     P1 takes the configured ssCola for pre-projection years -- what simple and
     monteCarlo already use for EVERY year, and well defined for any year. It is
     explicitly INTERIM: the real answer is the actual historical COLA for the
     calendar years the claim implies, and this engine carries no calendar
     anchor at all, so that successor is blocked on a feature, not a fix. */
  const withCola = (ssCola) => {
    const p = household({ age: 65, spouseAge: 67, selfClaim: 65, spouseClaim: 65, selfBenefit: 0, spouseBenefit: 1000 });
    p.retirement.ssCola = ssCola;
    return p;
  };
  /* Spouse claimed at 65; the projection opens with them at 67 -- two
     pre-projection years. The overrides are deliberately extreme, so borrowing
     any of them would be unmissable. */
  const OVERRIDES = { 2020: 0.10, 2021: 0.20, 2022: 0.40 };

  const zero = withCola(0);
  const base = engine.ssaBenefitAtClaim(zero, 'spouse');
  assert.ok(base > 0, 'precondition: the spouse must have a benefit');
  const flat = withColaOverrides(OVERRIDES, () =>
    engine.householdSocialSecurityForPeriod(zero, 65, 66, 67, startHistoryFor(zero)));
  assert.ok(Math.abs(flat - base) < 1e-6,
    'at a configured 0% the two pre-projection years must add nothing; got ' + flat.toFixed(2) +
    ' against ' + base.toFixed(2) + '. Anything larger means history was borrowed.');

  /* THE ASSERTION THAT PINS THE RULE. At 0%, "uses the configured rate" and
     "does not grow at all" are indistinguishable -- the option Q16 rejected
     would pass the check above. A non-zero rate separates them. */
  const three = withCola(3);
  const baseThree = engine.ssaBenefitAtClaim(three, 'spouse');
  const grown = withColaOverrides(OVERRIDES, () =>
    engine.householdSocialSecurityForPeriod(three, 65, 66, 67, startHistoryFor(three)));
  /* RE-FIXTURED BY INTENT at S5AA R34 (R32V-03): two 3% steps on the PIA, each rounded to the dime, then the spouse's factor
     (22 months early against 66 and 10 months), the benefit rounded to the dollar: floor(1,060.90 x 0.87778) = 931 a month. */
  const expected = SSA.floorDollar(SSA.colaPia(1000, 0.03, 2) * SSA.claimFactor(65, SSA.fra(67))) * 12;   // independent oracle
  assert.ok(Math.abs(grown - expected) < 1e-6,
    'two pre-projection years must index at the configured 3% -- expected ' + expected.toFixed(2) +
    ', got ' + grown.toFixed(2));
  assert.ok(grown > baseThree,
    'and it must GROW: stopping the accrual is the option R3 already showed was wrong');
  assert.ok(grown < baseThree * 1.10,
    'but nowhere near the 10/20/40% overrides -- borrowing history is what this closes');
});
