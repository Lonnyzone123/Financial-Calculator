'use strict';

/**
 * R4-F1 -- MISSING-RESULT HEAT-MAP GUARD, plus the R4-F3 test-hygiene
 * requirement the external audit found this file had repeated.
 *
 * THE DEFECT. The guard was `if (activeResult && activeResult.calculationError)`.
 * That asks "is this result INVALID?" when it needs to ask "is this result
 * PRESENT AND USABLE?" -- short-circuiting makes an ABSENT result satisfy the
 * condition rather than trip it, so control fell through into scheduling and
 * publishing a 98-year historical sweep for a scenario that had never been
 * run. Closed with a positive predicate, `usableActiveResult()`, applied at
 * the entry guard and at both callback re-checks.
 *
 * REACHABILITY. R4-F1 describes the trigger as "an empty results array,
 * nothing run yet." That exact state is not reachable through the obvious
 * routes: `setPage("results")` recalculates whenever
 * `resultsDirty || !results[app.active]`, and the Reset button's replacement
 * plan has rolling history off so the next guard catches it anyway. The audit
 * accepted this correction and added a nuance worth keeping: cold-load entry
 * DOES call calculation, but its completion is asynchronous, so "self-heals"
 * is not proof that an empty-result window is unreachable -- it is proof that
 * the window is transient.
 *
 * What is reachable, and what these tests drive, is exactly that transient
 * window: switching scenarios points `app.active` at an index with no result
 * and starts a recalculation, and until it lands `results[app.active]` is
 * `undefined`. Opening the heat map there is an ordinary sequence, and on a
 * real device running a large Monte Carlo projection the window is seconds
 * wide.
 *
 * BOUNDED HISTORY (audit item 6, closing R4-F3 for this file). The previous
 * version of this suite let the heat map run the app's REAL rolling-history
 * loop -- 98 `simulatePlan()` calls per render. Short paths made it fast, but
 * it was still history execution inside a consumer test, which is the
 * hygiene issue R4-F3 already carries. Every case below now installs a
 * bounded stub that answers historical sweeps with a fabricated cell and
 * counts the attempts, while delegating ordinary projections to the real
 * engine so the app still behaves normally. That turns "did the guard let a
 * sweep through?" from an inference about rendered HTML into a direct
 * observation of the call count.
 *
 * The stub is injected into the IN-MEMORY copy of the app only. It adds no
 * production seam.
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

/* The stub answers only historical sweeps -- the heat map sets
   `testPlan.assumptions.method = "historical"` before calling -- and hands
   everything else to the real engine. The fabricated result carries exactly
   what classifyHistoricalCell() reads: a null calculation-error age, a
   `failed` flag, and a final row with a finite total. */
const HISTORY_STUB = [
  '    window.__historySweeps=0;',
  '    var __realSimulatePlan=simulatePlan;',
  '    simulatePlan=function(plan,random,historyOffset,ltcRandom,issues){',
  '      if(plan&&plan.assumptions&&plan.assumptions.method==="historical"){',
  '        window.__historySweeps++;',
  '        return {calculationErrorAge:null,failed:false,rows:[{age:76,total:1234}]};',
  '      }',
  '      return __realSimulatePlan(plan,random,historyOffset,ltcRandom,issues);',
  '    };',
  // Clears the active result WITHOUT scheduling any work, so the callback's
  // own result re-check is reached instead of being pre-empted by the
  // generation guard. results[app.active] = null is the state the Reset
  // button already produces, not an invented one.
  '    window.__clearActiveResult=function(){results[app.active]=null;};',
].join('\n');

function assembleLiveApp() {
  /* build.js's own output (tests/lib/harness.js's fresh build of this tree),
     not a re-transcription of its stripping, which had drifted (no debt
     modules) and could not follow S5 2l's contract substitution. Required
     lazily, so a missing jsdom still reads as a skip. */
  const assembled = require('./lib/harness').freshBuildHtml();
  const stubbed = assembled.replace('    init();', HISTORY_STUB + '\n    init();');
  assert.notEqual(stubbed, assembled, 'the bounded history stub must actually be injected');
  return stubbed;
}

let jsdomAvailable = true;
try { require('jsdom'); } catch (e) { jsdomAvailable = false; }
const uiTest = jsdomAvailable ? {} : { skip: 'jsdom is not installed in this environment; run npm install to execute the DOM heat-map cases' };

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

function boundedPlan(name) {
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
  p.assumptions.rollingHistory = true;
  p.retirement.ssBenefit = 0;
  p.advanced.rmdOn = false;
  p.advanced.healthOn = false;
  p.advanced.ltcOn = false;
  p.accounts = [{
    id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 500000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  return p;
}

function twoScenarioApp() {
  return {
    version: 2, edition: '2C', active: 0, page: 'results', compare: false,
    scenarios: [boundedPlan('ONE'), boundedPlan('TWO')],
  };
}

const settle = (dom, ms) => new Promise((r) => dom.window.setTimeout(r, ms === undefined ? 300 : ms));
const heatmapHost = (dom) => dom.window.document.getElementById('v2-heatmap');
const sweeps = (dom) => dom.window.__historySweeps;

function openHeatmap(dom) {
  const details = dom.window.document.getElementById('v2-heatmap-details');
  details.open = true;
  details.dispatchEvent(new dom.window.Event('toggle'));
}

function switchToSecondScenario(dom) {
  const tabs = dom.window.document.getElementById('v2-scenario-tabs').querySelectorAll('button');
  assert.equal(tabs.length, 2, 'expected two scenario tabs');
  tabs[1].click();
}

/** Opens the heat map with the sweep's own timer INTERCEPTED rather than
 *  scheduled, and hands the callback back so a test can decide when -- and
 *  against what state -- it runs. This is the "controlled timeout" the audit
 *  described: it reaches the callback guard without running history and
 *  without touching production code. The only 0 ms timer scheduled
 *  synchronously inside renderHeatmap() is the sweep, so there is nothing
 *  else here to catch by mistake. */
function openHeatmapCapturingSweep(dom) {
  const W = dom.window;
  const realSetTimeout = W.setTimeout;
  let captured = null;
  W.setTimeout = function (fn, ms) {
    if (ms === 0 && captured === null) { captured = fn; return 0; }
    return realSetTimeout.call(W, fn, ms);
  };
  try {
    openHeatmap(dom);
  } finally {
    W.setTimeout = realSetTimeout;
  }
  return captured;
}

test('R4-F1 (control): with a present, usable result the sweep runs and a heat map renders -- the guard is not simply disabling the feature', uiTest, async () => {
  const dom = await loadLiveApp(twoScenarioApp());
  await settle(dom, 500);
  assert.equal(sweeps(dom), 0, 'no historical sweep should have run before the heat map is opened');
  openHeatmap(dom);
  await settle(dom, 500);
  assert.ok(sweeps(dom) > 50, 'the sweep must actually be attempted for every start year; got ' + sweeps(dom));
  const table = heatmapHost(dom).querySelector('table');
  assert.ok(table, 'a usable result must produce a heat map: ' + heatmapHost(dom).innerHTML.slice(0, 200));
  assert.ok(table.querySelectorAll('tbody tr').length > 50, 'and it must carry a row per start year');
});

test('R4-F1 (entry guard): opening the heat map while the selected scenario has NO result must attempt ZERO historical sweeps', uiTest, async () => {
  const dom = await loadLiveApp(twoScenarioApp());
  await settle(dom, 500);
  switchToSecondScenario(dom);   // app.active = 1, results[1] undefined
  openHeatmap(dom);              // same turn: the recalculation has not landed

  // Assertions are made INSIDE the window, not after it. Waiting would let
  // the recalculation land and the sweep legitimately run -- which is the
  // deferral behaviour, covered by its own control below.
  assert.equal(sweeps(dom), 0, 'a sweep was scheduled off an absent active result');
  assert.equal(heatmapHost(dom).querySelector('table'), null, 'and nothing may be published from it');
  assert.match(heatmapHost(dom).textContent, /has not been calculated yet/i,
    'the missing-result state must be reported as its own state, not as a calculation error: ' + heatmapHost(dom).textContent);
  assert.doesNotMatch(heatmapHost(dom).textContent, /calculation error/i);
});

test('R4-F1 (callback guard, independent): a sweep already QUEUED against a usable result must abandon itself once that result is gone', uiTest, async () => {
  const dom = await loadLiveApp(twoScenarioApp());
  await settle(dom, 500);

  // Entry guard passes -- scenario ONE has a usable result -- so the sweep is
  // legitimately scheduled. Its timer is intercepted rather than run, so the
  // callback can be fired deliberately against a chosen state.
  const queuedSweep = openHeatmapCapturingSweep(dom);
  assert.ok(typeof queuedSweep === 'function',
    'the sweep must genuinely be scheduled, or this exercises nothing');
  assert.match(heatmapHost(dom).innerHTML, /Calculating all historical start years/,
    'and the entry guard must have let it through');
  assert.equal(sweeps(dom), 0, 'it must not have run yet -- its timer was intercepted');

  // Now clear the active result and run the callback. This deliberately does
  // NOT switch scenarios: a tab click calls calculate(), which bumps
  // calcGeneration, and the callback's generation guard would then pre-empt
  // the check under test -- the probe would pass without ever reaching it.
  // Clearing the result directly leaves the generation untouched and the
  // details element open, so ONLY a present-and-usable result check can
  // stop the sweep. results[app.active] = null is the state the Reset button
  // already produces.
  dom.window.__clearActiveResult();
  queuedSweep();

  assert.equal(sweeps(dom), 0,
    'the queued callback ran its sweep against a scenario with no result; ' + sweeps(dom) + ' start years were simulated');
  assert.equal(heatmapHost(dom).querySelector('table'), null,
    'and it published: ' + heatmapHost(dom).innerHTML.slice(0, 200));
});

test('R4-F1 (control): the guard DEFERS the sweep rather than losing it -- the heat map appears once the projection lands', uiTest, async () => {
  const dom = await loadLiveApp(twoScenarioApp());
  await settle(dom, 500);
  switchToSecondScenario(dom);
  openHeatmap(dom);
  assert.equal(heatmapHost(dom).querySelector('table'), null, 'nothing is published in the window itself');

  // The recalculation the switch started now lands, renderResults() calls
  // renderHeatmap() again, and this time the result is usable.
  await settle(dom, 700);
  const table = heatmapHost(dom).querySelector('table');
  assert.ok(table, 'the heat map must appear once the projection completes: ' + heatmapHost(dom).innerHTML.slice(0, 200));
  assert.ok(sweeps(dom) > 50, 'and the deferred sweep must then actually run; got ' + sweeps(dom));
});

test('R4-F1 (hygiene, R4-F3): these cases never execute the real rolling-history loop', uiTest, async () => {
  // The stub is the assertion: if any case had reached the real engine for a
  // historical plan, it would have been counted here rather than simulated.
  // This test states the property so a future edit that removes the stub
  // fails loudly instead of quietly reintroducing history execution.
  const dom = await loadLiveApp(twoScenarioApp());
  await settle(dom, 500);
  openHeatmap(dom);
  await settle(dom, 400);
  assert.equal(typeof sweeps(dom), 'number',
    'the bounded stub must be installed; without it this suite runs 98 real projections per render');
  assert.ok(heatmapHost(dom).textContent.indexOf('1,234') !== -1,
    'every cell must come from the fabricated stub result, proving no real history ran: ' +
    heatmapHost(dom).textContent.slice(0, 120));
});
