/* S5 block 2k.5 -- Q58 on load: a saved plan's strategy is never erased, a
 * wrong-case name is normalised silently, and an unrecognised one is reported
 * on the results page while the plan runs as incomeFirst.
 *
 * Decided 2026-09-13 (the owner): no separate migration pass; apply warn-and-default
 * uniformly, including on load. Measured before this, through a restored
 * backup: an unknown saved name, and even a merely wrong-cased 'Guardrails',
 * were written back as "" at once. The strategy <select> cannot hold an
 * unmatched value, and readStatic() copied its blank value over the saved
 * name, so the engine only ever saw an empty one.
 *
 * Now writeStatic() puts the canonical name into the select, readStatic() keeps
 * the stored name while the select is blank, and renderWarnings() shows the
 * engine's RETIREMENT_STRATEGY_UNRECOGNIZED warning as a card. The engine half
 * is tests/audit-q58-strategy-resolution.test.js.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadCalculator, waitFor } = require('./lib/harness');

const STORAGE_KEY = 'investment-calculator-v2c';

async function importBackup(dom, payload) {
  const { document, File, Event } = dom.window;
  const root = document.getElementById('investment-calculator-v2c');
  const input = root.querySelector('#v2-import-settings');
  const status = root.querySelector('#v2-status');
  const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  status.textContent = '';
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor(() => status.textContent !== '', { window: dom.window });
  return status.textContent;
}

async function restoreWithStrategy(strategy) {
  const dom = await loadCalculator();
  const w = dom.window;
  const doc = w.document;
  const root = doc.getElementById('investment-calculator-v2c');
  const saved = () => JSON.parse(w.localStorage.getItem(STORAGE_KEY)).scenarios[0].retirement.strategy;
  try {
    const app = JSON.parse(w.localStorage.getItem(STORAGE_KEY));
    const scenario = app.scenarios[0];
    scenario.setupComplete = true;
    Object.assign(scenario.profile, { age: 60, retireAge: 62, endAge: 85 });
    scenario.accounts = [{
      id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 800000, contribution: 0,
      contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
      changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    }];
    Object.assign(scenario.retirement, { strategy, withdrawalRate: 4, floor: 0, ceiling: 10000000 });
    const message = await importBackup(dom, { format: STORAGE_KEY, app });
    assert.doesNotMatch(message, /not restored/, 'the backup must be restored: ' + message);
    const savedAfterRestore = saved();
    const selectValue = root.querySelector('#v2-strategy').value;
    root.querySelector('[data-page="results"]').click();
    /* Wait for THIS calculation to publish. The results page shows a "0%"
       placeholder at once, so a bare /%$/ wait returned before renderResults()
       ran, and the warnings panel was read empty (measured on this witness's
       first run). The published stat has one decimal, and the publish step
       drops is-running in the same callback that renders. */
    const perf = doc.getElementById('v2-performance');
    await waitFor(() => /\d\.\d%$/.test(doc.getElementById('v2-stat-success').textContent) && !perf.classList.contains('is-running'), { window: w, timeoutMs: 15000 });
    return {
      savedAfterRestore,
      selectValue,
      savedAfterResults: saved(),
      warnings: doc.getElementById('v2-warnings').textContent,
      definition: doc.getElementById('v2-strategy-definition').textContent,
      success: doc.getElementById('v2-stat-success').textContent,
    };
  } finally {
    w.close();
  }
}

test('Q58 app, unknown saved name: restoring it keeps the name, and the results page says the plan ran as income-first', async () => {
  const r = await restoreWithStrategy('bucketStrategy');
  assert.equal(r.savedAfterRestore, 'bucketStrategy', 'the saved strategy was erased to ' + JSON.stringify(r.savedAfterRestore) + ' on restore');
  assert.equal(r.savedAfterResults, 'bucketStrategy', 'the saved strategy was erased to ' + JSON.stringify(r.savedAfterResults) + ' by the time results showed');
  assert.equal(r.selectValue, '', 'the select cannot show a name it does not offer');
  assert.match(r.success, /\d\.\d%$/, 'CONTROL: results rendered');
  assert.match(r.warnings, /Withdrawal strategy/, 'no strategy card on the results page: ' + r.warnings.slice(0, 300));
  assert.ok(r.warnings.includes('bucketStrategy'), 'the card names the saved value');
  assert.notEqual(r.definition, 'undefined', 'a blank select must not print "undefined"');
});

test('Q58 app, wrong case: restoring Guardrails selects and saves guardrails, and reports nothing', async () => {
  const r = await restoreWithStrategy('Guardrails');
  assert.equal(r.savedAfterRestore, 'guardrails', 'the wrong-case strategy was saved as ' + JSON.stringify(r.savedAfterRestore) + ' on restore (erased, not normalised)');
  assert.equal(r.selectValue, 'guardrails');
  assert.equal(r.savedAfterResults, 'guardrails');
  assert.match(r.success, /\d\.\d%$/, 'CONTROL: results rendered');
  assert.doesNotMatch(r.warnings, /Withdrawal strategy/, 'a wrong-case name is normalised silently');
});

test('Q58 app control: an exact saved name round-trips unchanged and unreported', async () => {
  const r = await restoreWithStrategy('guardrails');
  assert.equal(r.savedAfterRestore, 'guardrails');
  assert.equal(r.selectValue, 'guardrails');
  assert.equal(r.savedAfterResults, 'guardrails');
  assert.match(r.success, /\d\.\d%$/, 'CONTROL: results rendered, so the absence below is observed');
  assert.doesNotMatch(r.warnings, /Withdrawal strategy/);
});
