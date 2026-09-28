'use strict';

// Track B, L2 -- unit tests for rothPhaseoutFactor(), a calculator-native
// function with no prior isolated coverage at all (unlike its neighbors in
// engine.js's function list, none of the existing test files exercise it,
// directly or indirectly through a full simulatePlan() run in a way that
// pins its own boundaries). Decides what fraction of a planned Roth IRA
// contribution is actually allowed once MAGI enters the IRS phase-out band
// -- 1 below the band, 0 at or above it, a straight-line ramp in between.
//
// Written boundary-exact from the start (this project's now-established
// convention after several L2/L5 passes found real value in testing
// strict-inequality edges directly), rather than adding a separate
// adversarial file later.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);
const RULES = global.RULES;

const engine = require('../src/engine.js');

function planFor(filing, spouseOn = false) {
  return { profile: { filing, spouseOn } };
}

test('rothPhaseoutFactor: any account type other than "rothIRA" always returns exactly 1, regardless of MAGI', () => {
  const p = planFor('single');
  const hugeIncomeAccount = { type: 'traditional401k' };
  assert.equal(engine.rothPhaseoutFactor(p, hugeIncomeAccount, 5000000, 0), 1);
  assert.equal(engine.rothPhaseoutFactor(p, { type: 'taxable' }, 5000000, 0), 1);
});

test('rothPhaseoutFactor: MAGI at or below the phase-out floor returns exactly 1 (full contribution allowed)', () => {
  const p = planFor('single');
  const [floor] = RULES.retirement.ira.rothPhaseout.single;
  assert.equal(engine.rothPhaseoutFactor(p, { type: 'rothIRA' }, floor, 0), 1, 'exactly at the floor must still be 1');
  assert.equal(engine.rothPhaseoutFactor(p, { type: 'rothIRA' }, floor - 1, 0), 1, 'below the floor must be 1');
});

test('rothPhaseoutFactor: MAGI at or above the phase-out ceiling returns exactly 0 (contribution fully disallowed)', () => {
  const p = planFor('single');
  const [, ceiling] = RULES.retirement.ira.rothPhaseout.single;
  assert.equal(engine.rothPhaseoutFactor(p, { type: 'rothIRA' }, ceiling, 0), 0, 'exactly at the ceiling must already be 0');
  assert.equal(engine.rothPhaseoutFactor(p, { type: 'rothIRA' }, ceiling + 1, 0), 0, 'above the ceiling must be 0');
});

test('rothPhaseoutFactor: strictly between floor and ceiling, the factor is an exact linear ramp from 1 down to 0', () => {
  const p = planFor('single');
  const [floor, ceiling] = RULES.retirement.ira.rothPhaseout.single;
  const midpoint = (floor + ceiling) / 2;
  assert.ok(Math.abs(engine.rothPhaseoutFactor(p, { type: 'rothIRA' }, midpoint, 0) - 0.5) < 1e-9, 'exactly halfway through the band must be exactly 0.5');

  const quarterPoint = floor + (ceiling - floor) * 0.25;
  const expectedAtQuarter = 1 - 0.25; // 75% of the band remaining allowed
  assert.ok(Math.abs(engine.rothPhaseoutFactor(p, { type: 'rothIRA' }, quarterPoint, 0) - expectedAtQuarter) < 1e-9);
});

test('rothPhaseoutFactor: one dollar inside either edge of the band is strictly between 0 and 1, not clamped to the edge value', () => {
  const p = planFor('single');
  const [floor, ceiling] = RULES.retirement.ira.rothPhaseout.single;
  const justInsideFloor = engine.rothPhaseoutFactor(p, { type: 'rothIRA' }, floor + 1, 0);
  const justInsideCeiling = engine.rothPhaseoutFactor(p, { type: 'rothIRA' }, ceiling - 1, 0);
  assert.ok(justInsideFloor < 1 && justInsideFloor > 0.99, 'one dollar past the floor must be just under 1, not exactly 1');
  assert.ok(justInsideCeiling > 0 && justInsideCeiling < 0.01, 'one dollar before the ceiling must be just over 0, not exactly 0');
});

test('rothPhaseoutFactor: filing "mfj" uses the mfj band; any other filing status (including "hoh") falls back to the single band', () => {
  const [singleFloor] = RULES.retirement.ira.rothPhaseout.single;
  const [mfjFloor] = RULES.retirement.ira.rothPhaseout.mfj;
  assert.notEqual(singleFloor, mfjFloor, 'test assumption: the two bands actually differ');

  const magiBetweenFloors = Math.min(singleFloor, mfjFloor) + Math.abs(mfjFloor - singleFloor) / 2;
  const mfjResult = engine.rothPhaseoutFactor(planFor('mfj'), { type: 'rothIRA' }, magiBetweenFloors, 0);
  const hohResult = engine.rothPhaseoutFactor(planFor('hoh'), { type: 'rothIRA' }, magiBetweenFloors, 0);
  assert.notEqual(mfjResult, hohResult, 'mfj and hoh must land in different phase-out positions at the same MAGI, since hoh uses the single band');
});

test('rothPhaseoutFactor: spouseSalary is added to MAGI only when spouseOn is true', () => {
  const [floor, ceiling] = RULES.retirement.ira.rothPhaseout.mfj;
  const salary = floor - 1000; // alone, below the floor
  const spouseSalary = 5000; // combined, pushes into the band
  const p = planFor('mfj', true);
  const withSpouse = engine.rothPhaseoutFactor(p, { type: 'rothIRA' }, salary, spouseSalary);
  const withoutSpouseOn = engine.rothPhaseoutFactor(planFor('mfj', false), { type: 'rothIRA' }, salary, spouseSalary);
  assert.ok(withSpouse < 1, 'combined MAGI (salary+spouseSalary) must land inside the phase-out band');
  assert.equal(withoutSpouseOn, 1, 'with spouseOn false, spouseSalary must be ignored entirely, leaving MAGI below the floor');
});

test('EA-03: rothPhaseoutFactor() asks householdFilingFor() for the row, and computes no death of its own', () => {
  /* S5AA R6 external audit, EA-03 -- the unit-level contract; the public route is
     tests/audit-s5aa-r6-roth-phaseout-filing.test.js. With no age, the canonical reader
     finds nobody dead, so the entered status stands -- the same answer the entered plan has always
     had. */
  const p = { profile: { filing: 'mfj', spouseOn: true, age: 50, spouseAge: 50 }, retirement: { selfLife: 95, spouseLife: 53 } };
  const roth = { type: 'rothIRA' };
  assert.equal(engine.rothPhaseoutFactor(p, roth, 170000, 0), 1, 'no row age: the entered joint status');
  assert.equal(engine.rothPhaseoutFactor(p, roth, 170000, 0, 53), 1, 'the year of death: joint');
  assert.equal(engine.rothPhaseoutFactor(p, roth, 170000, 0, 54), 0, 'the year after: single, past its ceiling');
  assert.equal(engine.householdFilingFor(p, 54), 'single', 'CONTROL: the canonical reader agrees');
});
