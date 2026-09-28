/* S5AA, R18 round: "RMD PAID" IS WHAT SATISFIED THE REQUIREMENT, NOT EVERY DOLLAR DISTRIBUTED (external re-audit of
 * `149ca0d`, R17-01).
 *
 * R17 (Q1-C) labelled row.rmdDistributed "RMD paid" in the table and the CSV. That field is the distribution LEDGER:
 * rmdGross plus a credited transfer, and rmdGross includes every QCD paid -- when no RMD is due at all, and the whole of a
 * QCD larger than the RMD. MEASURED at `149ca0d`, a $100,000 IRA and a $10,000 QCD: at 72, nothing due, "RMD paid"
 * $10,000; at 75, $4,065.04 due, "RMD paid" $10,000.
 *
 * What satisfied the requirement is, per obligation, the lesser of the obligation and what was credited and paid toward
 * it -- and the engine already reports exactly its complement: rmdUnmet is summed per obligation, with each credit (QCD
 * or transfer) capped at its own obligation. So the shell now shows RMD paid = RMD due - RMD unmet, and rmdDistributed
 * keeps its ledger meaning for every other consumer. No engine field changed, so no captured row moved. The first half
 * below pins that identity against hand figures on the engine; the second shows it in the table and the CSV.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const validator = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);
const { loadCalculator, waitFor } = require('./lib/harness');

const round = (x) => Math.round(Number(x) * 100) / 100;
const near = (actual, expected, label) => assert.equal(round(actual), round(expected), label);
const acct = (o) => Object.assign({ name: o.id, owner: 'self', basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0,
  annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100 }, o);

/* One row; every account earns its allocation's return (`flat` 0%, `crash` -95%); nothing spent. */
function planFor({ age, qcd = 0, spouseAge = null, transfer = 0, accounts }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age, retireAge: 60, endAge: age + 1, spouseOn: spouseAge !== null, spouseAge: spouseAge === null ? age : spouseAge,
    filing: spouseAge === null ? 'single' : 'mfj' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'annual' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [],
    otherIncomes: [], selfLife: 99, spouseLife: 99, survivor: false, dividendOn: false, withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax' });
  Object.assign(p.advanced, { rmdOn: true, qcd, healthOn: false, ltcOn: false, debts: [], otherAssets: [], bondTentOn: false, reserveOn: false,
    glideOn: false, assetsOn: true, conversionOn: false,
    assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }, { id: 'crash', name: 'Crash', returnRate: -95, volatility: 0 }],
    transferOn: transfer > 0, transferAge: age, transferFrom: 'ira', transferTo: 'cash', transferAmount: transfer });
  p.accounts = (accounts || [{ id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: 1 }])
    .concat([{ id: 'cash', type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 100000, priority: 2 }])
    .map((a) => acct(Object.assign({ allocation: { [a.crash ? 'crash' : 'flat']: 100 } }, a)));
  p.accounts.forEach((a) => { delete a.crash; });
  return p;
}
function row(opts) {
  const p = planFor(opts);
  assert.equal(validator.validateScenario(JSON.parse(JSON.stringify(p))).valid, true, JSON.stringify(opts) + ' is a valid plan');
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r.rows[1];
}
const satisfied = (w) => w.rmd - w.rmdUnmet; // what the shell now shows as RMD paid

test('R17-01: a QCD with no RMD due satisfies nothing, and a QCD above the RMD satisfies only the RMD', () => {
  const at72 = row({ age: 72, qcd: 10000 });
  near(at72.rmd, 0);
  near(satisfied(at72), 0, 'nothing was required, so nothing satisfied a requirement');
  near(at72.rmdDistributed, 10000, 'the ledger still records the $10,000 QCD');
  const at75 = row({ age: 75, qcd: 10000 });
  near(at75.rmd, 100000 / 24.6);
  near(satisfied(at75), 100000 / 24.6, 'the QCD satisfies the 4,065.04 due, and the rest is voluntary');
  near(at75.rmdDistributed, 10000);
  const below = row({ age: 75, qcd: 2000 });
  near(satisfied(below), 100000 / 24.6, 'a QCD below the RMD: the QCD and the row\'s own withdrawal together');
  near(below.rmdDistributed, 100000 / 24.6);
});

test('R17-01: two owners, an employer plan, and a transfer credited toward the IRA', () => {
  const owed95 = 100000 / 8.9;
  /* Both 95, $100,000 IRAs at 0%: the $30,000 QCD splits by IRA balance, 15,000 each, and each covers its own 11,235.96. */
  const couple = row({ age: 95, spouseAge: 95, qcd: 30000, accounts: [
    { id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: 1 },
    { id: 'sp-ira', type: 'traditionalIRA', taxClass: 'preTax', owner: 'spouse', balance: 100000, priority: 1 }] });
  near(satisfied(couple), 2 * owed95);
  near(couple.rmdDistributed, 30000);
  /* One owner at 95: the IRA's $20,000 QCD covers its 11,235.96; a 401(k) at -95% owes its own 11,235.96 and pays 5,000.
     The QCD's excess must not cover the 401(k)'s shortfall. */
  const mixed = row({ age: 95, qcd: 20000, accounts: [
    { id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: 1 },
    { id: 'k401', type: 'traditional401k', taxClass: 'preTax', balance: 100000, priority: 3, crash: true }] });
  near(satisfied(mixed), owed95 + 5000);
  near(mixed.rmdUnmet, owed95 - 5000);
  near(mixed.rmdDistributed, 20000 + 5000, 'the ledger records more than was due, while part of the due went unmet');
  /* A $2,000 transfer to cash at 75 counts toward the IRA's 4,065.04 and the row pays the rest. */
  const credited = row({ age: 75, transfer: 2000 });
  near(satisfied(credited), 100000 / 24.6);
});

/* ---- the table and the CSV ---- */
const STORAGE_KEY = 'investment-calculator-v2c';
async function render(age, qcd) {
  const dom = await loadCalculator();
  const w = dom.window;
  const doc = w.document;
  const root = doc.getElementById('investment-calculator-v2c');
  const app = JSON.parse(w.localStorage.getItem(STORAGE_KEY));
  const s = app.scenarios[0];
  s.setupComplete = true;
  Object.assign(s.profile, { age, retireAge: 60, endAge: age + 2, spouseOn: false, filing: 'single' });
  Object.assign(s.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'annual' });
  Object.assign(s.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(s.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, pension: 0, selfLife: 99, stages: [], expenses: [], otherIncomes: [],
    withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax' });
  Object.assign(s.advanced, { rmdOn: true, qcd, conversionOn: false, transferOn: false, healthOn: false, ltcOn: false, debts: [], otherAssets: [] });
  s.accounts = [acct({ id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: 1 }),
    acct({ id: 'cash', type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 100000, priority: 2 })];
  const input = root.querySelector('#v2-import-settings');
  const status = root.querySelector('#v2-status');
  Object.defineProperty(input, 'files', { value: [new w.File([JSON.stringify({ format: STORAGE_KEY, app })], 'b.json', { type: 'application/json' })], configurable: true });
  status.textContent = '';
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  await waitFor(() => status.textContent !== '', { window: w });
  root.querySelector('[data-page="results"]').click();
  const perf = doc.getElementById('v2-performance');
  await waitFor(() => doc.getElementById('v2-warnings').textContent !== '' && !perf.classList.contains('is-running'), { window: w, timeoutMs: 15000 });
  const warnings = doc.getElementById('v2-warnings').textContent;
  root.querySelector('[data-page="projection"]').click();
  await waitFor(() => doc.getElementById('v2-table').children.length > 0, { window: w, timeoutMs: 15000 });
  const headers = [...doc.getElementById('v2-table').closest('table').querySelectorAll('thead th')].map((th) => th.textContent);
  const table = [...doc.getElementById('v2-table').children].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
  let blob = null;
  w.URL.createObjectURL = (b) => { blob = b; return 'blob:stub'; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  root.querySelector('#v2-export-csv').click();
  await waitFor(() => blob !== null, { window: w });
  const csv = await new Promise((resolve) => { const fr = new w.FileReader(); fr.onload = () => resolve(fr.result); fr.readAsText(blob); });
  w.close();
  const lines = csv.split('\n').map((l) => l.split(','));
  return { warnings, cell: (h) => table[1][headers.indexOf(h)], csv: (h) => Number(lines[2][lines[0].indexOf(h)]) };
}

test('R17-01 in the app: a QCD at 72 shows no RMD paid; a QCD at 75 shows only the RMD paid', async () => {
  const at72 = await render(72, 10000);
  assert.equal(at72.cell('RMD due'), '$0');
  assert.equal(at72.cell('RMD paid'), '$0', 'a QCD with nothing due is not an RMD paid');
  assert.equal(at72.cell('RMD unmet'), '$0');
  assert.equal(at72.csv('RMD paid'), 0);
  const at75 = await render(75, 10000);
  assert.equal(at75.cell('RMD due'), '$4,065');
  assert.equal(at75.cell('RMD paid'), '$4,065', 'the $10,000 QCD satisfies the $4,065 due; the rest is voluntary');
  assert.equal(at75.csv('RMD paid'), Math.round(100000 / 24.6 * 100) / 100);
  assert.doesNotMatch(at75.warnings, /Required minimum distribution not fully paid/);
});
