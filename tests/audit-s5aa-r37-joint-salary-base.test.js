/* S5AA R37 (SA32F-45; Claude's R32F full-model audit, raised to P2 by ChatGPT's R32V) -- A JOINT ACCOUNT'S PERCENT OF SALARY IS
 * THE HOUSEHOLD'S SALARY, IN THE FORM, THE VALIDATOR AND THE ENGINE ALIKE.
 *
 * R32V: "UI:553 shows $16,000 from a joint percent-of-salary account; E plans $10,000 because it reads self compensation. A
 * displayed contribution dollar figure conflicts with the actual deposit ... Define joint ownership's compensation base once
 * for UI and engine; then hand-test it."
 * Defined once: a joint account belongs to the household, so its base is the household's salary -- the primary person's plus
 * the spouse's when a spouse is included. That is the figure the form already showed; the engine and the validator's
 * contribution check now use it too. Each salary counts only in a year its earner works (the engine's per-row salaries are
 * zero otherwise), and the account's deposits follow the primary person's contribution window, as before.
 *
 * Hand expectation: salaries 100,000 and 60,000, no growth, a joint brokerage at 10% of salary: 10% x 160,000 = 16,000 a year.
 * With no spouse included the spouse's salary is not the household's: 10% x 100,000 = 10,000. */
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
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const JOINT = { id: 'j', name: 'Joint', type: 'taxable', taxClass: 'taxable', owner: 'joint', balance: 0, basisPct: 100, contribution: 10,
  contributionMode: 'salaryPct', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], priority: 1 };

function planWith(spouseOn) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 45, retireAge: 60, endAge: 70, filing: spouseOn ? 'mfj' : 'single', spouseOn, spouseAge: 45 });
  Object.assign(p.employment, { salary: 100000, spouseSalary: 60000, growth: 0, contributionStop: 60 });
  Object.assign(p.assumptions, { inflation: 0, returnRate: 0 });
  p.accounts = [Object.assign({}, JOINT)];
  return p;
}

test('R37 SA32F-45: the engine deposits 10% of the household salary into a joint account', () => {
  const r = engine.runPlan(planWith(true));
  assert.strictEqual(r.status, 'ok');
  /* Row 0 is the opening row; row 1 is the first whole working year. */
  assert.strictEqual(r.rows[1].contributions, 16000, 'the engine read only the primary person\'s salary');
  /* CONTROL: with no spouse included, only the primary person's salary is the household's. */
  assert.strictEqual(engine.runPlan(planWith(false)).rows[1].contributions, 10000);
});

test('R37 SA32F-45: the validator\'s earned-income check reads the same base', () => {
  /* 10% of 160,000 is 16,000, inside earned income; at 70% it is 112,000, still inside 160,000 -- but above the primary person's
     100,000 alone, which the old base compared it with only because it counted 70,000. At 70%: planned 112,000 <= 160,000. */
  const p = planWith(true);
  p.accounts[0].contribution = 70;
  assert.ok(!validateScenario(p).issues.some((i) => i.code === 'CONTRIBUTIONS_ABOVE_EARNED_INCOME'));
  p.accounts[0].contribution = 110;
  const above = validateScenario(p).issues.find((i) => i.code === 'CONTRIBUTIONS_ABOVE_EARNED_INCOME');
  assert.ok(above, 'the validator compared 110% of the primary person\'s salary alone');
  assert.match(above.message, /planned contributions of 176000 a year/, 'the validator did not read the household base');
});

test('R37 SA32F-45: the form shows the same figure the engine deposits', async () => {
  for (const [spouseOn, shown] of [[true, '$16,000'], [false, '$10,000']]) {
    const dom = await loadCalculator();
    const w = dom.window;
    try {
      const STORAGE_KEY = 'investment-calculator-v2c';
      const app = JSON.parse(w.localStorage.getItem(STORAGE_KEY));
      app.scenarios[0] = Object.assign(app.scenarios[0], planWith(spouseOn), { id: app.scenarios[0].id, name: app.scenarios[0].name });
      const root = w.document.getElementById('investment-calculator-v2c');
      const input = root.querySelector('#v2-import-settings');
      const status = root.querySelector('#v2-status');
      const file = new w.File([JSON.stringify({ format: STORAGE_KEY, app })], 'backup.json', { type: 'application/json' });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      status.textContent = '';
      input.dispatchEvent(new w.Event('change', { bubbles: true }));
      await waitFor(() => status.textContent !== '', { window: w });
      assert.doesNotMatch(status.textContent, /not restored/, 'the backup must be restored: ' + status.textContent);
      await waitFor(() => w.document.getElementById('v2-contribution-total').textContent !== '', { window: w });
      assert.strictEqual(w.document.getElementById('v2-contribution-total').textContent, shown, 'spouse included: ' + spouseOn);
    } finally {
      w.close();
    }
  }
});
