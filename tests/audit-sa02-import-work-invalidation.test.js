'use strict';

/**
 * SA-02 (SPRINT_EXTERNAL_AUDIT_20260909.md) -- THE IMPORT ROLLBACK DOES NOT
 * INVALIDATE THE REJECTED CANDIDATE'S ASYNCHRONOUS WORK.
 *
 * R2-T05 made the import apply phase roll back synchronously: on a throw it
 * restores `app`, `results` and `resultsDirty`. The supplied regression test
 * stopped there, and so did the repair.
 *
 * The gap is that the apply phase has already STARTED work by then.
 * `writeStatic()` ends with `setPage(app.page || "setup")`, and `setPage()`
 * calls `calculate()` whenever the page is results/projection and the result
 * is missing or dirty. So applying a candidate whose saved page is "results"
 * schedules a full calculation FOR THE CANDIDATE, capturing the candidate's
 * plans and the current generation -- all before the later `renderRules()`
 * that throws.
 *
 * The rollback then restores three variables. It does not advance
 * `calcGeneration`, cancel workers, or clear the pending timers. The
 * candidate's queued job therefore still satisfies its own
 * `generation !== calcGeneration` guard, completes, and writes its result
 * into `results[app.active]` -- which now belongs to the RESTORED scenario.
 *
 * Independently reproduced before this repair, with a read-only inspection
 * hook: active scenario ORIGINAL, inputs $1,000,000, stored state ORIGINAL,
 * and `results[0]` holding a projection that opens at $9,000,000. The
 * rejection message was also overwritten by "Projection updated · saved in
 * this browser", so the user is told the import succeeded.
 *
 * Array index plus generation is not sufficient defence, so this file also
 * covers the identity guard: a result may only be published if the scenario
 * it was computed for is still the one sitting at its destination index.
 *
 * NOTE ON METHOD. These cases inject a read-only `window.__inspect()` into
 * the IN-MEMORY copy of the app only -- the same technique the external
 * audit used, and for the same reason: `results` is closed over by the app's
 * IIFE and the defect is invisible from the DOM alone. The hook only reads;
 * it adds no production seam and changes no behaviour. Everything else is
 * the real import and calculation path.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

function assembleLiveApp() {
  /* build.js's own output (tests/lib/harness.js's fresh build of this tree),
     not a re-transcription of its stripping, which had drifted (no debt
     modules) and could not follow S5 2l's contract substitution. Required
     lazily, so a missing jsdom still reads as a skip. */
  const assembled = require('./lib/harness').freshBuildHtml();
  const hooked = assembled.replace('    init();',
    '    window.__inspect=function(){return {' +
    'activeName:app.scenarios[app.active]&&app.scenarios[app.active].name,' +
    'openingBalances:results.map(function(r){return r&&r.rows&&r.rows[0]?r.rows[0].total:null}),' +
    'resultScenarioIds:results.map(function(r){return r&&r.identity?r.identity.scenarioId:null})' +
    '};};\n    init();');
  assert.notEqual(hooked, assembled, 'the read-only inspection hook must actually be injected');
  return hooked;
}

let jsdomAvailable = true;
try { require('jsdom'); } catch (e) { jsdomAvailable = false; }
const uiTest = jsdomAvailable ? {} : { skip: 'jsdom is not installed in this environment; run npm install to execute the DOM import cases' };

const STORAGE_KEY = 'investment-calculator-v2c';

async function loadLiveApp(appState) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(assembleLiveApp(), { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
  dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  const mainScript = Array.from(dom.window.document.querySelectorAll('script'))
    .find((el) => el.getAttribute('type') !== 'application/json'
      && el.textContent.includes('investment-calculator-v2c'));
  assert.ok(mainScript, 'could not find the app script -- selection keys off the app\'s own root lookup, ' +
    'because app-shell.html also carries a PWA manifest/icon bootstrap script in <head>');
  dom.window.eval(mainScript.textContent);
  await new Promise(function (resolve) { dom.window.setTimeout(resolve, 0); });
  return dom;
}

/** One bounded deterministic period, so nothing here depends on a long
 *  projection or on worker plumbing. */
function boundedPlan(name, balance) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.id = name;
  p.name = name;
  p.profile.age = 75;
  p.profile.retireAge = 65;
  p.profile.endAge = 76;
  p.profile.spouseOn = false;
  p.employment.salary = 0;
  p.employment.spouseSalary = 0;
  p.assumptions.method = 'simple';
  p.assumptions.returnRate = 0;
  p.assumptions.inflation = 0;
  p.assumptions.rollingHistory = false;
  p.retirement.strategy = 'fixedNominal';
  p.retirement.spending = 20000;
  p.retirement.ssBenefit = 0;
  p.retirement.dividendOn = false;
  p.advanced.rmdOn = false;
  p.advanced.healthOn = false;
  p.advanced.ltcOn = false;
  p.accounts = [{
    id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: balance, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  return p;
}

function stateOn(page, plan) {
  return { version: 2, edition: '2C', active: 0, page: page, compare: false, scenarios: [plan] };
}

function settle(dom, ms) {
  return new Promise(function (resolve) { dom.window.setTimeout(resolve, ms === undefined ? 400 : ms); });
}

async function importPayload(dom, appState) {
  const W = dom.window, D = W.document;
  const input = D.querySelector('#v2-import-settings'), status = D.querySelector('#v2-status');
  const file = new W.File([JSON.stringify({ format: 'investment-calculator-v2c', app: appState })], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  status.textContent = '';
  input.dispatchEvent(new W.Event('change', { bubbles: true }));
  const deadline = Date.now() + 4000;
  while (status.textContent === '' && Date.now() < deadline) await settle(dom, 5);
  return status.textContent;
}

/** Loads ORIGINAL, induces an apply-phase render failure, then imports a
 *  fully VALID candidate whose saved page is "results" -- which is what makes
 *  the apply phase schedule a calculation for the candidate before it fails. */
async function rejectedImportWithQueuedWork() {
  const dom = await loadLiveApp(stateOn('setup', boundedPlan('ORIGINAL', 1000000)));
  await settle(dom, 500);
  const warn = dom.window.document.getElementById('v2-rule-warning');
  warn.parentNode.removeChild(warn);
  const status = await importPayload(dom, stateOn('results', boundedPlan('REPLACEMENT', 9000000)));
  return { dom: dom, status: status };
}

test('SA-02 (setup): the candidate really is valid and its apply phase really does fail -- otherwise this is not the case under test', uiTest, async () => {
  const r = await rejectedImportWithQueuedWork();
  assert.doesNotMatch(r.status, /structural problem/,
    'the candidate must pass VALIDATION and fail at APPLY; a structural rejection would test the wrong path: ' + r.status);
  assert.match(r.status, /could not be applied/,
    'expected the apply-failure message, got: ' + r.status);
});

test('SA-02: the rejected candidate\'s queued calculation must never publish into the restored scenario', uiTest, async () => {
  const r = await rejectedImportWithQueuedWork();
  await settle(r.dom, 1500); // let every queued job run to completion

  const state = r.dom.window.__inspect();
  assert.equal(state.activeName, 'ORIGINAL', 'the active scenario must be the restored one');
  assert.ok(state.openingBalances.indexOf(9000000) === -1,
    'the rejected candidate published its $9,000,000 projection onto the restored $1,000,000 scenario: ' +
    JSON.stringify(state.openingBalances));
});

test('SA-02: a published result must carry the identity of the scenario it is stored against', uiTest, async () => {
  const r = await rejectedImportWithQueuedWork();
  await settle(r.dom, 1500);
  const state = r.dom.window.__inspect();
  for (const id of state.resultScenarioIds) {
    if (id === null) continue;
    assert.equal(id, 'ORIGINAL',
      'a result computed for "' + id + '" is stored against the ORIGINAL scenario -- index plus generation is not sufficient defence');
  }
});

test('SA-02: the restored inputs and stored state stay original, and the rejection is still reported', uiTest, async () => {
  const r = await rejectedImportWithQueuedWork();
  await settle(r.dom, 1500);
  const D = r.dom.window.document;
  assert.equal(D.getElementById('v2-name').value, 'ORIGINAL', 'inputs must show the restored scenario');
  const stored = JSON.parse(r.dom.window.localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.scenarios[0].name, 'ORIGINAL');
  assert.equal(stored.scenarios[0].accounts[0].balance, 1000000);
  assert.match(D.getElementById('v2-status').textContent, /could not be applied/,
    'the rejection message was overwritten by the candidate\'s completing job: ' + D.getElementById('v2-status').textContent);
});

test('SA-02 (control): a SUCCESSFUL import still calculates and publishes normally', uiTest, async () => {
  const dom = await loadLiveApp(stateOn('setup', boundedPlan('ORIGINAL', 1000000)));
  await settle(dom, 500);
  const status = await importPayload(dom, stateOn('results', boundedPlan('REPLACEMENT', 9000000)));
  assert.match(status, /Backup restored/, 'a valid import must still succeed; got: ' + status);
  await settle(dom, 1500);
  const state = dom.window.__inspect();
  assert.equal(state.activeName, 'REPLACEMENT');
  assert.ok(state.openingBalances.indexOf(9000000) !== -1,
    'the successfully imported scenario must get its own result published: ' + JSON.stringify(state.openingBalances));
});
