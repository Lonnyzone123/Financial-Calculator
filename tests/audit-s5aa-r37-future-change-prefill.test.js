/* S5AA R37 (SA32F-46; Claude's R32F full-model audit, confirmed by ChatGPT's R32V) -- A NEW FUTURE CONTRIBUTION CHANGE STARTS AT
 * TODAY'S ANNUAL DOLLARS, NOT AT THE PERCENTAGE.
 *
 * R32V: "UI's new future-change row copies a 10% contribution value into an amount/set field: $10/year if saved. The default is
 * misleading ... Preserve mode/unit or prefill the current calculated annual dollars; test the visible default and saved value."
 * A new change is "Set annual amount", which is dollars, so it now starts at the account's current planned annual dollars --
 * the figure accountPlannedContribution() gives at today's age on the owner's salary base. For a dollar-amount account that is
 * the amount itself, as before.
 *
 * Hand expectation: 10% of a 100,000 salary = 10,000 dollars a year; a 6,000-a-year dollar account starts at 6,000. */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadCalculator, waitFor } = require('./lib/harness');

const STORAGE_KEY = 'investment-calculator-v2c';

async function addChange(account) {
  const dom = await loadCalculator();
  const w = dom.window;
  const doc = w.document;
  try {
    const app = JSON.parse(w.localStorage.getItem(STORAGE_KEY));
    const scenario = app.scenarios[0];
    scenario.setupComplete = true;
    Object.assign(scenario.profile, { age: 40, retireAge: 65, endAge: 90, filing: 'single', spouseOn: false });
    Object.assign(scenario.employment, { salary: 100000, spouseSalary: 0, growth: 0, contributionStop: 65 });
    scenario.accounts = [Object.assign({
      id: 'a1', name: 'Savings', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 0, priority: 1, basisPct: 100,
      annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {},
      matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    }, account)];
    const root = doc.getElementById('investment-calculator-v2c');
    const input = root.querySelector('#v2-import-settings');
    const status = root.querySelector('#v2-status');
    const file = new w.File([JSON.stringify({ format: STORAGE_KEY, app })], 'backup.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    status.textContent = '';
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await waitFor(() => status.textContent !== '', { window: w });
    assert.doesNotMatch(status.textContent, /not restored/, 'the backup must be restored: ' + status.textContent);
    const button = () => [...root.querySelectorAll('button')].find((b) => b.textContent === 'Add future contribution change');
    await waitFor(() => !!button(), { window: w });
    button().click();
    const saved = () => JSON.parse(w.localStorage.getItem(STORAGE_KEY)).scenarios[0].accounts[0].futureChanges;
    await waitFor(() => saved().length === 1, { window: w, timeoutMs: 10000 });
    const row = root.querySelector('.v2-list-row');
    const shown = [...row.querySelectorAll('input[type="number"]')].map((i) => i.value);
    return { saved: saved()[0], shown };
  } finally {
    w.close();
  }
}

test('R37 SA32F-46: a percent-of-salary account\'s new change starts at its annual dollars', async () => {
  const r = await addChange({ contributionMode: 'salaryPct', contribution: 10 });
  assert.strictEqual(r.saved.mode, 'set');
  assert.strictEqual(r.saved.value, 10000, 'the 10% was copied into a dollar field as $10');
  assert.strictEqual(r.shown[1], '10000', 'the visible default');
});

test('R37 SA32F-46 control: a dollar account\'s new change starts at its amount, as before', async () => {
  const r = await addChange({ contributionMode: 'dollar', contribution: 6000 });
  assert.strictEqual(r.saved.value, 6000);
  assert.strictEqual(r.shown[1], '6000');
});
