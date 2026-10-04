'use strict';
const { retireAtEnd } = require('./lib/working-horizon'); // S5AA R53 (the owner's decision 3, 2026-10-04): working-only horizons

/*
 * S5 block 2r -- SA-05 through the built app.
 *
 * The contribution-limit warnings a user sees are computed in the app, not by
 * the engine: the account summary's "2026 limit status" and the results page's
 * "Contribution limit" cards each run the contribution audit themselves. Before
 * the repair both ran it without owner eligibility, so a retired spouse's HSA
 * request was checked as if both spouses were still working. The engine
 * deposited the full $8,750 and reported nothing, while the app showed
 * "1 warning" and a card saying the working owner exceeded the HSA limit by
 * $7,750.
 *
 * The existing guard calls the engine's internal audit directly and reads the
 * app's source text for the two calls. This file drives the built app in jsdom
 * instead: it restores a backup through the app's own import control, reads the
 * account summary, then opens the results page and reads its warning cards.
 *
 * Household: filing jointly, self 60 and working at $100,000, spouse 70 and
 * retired, a shared retirement and contribution-stop age of 65, the prevent
 * limit policy, no return or inflation, one year. The spouse's $8,750 HSA is
 * listed before the self's $8,750 HSA.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
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

const hsa = (id, owner, priority, contribution) => ({
  id, name: id, type: 'hsa', taxClass: 'hsa', owner, balance: 0, contribution, contributionMode: 'amount', priority,
  basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
  allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
});

/** Restores the household with these accounts, then reads the limit status and, once this calculation has published
 *  (a one-decimal success figure, and is-running dropped), the results page's contribution-limit cards. */
async function observeOnce(accounts) {
  const dom = await loadCalculator();
  const w = dom.window;
  const doc = w.document;
  const root = doc.getElementById('investment-calculator-v2c');
  try {
    const app = JSON.parse(w.localStorage.getItem(STORAGE_KEY));
    const s = app.scenarios[0];
    s.setupComplete = true;
    Object.assign(s.profile, { age: 60, spouseAge: 70, spouseOn: true, retireAge: 65, endAge: 61, filing: 'mfj' });
    retireAtEnd(s); // S5AA R53: an end age before the retirement age is refused; the owner retires at the end age instead (output-neutral, tests/lib/working-horizon.js)
    Object.assign(s.employment, { salary: 100000, spouseSalary: 0, growth: 0, contributionStop: 65 });
    s.limitPolicy = 'prevent';
    Object.assign(s.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0 });
    Object.assign(s.advanced, {
      rmdOn: false, healthOn: false, ltcOn: false, conversionOn: false, transferOn: false, reserveOn: false,
      bondTentOn: false, assetsOn: false, debts: [], otherAssets: [],
    });
    s.accounts = accounts;
    const message = await importBackup(dom, { format: STORAGE_KEY, app });
    assert.doesNotMatch(message, /not restored/, 'the backup must be restored: ' + message);
    const limitStatus = doc.getElementById('v2-limit-status').textContent;
    root.querySelector('[data-page="results"]').click();
    const perf = doc.getElementById('v2-performance');
    await waitFor(() => /\d\.\d%$/.test(doc.getElementById('v2-stat-success').textContent) && !perf.classList.contains('is-running'), { window: w, timeoutMs: 15000 });
    const limitCards = Array.from(doc.getElementById('v2-warnings').children)
      .map((c) => c.textContent.replace(/\s+/g, ' ').trim())
      .filter((t) => /^Contribution limit/.test(t));
    return { limitStatus, success: doc.getElementById('v2-stat-success').textContent, limitCards };
  } finally {
    w.close();
  }
}
const seen = new Map();
const observe = (key, accounts) => {
  if (!seen.has(key)) seen.set(key, observeOnce(accounts));
  return seen.get(key);
};
const retiredSpouseHousehold = () => observe('household', [hsa('spouseHSA', 'spouse', 1, 8750), hsa('selfHSA', 'self', 2, 8750)]);
const overLimitHousehold = () => observe('over-limit', [hsa('selfHSA', 'self', 1, 20000)]);

test('SA-05 (app): with the spouse retired, the account summary shows the HSA requests within limits, as the engine deposits them', async () => {
  const r = await retiredSpouseHousehold();
  assert.equal(r.limitStatus, 'Within limits',
    'the account summary must read Within limits for a retired spouse and a working owner: got ' + r.limitStatus);
});

test('SA-05 (app): with the spouse retired, the results page shows no contribution-limit card', async () => {
  const r = await retiredSpouseHousehold();
  assert.match(r.success, /\d\.\d%$/, 'results rendered, so the warning cards below were read');
  assert.equal(r.limitCards.length, 0,
    'the results page must show no contribution-limit card for this household: ' + r.limitCards.join(' | '));
});

test('SA-05 (app): a working owner asking past the family base and catch-up still sees 1 warning and a contribution-limit card', async () => {
  const r = await overLimitHousehold();
  assert.equal(r.limitStatus, '1 warning', 'a real over-limit request must still show in the account summary: got ' + r.limitStatus);
  assert.equal(r.limitCards.length, 1, 'and as one card on the results page: ' + r.limitCards.join(' | '));
  assert.match(r.limitCards[0], /hsa limit/i, 'the card names the HSA limit');
});
