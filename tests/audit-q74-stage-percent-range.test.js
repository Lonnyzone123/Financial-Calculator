/* S5, Q74's validator half. Decided 2026-09-14 (the owner), answer (c): the app resets a stage's value on a mode switch
 * (tests/audit-q74-stage-mode-switch.test.js), and once U4's generator repair landed, a validator WARNING bounds a
 * percent-mode spending stage, with the ceiling measured then.
 *
 * The defect: applyStage() applies a percent stage as base *= value / 100, and nothing bounded value. A $60,000 stage
 * switched to "Percent of strategy amount" read as 60,000% and spent 600 times the strategy amount, validator-clean.
 *
 * The range, measured before the repair on the repaired generator: 600 seeds and both corpora draw percent stages from
 * 50.36 to 119.94, none below 0. The ceiling is 200: above it a stage more than doubles the plan's spending, which
 * reads as a dollar figure in a percent field. A WARNING, not an ERROR, so the plan still runs.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { corpus } = require('../tools/capture-baseline.js');
const { validateScenario } = require('../src/scenario-validator.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs.js');
const { generateScenarios } = require('./lib/scenario-generator.js');

const ROOT = path.join(__dirname, '..');
const defaultPlan = extractDefaultPlan(fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const CODE = 'STAGE_PERCENT_OUT_OF_RANGE';

/* A validator-clean corpus plan with one retirement stage of the given mode and value. */
function withStage(mode, value) {
  const p = clone(corpus()[0].plan);
  const from = p.profile.retireAge;
  p.retirement.stages = [{ name: 'Go-go', start: from, end: from + 10, mode, value, growthMode: 'none', annualChange: 0 }];
  return p;
}
const found = (p) => validateScenario(clone(p)).issues.filter((i) => i.code === CODE);

test('Q74: a percent stage above 200% warns STAGE_PERCENT_OUT_OF_RANGE, as a $60,000 figure left in a percent stage does', () => {
  for (const value of [60000, 200.5]) {
    const f = found(withStage('percent', value));
    assert.equal(f.length, 1, value + '% must be warned about exactly once, got ' + f.length);
    assert.equal(f[0].path, 'retirement.stages[0].value');
  }
});

test('Q74: a percent stage below 0% warns STAGE_PERCENT_OUT_OF_RANGE', () => {
  const f = found(withStage('percent', -5));
  assert.equal(f.length, 1, 'got ' + f.length);
  assert.equal(f[0].path, 'retirement.stages[0].value');
});

test('Q74: the range is a WARNING, so an out-of-range percent stage leaves the plan as valid as an in-range one', () => {
  const inRange = validateScenario(clone(withStage('percent', 100)));
  const outcome = validateScenario(clone(withStage('percent', 60000)));
  const f = outcome.issues.filter((i) => i.code === CODE);
  assert.equal(f.length, 1, 'got ' + f.length);
  assert.equal(f[0].severity, 'WARNING');
  assert.equal(inRange.valid, true, 'the in-range plan is valid');
  assert.equal(outcome.valid, true, 'the out-of-range plan is still valid');
});

test('Q74: percent stages at 0, 50, 100, 120 and 200%, and an amount stage of $60,000, raise no STAGE_PERCENT_OUT_OF_RANGE', () => {
  for (const value of [0, 50, 100, 120, 200]) assert.equal(found(withStage('percent', value)).length, 0, value + '%');
  assert.equal(found(withStage('amount', 60000)).length, 0, 'an amount stage is dollars, not a percent');
});

test('Q74: no percent stage the repaired generator draws in seeds 1 to 150 is outside the range', () => {
  let stages = 0;
  for (const { seed, plan } of generateScenarios(defaultPlan, { count: 150, startSeed: 1 })) {
    stages += ((plan.retirement && plan.retirement.stages) || []).filter((s) => s && s.mode === 'percent').length;
    assert.equal(validateScenario(clone(plan)).issues.filter((i) => i.code === CODE).length, 0, 'seed ' + seed);
  }
  assert.ok(stages > 20, 'the batch draws percent stages at all: ' + stages);
});
