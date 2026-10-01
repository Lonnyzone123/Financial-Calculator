/* S5AA R37 (SA32F-27, SA32F-35, SA32F-38; Claude's R32F full-model audit, each confirmed or qualified by ChatGPT's R32V) --
 * THREE PLAN WARNINGS, AND THE APP SHOWS THEM.
 *
 * SA32F-27: the 1959 RMD warning (PROPOSED_RULE_USED) tested only the primary person's birth year. A spouse born in 1959 uses
 *   the same proposed age-73 record with no warning. R32V: "asymmetric authority disclosure ... Keep authority-status refresh
 *   separate from owner symmetry." Each person born in 1959 whom the plan carries to 73 now gets the warning, with their path.
 * SA32F-35: filing status and household are not checked against each other. R32V: "do not reject all spouseOff/MFJ plans ...
 *   Improve explanation/consistency checks." The recommendation of record is a warning, not a refusal: a married couple files
 *   jointly or separately (head of household only when considered unmarried), so a joint return with no spouse modelled, and a
 *   single or head-of-household return with a spouse included, are each reported as FILING_HOUSEHOLD_MISMATCH. (Married filing
 *   separately is not a status the tax tables define; Q68's gate refuses it as SCENARIO_UNKNOWN_FILING_STATUS.)
 * SA32F-38: an expense at or after the plan's end age falls in no row ([start, end) intervals) and is never charged. R32V: "The
 *   accepted but ineffective input needs a clear horizon warning." Reported as EXPENSE_AFTER_PLAN_END.
 *
 * Before this round the app rendered three engine issue codes as cards (RETIREMENT_STRATEGY_UNRECOGNIZED,
 * SPENDING_FLOOR_CEILING_SWAPPED and VPW_RATE_BOUNDS_SWAPPED), so any other warning the engine recorded reached no one. These three, and the 1959 warning, now show as cards on the results page. */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadCalculator, waitFor } = require('./lib/harness');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function planWith(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 62, endAge: 95, filing: 'single', spouseOn: false });
  p.accounts = [{ id: 't', name: 'IRA', type: 'customTraditional', taxClass: 'pretax', owner: 'self', balance: 400000, contribution: 0 }];
  p.advanced.rmdOn = true;
  edit(p);
  return p;
}
function issues(p, code) {
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', 'CONTROL: the plan runs');
  return r.issues.filter((i) => i.code === code);
}

test('R37 SA32F-27: a spouse born in 1959 gets the proposed-rule warning, as the primary person does', () => {
  const spouse = issues(planWith((p) => { Object.assign(p.profile, { filing: 'mfj', spouseOn: true, spouseAge: 67 }); }), 'PROPOSED_RULE_USED');
  assert.strictEqual(spouse.length, 1, 'no warning for the spouse born in 1959');
  assert.strictEqual(spouse[0].state.path, 'profile.spouseAge');
  assert.strictEqual(spouse[0].state.birthYear, 1959);
  assert.strictEqual(spouse[0].state.rmdStartAge, 73);
  /* CONTROLS: the primary person's warning is unchanged; both born in 1959 get one each; a spouse not included gets none; a
     spouse the plan never carries to 73 gets none. */
  const self = issues(planWith((p) => { p.profile.age = 67; }), 'PROPOSED_RULE_USED');
  assert.deepStrictEqual(self.map((i) => i.state.path), ['profile.age']);
  const both = issues(planWith((p) => { Object.assign(p.profile, { age: 67, filing: 'mfj', spouseOn: true, spouseAge: 67 }); }), 'PROPOSED_RULE_USED');
  assert.deepStrictEqual(both.map((i) => i.state.path), ['profile.age', 'profile.spouseAge']);
  assert.strictEqual(issues(planWith((p) => { Object.assign(p.profile, { spouseAge: 67 }); }), 'PROPOSED_RULE_USED').length, 0);
  assert.strictEqual(issues(planWith((p) => { Object.assign(p.profile, { age: 60, endAge: 65, filing: 'mfj', spouseOn: true, spouseAge: 67 }); }), 'PROPOSED_RULE_USED').length, 0);
});

test('R37 SA32F-35: a filing status that does not fit the household is reported, and the plan still runs', () => {
  const jointAlone = issues(planWith((p) => { p.profile.filing = 'mfj'; }), 'FILING_HOUSEHOLD_MISMATCH');
  assert.strictEqual(jointAlone.length, 1, 'a joint return with no spouse modelled was not reported');
  assert.strictEqual(jointAlone[0].severity, 'WARNING');
  assert.strictEqual(jointAlone[0].state.path, 'profile.filing');
  for (const filing of ['single', 'hoh']) {
    assert.strictEqual(issues(planWith((p) => { Object.assign(p.profile, { filing, spouseOn: true, spouseAge: 60 }); }), 'FILING_HOUSEHOLD_MISMATCH').length, 1,
      filing + ' with a spouse included was not reported');
  }
  /* CONTROLS: the coherent pairs are not reported. */
  assert.strictEqual(issues(planWith((p) => { Object.assign(p.profile, { filing: 'mfj', spouseOn: true, spouseAge: 60 }); }), 'FILING_HOUSEHOLD_MISMATCH').length, 0);
  assert.strictEqual(issues(planWith(() => {}), 'FILING_HOUSEHOLD_MISMATCH').length, 0);
});

test('R37 SA32F-38: an expense at or after the plan end age is reported as never charged', () => {
  const at = issues(planWith((p) => { p.retirement.expenses = [{ name: 'Roof', kind: 'expense', age: 95, amount: 30000 }]; }), 'EXPENSE_AFTER_PLAN_END');
  assert.strictEqual(at.length, 1, 'an expense at the end age was dropped in silence');
  assert.strictEqual(at[0].state.path, 'retirement.expenses[0].age');
  assert.strictEqual(issues(planWith((p) => { p.retirement.expenses = [{ name: 'Roof', kind: 'expense', age: 99, amount: 30000 }]; }), 'EXPENSE_AFTER_PLAN_END').length, 1);
  /* CONTROLS: an expense inside the plan is charged and not reported; a zero amount has nothing to charge. */
  const inside = planWith((p) => { p.retirement.expenses = [{ name: 'Roof', kind: 'expense', age: 94, amount: 30000 }]; });
  assert.strictEqual(issues(inside, 'EXPENSE_AFTER_PLAN_END').length, 0);
  assert.strictEqual(issues(planWith((p) => { p.retirement.expenses = [{ name: 'Roof', kind: 'expense', age: 95, amount: 0 }]; }), 'EXPENSE_AFTER_PLAN_END').length, 0);
});

test('R37 app: the results page shows the filing, expense and 1959 warnings as cards', async () => {
  const dom = await loadCalculator();
  const w = dom.window;
  const doc = w.document;
  try {
    const STORAGE_KEY = 'investment-calculator-v2c';
    const app = JSON.parse(w.localStorage.getItem(STORAGE_KEY));
    const scenario = app.scenarios[0];
    scenario.setupComplete = true;
    Object.assign(scenario.profile, { age: 67, retireAge: 67, endAge: 90, filing: 'single', spouseOn: true, spouseAge: 66 });
    scenario.advanced.rmdOn = true;
    scenario.accounts = [{
      id: 'a1', name: 'IRA', type: 'customTraditional', taxClass: 'pretax', owner: 'self', balance: 800000, contribution: 0,
      contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
      changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    }];
    scenario.retirement.expenses = [{ id: 'e1', name: 'Roof', kind: 'expense', age: 90, amount: 30000 }];
    const root = doc.getElementById('investment-calculator-v2c');
    const input = root.querySelector('#v2-import-settings');
    const status = root.querySelector('#v2-status');
    const file = new w.File([JSON.stringify({ format: STORAGE_KEY, app })], 'backup.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    status.textContent = '';
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await waitFor(() => status.textContent !== '', { window: w });
    assert.doesNotMatch(status.textContent, /not restored/, 'the backup must be restored: ' + status.textContent);
    root.querySelector('[data-page="results"]').click();
    const perf = doc.getElementById('v2-performance');
    await waitFor(() => /\d\.\d%$/.test(doc.getElementById('v2-stat-success').textContent) && !perf.classList.contains('is-running'), { window: w, timeoutMs: 15000 });
    const warnings = doc.getElementById('v2-warnings').textContent;
    assert.match(warnings, /Filing status:/, 'no filing card: ' + warnings.slice(0, 400));
    assert.match(warnings, /Expense after plan end:/, 'no expense card');
    assert.match(warnings, /Required distributions:.*1959/, 'no 1959 card');
  } finally {
    w.close();
  }
});
