/* S5AA R37 (SA32F-41; Claude's R32F full-model audit DMC-03, confirmed by ChatGPT's R32V) -- MONTE CARLO GUIDANCE NO LONGER SIZES A
 * SHORTFALL OR A SPENDING CUT FROM A MEDIAN ROW.
 *
 * R32V: "UI:935-936 combines failing-path median age with component-median-row shortfall. The 51.9%-success case displays 'short
 * by about $0' and suggests a 1% cut despite substantial failed paths. These statistics do not describe one representative
 * failure. Use a consistent conditional failure distribution or withhold the quantitative guidance; a necessary spending cut
 * cannot be inferred from that isolated quantile."
 * In Monte Carlo the table's rows are medians across ALL paths, while the shortfall ages are medians among the UNSUCCESSFUL
 * paths, so the row at that age says nothing about how far a failing path falls short. The quantitative guidance is withheld:
 * the ages stay (each labelled as the median among unsuccessful paths), the dollar figure and the percentage cut go, and the
 * card says why. Simple mode and historical replay describe one path, so their figures stay.
 *
 * WITH IT, HOW RETURNS ARE DRAWN IS DISCLOSED ON THE RESULTS PAGE (SA32F-42 by the owner's decision 7, "Keep average, disclose";
 * SA32F-52; SA32F-53). R32V: "The preset/UI fails to explain the different interpretations"; "Declare the present process";
 * "Disclose/validate the high-volatility behavior". Monte Carlo's card says the expected return is an arithmetic mean, the
 * draws are held to [-95%, +200%] (by integration, a 10% mean at 80% volatility averages 13.31%; at 30% or less it moves by under
 * 0.01 point), and a partial year's spread scales with its length, not its square root. Simple mode's card says it shows the
 * average path, not the typical one. */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadCalculator, waitFor } = require('./lib/harness');

const STORAGE_KEY = 'investment-calculator-v2c';

async function resultsFor(method) {
  const dom = await loadCalculator();
  const w = dom.window;
  const doc = w.document;
  try {
    const app = JSON.parse(w.localStorage.getItem(STORAGE_KEY));
    const scenario = app.scenarios[0];
    scenario.setupComplete = true;
    Object.assign(scenario.profile, { age: 60, retireAge: 60, endAge: 95, filing: 'single', spouseOn: false });
    Object.assign(scenario.assumptions, { method, runs: 200, returnRate: 7, volatility: 15, inflation: 3, historyStart: 1966 });
    scenario.accounts = [{
      id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1000000, contribution: 0,
      contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
      changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    }];
    Object.assign(scenario.retirement, { strategy: 'incomeFirst', spending: 100000, ssClaim: 70 });
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
    await waitFor(() => /\d\.\d%$/.test(doc.getElementById('v2-stat-success').textContent) && !perf.classList.contains('is-running'), { window: w, timeoutMs: 60000 });
    return { warnings: doc.getElementById('v2-warnings').textContent, insights: doc.getElementById('v2-insights').textContent,
      success: doc.getElementById('v2-stat-success').textContent };
  } finally {
    w.close();
  }
}

test('R37 SA32F-41: Monte Carlo guidance gives the failing paths\' median ages and withholds the amount and the cut', async () => {
  const r = await resultsFor('monteCarlo');
  assert.match(r.success, /\d\.\d%$/);
  assert.match(r.warnings, /shortfall near age|failure near age/, 'CONTROL: this plan has unsuccessful paths, so a shortfall card shows (success ' + r.success + ')');
  assert.doesNotMatch(r.warnings, /short by about/, 'a median row sized the failing paths\' shortfall');
  assert.match(r.warnings, /median among the unsuccessful paths/);
  assert.match(r.warnings, /rows are medians across all paths/);
  assert.match(r.insights, /Test a targeted spending adjustment/);
  assert.doesNotMatch(r.insights, /lower spending near age/, 'a median row sized a spending cut');
  /* SA32F-42, -52, -53: the draw is disclosed. */
  assert.match(r.warnings, /How Monte Carlo draws returns:.*arithmetic mean/);
  assert.ok(r.warnings.includes('held between -95% and +200%'));
  assert.ok(r.warnings.includes('80% volatility averages about 13.3%'));
  assert.match(r.warnings, /not with its square root/);
  assert.doesNotMatch(r.warnings, /Average return path/);
});

test('R37 SA32F-41 control: simple mode describes one path, so its amount and cut stay', async () => {
  const r = await resultsFor('simple');
  assert.match(r.warnings, /short by about \$/);
  assert.match(r.insights, /lower spending near age/);
  assert.match(r.warnings, /Average return path:.*not the typical outcome/);
  assert.doesNotMatch(r.warnings, /How Monte Carlo draws returns/);
});

test('R37 SA32F-53: the stated 13.3% is the clipped normal mean, computed here by integration', () => {
  const phi = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  const clippedMean = (mu, sd) => { let m = 0; for (let z = -10; z < 10; z += 1e-4) m += Math.min(2, Math.max(-0.95, mu + sd * z)) * phi(z) * 1e-4; return m; };
  assert.strictEqual(Math.round(clippedMean(0.10, 0.80) * 1000) / 10, 13.3);
  assert.ok(Math.abs(clippedMean(0.10, 0.30) - 0.10) < 0.0001, 'at 30% the limit moves the mean by under 0.01 point');
});
