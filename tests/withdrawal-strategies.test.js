'use strict';

// Track B, L2 -- unit tests for a calculator-native function that has never
// been tested in isolation (PLATFORM_DEVELOPMENT_ROADMAP.md §3: "Extract
// and unit-test calculator-native financial functions the same way Phase 2
// extracted the engine boundary"). strategySpending() decides how much a
// retiree actually withdraws every year -- arguably the single most
// consequential function in the whole engine -- and until now it has only
// ever been exercised indirectly through full simulatePlan()/runPlan() runs
// (tests/regression-suite.js, tests/mathematical-oracles.test.js), never
// pinned strategy-by-strategy with hand-computable expected values.
//
// Every one of the 8 withdrawal strategies the UI exposes
// (fixedReal/fixedNominal/constantPercent/guardrails/guyton/vpw/rmd/
// floorCeiling), the unrecognized-strategy fallback (the literal shipped
// default, "incomeFirst", falls through to this), and the two cross-cutting
// modifiers (survivor spending reduction, negative-return flexibility) are
// covered here directly against engine.strategySpending(), with no
// simulation, no accounts, no tax -- pure function in, number out.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

// Builds the minimal {retirement, profile, assumptions} shape
// strategySpending() actually reads, with inert defaults for everything not
// under test (no survivor reduction, no flexibility cut, no stages).
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
// strategySpending(p, age, balance, retireBalance, priorSpend, priorReturn, inflationFactor, annualInflation)
function spend(p, args) {
  const { age = 65, balance = 1000000, retireBalance = 1000000, priorSpend = null, priorReturn = 0.05, inflationFactor = 1, annualInflation = 0.03 } = args;
  return engine.strategySpending(p, age, balance, retireBalance, priorSpend, priorReturn, inflationFactor, annualInflation);
}

test('strategySpending: fixedNominal always returns the flat spending figure, ignoring balance and inflation', () => {
  const p = planFor({ strategy: 'fixedNominal', spending: 50000 });
  assert.equal(spend(p, { balance: 2000000, inflationFactor: 1.5 }), 50000);
  assert.equal(spend(p, { balance: 1, inflationFactor: 0.5 }), 50000);
});

test('strategySpending: an unrecognized strategy name (the literal shipped default, "incomeFirst") falls back to spending * inflationFactor', () => {
  const p = planFor({ strategy: 'incomeFirst', spending: 60000 });
  assert.equal(spend(p, { inflationFactor: 1 }), 60000);
  assert.equal(spend(p, { inflationFactor: 1.2 }), 72000);
});

test('strategySpending: constantPercent returns balance * withdrawalRate exactly', () => {
  const p = planFor({ strategy: 'constantPercent', withdrawalRate: 4 });
  assert.equal(spend(p, { balance: 1000000 }), 40000);
  assert.equal(spend(p, { balance: 500000 }), 20000);
});

test('strategySpending: fixedReal anchors to retireBalance*rate in year one, then grows priorSpend with inflation', () => {
  const p = planFor({ strategy: 'fixedReal', withdrawalRate: 4 });
  const year1 = spend(p, { retireBalance: 1000000, priorSpend: null });
  assert.equal(year1, 40000, 'year one: retireBalance * rate');
  const year2 = spend(p, { priorSpend: 40000, annualInflation: 0.03 });
  assert.equal(year2, 41200, 'year two: priorSpend * (1 + annualInflation), independent of current balance');
});

test('strategySpending: rmd divides balance by remaining life expectancy, scaled by rmdMultiplier, floored by rmdFloor', () => {
  const p = planFor({ strategy: 'rmd', rmdFloor: 0, rmdMultiplier: 100 });
  const remaining = 95 - 70; // profile.endAge - age: the remaining modelled duration (R11 round, audit R10-01)
  const expected = 1000000 / remaining;
  assert.ok(Math.abs(spend(p, { age: 70, balance: 1000000 }) - expected) < 1e-9);

  const halved = planFor({ strategy: 'rmd', rmdFloor: 0, rmdMultiplier: 50 });
  assert.ok(Math.abs(spend(halved, { age: 70, balance: 1000000 }) - expected / 2) < 1e-9);

  const floored = planFor({ strategy: 'rmd', rmdFloor: 100000, rmdMultiplier: 100 });
  assert.equal(spend(floored, { age: 94, balance: 10000, inflationFactor: 1 }), 100000, 'a tiny balance late in life must not push spending below the floor');
});

test('strategySpending: floorCeiling clamps balance*rate between floor and ceiling (both bounds independently)', () => {
  const p = planFor({ strategy: 'floorCeiling', withdrawalRate: 4, floor: 30000, ceiling: 90000 });
  assert.equal(spend(p, { balance: 1000000 }), 40000, 'in-range: unclamped');
  assert.equal(spend(p, { balance: 200000 }), 30000, '$8,000 unclamped is below the floor');
  assert.equal(spend(p, { balance: 5000000 }), 90000, '$200,000 unclamped is above the ceiling');
});

test('strategySpending: vpw divides balance by the annuity factor derived from the real return rate, and respects min/max rate clamps', () => {
  const p = planFor({ strategy: 'vpw', vpwMinRate: 0, vpwMaxRate: 100 }, { age: 65, endAge: 95 }, { returnRate: 7, fee: 0, inflation: 3 });
  const remaining = 95 - 65; // R11 round, audit R10-01: the duration left, not one more
  const realRate = (1.07 / 1.03) - 1;
  const factor = (1 - Math.pow(1 + realRate, -remaining)) / realRate;
  const expected = 1000000 / factor;
  assert.ok(Math.abs(spend(p, { balance: 1000000 }) - expected) < 1e-6);

  const capped = planFor({ strategy: 'vpw', vpwMinRate: 0, vpwMaxRate: 3 });
  assert.equal(spend(capped, { balance: 1000000 }), 30000, 'vpwMaxRate: 3 must cap withdrawal at 3% of balance regardless of the annuity factor');

  const floored = planFor({ strategy: 'vpw', vpwMinRate: 10, vpwMaxRate: 100 });
  assert.equal(spend(floored, { balance: 1000000 }), 100000, 'vpwMinRate: 10 must floor withdrawal at 10% of balance');
});

test('strategySpending: vpw handles the realRate ~ 0 edge case (factor collapses to plain remaining-years division)', () => {
  // returnRate === inflation -> realRate ~ 0, hitting the |realRate|<1e-5 branch.
  const p = planFor({ strategy: 'vpw', vpwMinRate: 0, vpwMaxRate: 100 }, { age: 80, endAge: 90 }, { returnRate: 3, fee: 0, inflation: 3 });
  const remaining = 90 - 80; // R11 round, audit R10-01
  assert.ok(Math.abs(spend(p, { age: 80, balance: 1100000 }) - 1100000 / remaining) < 1e-6);
});

test('strategySpending: guardrails cuts spending when the current withdrawal rate breaches the upper guardrail', () => {
  // Year one spend = retireBalance*rate = $40,000. Current balance has since
  // dropped to $500,000, so currentRate = 40000/500000 = 8% >> upper bound
  // (4%*1.2 = 4.8%), which must trigger the adjustment cut.
  const p = planFor({ strategy: 'guardrails', withdrawalRate: 4, upperGuardrail: 20, lowerGuardrail: 20, adjustment: 10, floor: 0, ceiling: Infinity });
  const beforeGuardrail = 40000 * 1.03; // priorSpend grown by inflation, pre-guardrail-check
  const expected = beforeGuardrail * 0.9; // adjustment: 10 -> cut 10%
  assert.ok(Math.abs(spend(p, { balance: 500000, priorSpend: 40000, annualInflation: 0.03 }) - expected) < 1e-6);
});

test('strategySpending: guardrails raises spending when the current withdrawal rate falls below the lower guardrail', () => {
  // Balance has grown a lot relative to spending -> currentRate well under
  // the lower bound (4%*0.8 = 3.2%), triggering the adjustment raise.
  const p = planFor({ strategy: 'guardrails', withdrawalRate: 4, upperGuardrail: 20, lowerGuardrail: 20, adjustment: 10, floor: 0, ceiling: Infinity });
  const beforeGuardrail = 40000 * 1.03;
  const expected = beforeGuardrail * 1.1;
  assert.ok(Math.abs(spend(p, { balance: 5000000, priorSpend: 40000, annualInflation: 0.03 }) - expected) < 1e-6);
});

test('strategySpending: guyton skips the inflation raise (but not the guardrail check) after a down year, when guytonSkipInflation is set', () => {
  const p = planFor({ strategy: 'guyton', withdrawalRate: 4, upperGuardrail: 20, lowerGuardrail: 20, adjustment: 10, guytonSkipInflation: true, floor: 0, ceiling: Infinity });
  // priorReturn < 0 and guytonSkipInflation -> amount stays at priorSpend (no *1.03), and balance is chosen so no guardrail fires.
  const result = spend(p, { balance: 40000 / 0.04, priorSpend: 40000, priorReturn: -0.1, annualInflation: 0.03 });
  assert.equal(result, 40000, 'inflation growth must be skipped entirely, not merely reduced, after a down year');
});

test('strategySpending: survivor reduction applies only when exactly one spouse is still alive at this age', () => {
  const base = { strategy: 'fixedNominal', spending: 60000, survivor: true, survivorSpendingReduction: 25, selfLife: 90, spouseLife: 90 };
  const bothAlive = planFor(base, { age: 70, spouseOn: true, spouseAge: 70 });
  assert.equal(spend(bothAlive, { age: 70 }), 60000, 'both alive: no reduction');

  // self dies at 90, spouse (10 years younger) still alive at self-age 92 -> spouseAge 82 < 90.
  const selfDeceased = planFor(base, { age: 92, spouseOn: true, spouseAge: 82 });
  assert.equal(spend(selfDeceased, { age: 92 }), 45000, 'one survivor: reduced by survivorSpendingReduction%');
});

test('strategySpending: negative-return flexibility cuts spending after a down year', () => {
  const p = planFor({ strategy: 'fixedNominal', spending: 60000, flexibility: 15 });
  assert.equal(spend(p, { priorReturn: 0.08 }), 60000, 'a positive prior return must not trigger the flexibility cut');
  assert.equal(spend(p, { priorReturn: -0.05 }), 51000, 'a negative prior return must cut spending by flexibility%');
});

test('strategySpending: never returns a negative amount, even with an aggressive stacked cut', () => {
  const p = planFor({ strategy: 'fixedNominal', spending: 100, flexibility: 100 });
  assert.equal(spend(p, { priorReturn: -0.01 }), 0);
});
