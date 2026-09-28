'use strict';

// FM-04 and FM-08 (whole-model audit, 2026-09-10) -- one shared root cause,
// which is why they are repaired together.
//
// The audit's section C names it: **a result must belong to an input
// revision and a completed job.** SA-02 added scenario-ID protection, which
// establishes *which scenario* a result belongs to. It cannot establish
// *whether the result is still current* after an edit to that same
// scenario, or whether the job that produced it actually finished.
//
// FM-04 (P1) -- two failure paths, failing differently:
//   1. `runPlansBackground` returns `Promise.resolve(plans.map(runScenario))`.
//      `plans.map(...)` is evaluated BEFORE `Promise.resolve` is called, so a
//      synchronous engine throw never becomes a rejection. It escapes the
//      `.catch` that `calculate` attaches and surfaces as an uncaught
//      exception, leaving the UI mid-calculation.
//   2. When the `.catch` DOES fire, it only rewrites status/debug text. The
//      previous result stays in `results` and stays on screen, so a stale
//      ending balance reads as a current financial answer -- an ARCH-02
//      violation, since a calculation error is being presented as an outcome.
//
// FM-08 (P2) -- `scheduleCalculate`'s empty-number branch returns before
// `calcGeneration++` and `cancelWorkers()`, which the ordinary path both do.
// Work already in flight therefore still belongs to the accepted generation
// and publishes onto a blank input, marking the plan clean.
//
// These tests assemble the app from `src/` through the real `build.js`.
// They deliberately do NOT use tests/lib/harness.js, which loads the
// intentionally stale shipped artifact.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const { build } = require('../build.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

let jsdomAvailable = true;
try { require('jsdom'); } catch (e) { jsdomAvailable = false; }
const uiTest = jsdomAvailable ? {} : { skip: 'jsdom is not installed; run npm install to execute these DOM cases' };

const STORAGE_KEY = 'investment-calculator-v2c';
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'fm04-fm08-'));
test.after(() => { fs.rmSync(SCRATCH, { recursive: true, force: true }); });

/*
 * The real build output, with a read-only inspection hook and a controlled
 * fault-injection seam spliced in just before init(). The seam replaces the
 * `runScenario` binding inside the app's own closure -- a function
 * declaration is a mutable binding, so this reaches the exact call site
 * `runPlansBackground` uses, without the test having to reach around it.
 */
function assembleLiveApp() {
  const { output } = build(path.join(SCRATCH, 'scratch-app.html'));
  const hook =
    '    window.__inspect=function(){var r=results[app.active];return {' +
    'dirty:resultsDirty,' +
    'generation:calcGeneration,' +
    'hasResult:!!r,' +
    'calculationError:!!(r&&r.calculationError),' +
    'calculationErrorCode:(r&&r.calculationErrorCode)||null,' +
    'rows:(r&&r.rows)?r.rows.length:null,' +
    'endingTotal:(r&&r.rows&&r.rows.length)?r.rows[r.rows.length-1].total:null,' +
    'performance:$("v2-performance").textContent,' +
    'status:$("v2-status").textContent' +
    '};};\n' +
    '    window.__breakEngine=function(){runScenario=function(){throw new Error("injected engine failure")}};\n' +
    '    window.__calculateNow=function(){calculate()};\n' +
    '    init();';
  const hooked = output.replace('    init();', hook);
  assert.notEqual(hooked, output, 'the inspection/fault-injection seam must actually be injected');
  return hooked;
}

async function loadLiveApp(appState) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(assembleLiveApp(), { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
  dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  // Keyed off the app's own root lookup rather than "first non-JSON script"
  // -- app-shell.html also carries a PWA manifest/icon bootstrap script in
  // <head>, which that weaker predicate selects instead.
  const mainScript = Array.from(dom.window.document.querySelectorAll('script'))
    .find((el) => el.getAttribute('type') !== 'application/json'
      && el.textContent.includes('investment-calculator-v2c'));
  assert.ok(mainScript, 'could not find the app script');
  dom.window.eval(mainScript.textContent);
  await flush(dom);
  return dom;
}

function flush(dom, ms = 0) {
  return new Promise((resolve) => dom.window.setTimeout(resolve, ms));
}

/** One bounded deterministic period -- nothing here depends on a long projection. */
function boundedPlan() {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.id = 'fm04';
  p.name = 'FM04';
  p.profile.age = 75;
  p.profile.retireAge = 65;
  p.profile.endAge = 76;
  p.profile.spouseOn = false;
  p.employment.salary = 0;
  p.employment.spouseSalary = 0;
  p.assumptions.method = 'simple';
  p.assumptions.returnRate = 0;
  p.assumptions.inflation = 0;
  p.assumptions.fee = 0;
  p.retirement.strategy = 'fixedNominal';
  p.retirement.spending = 20000;
  p.retirement.ssBenefit = 0;
  p.retirement.spouseSS = 0;
  p.retirement.pension = 0;
  p.retirement.dividendOn = false;
  p.retirement.stages = [];
  p.retirement.expenses = [];
  p.retirement.otherIncomes = [];
  p.advanced.rmdOn = false;
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  p.advanced.healthOn = false;
  p.advanced.ltcOn = false;
  p.accounts = [{
    id: 'a1', name: 'Taxable', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 1000000, basisPct: 100, contributionMode: 'dollar', contribution: 0, frequency: 12,
    annualChangeMode: 'percent', annualChange: 0, changeTiming: 'annual', contributionPreset: 'none',
    futureChanges: [], priority: 1, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0,
    vesting: 100, allocation: {},
  }];
  return p;
}

function appState() {
  return { version: 2, edition: '2C', page: 'results', complexity: 'standard', theme: 'auto', compare: false, active: 0, scenarios: [boundedPlan()] };
}

// ---------------------------------------------------------------------------
// FM-04 -- a thrown engine error must not leave a stale financial figure
// ---------------------------------------------------------------------------

test('FM-04: a synchronous engine throw must not leave the previous result as the active financial answer', uiTest, async () => {
  const dom = await loadLiveApp(appState());

  const before = dom.window.__inspect();
  assert.ok(before.hasResult, 'precondition: a valid result must exist before the failure');
  assert.ok(before.endingTotal > 0, 'precondition: a real ending balance must be on screen, got ' + before.endingTotal);
  assert.equal(before.calculationError, false, 'precondition: that result must not already be an error');
  const staleTotal = before.endingTotal;

  // jsdom has no Worker, so this exercises the no-worker path -- the one
  // where the synchronous throw escapes the promise boundary entirely.
  dom.window.__breakEngine();
  dom.window.__calculateNow();
  await flush(dom);
  await flush(dom);

  const after = dom.window.__inspect();

  assert.ok(
    !(after.hasResult && !after.calculationError && after.endingTotal === staleTotal),
    'the prior $' + staleTotal + ' result is still the active result after the engine threw -- ' +
    'a calculation error is being presented as a financial outcome (ARCH-02)'
  );
  assert.equal(after.calculationError, true, 'the active result must be a structured invalid result');
  assert.equal(after.rows, null, 'an invalid result must carry no rows');
  assert.ok(
    /stopped|error|could not/i.test(after.performance + ' ' + after.status),
    'the UI must say the calculation stopped, got performance=' + JSON.stringify(after.performance) + ' status=' + JSON.stringify(after.status)
  );
});

test('FM-04: after a failure the plan must not be marked clean', uiTest, async () => {
  const dom = await loadLiveApp(appState());
  dom.window.__breakEngine();
  dom.window.__calculateNow();
  await flush(dom);
  await flush(dom);
  assert.equal(dom.window.__inspect().dirty, true, 'a failed calculation must leave the plan dirty, not clean');
});

test('FM-04: recovery -- a good calculation after a failure produces a valid result again', uiTest, async () => {
  const dom = await loadLiveApp(appState());
  dom.window.__breakEngine();
  dom.window.__calculateNow();
  await flush(dom);
  await flush(dom);
  assert.equal(dom.window.__inspect().calculationError, true, 'precondition: the failure landed');

  // Reload a fresh instance to restore an unbroken engine, mirroring what a
  // real recovery looks like (the failure is not sticky in the source).
  const recovered = await loadLiveApp(appState());
  recovered.window.__calculateNow();
  await flush(recovered);
  await flush(recovered);
  const after = recovered.window.__inspect();
  assert.equal(after.calculationError, false, 'a healthy run after a failure must produce a valid result');
  assert.ok(after.endingTotal > 0, 'and real financial figures must come back');
});

// ---------------------------------------------------------------------------
// FM-08 -- emptying an input must invalidate work already in flight
// ---------------------------------------------------------------------------

function emptyTheSpendingInput(dom) {
  const root = dom.window.document.getElementById('investment-calculator-v2c');
  const el = root.querySelector('#v2-spending');
  assert.ok(el, 'expected the spending input to exist');
  el.value = '';
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  return el;
}

test('FM-08: emptying a number input must advance the calculation generation, like every other edit does', uiTest, async () => {
  const dom = await loadLiveApp(appState());
  const before = dom.window.__inspect().generation;
  emptyTheSpendingInput(dom);
  const after = dom.window.__inspect().generation;
  assert.ok(
    after > before,
    'emptying an input left calcGeneration at ' + before + ' -- so a job already in flight still belongs to the accepted generation'
  );
});

test('FM-08: work in flight when the input is emptied must not publish and must not mark the plan clean', uiTest, async () => {
  const dom = await loadLiveApp(appState());

  // Start a calculation, then empty the field in the same tick -- before the
  // job's deferred body runs. The job must observe that it is stale.
  dom.window.__calculateNow();
  emptyTheSpendingInput(dom);
  await flush(dom);
  await flush(dom);

  const after = dom.window.__inspect();
  assert.equal(after.dirty, true, 'the plan must still be dirty -- a blank input has no completed calculation');
  assert.ok(
    !/Projection updated/i.test(after.status),
    'the status must not report a completed projection for a blank input, got ' + JSON.stringify(after.status)
  );
});

test('FM-08: the waiting-for-a-value message is still shown -- the repair must not regress the prompt', uiTest, async () => {
  const dom = await loadLiveApp(appState());
  emptyTheSpendingInput(dom);
  const after = dom.window.__inspect();
  assert.ok(
    /waiting for a value/i.test(after.performance),
    'the user-facing prompt must survive the repair, got ' + JSON.stringify(after.performance)
  );
});
