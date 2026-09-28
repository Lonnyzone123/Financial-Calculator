/* S5AA R21 round: R20-01 -- AN ALLOCATION KEY FOR AN ASSET CLASS THE PLAN DOES NOT DEFINE IS REJECTED (ChatGPT's R19/R20
 * audit, 2026-09-24, priority 2; contract chosen by the owner 2026-09-23: reject it at validation).
 *
 * accountGlideWeights() divides the known classes' weights by the sum of ALL allocation keys, then scales the non-stock
 * weights by 1 - stock, as if the unknown key were not there. So an account allocated {stocks:50, bonds:25, ghost:25}
 * with a glide to 20% stock lands at stock .20 and bonds .25 x .80 / .50 = .40, which normalises to one third stock and
 * two thirds bonds -- 6.3333% at the default 10% / 4.5% rates, $1,063,333.33 on $1,000,000 in a year, where the 20/80
 * target is 5.6% and $1,056,000. The validator checked only that each weight was a finite number, so the plan passed.
 *
 * The app cannot make such a key: its Remove button deletes the class's key from every account, and it shows an
 * account's allocation boxes only for classes the plan defines, so a stray key could not even be seen. It arrives only in
 * a hand-edited or foreign file. The rule: every allocation key must be the id of one of advanced.assetClasses, whatever
 * its weight (a zero weight included) and whether or not assetsOn is set, since the classes can be switched on later.
 *
 * This file holds the validator contract, by validateScenario(), and one runPlan() witness that the recognised mix the
 * rejected plan stood for glides to its target. The import route through the app is
 * tests/audit-s5aa-r21-import-rejects-unknown-allocation-key.test.js.
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
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const CODE = 'UNKNOWN_ALLOCATION_CLASS';

const account = (id, allocation) => ({ id, name: id, type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1e6,
  basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 });

/* The audit's plan: one year at 60, retiring at 60, $1,000,000 taxable, a glide to 20% stock, no flows. */
function plan(allocations, o = {}) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, volatility: 0, inflation: 0, fee: 0, withdrawalTiming: 'annual' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: 60 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [],
    otherIncomes: [], dividendOn: true, dividendYield: 0 });
  Object.assign(p.advanced, { assetsOn: o.assetsOn !== false, glideOn: true, retirementStock: 20, correlation: 0.25, rmdOn: false,
    healthOn: false, ltcOn: false, reserveOn: false, bondTentOn: false, conversionOn: false, transferOn: false, debts: [], otherAssets: [] });
  if (o.classes) p.advanced.assetClasses = o.classes;
  p.accounts = allocations.map((al, i) => account('acct-' + (i + 1), al));
  return p;
}

const issuesOf = (p, code = CODE) => validateScenario(JSON.parse(JSON.stringify(p))).issues.filter((i) => i.code === code);

test('R20-01: the audit\'s plan, {stocks:50, bonds:25, ghost:25}, is invalid, with one ERROR at accounts[0].allocation.ghost', () => {
  const p = plan([{ stocks: 50, bonds: 25, ghost: 25 }]);
  const report = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(report.valid, false, 'it passed validation, so an import accepted it');
  const hits = report.issues.filter((i) => i.code === CODE);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].severity, 'ERROR');
  assert.equal(hits[0].path, 'accounts[0].allocation.ghost');
  /* The app's import message shows only the message, so it must name the key and the account itself. */
  assert.match(hits[0].message, /"ghost"/);
  assert.match(hits[0].message, /"acct-1"/);
  assert.deepEqual(report.issues.filter((i) => i.severity === 'ERROR').map((i) => i.code), [CODE], 'the only error');
});

test('R20-01: CONTROL -- the same holdings on known classes only are valid, and glide to the 20/80 target: $1,056,000', () => {
  /* 0.2 x 10% + 0.8 x 4.5% = 5.6% on $1,000,000. The rejected plan gave $1,063,333.33 (one third x 10% + two thirds x
     4.5% = 6.3333%). */
  const p = plan([{ stocks: 66.66666666666667, bonds: 33.33333333333333 }]);
  const report = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(report.valid, true, JSON.stringify(report.issues));
  assert.equal(issuesOf(p).length, 0);
  assert.equal(Math.round(engine.runPlan(p).rows[1].total * 100) / 100, 1056000);
});

test('R20-01: a zero weight on an unknown class is rejected too -- the rule is the key, not its weight', () => {
  assert.deepEqual(issuesOf(plan([{ stocks: 75, bonds: 25, ghost: 0 }])).map((i) => i.path), ['accounts[0].allocation.ghost']);
});

test('R20-01: the rule holds with the asset classes switched off, since they can be switched on later', () => {
  assert.deepEqual(issuesOf(plan([{ stocks: 50, bonds: 25, ghost: 25 }], { assetsOn: false })).map((i) => i.path),
    ['accounts[0].allocation.ghost']);
});

test('R20-01: every unknown key on every account is reported, each at its own path', () => {
  const p = plan([{ stocks: 70, bonds: 25, cash: 5 }, { stocks: 40, gold: 30, bonds: 20, crypto: 10 }]);
  assert.deepEqual(issuesOf(p).map((i) => i.path), ['accounts[1].allocation.gold', 'accounts[1].allocation.crypto']);
});

test('R20-01: a class the user added is known once it is in the class list, and unknown once it is removed from it', () => {
  /* The app's Add button gives a custom class a generated id ("asset-...") and a 0 weight on every account. */
  const classes = defaultPlan.advanced.assetClasses.concat([{ id: 'asset-abc123', name: 'Custom asset', returnRate: 7, volatility: 15 }]);
  const withClass = plan([{ stocks: 50, bonds: 25, cash: 0, 'asset-abc123': 25 }], { classes });
  assert.equal(validateScenario(JSON.parse(JSON.stringify(withClass))).valid, true);
  const removed = plan([{ stocks: 50, bonds: 25, cash: 0, 'asset-abc123': 25 }], { classes: defaultPlan.advanced.assetClasses });
  assert.deepEqual(issuesOf(removed).map((i) => i.path), ['accounts[0].allocation.asset-abc123']);
});

test('R20-01: a key spelled like an Object.prototype property is unknown unless a class has that id (Q67)', () => {
  /* Q67: asset-class ids are user-editable, so "constructor" is an ordinary id. It must be looked up as an own id, never
     through the prototype. */
  assert.deepEqual(issuesOf(plan([{ stocks: 50, bonds: 25, constructor: 25 }])).map((i) => i.path),
    ['accounts[0].allocation.constructor']);
  const classes = defaultPlan.advanced.assetClasses.concat([{ id: 'constructor', name: 'Odd id', returnRate: 5, volatility: 10 }]);
  assert.equal(issuesOf(plan([{ stocks: 50, bonds: 25, constructor: 25 }], { classes })).length, 0);
});

test('R20-01: no class list to check against, no report here -- the class list\'s own problem is reported instead', () => {
  const notArray = plan([{ stocks: 50, bonds: 25, ghost: 25 }]);
  notArray.advanced.assetClasses = 'stocks';
  assert.equal(issuesOf(notArray).length, 0);
  assert.ok(issuesOf(notArray, 'WRONG_TYPE').some((i) => i.path === 'advanced.assetClasses'), 'CONTROL: the class list is reported');
  const absent = plan([{ stocks: 50, bonds: 25, ghost: 25 }]);
  delete absent.advanced.assetClasses;
  assert.equal(issuesOf(absent).length, 0);
});
