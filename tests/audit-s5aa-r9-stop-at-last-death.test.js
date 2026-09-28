/* S5AA R9 round, the owner's decision 8 (2026-09-21): THE PROJECTION STOPS AT THE LAST DEATH.
 *
 * EA-01 (the R6 external audit) found that a projection carried on for rows in which nobody the plan models is alive --
 * spending, withdrawals, tax and returns for a household that no longer exists -- and repaired it by DISCLOSING those
 * rows as outside the supported domain (UNSUPPORTED_POST_DEATH_HOUSEHOLD). What a projection should DO there was left as
 * a product decision (decision 8 of the repair report). The external reviewer recommended stopping and reporting final
 * values; the owner decided: stop.
 *
 * Now the last row is the one in which the last person the plan models dies: a row is projected only while someone is
 * alive at its opening, by householdSurvivorship() -- the same reading EA-01's predicate, the filing status and the
 * Medicare count use -- so the year of the last death is the final row, and its balances are what the household leaves.
 * No row with nobody alive exists, so nothing is outside the supported domain for that reason any more, and
 * UNSUPPORTED_POST_DEATH_HOUSEHOLD is replaced by PROJECTION_ENDS_AT_LAST_DEATH (a WARNING, inside the domain), raised
 * once when the horizon was cut. A horizon that ends before the last death is unchanged.
 * Rows are labelled by the age at which they END; rows[0] is the opening snapshot. Tested through runPlan only.
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
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

function run({ age = 90, spouseAge = null, selfLife = 95, spouseLife = 95, endAge = 100, method = 'simple' }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const spouse = spouseAge !== null;
  Object.assign(p.profile, { age, retireAge: 60, endAge, spouseOn: spouse, spouseAge: spouse ? spouseAge : age, filing: spouse ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method, returnRate: 5, inflation: 2, fee: 0, volatility: 10, runs: 100, seed: 7 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 20000, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [], otherIncomes: [],
    selfLife, spouseLife, survivor: false });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = [{ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000, basisPct: 100, contribution: 0, priority: 1 }];
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const labels = (r) => r.rows.map((x) => x.age);
const issuesOf = (r, code) => (r.issues || []).filter((i) => i.code === code);

test('decision 8: one person with a lifespan of 95 against a horizon of 100 -- the last row is the year of the death', () => {
  const r = run({});
  assert.deepEqual(labels(r), [90, 91, 92, 93, 94, 95, 96], 'the row opening at 95 is the year of death; nothing after it');
});

test('decision 8: a couple -- the projection runs to the SECOND death, not the first', () => {
  const r = run({ age: 78, spouseAge: 78, selfLife: 80, spouseLife: 85 });
  assert.equal(labels(r)[labels(r).length - 1], 86, 'the spouse dies at 85; the row opening at 85 is the last');
  assert.ok(labels(r).includes(82), 'the rows after the first death, with a survivor, are kept');
});

test('decision 8: a fractional lifespan -- alive at the row\'s opening means the row is projected', () => {
  assert.equal(labels(run({ selfLife: 95.5 })).slice(-1)[0], 96, 'alive at 95, dead at 96');
});

test('decision 8 control: a horizon that ends before the last death is unchanged, and says nothing', () => {
  const r = run({ endAge: 94 });
  assert.equal(labels(r).slice(-1)[0], 94);
  assert.equal(issuesOf(r, 'PROJECTION_ENDS_AT_LAST_DEATH').length, 0);
});

test('decision 8: the cut is disclosed once, inside the supported domain, and the old exclusion is gone', () => {
  const r = run({});
  const said = issuesOf(r, 'PROJECTION_ENDS_AT_LAST_DEATH');
  assert.equal(said.length, 1);
  assert.equal(said[0].severity, 'WARNING');
  assert.equal(said[0].state.outsideSupportedDomain, undefined, 'no row is outside the domain for this reason any more');
  assert.equal(said[0].state.lastRowAge, 96);
  assert.equal(said[0].state.horizonEndAge, 100);
  assert.equal(issuesOf(r, 'UNSUPPORTED_POST_DEATH_HOUSEHOLD').length, 0);
  assert.equal((r.issues || []).filter((i) => i.state && i.state.outsideSupportedDomain).length, 0, 'nothing else in this plan is outside the domain');
});

test('decision 8: Monte Carlo stops at the same row', () => {
  assert.equal(labels(run({ method: 'monteCarlo' })).slice(-1)[0], 96);
});

/* INVERTED after the R9 round (fifth internal audit, finding 3; the owner, 2026-09-22, "refuse"): this plan returned "ok" with
   only the opening balances and no shortfall, a 100% success rate over no projected years. It is now refused. */
test('decision 8, with the refusal: nobody alive at the start -- the plan is refused, not reported as a success', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 90, retireAge: 60, endAge: 100, spouseOn: false, spouseAge: 90, filing: 'single' });
  Object.assign(p.retirement, { selfLife: 85 });
  const r = engine.runPlan(p);
  assert.equal(r.calculationErrorCode, 'SCENARIO_NOBODY_ALIVE_AT_START');
  assert.equal(r.rows, null, 'no rows');
  assert.equal(issuesOf(r, 'DEATH_BEFORE_PLAN_START').length, 0, 'the refusal replaces the warning that nothing was projected');
});

/* THE RESULT CONTRACT'S R-AGE-SPAN, amended with this decision (tools/result-contract.js): a result that carries
   PROJECTION_ENDS_AT_LAST_DEATH must end at the cut the CHECKER derives from the plan's lifespans, and the disclosure
   must name it. Without the disclosure, profile.endAge -- as before. Positive and negative controls, on real results. */
const { checkResult } = require(path.join(ROOT, 'tools', 'result-contract.js'));
function planFor(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 90, retireAge: 60, endAge: 100, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 5, inflation: 2, fee: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 20000, ssBenefit: 0, pension: 0, otherIncomes: [], selfLife: 95 }, o);
  p.accounts = [{ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000, basisPct: 100, contribution: 0, priority: 1 }];
  return p;
}
const ageSpan = (result, plan) => checkResult(result, { plan }).violations.filter((v) => v.rule === 'R-AGE-SPAN');

test('decision 8, contract: a real cut result conforms to R-AGE-SPAN', () => {
  const plan = planFor({});
  assert.deepEqual(ageSpan(engine.runPlan(plan), plan), []);
});

test('decision 8, contract: a result that stops early WITHOUT the disclosure violates R-AGE-SPAN', () => {
  const plan = planFor({});
  const r = engine.runPlan(plan);
  r.issues = r.issues.filter((i) => i.code !== 'PROJECTION_ENDS_AT_LAST_DEATH');
  assert.equal(ageSpan(r, plan).length, 1, 'held to profile.endAge');
});

test('decision 8, contract: a disclosure that names the wrong cut, or a cut the lifespans do not give, violates R-AGE-SPAN', () => {
  const plan = planFor({});
  const wrong = engine.runPlan(plan);
  wrong.issues.find((i) => i.code === 'PROJECTION_ENDS_AT_LAST_DEATH').state.stoppedAtRowOpening = 94;
  assert.ok(ageSpan(wrong, plan).length >= 1, 'the checker derives 96 from the plan itself');
  const alive = planFor({ selfLife: 105 });
  const claimed = engine.runPlan(planFor({}));
  assert.ok(ageSpan(claimed, alive).length >= 1, 'against a plan whose person outlives the horizon, a cut is not permitted');
});
