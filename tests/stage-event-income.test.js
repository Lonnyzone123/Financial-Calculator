'use strict';

// Track B, L2 -- unit tests for applyStage(), eventAmount(), and
// otherIncomeFor(): three more calculator-native functions with no prior
// isolated coverage. Together they cover spending-plan "stages" (temporary
// overrides to planned spending over an age range), one-time expense
// events, and non-SS/pension "other income" streams (rental income,
// annuities, part-time work, etc.) -- all only ever exercised indirectly
// through full simulatePlan() runs today.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

// ---------------------------------------------------------------------------
// applyStage
// ---------------------------------------------------------------------------

test('applyStage: with no stages, base passes through unchanged (clamped to >= 0)', () => {
  assert.equal(engine.applyStage({ stages: [] }, 65, 50000, 1), 50000);
  assert.equal(engine.applyStage({ stages: [] }, 65, -10, 1), 0, 'a negative base must still be clamped to 0');
});

test('applyStage: a stage outside the current age range does not apply', () => {
  const r = { stages: [{ start: 70, end: 75, mode: 'percent', value: 50 }] };
  assert.equal(engine.applyStage(r, 65, 50000, 1), 50000);
});

test('applyStage: mode "percent" scales the base by value/100 within range', () => {
  const r = { stages: [{ start: 60, end: 70, mode: 'percent', value: 150 }] };
  assert.equal(engine.applyStage(r, 65, 50000, 1), 75000);
});

test('applyStage: mode "set" with growthMode "fixed" replaces the base and compounds by annualChange over elapsed years', () => {
  const r = { stages: [{ start: 60, end: 70, mode: 'set', value: 40000, growthMode: 'fixed', annualChange: 5 }] };
  const expected = 40000 * Math.pow(1.05, 5); // age 65 - start 60 = 5 years elapsed
  assert.ok(Math.abs(engine.applyStage(r, 65, 999999, 1) - expected) < 1e-6, 'the original base (999999) must be discarded, not blended');
});

test('applyStage: mode "set" with growthMode "inflation" replaces the base and scales by inflationFactor', () => {
  const r = { stages: [{ start: 60, end: 70, mode: 'set', value: 40000, growthMode: 'inflation' }] };
  assert.equal(engine.applyStage(r, 65, 0, 1.2), 48000);
});

test('applyStage: multiple applicable stages apply sequentially in array order', () => {
  const r = { stages: [
    { start: 60, end: 90, mode: 'percent', value: 50 }, // halve first
    { start: 60, end: 90, mode: 'percent', value: 200 }, // then double
  ] };
  assert.equal(engine.applyStage(r, 65, 10000, 1), 10000, 'halve then double must net out to the original value, proving sequential (not independent) application');
});

// ---------------------------------------------------------------------------
// eventAmount
// ---------------------------------------------------------------------------

test('eventAmount: no items sums to 0', () => {
  assert.equal(engine.eventAmount([], 60, 61), 0);
  assert.equal(engine.eventAmount(undefined, 60, 61), 0);
});

test('eventAmount: an item exactly at the range start is included; exactly at the range end is excluded', () => {
  assert.equal(engine.eventAmount([{ age: 60, amount: 5000 }], 60, 61), 5000, 'start is inclusive');
  assert.equal(engine.eventAmount([{ age: 61, amount: 5000 }], 60, 61), 0, 'end is exclusive');
});

test('eventAmount: items outside the range are excluded, and multiple in-range items are summed', () => {
  const items = [
    { age: 59, amount: 1000 }, // before range
    { age: 60, amount: 2000 }, // in range
    { age: 60.5, amount: 3000 }, // in range
    { age: 61, amount: 4000 }, // after range (exclusive end)
  ];
  assert.equal(engine.eventAmount(items, 60, 61), 5000);
});

// ---------------------------------------------------------------------------
// otherIncomeFor
// ---------------------------------------------------------------------------

function basePlan(overrides = {}) {
  return {
    profile: Object.assign({ age: 60, spouseOn: false, spouseAge: 60 }, overrides.profile),
    retirement: { otherIncomes: overrides.otherIncomes || [] },
  };
}

// S5 task 7: otherIncomeFor() also returns seSelf and seSpouse, each owner's self-employment profit.
test('otherIncomeFor: no income streams returns all zeros', () => {
  const p = basePlan();
  /* S5AA tasks 3.2 (Q89) and 3.4 (Q98): `nii`, `wageSelf` and `wageSpouse` are new. `nii` is the share
     that Form 8960 Part I counts as net
     investment income, reported separately from `ordinary` because a dollar can bear ordinary income tax,
     the 3.8% surtax, both or neither. These are EXACT-SHAPE assertions, so they gain the field; none of the
     fixtures in this file uses a rental or investment stream, so it is zero in every one of them.
     `wageSelf` and `wageSpouse` are the PER-OWNER wage share of any `employment` stream, kept apart
     because the OASDI wage base is a per-person cap; no fixture here uses an employment stream either. */
  assert.deepEqual(engine.otherIncomeFor(p, 60, 61, 1, 0), { cash: 0, ordinary: 0, ss: 0, seSelf: 0, seSpouse: 0, nii: 0, wageSelf: 0, wageSpouse: 0 });
});

test('otherIncomeFor: a oneTime income inside the period counts as both cash and ordinary income', () => {
  const p = basePlan({ otherIncomes: [{ type: 'oneTime', owner: 'self', start: 60, amount: 25000 }] });
  const result = engine.otherIncomeFor(p, 60, 61, 1, 0);
  assert.deepEqual(result, { cash: 25000, ordinary: 25000, ss: 0, seSelf: 0, seSpouse: 0, nii: 0, wageSelf: 0, wageSpouse: 0 });
});

test('otherIncomeFor: a socialSecurity-type recurring income counts only as ss, never as ordinary', () => {
  const p = basePlan({ otherIncomes: [{ type: 'socialSecurity', owner: 'self', start: 55, end: 100, amount: 2000, growth: 0 }] });
  const result = engine.otherIncomeFor(p, 60, 61, 1, 0);
  assert.equal(result.ss, 2000);
  assert.equal(result.ordinary, 0, 'socialSecurity income must not also be double-counted as ordinary income');
  assert.equal(result.cash, 2000);
});

test('otherIncomeFor: a taxFree income counts only as cash, never as ordinary or ss', () => {
  const p = basePlan({ otherIncomes: [{ type: 'taxFree', owner: 'self', start: 55, end: 100, amount: 1500, growth: 0 }] });
  const result = engine.otherIncomeFor(p, 60, 61, 1, 0);
  assert.deepEqual(result, { cash: 1500, ordinary: 0, ss: 0, seSelf: 0, seSpouse: 0, nii: 0, wageSelf: 0, wageSpouse: 0 });
});

test('otherIncomeFor: a plain recurring income compounds by its own growth rate over elapsed years', () => {
  const p = basePlan({ otherIncomes: [{ type: 'rental', owner: 'self', start: 55, end: 100, amount: 1000, growth: 4 }] });
  const result = engine.otherIncomeFor(p, 60, 61, 1, 0);
  const expected = 1000 * Math.pow(1.04, 5) * 1; // 5 years elapsed (60-55), 1-year period
  assert.ok(Math.abs(result.cash - expected) < 1e-6);
  assert.ok(Math.abs(result.ordinary - expected) < 1e-6);
});

test('otherIncomeFor: an income outside its own start/end window contributes nothing', () => {
  const p = basePlan({ otherIncomes: [{ type: 'rental', owner: 'self', start: 70, end: 80, amount: 1000, growth: 0 }] });
  const result = engine.otherIncomeFor(p, 60, 61, 1, 0);
  assert.deepEqual(result, { cash: 0, ordinary: 0, ss: 0, seSelf: 0, seSpouse: 0, nii: 0, wageSelf: 0, wageSpouse: 0 });
});

test('otherIncomeFor: a spouse-owned income is evaluated at the spouse\'s own age, not the primary profile age', () => {
  // Primary is 60, spouse is 50 (10 years younger). An income window of
  // spouse-age 55-60 must NOT be active while the primary is 60 (spouse
  // would only be 60 when primary turns 70).
  const p = basePlan({ profile: { age: 60, spouseOn: true, spouseAge: 50 }, otherIncomes: [{ type: 'rental', owner: 'spouse', start: 55, end: 60, amount: 1000, growth: 0 }] });
  const atPrimary60 = engine.otherIncomeFor(p, 60, 61, 1, 0);
  assert.deepEqual(atPrimary60, { cash: 0, ordinary: 0, ss: 0, seSelf: 0, seSpouse: 0, nii: 0, wageSelf: 0, wageSpouse: 0 }, 'spouse is only 50 here, below the window start of 55');

  const atPrimary65 = engine.otherIncomeFor(p, 65, 66, 1, 0); // spouse would be 55
  assert.ok(atPrimary65.cash > 0, 'spouse is 55 here, exactly the window start -- must be active');
});
