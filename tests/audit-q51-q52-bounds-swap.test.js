/* S5 block 2h -- Q51 and Q52: an inverted spending floor and ceiling, or an
 * inverted VPW minimum and maximum rate, is swapped by the engine, and the
 * swap is reported.
 *
 * Decided 2026-09-13 (the owner): disclose and swap. The smaller value becomes the
 * floor or minimum, the larger the ceiling or maximum, and a warning records
 * that it happened. Before this, clamp(v, a, b) with a > b returned b for
 * every v, so the floor could never reach the output.
 *
 * The three user-bounded clamp() sites, all in strategySpending(): the
 * guardrails/guyton floor and ceiling, the floorCeiling floor and ceiling, and
 * the VPW rate pair. The other fourteen clamp() sites pass constant bounds.
 *
 * Scope: runPlan() and runScenario() callers. In the app, the form reader
 * raises the ceiling to the floor and the VPW maximum to the minimum for the
 * scenario being edited, silently, before a run -- measured through a
 * restored backup -- so no app result carries an inverted pair today. Whether
 * the app should swap and disclose too is held for a decision, and nothing
 * here asserts app behaviour.
 *
 * Fixtures are chosen so each pair binds, and so the old answer (the second
 * bound) differs from the ordered answer; otherwise "equals the ordered pair"
 * could pass against the defect. The method is simple, where guardrails and
 * guyton behave identically, so guardrails stands for both.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const FLOOR_CODE = 'SPENDING_FLOOR_CEILING_SWAPPED';
const VPW_CODE = 'VPW_RATE_BOUNDS_SWAPPED';

function plan(strategy, edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 5, inflation: 2, fee: 0, volatility: 0, runs: 20, seed: 3 });
  Object.assign(p.profile, { age: 64, retireAge: 65, endAge: 90, spouseOn: false });
  Object.assign(p.employment, { salary: 0, contributionStop: 64 });
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 2500000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }];
  Object.assign(p.retirement, { strategy, spending: 60000, withdrawalRate: 4, ssBenefit: 0, stages: [], expenses: [], otherIncomes: [] });
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  edit(p);
  return p;
}

const run = (strategy, edit) => engine.runPlan(plan(strategy, edit));
const bounds = (floor, ceiling) => (p) => { p.retirement.floor = floor; p.retirement.ceiling = ceiling; };
const rates = (min, max) => (p) => { p.retirement.vpwMinRate = min; p.retirement.vpwMaxRate = max; };
const swaps = (r) => (r.issues || []).filter((i) => i.code === FLOOR_CODE || i.code === VPW_CODE);

for (const strategy of ['floorCeiling', 'guardrails']) {
  test('Q51 ' + strategy + ': an inverted floor and ceiling are swapped -- the result equals the ordered pair, with one swap warning', () => {
    const ordered = run(strategy, bounds(50000, 80000));
    const inverted = run(strategy, bounds(80000, 50000));
    assert.equal(inverted.status, 'ok');
    assert.equal(JSON.stringify(inverted.rows), JSON.stringify(ordered.rows),
      'the inverted pair did not produce the ordered result (the old clamp answers with the ceiling for every amount)');
    const found = swaps(inverted);
    assert.equal(found.length, 1, 'expected exactly one swap warning for the run, got ' + JSON.stringify(found));
    assert.equal(found[0].code, FLOOR_CODE);
    assert.equal(found[0].severity, 'WARNING');
    assert.match(found[0].message, /\$80,000/);
    assert.match(found[0].message, /\$50,000/);
  });
}

test('Q52 vpw: an inverted minimum and maximum rate are swapped -- the result equals the ordered pair, with one swap warning', () => {
  const ordered = run('vpw', rates(1, 3));
  const inverted = run('vpw', rates(3, 1));
  assert.equal(inverted.status, 'ok');
  assert.equal(JSON.stringify(inverted.rows), JSON.stringify(ordered.rows),
    'the inverted pair did not produce the ordered result (the old clamp answers with the maximum for every amount)');
  const found = swaps(inverted);
  assert.equal(found.length, 1, 'expected exactly one swap warning for the run, got ' + JSON.stringify(found));
  assert.equal(found[0].code, VPW_CODE);
  assert.equal(found[0].severity, 'WARNING');
  assert.match(found[0].message, /3%/);
  assert.match(found[0].message, /1%/);
});

test('Q51/Q52 controls: every fixture pair binds, and ordered, equal or unused pairs carry no swap warning', () => {
  for (const strategy of ['floorCeiling', 'guardrails']) {
    const free = run(strategy, bounds(0, 10000000));
    const ordered = run(strategy, bounds(50000, 80000));
    const equal = run(strategy, bounds(60000, 60000));
    for (const r of [free, ordered, equal]) assert.equal(r.status, 'ok');
    assert.notEqual(JSON.stringify(ordered.rows), JSON.stringify(free.rows), 'CONTROL: ' + strategy + ' ordered bounds must bind, or the swap tests measure nothing');
    assert.notEqual(JSON.stringify(equal.rows), JSON.stringify(free.rows), 'CONTROL: ' + strategy + ' equal bounds must bind');
    assert.deepEqual(swaps(ordered), [], strategy + ': an ordered pair is not reported');
    assert.deepEqual(swaps(equal), [], strategy + ': the inclusive boundary, floor === ceiling, is not an inversion');
  }
  const free = run('vpw', rates(0, 100));
  const ordered = run('vpw', rates(1, 3));
  const equal = run('vpw', rates(2, 2));
  for (const r of [free, ordered, equal]) assert.equal(r.status, 'ok');
  assert.notEqual(JSON.stringify(ordered.rows), JSON.stringify(free.rows), 'CONTROL: vpw ordered rates must bind');
  assert.notEqual(JSON.stringify(equal.rows), JSON.stringify(free.rows), 'CONTROL: vpw equal rates must bind');
  assert.deepEqual(swaps(ordered), [], 'vpw: an ordered pair is not reported');
  assert.deepEqual(swaps(equal), [], 'vpw: the inclusive boundary, min === max, is not an inversion');
  const unused = run('fixedReal', bounds(80000, 50000));
  assert.equal(unused.status, 'ok');
  assert.deepEqual(swaps(unused), [], 'a strategy that never reads the floor and ceiling is not warned about them');
});

test('Q51 Monte Carlo: the swap is reported once for the run, not once per path or year', () => {
  const r = run('guardrails', (p) => {
    Object.assign(p.assumptions, { method: 'monteCarlo', volatility: 12, runs: 20, seed: 3 });
    bounds(80000, 50000)(p);
  });
  assert.equal(r.status, 'ok');
  assert.equal(swaps(r).length, 1, 'expected exactly one swap warning for a 20-path run, got ' + swaps(r).length);
});
