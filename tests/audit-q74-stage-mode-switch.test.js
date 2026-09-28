/* Q74 (app half) -- switching a spending stage between "Set annual spending" and "Percent of strategy amount" resets
 * its value, so a dollar figure is never read as a percent.
 *
 * The add-stage button creates a stage in dollars, seeded with the plan's spending, and the mode switch kept that
 * figure: a $60,000 stage switched to percent became 60,000%, and spent 600 times the strategy amount. Decided
 * 2026-09-14 (the owner), answer (c): the app resets the value on a mode switch now; a validator bound on a percent stage
 * waits for the corpus generator's repair. Reset, not rescale: a percent of the strategy amount has no fixed dollar
 * equivalent across strategies and years, so a switch to percent starts at 100 and a switch back starts at the
 * plan's spending.
 *
 * Runs the fresh build's own app in jsdom; no browser run is claimed. A missing jsdom reads as a skip. Each title is
 * a literal, so the requirements register names every one.
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
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
const STORAGE_KEY = 'investment-calculator-v2c';
const SPENDING = 60000;

let html = null;
async function loadApp() {
  const { JSDOM } = require('jsdom');
  if (html === null) html = require('./lib/harness').freshBuildHtml();
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
  const plan = JSON.parse(JSON.stringify(defaultPlan));
  plan.setupComplete = true;
  plan.retirement.spending = SPENDING;
  plan.retirement.stages = [];
  dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, edition: '2C', active: 0, page: 'plan', compare: false, scenarios: [plan] }));
  const main = Array.from(dom.window.document.querySelectorAll('script'))
    .find((el) => el.getAttribute('type') !== 'application/json' && el.textContent.includes('investment-calculator-v2c'));
  assert.ok(main, 'could not find the app script');
  dom.window.eval(main.textContent);
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  return dom;
}

/* The newest stage row: the child of #v2-stages that holds the last amount/percent select. The list re-renders on
   every mode change, so this is looked up again after each one. */
function lastStage(dom) {
  const stages = dom.window.document.getElementById('v2-stages');
  const modes = Array.from(stages.querySelectorAll('select')).filter((el) => Array.from(el.options).some((o) => o.value === 'percent'));
  const mode = modes[modes.length - 1];
  let row = mode;
  while (row && row.parentElement !== stages) row = row.parentElement;
  return { mode, numbers: row ? Array.from(row.querySelectorAll('input[type="number"]')) : [] };
}
function fire(dom, el, type) { el.dispatchEvent(new dom.window.Event(type, { bubbles: true })); }
function chooseMode(dom, value) { const { mode } = lastStage(dom); mode.value = value; fire(dom, mode, 'change'); }
function typeValue(dom, index, value) { const input = lastStage(dom).numbers[index]; input.value = String(value); fire(dom, input, 'input'); }
/* Adds a stage and finds its value input by the spending figure the button seeds it with. */
function addStage(dom) {
  dom.window.document.getElementById('v2-add-stage').click();
  const index = lastStage(dom).numbers.findIndex((el) => Number(el.value) === SPENDING);
  assert.ok(index >= 0, 'CONTROL: a new stage is created in dollars, seeded with the plan\'s spending (' + SPENDING + ')');
  return index;
}
const valueAt = (dom, index) => Number(lastStage(dom).numbers[index].value);

test('Q74: switching a new spending stage to "Percent of strategy amount" resets its value to 100, not the dollar figure it was created with', uiTest, async () => {
  const dom = await loadApp();
  try {
    const index = addStage(dom);
    chooseMode(dom, 'percent');
    assert.equal(lastStage(dom).mode.value, 'percent');
    assert.equal(valueAt(dom, index), 100);
  } finally { dom.window.close(); }
});

test('Q74: switching a percent stage back to "Set annual spending" resets its value to the plan\'s spending', uiTest, async () => {
  const dom = await loadApp();
  try {
    const index = addStage(dom);
    chooseMode(dom, 'percent');
    typeValue(dom, index, 80);
    chooseMode(dom, 'amount');
    assert.equal(lastStage(dom).mode.value, 'amount');
    assert.equal(valueAt(dom, index), SPENDING);
  } finally { dom.window.close(); }
});

test('Q74 control: choosing the mode a stage already has leaves an edited value alone, in dollars and in percent', uiTest, async () => {
  const dom = await loadApp();
  try {
    const index = addStage(dom);
    typeValue(dom, index, 55000);
    chooseMode(dom, 'amount');
    assert.equal(valueAt(dom, index), 55000, 'CONTROL: an amount stage re-choosing amount keeps its figure');
    const again = addStage(dom);
    chooseMode(dom, 'percent');
    typeValue(dom, again, 80);
    chooseMode(dom, 'percent');
    assert.equal(valueAt(dom, again), 80, 'CONTROL: a percent stage re-choosing percent keeps its figure');
  } finally { dom.window.close(); }
});
