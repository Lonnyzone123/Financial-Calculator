/* S5AA, R11 round: THE CONTRACT DERIVES DECISION 8 FOR A CURRENT RESULT, INSTEAD OF BELIEVING THE RESULT'S OWN WARNING
 * (external audit of `02b921a`, R10-08).
 *
 * R-AGE-SPAN held a result to the checker's own cut ONLY where the result carried PROJECTION_ENDS_AT_LAST_DEATH, and to
 * profile.endAge otherwise. That was written for backward compatibility -- a capture taken before decision 8 must still
 * be judged as it was -- but it let the thing under test choose its own rule. MEASURED at `02b921a`: a genuine result
 * (start 90, lifespan 95, last row 96) passes; so does the same result with the disclosure REMOVED and unchanged
 * zero-flow rows appended through age 100, and so does one whose disclosure claims `lastRowAge: 123`.
 *
 * Now a result checked under the CURRENT contract version must satisfy the cut whether or not it says anything: where
 * the plan's lifespans give a cut, the last row is that cut and the disclosure must be there and name it (its
 * `lastRowAge` is the last row, its `horizonEndAge` is profile.endAge). A result checked under an older version -- what
 * a legacy capture is checked under -- keeps exactly the old reading. The captured rows themselves are never rewritten.
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
const { checkResult } = require(path.join(ROOT, 'tools', 'result-contract.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

function planFor({ age = 90, selfLife = 95, endAge = 100 }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age, retireAge: 60, endAge, spouseOn: false, spouseAge: age, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [],
    otherIncomes: [], selfLife, spouseLife: selfLife, survivor: false });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = [{ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000, basisPct: 100, contribution: 0, priority: 1 }];
  return p;
}
const ageSpan = (result, plan, version) => checkResult(result, version === undefined ? { plan } : { plan, contractVersion: version })
  .violations.filter((v) => v.rule === 'R-AGE-SPAN');
const clone = (x) => JSON.parse(JSON.stringify(x));

test('R10-08 control: a genuine current result passes, as before', () => {
  const plan = planFor({});
  const r = engine.runPlan(plan);
  assert.equal(r.rows[r.rows.length - 1].age, 96);
  assert.deepEqual(ageSpan(r, plan), []);
});

test('R10-08: a result that removes the disclosure and restores the rows after the death is a violation', () => {
  const plan = planFor({});
  const r = engine.runPlan(plan);
  const mutant = clone(r);
  mutant.issues = (mutant.issues || []).filter((i) => i.code !== 'PROJECTION_ENDS_AT_LAST_DEATH');
  const last = mutant.rows[mutant.rows.length - 1];
  for (let age = 97; age <= 100; age++) mutant.rows.push(Object.assign(clone(last), { age }));
  const v = ageSpan(mutant, plan);
  assert.equal(v.length, 2, 'the cut comes from the plan, not from the result saying so');
  assert.ok(v.some((x) => /does not carry PROJECTION_ENDS_AT_LAST_DEATH/.test(x.message)), 'the missing disclosure is named');
  assert.ok(v.some((x) => /expected the last-death cut 96, got 100/.test(x.message)), 'and so are the rows that should not exist');
});

test('R10-08: a result whose disclosure misreports the last row is a violation', () => {
  const plan = planFor({});
  const mutant = clone(engine.runPlan(plan));
  const stop = mutant.issues.find((i) => i.code === 'PROJECTION_ENDS_AT_LAST_DEATH');
  stop.state.lastRowAge = 123;
  assert.equal(ageSpan(mutant, plan).length, 1, 'the disclosure must name the row the result actually ends at');
});

test('R10-08: a current result that stops at the cut but says nothing is a violation', () => {
  const plan = planFor({});
  const mutant = clone(engine.runPlan(plan));
  mutant.issues = (mutant.issues || []).filter((i) => i.code !== 'PROJECTION_ENDS_AT_LAST_DEATH');
  assert.equal(ageSpan(mutant, plan).length, 1, 'stopping early without saying so was already a violation, and stays one');
});

test('R10-08 control: a plan with no cut is held to profile.endAge, and must not claim one', () => {
  const plan = planFor({ selfLife: 100 });
  const r = engine.runPlan(plan);
  assert.equal(r.rows[r.rows.length - 1].age, 100);
  assert.deepEqual(ageSpan(r, plan), [], 'nobody dies inside the horizon');
});

test('R10-08 control: under the older contract version, the old reading is unchanged', () => {
  const plan = planFor({});
  const mutant = clone(engine.runPlan(plan));
  mutant.issues = (mutant.issues || []).filter((i) => i.code !== 'PROJECTION_ENDS_AT_LAST_DEATH');
  const last = mutant.rows[mutant.rows.length - 1];
  for (let age = 97; age <= 100; age++) mutant.rows.push(Object.assign(clone(last), { age }));
  assert.deepEqual(ageSpan(mutant, plan, 2), [], 'a capture from before decision 8 is judged as it always was');
});
