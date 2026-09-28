/* S5 checklist 2.6 -- a household-owned other income is timed by the self member's ages, and the income row says so.
 *
 * Decided 2026-09-14, night (the owner, answer 4 (A)): keep timing a "household" income by self's ages, and state the rule
 * in MODEL_ASSUMPTIONS.md (section 10, written by the plan owner) and on the input label. otherIncomeFor() tests
 * i.owner === "spouse", so "self" and "household" both take self's ages. The income row's owner select offered a bare
 * "Household", which named no clock.
 *
 * The label cases run the fresh build's own app in jsdom; no browser run is claimed. A missing jsdom reads as a skip.
 * The timing case runs runPlan() on a public route.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let jsdomAvailable = true;
try { require('jsdom'); } catch (e) { jsdomAvailable = false; }
const uiTest = jsdomAvailable ? {} : { skip: 'jsdom is not installed in this environment; run npm install to execute the DOM cases' };

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
const STORAGE_KEY = 'investment-calculator-v2c';

let html = null;
async function loadApp() {
  const { JSDOM } = require('jsdom');
  if (html === null) html = require('./lib/harness').freshBuildHtml();
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
  const plan = JSON.parse(JSON.stringify(defaultPlan));
  plan.setupComplete = true;
  plan.retirement.otherIncomes = [];
  dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, edition: '2C', active: 0, page: 'plan', compare: false, scenarios: [plan] }));
  const main = Array.from(dom.window.document.querySelectorAll('script'))
    .find((el) => el.getAttribute('type') !== 'application/json' && el.textContent.includes('investment-calculator-v2c'));
  assert.ok(main, 'could not find the app script');
  dom.window.eval(main.textContent);
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  return dom;
}

/* The owner select of the newest income row: the last select in #v2-incomes that offers "household". */
function ownerOptions(dom) {
  dom.window.document.getElementById('v2-add-income').click();
  const selects = Array.from(dom.window.document.getElementById('v2-incomes').querySelectorAll('select'))
    .filter((el) => Array.from(el.options).some((o) => o.value === 'household'));
  assert.ok(selects.length > 0, 'CONTROL: the new income row has an owner select');
  const options = {};
  Array.from(selects[selects.length - 1].options).forEach((o) => { options[o.value] = o.textContent; });
  return options;
}

test('an income row\'s "Household" owner option says the income is timed by your ages', uiTest, async () => {
  const dom = await loadApp();
  try {
    const options = ownerOptions(dom);
    assert.match(options.household, /^Household \(your ages\)$/);
  } finally { dom.window.close(); }
});

test('control: the income row\'s "You" and "Spouse" owner options are unchanged', uiTest, async () => {
  const dom = await loadApp();
  try {
    const options = ownerOptions(dom);
    assert.equal(options.self, 'You');
    assert.equal(options.spouse, 'Spouse');
  } finally { dom.window.close(); }
});

test('control: runPlan() times a household-owned income by the self member\'s ages, not the spouse\'s', () => {
  const plan = (withRental) => {
    const p = JSON.parse(JSON.stringify(defaultPlan));
    p.setupComplete = true;
    Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 70, spouseOn: true, spouseAge: 70, filing: 'mfj' });
    Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
    Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
    Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 30000, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [], dividendOn: false,
      otherIncomes: withRental ? [{ name: 'Rent', type: 'rental', owner: 'household', amount: 12000, start: 65, end: 100, growthMode: 'fixed', growth: 0 }] : [] });
    return p;
  };
  const a = engine.runPlan(plan(false)), b = engine.runPlan(plan(true));
  assert.equal(a.status, 'ok');
  assert.equal(b.status, 'ok');
  const at = (r, age) => r.rows.find((row) => row.age === age);
  assert.equal(at(b, 63).income, at(a, 63).income, 'at self 63 (spouse 73, past 65) the household income has not started');
  assert.ok(at(b, 66).income > at(a, 66).income, 'at self 66 it has: ' + at(a, 66).income + ' -> ' + at(b, 66).income);
});
