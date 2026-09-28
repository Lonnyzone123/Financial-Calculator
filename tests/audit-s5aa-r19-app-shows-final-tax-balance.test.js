/* S5AA R19 round: THE APP STATES A FINAL-YEAR TAX BALANCE (workstream A's contract, section 3: the terminal true-up is
 * "deducted from the after-tax ending value, and the results page states the deduction beside the ending balance"; the owner,
 * 2026-09-23: a final tax the plan cannot pay counts as a failure).
 *
 * The CSV carries the tax ledger -- "Tax on settled income", "Tax true-up paid", "Tax true-up outstanding" -- and the results
 * page shows a warning card when the plan ends with a true-up still owed (or a refund still due), naming the amount and
 * whether the portfolio left could pay it. A Monte Carlo result carries no ledger (a median of per-path true-ups describes
 * no path): blank CSV cells, no card.
 *
 * The plan is workstream A's R10-05 year as the plan's only year: 71, $50,000 of wages, a deductible $5,000 IRA
 * contribution and a $10,000 QCD, so $5,000 of the QCD is not excludable and $725 more tax is owed (600 federal at 12%,
 * 125 Arizona at 2.5%) -- with no next year to pay it in.
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

const account = (o) => Object.assign({ owner: 'self', contribution: 0, contributionMode: 'amount', basisPct: 0, annualChange: 0,
  annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0,
  matchRate: 0, profitShare: 0, vesting: 100 }, o);

async function render(o) {
  const dom = await loadCalculator();
  const w = dom.window;
  const doc = w.document;
  const root = doc.getElementById('investment-calculator-v2c');
  const app = JSON.parse(w.localStorage.getItem(STORAGE_KEY));
  const s = app.scenarios[0];
  s.setupComplete = true;
  Object.assign(s.profile, { age: 71, retireAge: 72, endAge: 72, spouseOn: false, filing: 'single' });
  Object.assign(s.assumptions, { method: o.method || 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: o.method === 'monteCarlo' ? 10 : 0, runs: 20, seed: 7, withdrawalTiming: 'annual' });
  Object.assign(s.employment, { salary: 50000, spouseSalary: 0, growth: 0, contributionStop: 72 });
  Object.assign(s.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, pension: 0, selfLife: 99, stages: [], expenses: [], otherIncomes: [],
    dividendOn: false, withdrawalOrder: 'manual', manualOrder: 'preTax,taxable,roth,hsa' });
  Object.assign(s.advanced, { rmdOn: false, qcd: o.qcd, conversionOn: false, transferOn: false, healthOn: false, ltcOn: false, debts: [], otherAssets: [] });
  s.accounts = [account({ id: 'ira', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', balance: o.ira, contribution: 5000, priority: 1 })];
  const message = await importBackup(dom, { format: STORAGE_KEY, app });
  assert.doesNotMatch(message, /not restored|not a valid/, 'the backup must be restored: ' + message);
  root.querySelector('[data-page="results"]').click();
  const perf = doc.getElementById('v2-performance');
  await waitFor(() => doc.getElementById('v2-warnings').textContent !== '' && !perf.classList.contains('is-running'), { window: w, timeoutMs: 15000 });
  const warnings = doc.getElementById('v2-warnings').textContent;
  let blob = null;
  w.URL.createObjectURL = (b) => { blob = b; return 'blob:stub'; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  root.querySelector('#v2-export-csv').click();
  await waitFor(() => blob !== null, { window: w });
  const csv = await new Promise((resolve) => { const fr = new w.FileReader(); fr.onload = () => resolve(fr.result); fr.readAsText(blob); });
  w.close();
  const lines = csv.split('\n').filter((l) => l.trim() !== '').map((l) => l.split(','));
  return { warnings, head: lines[0], last: lines[lines.length - 1] };
}

test('workstream A: a final-year tax balance the portfolio can pay is stated, and the CSV carries the ledger', async () => {
  /* The IRA ends with 20,000 + 5,000 - 10,000 = 15,000, which can pay the $725. */
  const r = await render({ ira: 20000, qcd: 10000 });
  assert.match(r.warnings, /A tax balance is owed at the end of the plan/, r.warnings.slice(0, 400));
  assert.ok(r.warnings.includes('$725'), 'the card names the amount');
  assert.match(r.warnings, /deducted from the ending net worth/);
  assert.doesNotMatch(r.warnings, /cannot pay/);
  for (const h of ['Tax on settled income', 'Tax true-up paid', 'Tax true-up outstanding']) assert.ok(r.head.includes(h), 'the CSV has "' + h + '": ' + r.head.join(' | '));
  assert.equal(Number(r.last[r.head.indexOf('Tax true-up outstanding')]), 725);
  assert.equal(Number(r.last[r.head.indexOf('Tax on settled income')]), Number(r.last[r.head.indexOf('Taxes')]) + 725);
});

test('workstream A: a final-year tax balance the portfolio cannot pay is stated as the failure it is', async () => {
  /* A $10,000 IRA plus the $5,000 contribution, all $15,000 given away: nothing is left to pay the $725. */
  const r = await render({ ira: 10000, qcd: 15000 });
  assert.match(r.warnings, /A tax balance is owed at the end of the plan/);
  assert.match(r.warnings, /cannot pay \$725/, r.warnings.slice(0, 600));
  assert.match(r.warnings, /counts as failing/);
});

test('workstream A: a Monte Carlo result carries no ledger -- blank CSV cells and no final-tax card', async () => {
  const r = await render({ ira: 20000, qcd: 10000, method: 'monteCarlo' });
  assert.doesNotMatch(r.warnings, /A tax balance is owed at the end of the plan/);
  assert.equal(r.last[r.head.indexOf('Tax true-up outstanding')], '', 'blank, not zero');
});
