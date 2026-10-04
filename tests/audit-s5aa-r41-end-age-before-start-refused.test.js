/* S5AA R41 (found by the task 6.5 browser check; the owner 2026-09-30: "Repair now") -- AN END AGE BEFORE THE STARTING AGE
 * IS REFUSED.
 *
 * MEASURED at 978a6e4 (s5aa-r40.1-source): the baseline plan with profile.endAge one year below profile.age validated as
 * valid, with one WARNING (INCONSISTENT_AGES at profile.endAge, which compares the end age with the RETIREMENT age only),
 * so the app's "Restore backup" accepted it; runScenario() returned no calculation error and two rows, at ages 29.5 and
 * then 28.5 -- a projection running backwards. The form cannot produce it: readStatic() raises the end age to at least the
 * retirement age, and the retirement age to at least the starting age. Now the engine's input gate refuses it
 * (SCENARIO_END_AGE_BEFORE_START, no rows) and the validator reports it as an ERROR (END_AGE_BEFORE_START), so the
 * import refuses the backup. An end age EQUAL to the start is not refused: the form produces it, and it projects one row.
 * Expectations are hand-derived from the rule, not read from another engine run.
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

const CODE = 'SCENARIO_END_AGE_BEFORE_START';
function plan({ age = 70, retireAge = 70, endAge = 69, method = 'simple' } = {}) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age, retireAge, endAge, spouseOn: false, spouseAge: age, filing: 'single' });
  Object.assign(p.assumptions, { method, returnRate: 5, inflation: 2, fee: 0, volatility: 10, runs: 50, seed: 7, historyStart: 1990 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 20000, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [], otherIncomes: [],
    selfLife: 95, spouseLife: 95, survivor: false });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = [{ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000, basisPct: 100, contribution: 0, priority: 1 }];
  return p;
}
const issuesOf = (r, code) => (r.issues || []).filter((i) => i.code === code);
const validatorIssues = (p) => validateScenario(JSON.parse(JSON.stringify(p))).issues.map((i) => i.severity + ' ' + i.code + '@' + i.path);

test('R41: an end age one year below the start is refused, in every method -- no rows, one ERROR naming the ages', () => {
  for (const method of ['simple', 'monteCarlo', 'historical']) {
    const r = engine.runPlan(plan({ age: 70, retireAge: 70, endAge: 69, method }));
    assert.equal(r.calculationErrorCode, CODE, method);
    assert.equal(r.rows, null, method + ': no rows');
    assert.notEqual(r.status, 'ok', method);
    const said = issuesOf(r, CODE);
    assert.equal(said.length, 1, method);
    assert.equal(said[0].severity, 'ERROR');
    assert.match(said[0].message, /ending age/);
    assert.match(said[0].message, /starting age/);
  }
});

test('R41: runScenario() refuses it too, and a fractional start is compared exactly (29.5 against 28.5)', () => {
  const r = engine.runScenario(plan({ age: 29.5, retireAge: 55, endAge: 28.5 }));
  assert.equal(r.calculationErrorCode, CODE);
  assert.equal(r.rows, null);
});

test('R41: the validator reports it as an ERROR at profile.endAge, so the import refuses the backup', () => {
  const p = plan({ age: 70, retireAge: 70, endAge: 69 });
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, false);
  assert.ok(validatorIssues(p).includes('ERROR END_AGE_BEFORE_START@profile.endAge'), validatorIssues(p).join(' | '));
});

test('R41, control: an end age EQUAL to the start is projected as before -- one row, at the starting age, no ERROR', () => {
  const p = plan({ age: 90, retireAge: 90, endAge: 90 });
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  assert.deepEqual(r.rows.map((x) => x.age), [90]);
  assert.equal(validatorIssues(p).filter((s) => s.startsWith('ERROR')).length, 0, validatorIssues(p).join(' | '));
});

test('R41, control: an end age between the start and the retirement age keeps its warning and is projected to the end age', () => {
  const p = plan({ age: 60, retireAge: 65, endAge: 63 });
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  assert.deepEqual(r.rows.map((x) => x.age), [60, 61, 62, 63]);
  const v = validatorIssues(p);
  assert.ok(v.includes('WARNING INCONSISTENT_AGES@profile.endAge'), v.join(' | '));
  assert.equal(v.filter((s) => s.startsWith('ERROR')).length, 0, v.join(' | '));
});

test('R41, control: a retirement age below the start (already retired) is projected; since R45 it warns only beside a salary', () => {
  // S5AA R45 (the owner, 2026-10-03, rule 8: "Warn only if a salary is entered"): an earlier retirement age is how a retired
  // household is entered, so with no salary there is no warning (R41 pinned one); a salary beside it still warns.
  const p = plan({ age: 70, retireAge: 65, endAge: 72 });
  p.employment.salary = 0;
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  assert.deepEqual(r.rows.map((x) => x.age), [70, 71, 72]);
  const v = validatorIssues(p);
  assert.ok(!v.includes('WARNING INCONSISTENT_AGES@profile.retireAge'), v.join(' | '));
  assert.equal(v.filter((s) => s.startsWith('ERROR')).length, 0, v.join(' | '));
  p.employment.salary = 50000;
  assert.ok(validatorIssues(p).includes('WARNING INCONSISTENT_AGES@profile.retireAge'), 'a salary beside a past retirement age');
});
