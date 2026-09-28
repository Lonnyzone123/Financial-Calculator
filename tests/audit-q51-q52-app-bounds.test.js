/* S5 block 2h.6 -- Q51 and Q52 in the app: a restored floor above its ceiling,
 * or a VPW minimum above its maximum, is kept as entered, and the results page
 * shows that the engine swapped it.
 *
 * Decided 2026-09-13 (the owner): disclose and swap; the engine half landed at
 * 6950422 (tests/audit-q51-q52-bounds-swap.test.js). The app half, decided
 * 2026-09-14 (the owner's answer (a), relayed by bd9f75): pass the entered pair
 * through. Measured before this, through a restored backup: the form reader
 * raised the ceiling to the floor (80,000 / 50,000 saved as 80,000 / 80,000)
 * and the VPW maximum to the minimum (5% / 3% saved as 5% / 5%), silently and
 * even for a strategy that never reads the pair. So no app user could see the
 * engine's swap warning: the pair never reached the engine inverted, and the
 * results page rendered no engine issue for it.
 *
 * Now the form keeps what was entered, and renderWarnings() shows the engine's
 * SPENDING_FLOOR_CEILING_SWAPPED or VPW_RATE_BOUNDS_SWAPPED message as a
 * "Spending bounds" card. The controls are the ordered pair and the equal pair
 * (the inclusive boundary) for each read, which must round-trip with no card.
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

/* Restores one scenario carrying the given retirement fields, then opens the
   results page and waits for THIS calculation to publish (the strategy-load app test's
   wait: a one-decimal success figure, and is-running dropped). */
async function restore(retirement) {
  const dom = await loadCalculator();
  const w = dom.window;
  const doc = w.document;
  const root = doc.getElementById('investment-calculator-v2c');
  const saved = () => {
    const r = JSON.parse(w.localStorage.getItem(STORAGE_KEY)).scenarios[0].retirement;
    return { floor: r.floor, ceiling: r.ceiling, vpwMinRate: r.vpwMinRate, vpwMaxRate: r.vpwMaxRate };
  };
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
    Object.assign(scenario.retirement, retirement);
    const message = await importBackup(dom, { format: STORAGE_KEY, app });
    assert.doesNotMatch(message, /not restored/, 'the backup must be restored: ' + message);
    const afterRestore = saved();
    root.querySelector('[data-page="results"]').click();
    const perf = doc.getElementById('v2-performance');
    await waitFor(() => /\d\.\d%$/.test(doc.getElementById('v2-stat-success').textContent) && !perf.classList.contains('is-running'), { window: w, timeoutMs: 15000 });
    return {
      afterRestore,
      afterResults: saved(),
      warnings: doc.getElementById('v2-warnings').textContent,
      success: doc.getElementById('v2-stat-success').textContent,
    };
  } finally {
    w.close();
  }
}

test('Q51 app: a restored floor above the ceiling is kept as entered, and the results page shows the engine swapped it', async () => {
  const r = await restore({ strategy: 'floorCeiling', withdrawalRate: 4, floor: 80000, ceiling: 50000 });
  assert.equal(r.afterRestore.ceiling, 50000, 'the restored ceiling was raised to the floor (' + r.afterRestore.ceiling + ') before the engine could see the inverted pair');
  assert.equal(r.afterRestore.floor, 80000);
  assert.equal(r.afterResults.ceiling, 50000, 'the ceiling must still be as entered once results have run');
  assert.match(r.success, /\d\.\d%$/, 'CONTROL: results rendered, so the card below is observed');
  assert.match(r.warnings, /Spending bounds/, 'no Spending bounds card on the results page: ' + r.warnings.slice(0, 200));
  assert.ok(r.warnings.includes('$80,000') && r.warnings.includes('$50,000') && r.warnings.includes('swapped'),
    'the card must carry the engine\'s own message, naming both amounts');
});

test('Q52 app: a restored VPW minimum above the maximum is kept as entered, and the results page shows the engine swapped it', async () => {
  const r = await restore({ strategy: 'vpw', vpwMinRate: 5, vpwMaxRate: 3 });
  assert.equal(r.afterRestore.vpwMaxRate, 3, 'the restored VPW maximum was raised to the minimum (' + r.afterRestore.vpwMaxRate + ') before the engine could see the inverted pair');
  assert.equal(r.afterRestore.vpwMinRate, 5);
  assert.equal(r.afterResults.vpwMaxRate, 3, 'the maximum must still be as entered once results have run');
  assert.match(r.success, /\d\.\d%$/, 'CONTROL: results rendered, so the card below is observed');
  assert.match(r.warnings, /Spending bounds/, 'no Spending bounds card on the results page: ' + r.warnings.slice(0, 200));
  assert.ok(r.warnings.includes('(5%)') && r.warnings.includes('(3%)') && r.warnings.includes('swapped'),
    'the card must carry the engine\'s own message, naming both rates');
});

test('Q51 app: a strategy that never reads the pair keeps it as entered, with no card', async () => {
  const r = await restore({ strategy: 'incomeFirst', floor: 80000, ceiling: 50000 });
  assert.equal(r.afterRestore.ceiling, 50000, 'the ceiling was raised to the floor (' + r.afterRestore.ceiling + ') even though income-first never reads it');
  assert.equal(r.afterResults.ceiling, 50000);
  assert.match(r.success, /\d\.\d%$/, 'CONTROL: results rendered, so the absence below is observed');
  assert.doesNotMatch(r.warnings, /Spending bounds/, 'a strategy that never reads the pair gets no swap, so no card');
});

async function assertRoundTrip(retirement) {
  const r = await restore(retirement);
  for (const key of Object.keys(retirement).filter((k) => k in r.afterRestore)) {
    assert.equal(r.afterRestore[key], retirement[key], key + ' changed on restore');
    assert.equal(r.afterResults[key], retirement[key], key + ' changed by the time results showed');
  }
  assert.match(r.success, /\d\.\d%$/, 'CONTROL: results rendered, so the absence below is observed');
  assert.doesNotMatch(r.warnings, /Spending bounds/, 'a pair that is not inverted is not swapped, so no card');
}

test('Q51 app control: an ordered floor and ceiling round-trip unchanged, with no card', async () => {
  await assertRoundTrip({ strategy: 'floorCeiling', withdrawalRate: 4, floor: 50000, ceiling: 80000 });
});

test('Q51 app control: an equal floor and ceiling, the inclusive boundary, round-trip unchanged, with no card', async () => {
  await assertRoundTrip({ strategy: 'floorCeiling', withdrawalRate: 4, floor: 60000, ceiling: 60000 });
});

test('Q52 app control: an ordered VPW pair round-trips unchanged, with no card', async () => {
  await assertRoundTrip({ strategy: 'vpw', vpwMinRate: 3, vpwMaxRate: 5 });
});

test('Q52 app control: an equal VPW pair, the inclusive boundary, round-trips unchanged, with no card', async () => {
  await assertRoundTrip({ strategy: 'vpw', vpwMinRate: 4, vpwMaxRate: 4 });
});
