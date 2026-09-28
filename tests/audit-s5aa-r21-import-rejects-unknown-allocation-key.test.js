/* S5AA R21 round: R20-01 through the app -- A BACKUP WHOSE ACCOUNT ALLOCATES TO AN ASSET CLASS THE PLAN DOES NOT DEFINE
 * IS NOT RESTORED (ChatGPT's R19/R20 audit, 2026-09-24, priority 2; the owner 2026-09-23: reject it at validation).
 *
 * The import is the only way such a key reaches the app: the Remove button deletes a class's key from every account,
 * and an account shows allocation boxes only for the plan's own classes. importSettings() blocks a backup on any
 * validation ERROR and names it in the status line, leaving the current scenarios unchanged. The validator contract
 * itself, and why the key misprices a glide, are in tests/audit-s5aa-r21-unknown-allocation-key.test.js.
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

/* Restores a backup of the app's own saved state whose one account holds `allocation`, with `classes` as the plan's
   class list when given. Returns the status line and the account's allocation as saved afterwards. */
async function restore(allocation, classes) {
  const dom = await loadCalculator();
  const w = dom.window;
  try {
    const app = JSON.parse(w.localStorage.getItem(STORAGE_KEY));
    const before = JSON.stringify(app.scenarios[0].accounts);
    const scenario = app.scenarios[0];
    scenario.setupComplete = true;
    Object.assign(scenario.advanced, { assetsOn: true, glideOn: true, retirementStock: 20 });
    if (classes) scenario.advanced.assetClasses = classes;
    scenario.accounts = [{
      id: 'mixed', name: 'Mixed', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1000000, contribution: 0,
      contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
      changeTiming: 'year', futureChanges: [], allocation, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    }];
    const message = await importBackup(dom, { format: STORAGE_KEY, app });
    const saved = JSON.parse(w.localStorage.getItem(STORAGE_KEY)).scenarios[0].accounts;
    return { message, savedAllocation: saved[0] && saved[0].allocation, unchanged: JSON.stringify(saved) === before };
  } finally {
    w.close();
  }
}

test('R20-01 app: a backup allocating 25% to "ghost", a class the plan does not define, is not restored, and says why', async () => {
  const r = await restore({ stocks: 50, bonds: 25, ghost: 25 });
  assert.match(r.message, /not restored/, 'the backup was restored: ' + r.message);
  assert.match(r.message, /"ghost"/, 'the message must name the key: ' + r.message);
  assert.match(r.message, /"mixed"/, 'the message must name the account: ' + r.message);
  assert.equal(r.unchanged, true, 'the current scenarios must be left unchanged');
});

test('R20-01 app: CONTROL -- a backup whose class list was edited to add a class, and allocates to it, is restored', async () => {
  const classes = [
    { id: 'stocks', name: 'Stocks', returnRate: 10, volatility: 18.5 },
    { id: 'bonds', name: 'Bonds', returnRate: 4.5, volatility: 7 },
    { id: 'asset-abc123', name: 'Custom asset', returnRate: 7, volatility: 15 },
  ];
  const r = await restore({ stocks: 50, bonds: 25, 'asset-abc123': 25 }, classes);
  assert.doesNotMatch(r.message, /not restored/, 'the backup must be restored: ' + r.message);
  assert.deepEqual(r.savedAllocation, { stocks: 50, bonds: 25, 'asset-abc123': 25 });
});

test('R20-01 app: the same backup with that class removed from the list but its key left on the account is not restored', async () => {
  const classes = [
    { id: 'stocks', name: 'Stocks', returnRate: 10, volatility: 18.5 },
    { id: 'bonds', name: 'Bonds', returnRate: 4.5, volatility: 7 },
  ];
  const r = await restore({ stocks: 50, bonds: 25, 'asset-abc123': 25 }, classes);
  assert.match(r.message, /not restored/, 'the backup was restored: ' + r.message);
  assert.match(r.message, /"asset-abc123"/);
  assert.equal(r.unchanged, true);
});
