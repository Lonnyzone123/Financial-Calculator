/* S5AA R20 round: R18F-01, THE PORTFOLIO ARITHMETIC (internals) -- A GLIDE PATH'S RETURN AND RISK COME FROM ONE ALLOCATION (ChatGPT's R18 full-model audit,
 * 2026-09-24, priority 1; its own number R18-01, renumbered R18F-01; repair and the all-stock destination chosen by the owner
 * 2026-09-23: the stock share a glide gives up goes into bonds).
 *
 * accountExpected() moved the stock weight toward advanced.retirementStock; accountVolatility() read the OPENING
 * allocation; so a Monte Carlo draw paired the glided mean with the opening portfolio's risk. An 80/20 account at its
 * 20% target was drawn at 5.6% with 15.21% volatility, where a 20/80 portfolio has 7.44%: its tenth percentile fell
 * $96,875 below a static 20/80 account's on the same seed. And an account that starts 100% in stocks had nowhere to
 * glide: at a 60% target it stayed all stock (10%), and at 0% its expected return collapsed to 0%.
 *
 * The oracle is the portfolio arithmetic, written here and not read from the engine: expected return is the weighted
 * mean of the classes' rates, and volatility is sqrt(w' S w) with S built from each class's volatility and the one
 * correlation. The whole-plan witnesses are in tests/audit-s5aa-r20-glide-one-allocation.test.js. The default classes: stocks 10% / 18.5%, bonds 4.5% / 7%, cash 3% / 1%; correlation 0.25.
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

const CLASSES = [{ id: 'stocks', r: 0.10, v: 0.185 }, { id: 'bonds', r: 0.045, v: 0.07 }, { id: 'cash', r: 0.03, v: 0.01 }];
const RHO = 0.25;
const mean = (w) => CLASSES.reduce((s, c) => s + (w[c.id] || 0) * c.r, 0);
const vol = (w) => {
  let v = 0;
  for (const a of CLASSES) for (const b of CLASSES) v += (w[a.id] || 0) * (w[b.id] || 0) * a.v * b.v * (a.id === b.id ? 1 : RHO);
  return Math.sqrt(v);
};
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-12, label + ': ' + actual + ' vs ' + expected);
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
  Object.assign(p.advanced, { assetsOn: true, glideOn: o.glideOn !== false, retirementStock: o.target, correlation: RHO, rmdOn: false,
    healthOn: false, ltcOn: false, reserveOn: false, bondTentOn: false, conversionOn: false, transferOn: false, debts: [], otherAssets: [] });
  if (o.classes) p.advanced.assetClasses = o.classes;
  p.accounts = [account(o.allocation)];
  assert.equal(validator.validateScenario(JSON.parse(JSON.stringify(p))).valid, true, 'a valid plan');
  return p;
}

test('R18F-01: at its target, an 80/20 account gliding to 20% stocks has the 20/80 return AND the 20/80 volatility', () => {
  const p = plan({ age: 60, retireAge: 60, endAge: 61, target: 20, allocation: { stocks: 80, bonds: 20, cash: 0 } });
  const a = p.accounts[0], w = { stocks: 0.2, bonds: 0.8 };
  close(engine.accountExpected(a, p, 0, null), mean(w), 'expected return 5.6%');
  close(engine.accountVolatility(a, p, 0), vol(w), 'volatility 7.443789%');
});

test('R18F-01: halfway along the glide, return and volatility both read the halfway allocation', () => {
  /* 80/20 at 55, target 20% at 65: five years in, stocks are 50%, and bonds scale from 20% to 50%. */
  const p = plan({ age: 55, retireAge: 65, endAge: 56, target: 20, allocation: { stocks: 80, bonds: 20, cash: 0 } });
  const a = p.accounts[0], w = { stocks: 0.5, bonds: 0.5 };
  close(engine.accountExpected(a, p, 5, null), mean(w), 'expected return 7.25%');
  close(engine.accountVolatility(a, p, 5), vol(w), 'volatility');
});

test('R18F-01 control: with the glide off, or with no year given, volatility reads the opening allocation, as before', () => {
  const on = plan({ age: 60, retireAge: 60, endAge: 61, target: 20, allocation: { stocks: 80, bonds: 20, cash: 0 } });
  const off = plan({ age: 60, retireAge: 60, endAge: 61, target: 20, glideOn: false, allocation: { stocks: 80, bonds: 20, cash: 0 } });
  const w = { stocks: 0.8, bonds: 0.2 };
  close(engine.accountVolatility(off.accounts[0], off, 0), vol(w), 'glide off');
  close(engine.accountExpected(off.accounts[0], off, 0, null), mean(w), 'glide off, return 8.9%');
  close(engine.accountVolatility(on.accounts[0], on), vol(w), 'no year given (the down-year account ranking)');
});

test('R18F-01 (the owner: into bonds): an all-stock account gliding to 60% stocks is 60/40 at its target', () => {
  const p = plan({ age: 60, retireAge: 60, endAge: 61, target: 60, allocation: { stocks: 100, bonds: 0, cash: 0 } });
  const a = p.accounts[0], w = { stocks: 0.6, bonds: 0.4 };
  close(engine.accountExpected(a, p, 0, null), mean(w), 'expected return 7.8%');
  close(engine.accountVolatility(a, p, 0), vol(w), 'volatility');
});

test('R18F-01 (the owner: into bonds): an all-stock account gliding to 0% stocks is all bonds -- 4.5%, not 0%', () => {
  const p = plan({ age: 60, retireAge: 60, endAge: 61, target: 0, allocation: { stocks: 100, bonds: 0, cash: 0 } });
  const a = p.accounts[0];
  close(engine.accountExpected(a, p, 0, null), 0.045, 'expected return');
  close(engine.accountVolatility(a, p, 0), 0.07, 'volatility');
});

test('R18F-01: with no bonds class to glide into, an all-stock account keeps its allocation -- return and risk still agree', () => {
  const classes = [{ id: 'stocks', name: 'US stocks', returnRate: 10, volatility: 18.5 }, { id: 'cash', name: 'Cash', returnRate: 3, volatility: 1 }];
  const p = plan({ age: 60, retireAge: 60, endAge: 61, target: 0, classes, allocation: { stocks: 100, cash: 0 } });
  const a = p.accounts[0];
  close(engine.accountExpected(a, p, 0, null), 0.10, 'expected return stays all-stock');
  close(engine.accountVolatility(a, p, 0), 0.185, 'volatility stays all-stock');
});
