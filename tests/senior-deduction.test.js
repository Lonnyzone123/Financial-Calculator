'use strict';

// Track B, L2 -- unit tests for seniorDeduction(), the 2026 senior
// deduction phase-out formula, found uncovered by the same worker-
// function-list audit that turned up rothPhaseoutFactor and
// accountPlannedContribution.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);
const RULES = global.RULES;

const engine = require('../src/engine.js');

test('seniorDeduction: nobody age 65+ returns exactly 0, regardless of magi', () => {
  assert.equal(engine.seniorDeduction(0, [64, 30], 'single'), 0);
  assert.equal(engine.seniorDeduction(1000000, [64], 'single'), 0);
});

test('seniorDeduction: age exactly 65 counts as eligible; 64.999 does not', () => {
  const r = RULES.federal.seniorDeduction;
  assert.equal(engine.seniorDeduction(0, [65], 'single'), r.perEligiblePerson);
  assert.equal(engine.seniorDeduction(0, [64.999], 'single'), 0);
});

test('seniorDeduction: the max deduction scales linearly with the number of eligible people (both spouses 65+)', () => {
  const r = RULES.federal.seniorDeduction;
  assert.equal(engine.seniorDeduction(0, [70, 68], 'mfj'), r.perEligiblePerson * 2);
  assert.equal(engine.seniorDeduction(0, [70, 40], 'mfj'), r.perEligiblePerson, 'only the 65+ spouse counts');
});

test('seniorDeduction: magi at or below the filing-status phaseout start gets the full max, unreduced', () => {
  const r = RULES.federal.seniorDeduction;
  assert.equal(engine.seniorDeduction(r.singlePhaseoutStart, [70], 'single'), r.perEligiblePerson, 'exactly at the single threshold, no phase-out yet');
  assert.equal(engine.seniorDeduction(r.singlePhaseoutStart - 1, [70], 'single'), r.perEligiblePerson);
  assert.equal(engine.seniorDeduction(r.jointPhaseoutStart, [70, 68], 'mfj'), r.perEligiblePerson * 2, 'exactly at the mfj threshold, no phase-out yet');
});

test('seniorDeduction: magi above the phaseout start reduces the deduction by phaseoutRate per dollar over the threshold', () => {
  const r = RULES.federal.seniorDeduction;
  const over = 10000;
  const expected = r.perEligiblePerson - over * r.phaseoutRate;
  assert.ok(Math.abs(engine.seniorDeduction(r.singlePhaseoutStart + over, [70], 'single') - expected) < 1e-9);
});

test('seniorDeduction: floors at exactly 0 once the phase-out would otherwise go negative', () => {
  const r = RULES.federal.seniorDeduction;
  const wayOver = r.perEligiblePerson / r.phaseoutRate + 100000; // far past full phase-out
  assert.equal(engine.seniorDeduction(r.singlePhaseoutStart + wayOver, [70], 'single'), 0);
});

test('seniorDeduction: single and mfj use independent phaseout thresholds', () => {
  const r = RULES.federal.seniorDeduction;
  assert.notEqual(r.singlePhaseoutStart, r.jointPhaseoutStart, 'test assumption: the two thresholds actually differ');
  const magiBetween = Math.min(r.singlePhaseoutStart, r.jointPhaseoutStart) + Math.abs(r.jointPhaseoutStart - r.singlePhaseoutStart) / 2;
  const singleResult = engine.seniorDeduction(magiBetween, [70], 'single');
  const mfjResult = engine.seniorDeduction(magiBetween, [70], 'mfj');
  assert.notEqual(singleResult, mfjResult, 'the same magi must phase out differently under single vs mfj');
});
