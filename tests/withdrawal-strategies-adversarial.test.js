'use strict';

// Track B, L5 -- adversarial/boundary-exact pass on strategySpending(),
// following up on tests/withdrawal-strategies.test.js's L2 base coverage
// (one hand-computable case per strategy plus the two cross-cutting
// modifiers). This file targets the boundaries and degenerate inputs that
// a single representative case per strategy doesn't exercise: the vpw
// near-zero-real-rate branch switch, the rmd/vpw "remaining years" clamp at
// and past endAge, guardrails' balance=0 special-case, a misconfigured
// floor>ceiling clamp, the output floor at exactly 0 under stacked negative
// multipliers, and the survivor/guyton-skip conditions evaluated exactly at
// their boundary rather than clearly inside or outside it. Same posture as
// the Phase 5-8 adversarial passes that found 4 real bugs: prove behavior
// empirically at the boundary rather than only reasoning about the source.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

function planFor(retirementOverrides = {}, profileOverrides = {}, assumptionsOverrides = {}) {
  return {
    retirement: Object.assign({
      strategy: 'fixedNominal', spending: 0, withdrawalRate: 4,
      upperGuardrail: 20, lowerGuardrail: 20, adjustment: 10,
      floor: 0, ceiling: Infinity, guytonSkipInflation: true,
      vpwMinRate: 0, vpwMaxRate: 100, rmdMultiplier: 100, rmdFloor: 0,
      survivor: false, survivorSpendingReduction: 0, selfLife: 95, spouseLife: 95,
      stages: [], flexibility: 0,
    }, retirementOverrides),
    profile: Object.assign({ age: 65, endAge: 95, spouseOn: false, spouseAge: 65 }, profileOverrides),
    assumptions: Object.assign({ returnRate: 7, fee: 0, inflation: 3 }, assumptionsOverrides),
  };
}
function spend(p, args) {
  const { age = 65, balance = 1000000, retireBalance = 1000000, priorSpend = null, priorReturn = 0.05, inflationFactor = 1, annualInflation = 0.03 } = args;
  return engine.strategySpending(p, age, balance, retireBalance, priorSpend, priorReturn, inflationFactor, annualInflation);
}

// ---------------------------------------------------------------------------
// vpw: the |realRate| < 0.00001 branch switch (annuity factor vs. plain
// remaining-years division)
// ---------------------------------------------------------------------------

test('vpw: returnRate exactly equal to inflation (real rate precisely 0) uses plain remaining-years division, not the annuity formula', () => {
  // realRate = (1+(returnRate-fee)/100)/(1+inflation/100) - 1, which is
  // exactly 0 when returnRate-fee === inflation.
  const p = planFor({ strategy: 'vpw' }, { age: 70, endAge: 95 }, { returnRate: 4, fee: 0, inflation: 4 });
  const remaining = 95 - 70; // 25, the remaining modelled duration (R11 round, audit R10-01)
  assert.equal(spend(p, { balance: 260000, age: 70 }), 260000 / remaining);
});

test('vpw: a real rate just outside the +/-0.00001 dead zone uses the annuity formula, and it must diverge from plain division', () => {
  // Pick a small but real annual return spread that pushes realRate just
  // past the 0.00001 threshold either side, so the two formulas would
  // visibly disagree if the branch selection were wrong.
  const pAbove = planFor({ strategy: 'vpw' }, { age: 70, endAge: 95 }, { returnRate: 4.01, fee: 0, inflation: 4 });
  const remaining = 25;
  const plainDivision = 260000 / remaining;
  const annuityResult = spend(pAbove, { balance: 260000, age: 70 });
  assert.notEqual(annuityResult, plainDivision, 'a real rate clearly outside the dead zone must not silently fall back to plain division');
});

test('vpw: min/max rate clamps apply even when the raw annuity/division amount would exceed them', () => {
  const p = planFor({ strategy: 'vpw', vpwMinRate: 2, vpwMaxRate: 3 }, { age: 70, endAge: 95 }, { returnRate: 4, fee: 0, inflation: 4 });
  // Unclamped result would be balance/remaining = 260000/25 = 10400, i.e. a
  // 4% rate -- above vpwMaxRate's 3% ceiling, so it must clamp down.
  assert.equal(spend(p, { balance: 260000, age: 70 }), 260000 * 0.03);
});

// ---------------------------------------------------------------------------
// rmd and vpw: the "remaining years" clamp at and past endAge
// ---------------------------------------------------------------------------

test('rmd: remaining-years denominator is exactly 1 at endAge, and stays clamped at 1 (not 0 or negative) past endAge', () => {
  const atEnd = planFor({ strategy: 'rmd', rmdMultiplier: 100 }, { age: 94, endAge: 95 });
  assert.equal(spend(atEnd, { balance: 100000, age: 94 }), 100000); // remaining = endAge-age = 1 (R11 round, audit R10-01)
  const p = planFor({ strategy: 'rmd', rmdMultiplier: 100 }, { age: 95, endAge: 95 });
  assert.equal(spend(p, { balance: 100000, age: 95 }), 100000); // no duration left at all: the whole year it was clamped to before
  const pastEnd = planFor({ strategy: 'rmd', rmdMultiplier: 100 }, { age: 96, endAge: 95 });
  assert.equal(spend(pastEnd, { balance: 100000, age: 96 }), 100000, 'a denominator that would go to 0 or negative past endAge must clamp to 1, not divide oddly');
});

test('rmd: rmdFloor is scaled by inflationFactor and wins when the computed RMD would be lower', () => {
  const p = planFor({ strategy: 'rmd', rmdFloor: 10000, rmdMultiplier: 100 }, { age: 95, endAge: 95 });
  // Computed RMD off a tiny balance would be far below the floor.
  assert.equal(spend(p, { balance: 100, age: 95, inflationFactor: 1.5 }), 15000);
});

// ---------------------------------------------------------------------------
// guardrails/guyton: the balance<=0 special case (currentRate forced to 9)
// ---------------------------------------------------------------------------

test('guardrails: a balance of exactly 0 forces currentRate to the hardcoded sentinel 9, which always breaches the upper guardrail and cuts spending', () => {
  const p = planFor({ strategy: 'guardrails', withdrawalRate: 4, upperGuardrail: 20, adjustment: 10, floor: 0, ceiling: Infinity });
  // priorSpend non-null so the guardrail-check branch runs (not the
  // year-one anchor); balance 0 means currentRate = amount/0 guarded to 9,
  // clearly above upper = 0.04*1.2 = 0.048, so the upper-cut always fires.
  const priorSpend = 40000;
  const result = spend(p, { balance: 0, priorSpend, annualInflation: 0 });
  assert.ok(Math.abs(result - priorSpend * 0.9) < 1e-9, 'expected the upper-guardrail cut (amount*(1-adjustment/100)) to apply, using the pre-cut amount as its base');
});

// ---------------------------------------------------------------------------
// A misconfigured floor > ceiling. clamp(v,a,b) = min(b, max(a,v)) returns b
// for every v when a > b. This test was added at e5786ae to document that
// consequence of clamp()'s argument order, and it pinned the ceiling as the
// answer. SPRINT_QUESTIONS.md Q51 then recorded it as a defect, and the owner
// decided on 2026-09-13 to swap the pair and disclose the swap. S5 block 2h
// swaps it at the call site, so this test now pins the decided answer with
// the same inputs: the inverted pair behaves exactly as the ordered one. The
// disclosure is runPlan()'s, not strategySpending()'s, and is held by
// tests/audit-q51-q52-bounds-swap.test.js.
// ---------------------------------------------------------------------------

test('floorCeiling: a misconfigured floor greater than ceiling is swapped -- it behaves exactly as the ordered pair, whatever the pre-clamp amount', () => {
  const inverted = planFor({ strategy: 'floorCeiling', withdrawalRate: 50, floor: 100000, ceiling: 1000 });
  const ordered = planFor({ strategy: 'floorCeiling', withdrawalRate: 50, floor: 1000, ceiling: 100000 });
  // Pre-clamp amount (balance*rate) far above both bounds: the larger bound, now the ceiling.
  assert.equal(spend(inverted, { balance: 1000000, inflationFactor: 1 }), 100000,
    'the inverted floor and ceiling did not behave as the ordered pair above both bounds (the old clamp answered 1000)');
  assert.equal(spend(inverted, { balance: 1000000, inflationFactor: 1 }), spend(ordered, { balance: 1000000, inflationFactor: 1 }));
  // Pre-clamp amount far below both: the smaller bound, now the floor.
  assert.equal(spend(inverted, { balance: 1, inflationFactor: 1 }), 1000);
  assert.equal(spend(inverted, { balance: 1, inflationFactor: 1 }), spend(ordered, { balance: 1, inflationFactor: 1 }));
});

// ---------------------------------------------------------------------------
// Output floor: never negative, even when negative multipliers stack
// ---------------------------------------------------------------------------

test('never returns a negative amount when flexibility exceeds 100% (a negative multiplier) stacks with a negative-return year', () => {
  const p = planFor({ strategy: 'fixedNominal', spending: 50000, flexibility: 150 });
  // amount*(1-150/100) = amount*(-0.5), which would be negative without the
  // final Math.max(0, amount) floor.
  assert.equal(spend(p, { priorReturn: -0.1 }), 0);
});

test('constantPercent with a negative balance would go negative pre-floor; the final result is still clamped to exactly 0', () => {
  const p = planFor({ strategy: 'constantPercent', withdrawalRate: 4 });
  assert.equal(spend(p, { balance: -500000 }), 0);
});

// ---------------------------------------------------------------------------
// survivor spending reduction: evaluated exactly at the selfLife/spouseLife
// boundary, where "<" (not "<=") decides who counts as still alive
// ---------------------------------------------------------------------------

/* S5AA R9 round, the owner's decision 7 (2026-09-21): INVERTED. This pinned the strict "<", strategySpending()'s own reading of
   death, under which the row opening at the lifespan was already a survivor year. The engine's one definition,
   householdSurvivorship(), counts a person dead only once the lifespan is BELOW the row's opening age: the row opening at
   the lifespan is the year of death, filed jointly and costed for two, and now spent for two. The boundary moves by one. */
test('survivor (decision 7): age exactly equal to selfLife is the year of death -- the self still counts as alive, no reduction; the next year it applies', () => {
  const p = planFor({ strategy: 'fixedNominal', spending: 50000, survivor: true, survivorSpendingReduction: 30, selfLife: 90, spouseLife: 95 }, { age: 90, spouseOn: true, spouseAge: 90 });
  assert.equal(spend(p, { age: 90 }), 50000, 'selfLife(90) is not below 90: alive in the year of death');
  assert.equal(spend(p, { age: 91 }), 50000 * 0.7, 'selfLife(90) < 91: one survivor, the reduction applies');
});

test('survivor: one age below the selfLife boundary, the self still counts as alive and (with the spouse also alive) both are alive -- no reduction', () => {
  const p = planFor({ strategy: 'fixedNominal', spending: 50000, survivor: true, survivorSpendingReduction: 30, selfLife: 90, spouseLife: 95 }, { age: 89, spouseOn: true, spouseAge: 89 });
  assert.equal(spend(p, { age: 89 }), 50000, 'both spouses still alive one year before the boundary -- no reduction');
});

// ---------------------------------------------------------------------------
// guyton's skip-inflation-after-a-down-year condition: strictly negative,
// not <= 0
// ---------------------------------------------------------------------------

test('guyton: priorReturn of exactly 0 does NOT count as a down year -- inflation is still applied, unlike a genuinely negative return', () => {
  const p = planFor({ strategy: 'guyton', withdrawalRate: 4, guytonSkipInflation: true, upperGuardrail: 1000, lowerGuardrail: 1000, floor: 0, ceiling: Infinity });
  const priorSpend = 40000;
  const zeroReturn = spend(p, { balance: 1000000, priorSpend, priorReturn: 0, annualInflation: 0.03 });
  const negativeReturn = spend(p, { balance: 1000000, priorSpend, priorReturn: -0.0001, annualInflation: 0.03 });
  assert.ok(Math.abs(zeroReturn - priorSpend * 1.03) < 1e-9, 'priorReturn of exactly 0 must still apply the inflation raise');
  assert.ok(Math.abs(negativeReturn - priorSpend) < 1e-9, 'a genuinely negative (even if tiny) prior return must skip the inflation raise');
});
