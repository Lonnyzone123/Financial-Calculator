/* S5AA, after the R9 round: A PLAN IN WHICH NOBODY IS ALIVE AT THE START IS REFUSED (fifth internal audit, finding 3;
 * the owner's decision of 2026-09-22, "refuse").
 *
 * Since decision 8 the projection stops at the first row opening at which nobody the plan models is alive. A plan whose
 * every lifespan ended before its starting age is cut at the opening itself: MEASURED at bd8c922, a person of 90 with a
 * lifespan of 85 returned status "ok", one row (the opening balances), no shortfall -- so a 100% success rate over no
 * projected years -- and only a WARNING (DEATH_BEFORE_PLAN_START) saying nothing was projected. A result that reads as
 * a success for a projection that was never run is refused instead, as the input gate refuses any scenario it cannot
 * project: SCENARIO_NOBODY_ALIVE_AT_START, no rows. "Alive" is householdSurvivorship() at the starting age, the reading
 * decision 8's cut uses, so a lifespan EQUAL to the starting age is a death inside the first row and is projected, and a
 * couple with one survivor is projected as before. Tested through runPlan() and runScenario().
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

const CODE = 'SCENARIO_NOBODY_ALIVE_AT_START';
function plan({ age = 90, spouseAge = null, selfLife = 95, spouseLife = 95, method = 'simple' }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const spouse = spouseAge !== null;
  Object.assign(p.profile, { age, retireAge: 60, endAge: 100, spouseOn: spouse, spouseAge: spouse ? spouseAge : age, filing: spouse ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method, returnRate: 5, inflation: 2, fee: 0, volatility: 10, runs: 50, seed: 7 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 20000, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [], otherIncomes: [],
    selfLife, spouseLife, survivor: false });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = [{ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000, basisPct: 100, contribution: 0, priority: 1 }];
  return p;
}
const issuesOf = (r, code) => (r.issues || []).filter((i) => i.code === code);

test('fifth audit, finding 3: one person whose lifespan ended before the start -- refused, no rows, no success rate', () => {
  for (const method of ['simple', 'monteCarlo', 'historical']) {
    const r = engine.runPlan(plan({ age: 90, selfLife: 85, method }));
    assert.equal(r.calculationErrorCode, CODE, method);
    assert.equal(r.rows, null, method + ': no rows');
    assert.notEqual(r.status, 'ok', method);
    const said = issuesOf(r, CODE);
    assert.equal(said.length, 1, method);
    assert.equal(said[0].severity, 'ERROR');
    assert.match(said[0].message, /lifespan/);
  }
});

test('fifth audit, finding 3: a couple who both died before the start -- refused', () => {
  const r = engine.runPlan(plan({ age: 70, spouseAge: 70, selfLife: 65, spouseLife: 66 }));
  assert.equal(r.calculationErrorCode, CODE);
  assert.equal(r.rows, null);
});

test('fifth audit, finding 3: runScenario() refuses it too', () => {
  const r = engine.runScenario(plan({ age: 90, selfLife: 85 }));
  const result = r && r.result !== undefined ? r.result : r;
  assert.equal(result.calculationErrorCode, CODE);
});

test('fifth audit, finding 3, control: a lifespan EQUAL to the starting age is a death inside the first row, and is projected', () => {
  const r = engine.runPlan(plan({ age: 90, selfLife: 90 }));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  assert.deepEqual(r.rows.map((x) => x.age), [90, 91]);
});

test('fifth audit, finding 3, control: a couple with one survivor at the start is projected, and the death is disclosed as before', () => {
  const r = engine.runPlan(plan({ age: 72, spouseAge: 74, selfLife: 90, spouseLife: 70 }));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  assert.equal(issuesOf(r, 'DEATH_BEFORE_PLAN_START').length, 1);
  assert.equal(issuesOf(r, CODE).length, 0);
});

test('fifth audit, finding 3, control: a spouse lifespan left over with the spouse switched off does not refuse a living person', () => {
  const p = plan({ age: 70, selfLife: 90 });
  Object.assign(p.profile, { spouseOn: false, spouseAge: 80 });
  p.retirement.spouseLife = 60;
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.calculationErrorCode);
});
