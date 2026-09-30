/* S5AA R38 (R37's open question on the default filing status; the owner 2026-09-29: "go with your recommendations" -- default to single) --
 * A NEW PLAN FILES SINGLE.
 *
 * The app's default plan filed jointly with no spouse included, so every untouched plan taxed one person's income on the joint brackets --
 * roughly twice as wide -- and showed R37's FILING_HOUSEHOLD_MISMATCH card. It now files single, matching its default of no spouse. A
 * saved plan keeps the filing status it was saved with. The tests' copy of the default plan (tests/lib/golden-scenario-defs.js) keeps the
 * joint return every corpus plan, fixture and test was written on, as it already keeps their starting age -- so the control, the golden
 * fixtures and the expanded corpus do not move. */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const capture = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
capture.installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

test('R38: the default plan files single, and an untouched plan carries no filing warning', () => {
  assert.strictEqual(defaultPlan.profile.filing, 'single');
  assert.strictEqual(defaultPlan.profile.spouseOn, false);
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual((r.issues || []).filter((i) => i.code === 'FILING_HOUSEHOLD_MISMATCH').length, 0);
});

test('R38: the default plan\'s first year is taxed on the single brackets', () => {
  /* 30, a $60,000 salary, no growth, no inflation, no accounts. Worked by hand on the 2026 figures:
     federal: 60,000 - 16,100 standard deduction = 43,900; 10% of 12,400 + 12% of 31,500 = 1,240 + 3,780 = 5,020.
     Arizona: 2.5% of 43,900 = 1,097.50. Payroll: 7.65% of 60,000 = 4,590. Total 10,707.50.
     (On the joint return it filed before: 60,000 - 32,200 = 27,800; 2,480 + 360 = 2,840 + 695 + 4,590 = 8,125.) */
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.employment, { salary: 60000, growth: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0 });
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(+r.rows[1].taxes.toFixed(2), 10707.5);
});

test('R38: the tests\' base plan keeps the joint return, apart from the app, and so does the corpus', () => {
  const golden = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js'));
  assert.strictEqual(golden.extractDefaultPlan(shell).profile.filing, 'mfj');
  /* The married pair never set a filing status of its own; it still files jointly. */
  const entries = capture.corpus().filter((e) => e.name === 'targeted:historical-spouse-ss' || e.name === 'targeted:spouse-cola-income');
  assert.strictEqual(entries.length, 2);
  entries.forEach((e) => assert.deepStrictEqual([e.name, e.plan.profile.filing, e.plan.profile.spouseOn], [e.name, 'mfj', true]));
});
