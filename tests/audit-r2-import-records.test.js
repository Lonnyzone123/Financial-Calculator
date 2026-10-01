'use strict';

/**
 * R2-T05 / R2-006 -- MALFORMED IMPORTS MUST BE REJECTED ATOMICALLY.
 *
 * The audit's demonstration, reproduced by the control tests below: a
 * default-shaped plan with `retirement.expenses = [null]` passes BOTH
 * validators. `validateRawContainers()` only asks whether the container is
 * an array -- it is -- and `validateScenario()`'s `validateRetirement()`
 * asks the same question and never looks inside. Normalization preserves
 * the array as-is, because `Array.isArray(x) ? x : []` is satisfied.
 *
 * So `importSettings()` reaches its apply phase, assigns `app = candidate`,
 * clears `results`, and only THEN calls `writeStatic() ->
 * renderRetirementLists()`, which reads `item.name` off `null` and throws.
 * The outer catch reports an invalid backup -- but the in-memory app has
 * already been replaced. The user is told the import failed while looking
 * at, and able to persist, the failed import's state.
 *
 * That is two distinct defects, and this file covers both:
 *
 *   1. A VALIDATION GAP. Nested record entries are never checked. Closed
 *      by validating entry shape and the financial fields inside each
 *      entry, in `validateRawContainers()` (which runs BEFORE lossy
 *      normalization, on a detached candidate) and in `validateScenario()`
 *      (so direct callers get the same protection).
 *
 *   2. AN ATOMICITY GAP. Validation can never be proven exhaustive, so the
 *      apply phase must be recoverable on its own. Closed by snapshotting
 *      app/results/resultsDirty before the apply phase and restoring them
 *      if anything in it throws.
 *
 * BOUNDARY. The risk called out by the audit is that over-eager validation
 * rejects legitimate legacy backups, so the rules here are deliberately
 * narrow: an entry must be an OBJECT, and a financial field must be a
 * finite number IF IT IS PRESENT. Absent fields stay legal -- that is what
 * legacy migration depends on. Rate-style fields that the engine already
 * reads through a documented `Number(x) || 0` fallback are left alone; see
 * SPRINT_QUESTIONS.md Q4.
 *
 * The DOM cases assemble the app in memory from `src/` exactly as build.js
 * would, rather than going through tests/lib/harness.js -- that harness
 * deliberately loads the stale, hash-locked shipped artifact, which does
 * not contain this repair, so an assertion made through it would silently
 * test old code (ROADMAP ground rule 2).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');
const validator = require('../src/scenario-validator.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

function planWith(retirementOverrides, accounts) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.id = 'import-records';
  p.name = 'ORIGINAL';
  p.accounts = accounts || [{
    id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 100000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  Object.assign(p.retirement, retirementOverrides || {});
  return p;
}

/** Every ERROR path reported by either validator, for one plan. */
function errorPaths(plan) {
  const raw = validator.validateRawContainers(plan);
  const full = validator.validateScenario(plan);
  return {
    raw: raw.issues.filter(function (i) { return i.severity === 'ERROR'; }).map(function (i) { return i.path; }),
    full: full.issues.filter(function (i) { return i.severity === 'ERROR'; }).map(function (i) { return i.path; }),
    rawValid: raw.valid,
    fullValid: full.valid,
  };
}

// =====================================================================
// The defect, and the entry-shape rule that closes it.
// =====================================================================

test('R2-006 (control): a [null] expenses entry really is structurally unusable -- the engine\'s own eventAmount() throws on it', () => {
  assert.throws(function () { engine.eventAmount([null], 60, 61); },
    'if this stopped throwing, the premise of this whole file would need rechecking');
});

test('R2-006: retirement.expenses = [null] is rejected by BOTH validators, with an INDEXED path', () => {
  const r = errorPaths(planWith({ expenses: [null] }));
  assert.equal(r.rawValid, false, 'the pre-normalization gate must reject it -- this is the gate importSettings() runs first');
  assert.equal(r.fullValid, false, 'the full validator must reject it too, for direct callers');
  assert.ok(r.raw.indexOf('retirement.expenses[0]') !== -1,
    'expected an indexed path "retirement.expenses[0]", got ' + JSON.stringify(r.raw));
  assert.ok(r.full.indexOf('retirement.expenses[0]') !== -1,
    'expected an indexed path from the full validator, got ' + JSON.stringify(r.full));
});

test('R2-006: primitive entries of every kind are rejected, and the index reported is the offending one', () => {
  const cases = [
    ['null', null], ['a number', 42], ['a string', 'expense'],
    ['a boolean', true], ['a nested array', []],
  ];
  for (const entry of cases) {
    const good = { name: 'Roof', age: 70, amount: 20000 };
    const r = errorPaths(planWith({ expenses: [good, entry[1]] }));
    assert.equal(r.rawValid, false, entry[0] + ' entry was accepted');
    assert.ok(r.raw.indexOf('retirement.expenses[1]') !== -1,
      entry[0] + ': expected the path to name index 1, got ' + JSON.stringify(r.raw));
    assert.ok(r.raw.indexOf('retirement.expenses[0]') === -1,
      entry[0] + ': the VALID entry at index 0 must not be flagged, got ' + JSON.stringify(r.raw));
  }
});

test('R2-006: stages and otherIncomes get the same entry-shape rule as expenses', () => {
  const stages = errorPaths(planWith({ stages: [null] }));
  assert.equal(stages.rawValid, false);
  assert.ok(stages.raw.indexOf('retirement.stages[0]') !== -1, JSON.stringify(stages.raw));

  const incomes = errorPaths(planWith({ otherIncomes: ['rental'] }));
  assert.equal(incomes.rawValid, false);
  assert.ok(incomes.raw.indexOf('retirement.otherIncomes[0]') !== -1, JSON.stringify(incomes.raw));
});

test('R2-006: an account\'s futureChanges entries are checked too, with both indices in the path', () => {
  const accounts = [{
    id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 100000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [{ age: 60, mode: 'set', value: 0 }, null], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }];
  const r = errorPaths(planWith({}, accounts));
  assert.equal(r.rawValid, false);
  assert.ok(r.raw.indexOf('accounts[0].futureChanges[1]') !== -1,
    'expected a doubly-indexed path, got ' + JSON.stringify(r.raw));
});

// =====================================================================
// Malformed financial fields inside an otherwise well-shaped entry.
// =====================================================================

test('R2-006: a PRESENT financial field that is not a finite number is rejected -- this is the silent-wrong-answer case, not a crash', () => {
  const cases = [
    ['a string amount', { name: 'Roof', age: 70, amount: 'lots' }, 'retirement.expenses[0].amount'],
    ['a null age', { name: 'Roof', age: null, amount: 20000 }, 'retirement.expenses[0].age'],
    ['NaN', { name: 'Roof', age: 70, amount: NaN }, 'retirement.expenses[0].amount'],
    ['Infinity', { name: 'Roof', age: Infinity, amount: 20000 }, 'retirement.expenses[0].age'],
    ['an object', { name: 'Roof', age: 70, amount: { value: 1 } }, 'retirement.expenses[0].amount'],
  ];
  for (const entry of cases) {
    const r = errorPaths(planWith({ expenses: [entry[1]] }));
    assert.equal(r.rawValid, false, entry[0] + ' was accepted');
    assert.ok(r.raw.indexOf(entry[2]) !== -1,
      entry[0] + ': expected path ' + entry[2] + ', got ' + JSON.stringify(r.raw));
  }
});

test('R2-006: stage and income timing/amount fields are checked the same way', () => {
  const stage = errorPaths(planWith({ stages: [{ name: 'Go-go', start: 65, end: 'later', mode: 'amount', value: 80000 }] }));
  assert.ok(stage.raw.indexOf('retirement.stages[0].end') !== -1, JSON.stringify(stage.raw));

  const income = errorPaths(planWith({ otherIncomes: [{ name: 'Rental', type: 'rental', amount: '2400', start: 65, end: 90 }] }));
  assert.ok(income.raw.indexOf('retirement.otherIncomes[0].amount') !== -1, JSON.stringify(income.raw));
});

// =====================================================================
// Legacy compatibility -- the fix risk the audit named explicitly.
// =====================================================================

test('R2-006 (legacy): a plan with the nested arrays entirely ABSENT still validates -- migration of truly absent fields is unchanged', () => {
  const p = planWith({});
  delete p.retirement.stages;
  delete p.retirement.expenses;
  delete p.retirement.otherIncomes;
  const r = errorPaths(p);
  assert.equal(r.rawValid, true, 'absent arrays must remain legal: ' + JSON.stringify(r.raw));
  assert.equal(r.fullValid, true, 'absent arrays must remain legal: ' + JSON.stringify(r.full));
});

/* SA-01 (SPRINT_EXTERNAL_AUDIT_20260909.md) REPLACES the test that used to
   sit here. That test asserted that an entry which merely omits optional
   fields is ACCEPTED, on the premise that an absent field is inert. The
   audit disproved the premise against the comparisons the engine actually
   performs, and the test was therefore codifying the defect. The premise is
   now inverted: a PRESENT record must be a COMPLETE financial instruction.
   Absent CONTAINERS remain legal -- that is the real legacy-migration
   compatibility, and its tests are retained below unchanged. */

test('SA-01: an incomplete record is REJECTED -- a present record must be a complete financial instruction', () => {
  const cases = [
    ['bare stage', { stages: [{ name: 'Go-go' }] }, ['retirement.stages[0].start', 'retirement.stages[0].end', 'retirement.stages[0].mode', 'retirement.stages[0].value']],
    ['bare expense', { expenses: [{ name: 'Roof' }] }, ['retirement.expenses[0].age', 'retirement.expenses[0].amount']],
    ['income with no end', { otherIncomes: [{ name: 'Rental', type: 'rental', amount: 24000, start: 65 }] }, ['retirement.otherIncomes[0].end']],
  ];
  for (const entry of cases) {
    const r = errorPaths(planWith(entry[1]));
    assert.equal(r.rawValid, false, entry[0] + ' was accepted');
    assert.equal(r.fullValid, false, entry[0] + ' was accepted by the full validator');
    for (const p of entry[2]) {
      assert.ok(r.raw.indexOf(p) !== -1,
        entry[0] + ': expected a missing-field error at ' + p + ', got ' + JSON.stringify(r.raw));
    }
  }
});

test('SA-01 (end-to-end): the bare-stage payload really would have zeroed all spending -- this is what the rejection is protecting against', () => {
  // The stake, asserted rather than described. applyStage()'s rejection test
  // is `age < s.start || age > s.end`; with both boundaries absent BOTH
  // comparisons are false, so the stage applies, missing `mode` takes the
  // amount branch, and missing `value` becomes 0 via Number(v) || 0.
  const p = planWith({ stages: [{ name: 'Go-go' }] });
  p.profile.age = 75; p.profile.retireAge = 65; p.profile.endAge = 76;
  p.employment.salary = 0; p.employment.spouseSalary = 0;
  p.assumptions.method = 'simple'; p.assumptions.returnRate = 0; p.assumptions.inflation = 0;
  p.retirement.strategy = 'fixedNominal'; p.retirement.spending = 20000;
  p.retirement.ssBenefit = 0; p.retirement.dividendOn = false;
  p.advanced.rmdOn = false; p.advanced.healthOn = false; p.advanced.ltcOn = false;
  /* S5AA R43 (SA42F-06): the engine's input gate now refuses the incomplete stage itself (src/plan-value-contract.json), so the
     stake this test asserted -- spending silently zeroed with no calculation error -- can no longer be reached; both layers refuse. */
  const refused = engine.simulatePlan(p, null, 0, null, null);
  assert.equal(refused.calculationErrorCode, 'SCENARIO_NONNUMBER_PLAN_VALUE', 'the engine refuses the stage with no boundaries');
  assert.ok(!refused.rows || refused.rows.length === 0, 'and projects nothing');
  assert.equal(errorPaths(p).rawValid, false, 'and the validator refuses it before it can reach a projection');
});

test('SA-01 (end-to-end): a COMPLETE stage is accepted AND produces its intended spending, not merely valid === true', () => {
  const p = planWith({ stages: [{ name: 'Go-go', start: 70, end: 80, mode: 'amount', value: 55000, growthMode: 'none', annualChange: 0 }] });
  p.profile.age = 75; p.profile.retireAge = 65; p.profile.endAge = 76;
  p.employment.salary = 0; p.employment.spouseSalary = 0;
  p.assumptions.method = 'simple'; p.assumptions.returnRate = 0; p.assumptions.inflation = 0;
  p.retirement.strategy = 'fixedNominal'; p.retirement.spending = 20000;
  p.retirement.ssBenefit = 0; p.retirement.dividendOn = false;
  p.advanced.rmdOn = false; p.advanced.healthOn = false; p.advanced.ltcOn = false;
  const r = errorPaths(p);
  assert.equal(r.rawValid, true, 'a complete stage must be accepted: ' + JSON.stringify(r.raw));
  assert.equal(r.fullValid, true, 'a complete stage must be accepted: ' + JSON.stringify(r.full));
  assert.equal(engine.simulatePlan(p, null, 0, null, null).rows[1].spending, 55000,
    'the accepted stage must actually take effect, at its stated amount');
});

test('SA-01 (end-to-end): a COMPLETE recurring income is accepted and stops at its stated end age', () => {
  const p = planWith({ otherIncomes: [{ name: 'Rental', type: 'rental', owner: 'household', amount: 24000, start: 65, end: 80, growthMode: 'fixed', growth: 0 }] });
  assert.equal(errorPaths(p).rawValid, true, 'a complete income must be accepted');
  assert.equal(engine.otherIncomeFor(p, 70, 71, 1, 0).cash, 24000, 'inside its interval it pays');
  assert.equal(engine.otherIncomeFor(p, 90, 91, 1, 0).cash, 0, 'past its end age it must stop -- the missing-end case could not');
});

test('SA-01: a one-time income needs its event timing but NOT an interval end -- the rule is per record kind, not one blanket list', () => {
  const oneTime = errorPaths(planWith({ otherIncomes: [{ name: 'Inheritance', type: 'oneTime', amount: 50000, start: 70 }] }));
  assert.equal(oneTime.rawValid, true, 'a one-time income has no interval, so no end is required: ' + JSON.stringify(oneTime.raw));
  const noTiming = errorPaths(planWith({ otherIncomes: [{ name: 'Inheritance', type: 'oneTime', amount: 50000 }] }));
  assert.equal(noTiming.rawValid, false, 'but it still needs its event timing');
  assert.ok(noTiming.raw.indexOf('retirement.otherIncomes[0].start') !== -1, JSON.stringify(noTiming.raw));
});

test('SA-01: rate-style fields stay OPTIONAL but are validated when present -- Number(x) || 0 is not a substitute for validation', () => {
  const absent = errorPaths(planWith({ otherIncomes: [{ name: 'R', type: 'rental', amount: 1000, start: 65, end: 80 }] }));
  assert.equal(absent.rawValid, true, 'an absent growth rate is still legal: ' + JSON.stringify(absent.raw));

  const malformed = errorPaths(planWith({ otherIncomes: [{ name: 'R', type: 'rental', amount: 1000, start: 65, end: 80, growth: 'not-a-rate' }] }));
  assert.equal(malformed.rawValid, false, 'a present, malformed growth rate must be rejected rather than silently read as 0');
  assert.ok(malformed.raw.indexOf('retirement.otherIncomes[0].growth') !== -1, JSON.stringify(malformed.raw));

  // The specific case the truthiness fallback cannot catch: Number("Infinity")
  // is Infinity, which is truthy, so `Number(x) || 0` passes it straight
  // through as an infinite growth rate.
  assert.ok(Number('Infinity') || 0, 'precondition: "Infinity" survives the || 0 fallback');
  const infinite = errorPaths(planWith({ otherIncomes: [{ name: 'R', type: 'rental', amount: 1000, start: 65, end: 80, growth: 'Infinity' }] }));
  assert.equal(infinite.rawValid, false, 'a non-finite growth rate must be rejected');
});

test('SA-01: an unrecognized mode is rejected rather than falling into a default branch', () => {
  const stage = errorPaths(planWith({ stages: [{ name: 'S', start: 70, end: 80, mode: 'sideways', value: 1000 }] }));
  assert.equal(stage.rawValid, false, 'applyStage() would silently take the amount branch for an unknown mode');
  assert.ok(stage.raw.indexOf('retirement.stages[0].mode') !== -1, JSON.stringify(stage.raw));

  // accountPlannedContribution()'s unrecognized-mode branch means "dollar",
  // so an absent or unknown mode silently picks a policy.
  const accounts = [Object.assign({}, planWith({}).accounts[0], { futureChanges: [{ age: 70, value: 500 }] })];
  const change = errorPaths(planWith({}, accounts));
  assert.equal(change.rawValid, false, 'a future contribution change must state its mode');
  assert.ok(change.raw.indexOf('accounts[0].futureChanges[0].mode') !== -1, JSON.stringify(change.raw));
});

test('R2-006 (legacy): fully populated, valid arrays validate cleanly and are not disturbed', () => {
  const r = errorPaths(planWith({
    stages: [{ name: 'Go-go', start: 65, end: 75, mode: 'amount', value: 80000, growthMode: 'inflation', annualChange: 0 }],
    expenses: [{ name: 'Roof', kind: 'expense', age: 70, amount: 20000 }],
    otherIncomes: [{ name: 'Rental', type: 'rental', owner: 'household', amount: 24000, start: 65, end: 90, growthMode: 'fixed', growth: 2 }],
  }));
  assert.equal(r.rawValid, true, JSON.stringify(r.raw));
  assert.equal(r.fullValid, true, JSON.stringify(r.full));
});

test('R2-006 (legacy): empty arrays -- the shipped default -- validate cleanly', () => {
  const r = errorPaths(planWith({ stages: [], expenses: [], otherIncomes: [] }));
  assert.equal(r.rawValid, true, JSON.stringify(r.raw));
  assert.equal(r.fullValid, true, JSON.stringify(r.full));
});

// =====================================================================
// Atomicity, through the real import path.
// =====================================================================

/* The FULL app exactly as build.js assembles it: tests/lib/harness.js's fresh
   build of this tree, into a scratch directory, never the shipped artifact.
   This used to re-transcribe build.js's header and footer stripping here. That
   copy had already drifted -- it never bundled the debt modules -- and S5 2l,
   where build.js hands the engine the boolean-flag contract, left it shipping
   an engine that cannot load. Required lazily, so a missing jsdom still reads
   as a skip. */
function assembleLiveApp() {
  return require('./lib/harness').freshBuildHtml();
}

/* Per ROADMAP ground rule 3: a missing jsdom is an environment fact, not a
   product defect, and must read as a skip rather than as a pass or a
   failure. */
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

/** A bounded one-period plan, so nothing here depends on a long
 *  projection or on worker plumbing. */
function boundedPlan(name) {
  const p = planWith({});
  p.name = name;
  p.profile.age = 75;
  p.profile.retireAge = 65;
  p.profile.endAge = 76;
  p.profile.spouseOn = false;
  p.employment.salary = 0;
  p.employment.spouseSalary = 0;
  p.assumptions.method = 'simple';
  p.assumptions.returnRate = 0;
  p.retirement.ssBenefit = 0;
  p.advanced.rmdOn = false;
  p.advanced.healthOn = false;
  p.advanced.ltcOn = false;
  return p;
}

function appStateWith(plan) {
  return { version: 2, edition: '2C', active: 0, page: 'setup', compare: false, scenarios: [plan] };
}

async function importPayload(dom, payload) {
  const { document, File, Event } = dom.window;
  const root = document.getElementById('investment-calculator-v2c');
  const input = root.querySelector('#v2-import-settings');
  const status = root.querySelector('#v2-status');
  const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  status.textContent = '';
  input.dispatchEvent(new Event('change', { bubbles: true }));
  const deadline = Date.now() + 4000;
  while (status.textContent === '' && Date.now() < deadline) {
    await new Promise(function (resolve) { dom.window.setTimeout(resolve, 5); });
  }
  return status.textContent;
}

test('R2-006 (import): a backup containing a [null] expenses entry is REFUSED as a structural problem, not accepted and then crashed through', uiTest, async () => {
  const dom = await loadLiveApp(appStateWith(boundedPlan('ORIGINAL')));
  const replacement = boundedPlan('REPLACEMENT');
  replacement.retirement.expenses = [null];

  const status = await importPayload(dom, { format: 'investment-calculator-v2c', app: appStateWith(replacement) });
  assert.match(status, /structural problem|structural problems/,
    'expected a structural-problem message, got: ' + status);
});

test('R2-006 (import): the refused backup leaves the LIVE app untouched -- the rendered scenario is still the original', uiTest, async () => {
  const dom = await loadLiveApp(appStateWith(boundedPlan('ORIGINAL')));
  const replacement = boundedPlan('REPLACEMENT');
  replacement.retirement.expenses = [null];

  await importPayload(dom, { format: 'investment-calculator-v2c', app: appStateWith(replacement) });
  const nameField = dom.window.document.getElementById('v2-name');
  assert.equal(nameField.value, 'ORIGINAL',
    'the rejected candidate reached the UI: #v2-name reads "' + nameField.value + '"');
});

test('R2-006 (import): the refused backup cannot be persisted -- stored state is still the original after the failed import', uiTest, async () => {
  const dom = await loadLiveApp(appStateWith(boundedPlan('ORIGINAL')));
  const replacement = boundedPlan('REPLACEMENT');
  replacement.retirement.expenses = [null];

  await importPayload(dom, { format: 'investment-calculator-v2c', app: appStateWith(replacement) });
  const stored = JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.scenarios[0].name, 'ORIGINAL',
    'the rejected candidate was persisted; stored name is "' + stored.scenarios[0].name + '"');
  assert.deepEqual(stored.scenarios[0].retirement.expenses, [],
    'the rejected candidate\'s malformed array reached storage');
});

test('R2-006 (import): a VALID backup still imports -- the new validation does not block legitimate restores', uiTest, async () => {
  const dom = await loadLiveApp(appStateWith(boundedPlan('ORIGINAL')));
  const replacement = boundedPlan('REPLACEMENT');
  replacement.retirement.expenses = [{ name: 'Roof', kind: 'expense', age: 76, amount: 20000 }];

  const status = await importPayload(dom, { format: 'investment-calculator-v2c', app: appStateWith(replacement) });
  assert.match(status, /Backup restored/, 'a valid backup must still import; got: ' + status);
  assert.equal(dom.window.document.getElementById('v2-name').value, 'REPLACEMENT');
});

test('R2-006 (import): a legacy backup with the nested arrays entirely absent still imports', uiTest, async () => {
  const dom = await loadLiveApp(appStateWith(boundedPlan('ORIGINAL')));
  const legacy = boundedPlan('LEGACY');
  delete legacy.retirement.stages;
  delete legacy.retirement.expenses;
  delete legacy.retirement.otherIncomes;

  const status = await importPayload(dom, { format: 'investment-calculator-v2c', app: appStateWith(legacy) });
  assert.match(status, /Backup restored/, 'a legacy backup must still import; got: ' + status);
});

test('R2-006 (atomicity): if the APPLY phase throws after the app has been assigned, the previous app is rolled back rather than left half-replaced', uiTest, async () => {
  const dom = await loadLiveApp(appStateWith(boundedPlan('ORIGINAL')));
  // renderRules() runs immediately after writeStatic() in the apply phase.
  // Removing one of ITS elements makes the apply throw at a point where the
  // candidate has already been assigned AND written to the UI, while
  // leaving the rest of the DOM intact -- exactly the "accepted candidate
  // failed to apply" case the rollback exists for. Validation cannot help
  // here: the payload is entirely valid.
  const ruleWarning = dom.window.document.getElementById('v2-rule-warning');
  ruleWarning.parentNode.removeChild(ruleWarning);

  const status = await importPayload(dom, { format: 'investment-calculator-v2c', app: appStateWith(boundedPlan('REPLACEMENT')) });
  assert.doesNotMatch(status, /Backup restored/,
    'an import whose apply phase threw must not report success; got: ' + status);
  assert.equal(dom.window.document.getElementById('v2-name').value, 'ORIGINAL',
    'the half-applied candidate was left in place: #v2-name reads "' + dom.window.document.getElementById('v2-name').value + '"');
  const stored = JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.scenarios[0].name, 'ORIGINAL',
    'the half-applied candidate reached storage as "' + stored.scenarios[0].name + '"');
});
