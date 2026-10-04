/* S5AA R51 (the owner's follow-up decisions on R46-R50, 2026-10-03) -- THE APP'S HALF: the flexibility field's fallback, and a
 * "This plan offers Roth contributions" checkbox for R47's accounts[].planOffersRoth.
 *
 * AA1-25(c)  Flexibility defaults to off. The form's reader fell back to 10 when the field was blank; it falls back to 0.
 * AA1-13     R47 added accounts[].planOffersRoth (boolean contract, default true; absent means the workplace plan lets participants make
 *            designated Roth deferrals) with no form control. The pre-tax workplace account's editor (a traditional 401(k), the only
 *            account auditContributions() reads it on) now carries a checkbox, checked when the field is absent or true; unchecking
 *            stores false, checking stores true. Other accounts carry none.
 *
 * Runs the fresh build's own app in jsdom; no browser run is claimed. A missing jsdom reads as a skip. Each title is a literal.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let jsdomAvailable = true;
try { require('jsdom'); } catch (e) { jsdomAvailable = false; }
const uiTest = jsdomAvailable ? {} : { skip: 'jsdom is not installed in this environment; run npm install to execute the DOM cases' };

const SHELL = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
const STORAGE_KEY = 'investment-calculator-v2c';

function account(id, type, taxClass, extra) {
  return Object.assign({ id, name: id, type, taxClass, owner: 'self', balance: 10000, basisPct: 100, contribution: 0, contributionMode: 'dollar',
    annualChange: 0, annualChangeMode: 'percent', frequency: 12, changeTiming: 'annual', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1, contributionPreset: 'none' }, extra || {});
}
async function load(edit) {
  const { loadCalculator } = require('./lib/harness');
  const plan = JSON.parse(JSON.stringify(defaultPlan));
  plan.setupComplete = true;
  Object.assign(plan.profile, { age: 50, retireAge: 65, endAge: 90 });
  Object.assign(plan.employment, { salary: 100000, contributionStop: 65 });
  if (edit) edit(plan);
  return loadCalculator({ localStorageSeed: { [STORAGE_KEY]: JSON.stringify({ version: 2, edition: '2C', active: 0, page: 'plan', compare: false, scenarios: [plan] }) } });
}
const saved = (w) => JSON.parse(w.localStorage.getItem(STORAGE_KEY)).scenarios[0];
const fire = (w, el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
function rothBoxes(doc) {
  return [...doc.querySelectorAll('#v2-accounts-list label')].filter((l) => /^This plan offers Roth contributions/.test(l.textContent.trim()))
    .map((l) => l.querySelector('input[type="checkbox"]'));
}

test('R51 AA1-25(c): a blank flexibility field reads as 0, not 10', uiTest, async () => {
  const { waitFor } = require('./lib/harness');
  const dom = await load((p) => { p.retirement.flexibility = 25; });
  const w = dom.window, doc = w.document;
  try {
    const flex = doc.getElementById('v2-flexibility');
    assert.equal(flex.value, '25', 'CONTROL: the stored 25 is shown');
    flex.value = '';
    const spending = doc.getElementById('v2-spending');
    spending.value = String(Number(spending.value) + 1000);
    fire(w, spending, 'input'); fire(w, spending, 'change');
    await waitFor(() => saved(w).retirement.flexibility !== 25, { window: w, timeoutMs: 10000 });
    assert.equal(saved(w).retirement.flexibility, 0);   // before R51: 10
  } finally { w.close(); }
});

test('R51 AA1-13: a traditional 401(k) shows "This plan offers Roth contributions", checked when the field is absent', uiTest, async () => {
  const dom = await load((p) => { p.accounts = [account('k', 'traditional401k', 'preTax'), account('r', 'rothIRA', 'roth'), account('b', 'taxable', 'taxable')]; });
  const w = dom.window;
  try {
    const boxes = rothBoxes(w.document);
    assert.equal(boxes.length, 1, 'one checkbox: the 401(k) only (not the Roth IRA or the brokerage account)');
    assert.equal(boxes[0].checked, true);
  } finally { w.close(); }
});

test('R51 AA1-13: unchecking stores planOffersRoth false, checking again stores true', uiTest, async () => {
  const { waitFor } = require('./lib/harness');
  const dom = await load((p) => { p.accounts = [account('k', 'traditional401k', 'preTax')]; });
  const w = dom.window;
  try {
    let box = rothBoxes(w.document)[0];
    box.checked = false; fire(w, box, 'change');
    await waitFor(() => saved(w).accounts[0].planOffersRoth === false, { window: w, timeoutMs: 10000 });
    box = rothBoxes(w.document)[0];
    box.checked = true; fire(w, box, 'change');
    await waitFor(() => saved(w).accounts[0].planOffersRoth === true, { window: w, timeoutMs: 10000 });
  } finally { w.close(); }
});

test('R51 AA1-13: a plan stored with planOffersRoth false shows the box unchecked', uiTest, async () => {
  const dom = await load((p) => { p.accounts = [account('k', 'traditional401k', 'preTax', { planOffersRoth: false })]; });
  const w = dom.window;
  try {
    const boxes = rothBoxes(w.document);
    assert.equal(boxes.length, 1);
    assert.equal(boxes[0].checked, false);
  } finally { w.close(); }
});
