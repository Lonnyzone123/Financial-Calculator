/* S5R-05 (the 2026-09-16 external audit's fifth finding): effectiveMarginalRate() (S5 task 9) accepted inputs it cannot
 * compute.
 *
 * The source was looked up in a plain object, so "toString", "constructor" and every other inherited name resolved to a
 * function, passed the check, and returned a rate of 0. The step was accepted whenever `delta > 0`, so the string "100"
 * was added to the income as text (a rate of 394353.5975 at $100,000) and Infinity returned NaN.
 *
 * Now a source is one of the three own names, and a given step is a positive finite number; anything else throws, as an
 * unknown source already did. Omitting the step still means $100. runPlan() does not call this helper, so the only
 * route is the direct call.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function household() {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  Object.assign(p.profile, { age: 80, spouseOn: false, filing: 'single' });
  return p;
}
const BASE = { ordinaryIncome: 100000 };
const rate = (source, delta) => engine.effectiveMarginalRate(household(), 80, BASE, source, delta);

test('S5R-05: an inherited name is not a source -- toString, constructor, __proto__ and hasOwnProperty throw', () => {
  for (const name of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) {
    assert.throws(() => rate(name), /unknown source/, name + ' must be refused, not priced at a rate of 0');
  }
});

test('S5R-05: a step that is not a positive finite number throws -- a numeric string, Infinity, NaN, 0 and a negative', () => {
  for (const delta of ['100', Infinity, NaN, 0, -100, null, true]) {
    assert.throws(() => rate('ordinary', delta), /step/, JSON.stringify(String(delta)) + ' must be refused');
  }
});

test('control: the three sources price as before, with the default and an explicit step', () => {
  const ordinary = rate('ordinary');
  assert.equal(ordinary.delta, 100);
  assert.ok(Number.isFinite(ordinary.above) && ordinary.above > 0 && ordinary.above < 1, 'ordinary above: ' + ordinary.above);
  assert.deepEqual(rate('ordinary', 100), ordinary, 'an explicit $100 step is the default');
  for (const source of ['capitalGains', 'qualifiedDividends']) {
    const r = engine.effectiveMarginalRate(household(), 80, { ordinaryIncome: 100000, capitalGains: 5000, qualifiedDividends: 5000 }, source, 250);
    assert.equal(r.source, source);
    assert.equal(r.delta, 250);
    assert.ok(Number.isFinite(r.above) && Number.isFinite(r.below), source + ': ' + JSON.stringify(r));
  }
});
