'use strict';

// Track B, L2 -- unit tests for accountPlannedContribution(), a calculator-
// native function with no prior isolated coverage found while re-auditing
// engine.js's full worker-serialized function list for gaps (the same audit
// that turned up rothPhaseoutFactor's total absence of coverage). This one
// is genuinely consequential: it decides how much money is actually
// contributed to every account, every year, across the entire accumulation
// phase -- dollar vs. salary-percent contribution modes, annual growth
// (percent-compounding or flat-dollar), period- vs. annual-timed growth,
// and a sorted sequence of one-time future overrides (set/percent/add) --
// yet was previously only ever exercised indirectly through full
// simulatePlan()/runPlan() runs.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

function accountFor(overrides = {}) {
  return Object.assign({
    contributionMode: 'dollar', contribution: 1000,
    annualChangeMode: 'percent', annualChange: 0,
    changeTiming: 'annual', frequency: 12,
    futureChanges: [],
  }, overrides);
}
function planFor(startAge = 40) {
  return { profile: { age: startAge } };
}

// ---------------------------------------------------------------------------
// Base contribution modes
// ---------------------------------------------------------------------------

test('dollar mode: returns the flat contribution figure regardless of salary', () => {
  const a = accountFor({ contributionMode: 'dollar', contribution: 5000 });
  assert.equal(engine.accountPlannedContribution(a, 999999, 40, planFor(40)), 5000);
  assert.equal(engine.accountPlannedContribution(a, 0, 40, planFor(40)), 5000);
});

test('salaryPct mode: returns salary * contribution% exactly, ignoring the flat contribution field\'s own magnitude', () => {
  const a = accountFor({ contributionMode: 'salaryPct', contribution: 10 });
  assert.equal(engine.accountPlannedContribution(a, 100000, 40, planFor(40)), 10000);
});

// ---------------------------------------------------------------------------
// elapsed time clamp: age before the plan's own starting age never goes
// negative
// ---------------------------------------------------------------------------

test('an age before the plan\'s starting age clamps elapsed periods to 0, not negative', () => {
  const a = accountFor({ contribution: 1000, annualChangeMode: 'flat', annualChange: 100 });
  // age(35) - profile.age(40) would be -5 without the Math.max(0,...) clamp,
  // which would otherwise SUBTRACT periods worth of growth.
  assert.equal(engine.accountPlannedContribution(a, 0, 35, planFor(40)), 1000);
});

// ---------------------------------------------------------------------------
// changeTiming: "period" scales elapsed time by frequency; anything else
// uses raw elapsed years
// ---------------------------------------------------------------------------

test('changeTiming "period" multiplies elapsed years by frequency before flooring; the default (annual) timing ignores frequency entirely', () => {
  const periodAccount = accountFor({
    contribution: 1000, annualChangeMode: 'flat', annualChange: 10,
    changeTiming: 'period', frequency: 12,
  });
  // elapsed = 2 years, periods = floor(2*12) = 24 -> 1000 + 10*24 = 1240
  assert.equal(engine.accountPlannedContribution(periodAccount, 0, 42, planFor(40)), 1240);

  const annualAccount = accountFor({
    contribution: 1000, annualChangeMode: 'flat', annualChange: 10,
    changeTiming: 'annual', frequency: 12, // frequency present but must be ignored
  });
  // periods = floor(2) = 2 -> 1000 + 10*2 = 1020
  assert.equal(engine.accountPlannedContribution(annualAccount, 0, 42, planFor(40)), 1020);
});

test('changeTiming "period" floors partial periods just like the annual path floors partial years', () => {
  const a = accountFor({ contribution: 1000, annualChangeMode: 'flat', annualChange: 10, changeTiming: 'period', frequency: 12 });
  // elapsed = 2.08333 years * 12 = 24.9999... -> floors to 24, not 25.
  assert.equal(engine.accountPlannedContribution(a, 0, 42.08333, planFor(40)), 1240);
});

// ---------------------------------------------------------------------------
// annualChangeMode: "percent" compounds geometrically; anything else adds
// a flat per-period amount
// ---------------------------------------------------------------------------

test('annualChangeMode "percent" compounds geometrically over the elapsed periods', () => {
  const a = accountFor({ contribution: 1000, annualChangeMode: 'percent', annualChange: 10 }); // +10%/yr
  assert.ok(Math.abs(engine.accountPlannedContribution(a, 0, 43, planFor(40)) - 1000 * Math.pow(1.10, 3)) < 1e-9);
});

test('a percent annualChange at or below -100% clamps the growth factor to 0, not a negative multiplier', () => {
  const atNegative100 = accountFor({ contribution: 1000, annualChangeMode: 'percent', annualChange: -100 });
  assert.equal(engine.accountPlannedContribution(atNegative100, 0, 45, planFor(40)), 0, 'exactly -100% must floor the compounding factor at 0');

  const belowNegative100 = accountFor({ contribution: 1000, annualChangeMode: 'percent', annualChange: -150 });
  assert.equal(engine.accountPlannedContribution(belowNegative100, 0, 45, planFor(40)), 0, 'below -100% must not flip the factor negative and then positive again via Math.pow on an odd number of periods');
});

test('a non-"percent" annualChangeMode adds a flat per-period dollar amount instead of compounding', () => {
  const a = accountFor({ contribution: 1000, annualChangeMode: 'flat', annualChange: 200 });
  assert.equal(engine.accountPlannedContribution(a, 0, 43, planFor(40)), 1000 + 200 * 3);
});

// ---------------------------------------------------------------------------
// futureChanges: applied in age order regardless of input array order, only
// once age >= the change's own age, each mode behaving distinctly
// ---------------------------------------------------------------------------

test('futureChanges are applied in ascending age order even when the input array is not sorted', () => {
  const a = accountFor({
    contribution: 1000, annualChangeMode: 'flat', annualChange: 0,
    futureChanges: [
      { age: 65, mode: 'percent', value: 10 }, // applied second
      { age: 60, mode: 'set', value: 2000 }, // applied first
    ],
  });
  // At age 66: first the "set" at 60 fires (amount -> 2000), then the
  // "percent" at 65 fires (2000 * 1.10 = 2200). If input order were used
  // instead of age order, this would come out as 1000*1.10 then set to
  // 2000, landing on 2000 instead of 2200.
  assert.equal(engine.accountPlannedContribution(a, 0, 66, planFor(40)), 2200);
});

test('a futureChange only applies once age reaches its own age exactly (">="), not before', () => {
  const a = accountFor({ contribution: 1000, annualChangeMode: 'flat', annualChange: 0, futureChanges: [{ age: 60, mode: 'set', value: 5000 }] });
  assert.equal(engine.accountPlannedContribution(a, 0, 60, planFor(40)), 5000, 'exactly at the change age, it must already apply');
  assert.equal(engine.accountPlannedContribution(a, 0, 59.999, planFor(40)), 1000, 'one tick before, it must not yet apply');
});

test('futureChanges: "set" replaces the amount outright, "percent" multiplies the current amount, and the default (anything else) mode adds a flat value', () => {
  const setAccount = accountFor({ contribution: 1000, futureChanges: [{ age: 50, mode: 'set', value: 42 }] });
  assert.equal(engine.accountPlannedContribution(setAccount, 0, 50, planFor(40)), 42);

  const percentAccount = accountFor({ contribution: 1000, futureChanges: [{ age: 50, mode: 'percent', value: 50 }] });
  assert.equal(engine.accountPlannedContribution(percentAccount, 0, 50, planFor(40)), 1500);

  const addAccount = accountFor({ contribution: 1000, futureChanges: [{ age: 50, mode: 'add', value: 300 }] });
  assert.equal(engine.accountPlannedContribution(addAccount, 0, 50, planFor(40)), 1300, 'any mode other than "set"/"percent" must add the value as a flat amount');
});

test('multiple futureChanges at the exact same age are all applied, in their relative array order after the stable sort', () => {
  const a = accountFor({
    contribution: 1000,
    futureChanges: [{ age: 50, mode: 'add', value: 100 }, { age: 50, mode: 'add', value: 50 }],
  });
  assert.equal(engine.accountPlannedContribution(a, 0, 50, planFor(40)), 1150);
});

test('futureChanges defaulting to an empty array (undefined) does not throw', () => {
  const a = accountFor({ contribution: 1000 });
  delete a.futureChanges;
  assert.doesNotThrow(() => engine.accountPlannedContribution(a, 0, 45, planFor(40)));
});

// ---------------------------------------------------------------------------
// Final floor: the result is never negative
// ---------------------------------------------------------------------------

test('a large negative flat annualChange accumulated over many periods is floored at exactly 0, never negative', () => {
  const a = accountFor({ contribution: 1000, annualChangeMode: 'flat', annualChange: -500 });
  assert.equal(engine.accountPlannedContribution(a, 0, 50, planFor(40)), 0, '1000 - 500*10 would be -4000 without the floor');
});

test('a futureChange "add" that drives the amount negative is also floored at 0', () => {
  const a = accountFor({ contribution: 1000, futureChanges: [{ age: 50, mode: 'add', value: -5000 }] });
  assert.equal(engine.accountPlannedContribution(a, 0, 50, planFor(40)), 0);
});
