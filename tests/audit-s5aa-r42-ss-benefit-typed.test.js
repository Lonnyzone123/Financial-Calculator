/* S5AA R42 (ChatGPT's R41F-05, the R41F whole-model audit; the owner 2026-09-30: "Repair all five in R42") -- A SOCIAL
 * SECURITY AMOUNT THAT IS NOT A NUMBER IS REFUSED.
 *
 * MEASURED at 984197c: retirement.ssBenefit "abc" validated as valid, and runPlan() returned status "ok" with $0 of benefit
 * where the same plan with 2500 had $30,000 in its age-68 row; Restore backup accepted it, and the form then stored 0. A typo
 * or a malformed backup erased an income stream without a word. Now a PRESENT ssBenefit or spouseSS that is not a finite
 * number is WRONG_TYPE in the validator (so the import refuses the backup) and is refused by the engine as
 * SCENARIO_NONNUMBER_PLAN_VALUE, the R25 refusal for a plan field the validator types. An ABSENT field is unchanged.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadCalculator, waitFor } = require('./lib/harness');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

function plan(ssBenefit, { spouseSS, spouseOn = false } = {}) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 66, retireAge: 66, endAge: 68, spouseOn, spouseAge: 66, filing: spouseOn ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit, ssClaim: 67, spouseClaim: 67, ssCola: 0, ssAdvanced: false,
    pension: 0, stages: [], expenses: [], otherIncomes: [], survivor: false, selfLife: 95, spouseLife: 95 });
  if (spouseSS !== undefined) p.retirement.spouseSS = spouseSS;
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = [{ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 0, basisPct: 100, contribution: 0, priority: 1 }];
  return p;
}
const issues = (p) => validateScenario(JSON.parse(JSON.stringify(p))).issues.map((i) => i.severity + ' ' + i.code + '@' + i.path);

test('R42 (R41F-05) control: a numeric benefit of $2,500 a month claimed at 67 pays $30,000 in the age-68 row', () => {
  const r = engine.runPlan(plan(2500));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  assert.equal(r.rows.find((x) => x.age === 68).income, 30000);
});

test('R42 (R41F-05): ssBenefit "abc" is WRONG_TYPE in the validator and refused by the engine, by path', () => {
  for (const bad of ['abc', '2500', null, true]) {
    const p = plan(bad);
    assert.ok(issues(p).includes('ERROR WRONG_TYPE@retirement.ssBenefit'), JSON.stringify(bad) + ': ' + issues(p).join(' | '));
    const r = engine.runPlan(p);
    assert.equal(r.calculationErrorCode, 'SCENARIO_NONNUMBER_PLAN_VALUE', JSON.stringify(bad));
    assert.equal(r.rows, null);
    const said = (r.issues || []).find((i) => i.code === 'SCENARIO_NONNUMBER_PLAN_VALUE');
    assert.equal(said.state.path, 'retirement.ssBenefit');
  }
});

test('R42 (R41F-05): the spouse\'s benefit is typed the same way', () => {
  const p = plan(2500, { spouseSS: 'abc', spouseOn: true });
  assert.ok(issues(p).includes('ERROR WRONG_TYPE@retirement.spouseSS'), issues(p).join(' | '));
  const r = engine.runPlan(p);
  assert.equal(r.calculationErrorCode, 'SCENARIO_NONNUMBER_PLAN_VALUE');
  assert.equal((r.issues || []).find((i) => i.code === 'SCENARIO_NONNUMBER_PLAN_VALUE').state.path, 'retirement.spouseSS');
});

test('R42 (R41F-05) control: an ABSENT benefit field is not an error, and the plan runs as before', () => {
  const p = plan(2500);
  delete p.retirement.ssBenefit;
  delete p.retirement.spouseSS;
  assert.equal(issues(p).filter((s) => /retirement\.(ssBenefit|spouseSS)/.test(s)).length, 0, issues(p).join(' | '));
  assert.equal(engine.runPlan(p).status, 'ok');
});

test('R42 (R41F-05): Restore backup refuses a backup whose ssBenefit is not a number, and leaves the saved plan alone', async () => {
  const dom = await loadCalculator();
  const w = dom.window, root = w.document.getElementById('investment-calculator-v2c');
  try {
    const app = JSON.parse(w.localStorage.getItem('investment-calculator-v2c'));
    const before = JSON.stringify(app.scenarios[0].retirement.ssBenefit);
    const candidate = JSON.parse(JSON.stringify(app));
    candidate.scenarios[0].setupComplete = true;
    candidate.scenarios[0].retirement.ssBenefit = 'abc';
    const input = root.querySelector('#v2-import-settings'), status = root.querySelector('#v2-status');
    const file = new w.File([JSON.stringify({ format: 'investment-calculator-v2c', app: candidate })], 'backup.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    status.textContent = '';
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await waitFor(() => status.textContent !== '', { window: w });
    assert.match(status.textContent, /not restored/, status.textContent);
    assert.match(status.textContent, /retirement\.ssBenefit/, status.textContent);
    assert.equal(JSON.stringify(JSON.parse(w.localStorage.getItem('investment-calculator-v2c')).scenarios[0].retirement.ssBenefit), before);
  } finally { w.close(); }
});
