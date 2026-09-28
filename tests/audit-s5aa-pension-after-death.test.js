/* S5AA third audit, the owner's decision of 2026-09-21: "disclose the pension".
 *
 * `retirement.pension` is paid whenever the self is retired, with no death check, so a pension keeps
 * paying in full after the self dies -- and, where the self dies before retiring, starts paying after
 * the death. That is an unstated assumption of a 100% joint-and-survivor annuity. It is KEPT as the
 * behaviour and DISCLOSED as an approximation; a survivor percentage is not modelled.
 *
 * Tested through runPlan only.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

function run(over) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 66, spouseAge: 64, retireAge: 65, endAge: 80, spouseOn: true, filing: 'mfj' }, (over || {}).profile);
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 30000, pensionCola: 0, ssBenefit: 0,
    spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 70, spouseLife: 95,
  }, (over || {}).retirement);
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, qcd: 0, debts: [], otherAssets: [] });
  p.accounts = [{ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 100000,
    basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0,
    matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const said = (r) => (r.issues || []).find((i) => i.code === 'PENSION_AFTER_DEATH_ASSUMED');
const income = (r, age) => Number(r.rows.find((x) => x.age === age).income);

test('the pension is still paid in full after the self dies -- the behaviour is KEPT', () => {
  const r = run();
  assert.equal(income(r, 70), 30000, 'CONTROL: alive');
  assert.equal(income(r, 75), 30000, 'after the death at 70, unchanged: this commit discloses, it does not repair');
});

test('and the household is told what that assumes', () => {
  const issue = said(run());
  assert.ok(issue, 'disclosed');
  assert.equal(issue.severity, 'WARNING');
  assert.equal(issue.state.approximation, true);
  assert.equal(issue.state.outsideSupportedDomain, undefined, 'an approximation, not an exclusion');
  assert.equal(issue.state.path, 'retirement.pension');
  assert.equal(issue.state.assumed, '100% joint-and-survivor');
  assert.ok(/survivor/.test(issue.message) && /100%/.test(issue.message));
});

test('only where a pension is paid at some point after the self\'s death', () => {
  assert.ok(!said(run({ retirement: { selfLife: 95 } })), 'the self outlives the horizon');
  assert.ok(!said(run({ retirement: { pension: 0 } })), 'no pension');
  assert.ok(said(run({ profile: { age: 55, spouseAge: 53 }, retirement: { selfLife: 60 } })),
    'dying BEFORE retiring is the starker case -- the pension starts after the death -- and is told too');
});
