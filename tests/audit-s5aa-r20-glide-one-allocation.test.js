/* S5AA R20 round: R18F-01 -- A GLIDE PATH'S RETURN AND RISK COME FROM ONE ALLOCATION (ChatGPT's R18 full-model audit,
 * 2026-09-24, priority 1; its own number R18-01, renumbered R18F-01; repair and the all-stock destination chosen by the owner
 * 2026-09-23: the stock share a glide gives up goes into bonds).
 *
 * accountExpected() moved the stock weight toward advanced.retirementStock; accountVolatility() read the OPENING
 * allocation; so a Monte Carlo draw paired the glided mean with the opening portfolio's risk. An 80/20 account at its
 * 20% target was drawn at 5.6% with 15.21% volatility, where a 20/80 portfolio has 7.44%: its tenth percentile fell
 * $96,875 below a static 20/80 account's on the same seed. And an account that starts 100% in stocks had nowhere to
 * glide: at a 60% target it stayed all stock (10%), and at 0% its expected return collapsed to 0%.
 *
 * This file holds the whole-plan witnesses, through runPlan() only. The portfolio arithmetic -- expected return the
 * weighted mean of the classes' rates, volatility sqrt(w' S w) from each class's volatility and the one correlation --
 * is tested directly, and written independently of the engine, in tests/audit-s5aa-r20-glide-one-allocation-internals.test.js.
 * The default classes: stocks 10% / 18.5%, bonds 4.5% / 7%, cash 3% / 1%; correlation 0.25.
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
const validator = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const round = (x) => Math.round(Number(x) * 100) / 100;

const account = (allocation) => ({ id: 'mixed', name: 'mixed', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1e6,
  basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 });

function plan(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: o.age, retireAge: o.retireAge, endAge: o.endAge, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: o.method || 'simple', returnRate: 0, volatility: 0, inflation: 0, fee: 0,
    withdrawalTiming: 'annual', seed: 42791, runs: 1000 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: o.age });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [],
    otherIncomes: [], dividendOn: true, dividendYield: 0 });
  Object.assign(p.advanced, { assetsOn: true, glideOn: o.glideOn !== false, retirementStock: o.target, correlation: 0.25, rmdOn: false,
    healthOn: false, ltcOn: false, reserveOn: false, bondTentOn: false, conversionOn: false, transferOn: false, debts: [], otherAssets: [] });
  if (o.classes) p.advanced.assetClasses = o.classes;
  p.accounts = [account(o.allocation)];
  assert.equal(validator.validateScenario(JSON.parse(JSON.stringify(p))).valid, true, 'a valid plan');
  return p;
}

test('R18F-01 through runPlan: the glided account and a static 20/80 account give the same Monte Carlo percentiles', () => {
  /* The audit's witness: one year, 1,000 paths, seed 42791, no flows. At its target the glided account IS a 20/80
     portfolio, so its percentiles must match a static 20/80 account's on the same seed (it was $96,875 lower at q10). */
  const glide = plan({ method: 'monteCarlo', age: 60, retireAge: 60, endAge: 61, target: 20, allocation: { stocks: 80, bonds: 20, cash: 0 } });
  const fixed = plan({ method: 'monteCarlo', age: 60, retireAge: 60, endAge: 61, target: 20, glideOn: false, allocation: { stocks: 20, bonds: 80, cash: 0 } });
  const g = engine.runPlan(glide).rows[1], s = engine.runPlan(fixed).rows[1];
  assert.deepEqual([round(g.q10), round(g.total), round(g.q90)], [round(s.q10), round(s.total), round(s.q90)]);
});

test('R18F-01 through runPlan: an all-stock account gliding to 60% grows 10% then 7.8% -- $1,185,800', () => {
  /* 59 to 61, retiring at 60: the first year is at the opening allocation (all stock, 10%), the second at the target
     (60/40, 7.8%). It was $1,210,000 (all stock both years); at a 0% target it was $1,100,000 (a 0% second year). */
  const sixty = engine.runPlan(plan({ age: 59, retireAge: 60, endAge: 61, target: 60, allocation: { stocks: 100, bonds: 0, cash: 0 } }));
  assert.deepEqual(sixty.rows.map((r) => round(r.total)), [1000000, 1100000, 1185800]);
  const zero = engine.runPlan(plan({ age: 59, retireAge: 60, endAge: 61, target: 0, allocation: { stocks: 100, bonds: 0, cash: 0 } }));
  assert.deepEqual(zero.rows.map((r) => round(r.total)), [1000000, 1100000, 1149500]);
});
