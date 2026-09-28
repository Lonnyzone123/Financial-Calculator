/* S5AA, R17 round: THE APP SHOWS WHAT AN RMD OWED, WHAT WAS PAID, AND WHAT WAS NOT (the owner's decision Q1-C, 2026-09-22, on
 * the external re-audit's recommendation, S5AA_R16_EXTERNAL_REAUDIT_RECOMMENDATIONS_AND_CLAUDE_HANDOVER_20260922.md).
 *
 * An ordinary RMD shortfall -- an account with less than it owes after a deep loss -- is a valid result, with rmdUnmet
 * on the row. But the shell never read it. MEASURED in src/app-shell.html at dcd7247: the projection table and the CSV
 * showed row.rmd, the OBLIGATION, under the heading "RMD", and nothing read rmdDistributed or rmdUnmet. A row that owed
 * $11,235.96 and paid $5,000 showed $11,235.96, and nothing on the page said otherwise.
 *
 * Now the table and the CSV carry "RMD due", "RMD paid" and "RMD unmet", and the results page shows a warning card
 * naming the first year an RMD was not fully paid. A Monte Carlo result shows the median obligation; its paid and
 * unmet cells are a dash in the table and blank in the CSV, because a median of per-path shortfalls describes no path.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadCalculator, waitFor } = require('./lib/harness');

const STORAGE_KEY = 'investment-calculator-v2c';
const OWED = 100000 / 8.9; // at 95

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

/* One owner at 95 with a $100,000 IRA and $100,000 of cash, nothing spent; `returnRate` for the year. */
async function renderPlan(returnRate, method = 'simple') {
  const dom = await loadCalculator();
  const w = dom.window;
  const doc = w.document;
  const root = doc.getElementById('investment-calculator-v2c');
  const app = JSON.parse(w.localStorage.getItem(STORAGE_KEY));
  const s = app.scenarios[0];
  s.setupComplete = true;
  Object.assign(s.profile, { age: 95, retireAge: 60, endAge: 97, spouseOn: false, filing: 'single' });
  Object.assign(s.assumptions, { method, returnRate, inflation: 0, fee: 0, volatility: method === 'monteCarlo' ? 10 : 0, runs: 20, seed: 7, withdrawalTiming: 'annual' });
  Object.assign(s.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(s.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, pension: 0, selfLife: 99, stages: [], expenses: [], otherIncomes: [],
    withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax' });
  Object.assign(s.advanced, { rmdOn: true, qcd: 0, conversionOn: false, transferOn: false, healthOn: false, ltcOn: false, debts: [], otherAssets: [] });
  s.accounts = [account({ id: 'ira', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: 1 }),
    account({ id: 'cash', name: 'Cash', type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 100000, priority: 2 })];
  const message = await importBackup(dom, { format: STORAGE_KEY, app });
  assert.doesNotMatch(message, /not restored|not a valid/, 'the backup must be restored: ' + message);
  root.querySelector('[data-page="results"]').click();
  const perf = doc.getElementById('v2-performance');
  await waitFor(() => doc.getElementById('v2-warnings').textContent !== '' && !perf.classList.contains('is-running'), { window: w, timeoutMs: 15000 });
  const warnings = doc.getElementById('v2-warnings').textContent;
  root.querySelector('[data-page="projection"]') && root.querySelector('[data-page="projection"]').click();
  await waitFor(() => doc.getElementById('v2-table').children.length > 0, { window: w, timeoutMs: 15000 });
  const headers = [...root.querySelectorAll('#v2-table')[0].closest('table').querySelectorAll('thead th')].map((th) => th.textContent);
  const table = [...doc.getElementById('v2-table').children].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
  const cells = (i) => table[i];
  let blob = null;
  w.URL.createObjectURL = (b) => { blob = b; return 'blob:stub'; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  root.querySelector('#v2-export-csv').click();
  await waitFor(() => blob !== null, { window: w });
  const csv = await new Promise((resolve) => { const fr = new w.FileReader(); fr.onload = () => resolve(fr.result); fr.readAsText(blob); });
  w.close();
  return { warnings, headers, cells, csv: csv.split('\n').map((l) => l.split(',')) };
}

test('Q1-C: an ordinary RMD shortfall is shown -- due, paid and unmet in the table and the CSV, and a warning', async () => {
  const r = await renderPlan(-95);
  for (const h of ['RMD due', 'RMD paid', 'RMD unmet']) assert.ok(r.headers.includes(h), 'the table has a "' + h + '" column: ' + r.headers.join(' | '));
  assert.ok(!r.headers.includes('RMD'), 'the obligation is no longer headed as though it were paid');
  const row = r.cells(1), at = (h) => row[r.headers.indexOf(h)];
  assert.equal(at('RMD due'), '$11,236', 'due: ' + at('RMD due'));
  assert.equal(at('RMD paid'), '$5,000', 'paid: the 5,000 a 95% loss leaves');
  assert.equal(at('RMD unmet'), '$6,236', 'unmet');
  assert.match(r.warnings, /Required minimum distribution not fully paid/, 'a warning card: ' + r.warnings.slice(0, 300));
  assert.ok(r.warnings.includes('$11,236') && r.warnings.includes('$5,000') && r.warnings.includes('$6,236'), 'naming all three amounts');
  const head = r.csv[0], data = r.csv[2], col = (h) => Number(data[head.indexOf(h)]);
  for (const h of ['RMD due', 'RMD paid', 'RMD unmet']) assert.ok(head.includes(h), 'the CSV has "' + h + '": ' + head.join(' | '));
  assert.equal(col('RMD due'), Math.round(OWED * 100) / 100);
  assert.equal(col('RMD paid'), 5000);
  assert.equal(col('RMD unmet'), Math.round((OWED - 5000) * 100) / 100);
});

test('Q1-C control: a year that pays its RMD in full shows it paid, and no warning', async () => {
  const r = await renderPlan(0);
  const row = r.cells(1), at = (h) => row[r.headers.indexOf(h)];
  assert.equal(at('RMD due'), '$11,236');
  assert.equal(at('RMD paid'), '$11,236');
  assert.equal(at('RMD unmet'), '$0');
  assert.doesNotMatch(r.warnings, /Required minimum distribution not fully paid/);
});

test('Q1-C: a Monte Carlo result shows the median obligation, and a dash -- not a zero -- for paid and unmet', async () => {
  const r = await renderPlan(-10, 'monteCarlo');
  const row = r.cells(1), at = (h) => row[r.headers.indexOf(h)];
  assert.match(at('RMD due'), /^\$[\d,]+$/, 'the median obligation is shown: ' + at('RMD due'));
  assert.equal(at('RMD paid'), '—');
  assert.equal(at('RMD unmet'), '—');
  const head = r.csv[0], data = r.csv[2];
  assert.equal(data[head.indexOf('RMD paid')], '', 'blank in the CSV');
  assert.equal(data[head.indexOf('RMD unmet')], '');
});
