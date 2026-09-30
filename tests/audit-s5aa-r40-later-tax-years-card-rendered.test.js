/* S5AA R40 (exit gate E14: "every changed disclosure is read rendered") -- R36'S "LATER TAX YEARS" CARD, READ IN THE PAGE.
 *
 * R36 (cf643a8, SA32F-D1 by the owner's decision 8, with D8) indexes each later year's 2026 figures the way the law indexes
 * them and added a results-page card saying so, including the owner's choice to keep the senior deduction after 2028. No test
 * read that card as the page shows it; R37's cards are read rendered (audit-s5aa-r37-plan-warnings). This loads the built
 * app, runs a plan to the results page and reads the card's text there, so a card that stops rendering, or a sentence that
 * stops saying what R36 decided, fails here. */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadCalculator, waitFor } = require('./lib/harness');

test('R40: the results page shows R36\'s "Later tax years" card, with what it decided', async () => {
  const dom = await loadCalculator();
  const w = dom.window;
  const doc = w.document;
  try {
    const STORAGE_KEY = 'investment-calculator-v2c';
    const app = JSON.parse(w.localStorage.getItem(STORAGE_KEY));
    const scenario = app.scenarios[0];
    scenario.setupComplete = true;
    Object.assign(scenario.profile, { age: 60, retireAge: 65, endAge: 90, filing: 'single', spouseOn: false });
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
    const cards = [...doc.getElementById('v2-warnings').querySelectorAll('.v2-card')].map((c) => c.textContent);
    const card = cards.find((t) => t.startsWith('Later tax years:'));
    assert.ok(card, 'no "Later tax years" card among: ' + cards.map((t) => t.split(':')[0]).join(' | '));
    assert.match(card, /indexes the 2026 figures the way the law indexes them/);
    assert.match(card, /rise with this plan's inflation rate, standing in for the official price index/);
    assert.match(card, /rise with the salary-growth rate, standing in for the national wage index/);
    assert.match(card, /Amounts the law fixes stay fixed/);
    assert.match(card, /the senior deduction, which this plan keeps after 2028/, 'the owner\'s D8 choice must be stated');
  } finally {
    w.close();
  }
});
