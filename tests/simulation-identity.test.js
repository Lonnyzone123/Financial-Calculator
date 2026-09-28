'use strict';

// Track A -- Scenario/Result schema, simulation identity, one engine entry
// point (PLATFORM_DEVELOPMENT_ROADMAP.md, Track A). Covers:
//   A1/A2 (schema): defaultPlan carries scenarioSchemaVersion; a scenario
//     saved before this landed (no `id`, no `scenarioSchemaVersion`) must
//     still load and get both backfilled -- the migration concern audit
//     finding C-1 raised.
//   A3 (identity): buildSimulationIdentity()'s shape and the specific
//     properties it must hold (stable input hash, changing run id, etc).
//   A4 (entry point): runScenario() must return exactly what runPlan() would
//     (every existing field, unchanged) plus the attached `identity` --
//     non-breaking for every caller that only ever knew about runPlan().

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadCalculator, waitFor, setValue, click, completeGuidedSetup, goToPage } = require('./lib/harness');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

function braceExtract(src, marker) {
  const i = src.indexOf(marker);
  let j = src.indexOf('{', i), depth = 0, inStr = null;
  for (let k = j; k < src.length; k++) {
    const c = src[k];
    if (inStr) { if (c === '\\') { k++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(j, k + 1); }
  }
  throw new Error('braceExtract: unbalanced braces');
}
const defaultPlan = eval('(' + braceExtract(shell, 'var defaultPlan=') + ')');

function samplePlan(overrides = {}) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.id = 'test-scenario-fixed-id';
  p.accounts = [
    { id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 250000, contribution: 12000, contributionMode: 'amount', priority: 1, basisPct: 70, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 },
  ];
  p.employment.salary = 145000;
  Object.assign(p.assumptions, overrides.assumptions || {});
  Object.assign(p.retirement, overrides.retirement || {});
  Object.assign(p.advanced, overrides.advanced || {});
  Object.assign(p.profile, overrides.profile || {});
  return p;
}

// ---------------------------------------------------------------------------
// A1/A2: schema fields
// ---------------------------------------------------------------------------

test('defaultPlan carries a schema version, and it is a plain literal (not a variable reference)', () => {
  // Regression guard for a real bug this test would have caught: an earlier
  // draft wrote `scenarioSchemaVersion: SCENARIO_SCHEMA_VERSION` directly in
  // defaultPlan's object literal, which in the built shell evaluates before
  // engine.js's `var SCENARIO_SCHEMA_VERSION=1` assignment has run (variable
  // hoisting only hoists the declaration, not the assignment) -- silently
  // producing `undefined` in the shipped app despite every test passing,
  // because the test harness's braceExtract+eval pattern evaluates
  // defaultPlan in isolation and would throw ReferenceError instead of
  // silently swallowing it the way the real page load does.
  assert.equal(defaultPlan.scenarioSchemaVersion, engine.SCENARIO_SCHEMA_VERSION);
  assert.equal(typeof defaultPlan.scenarioSchemaVersion, 'number');
});

test('a scenario saved before Track A (no id, no scenarioSchemaVersion) survives a reload and gets both backfilled', async () => {
  const legacyScenario = {
    name: 'Pre-Track-A Save',
    setupComplete: true,
    accounts: [{ type: 'taxable', balance: 100000 }],
    // Deliberately no `id`, no `scenarioSchemaVersion` -- simulating a
    // scenario saved by a build before this change existed.
  };
  const legacyAppState = {
    version: 2, edition: '2C', page: 'setup', complexity: 'standard', theme: 'auto',
    compare: false, active: 0, scenarios: [legacyScenario],
  };

  const dom = await loadCalculator({
    localStorageSeed: { 'investment-calculator-v2c': JSON.stringify(legacyAppState) },
  });
  const doc = dom.window.document;
  const root = doc.getElementById('investment-calculator-v2c');

  assert.equal(root.querySelector('#v2-name').value, 'Pre-Track-A Save', 'the legacy scenario itself must still load correctly');

  const savedRaw = dom.window.localStorage.getItem('investment-calculator-v2c');
  const saved = JSON.parse(savedRaw);
  assert.ok(saved.scenarios[0].id, 'a scenario with no id must be backfilled with one on load');
  assert.equal(typeof saved.scenarios[0].id, 'string');
  assert.equal(saved.scenarios[0].scenarioSchemaVersion, engine.SCENARIO_SCHEMA_VERSION, 'scenarioSchemaVersion must be backfilled to the current version');
});

test('duplicating a scenario gives the copy a different id than the source', async () => {
  const dom = await loadCalculator();
  const doc = dom.window.document;
  const root = doc.getElementById('investment-calculator-v2c');

  setValue(root.querySelector('#v2-name'), 'Original');
  completeGuidedSetup(doc);
  await waitFor(() => root.querySelector('[data-page-panel="accounts"]').classList.contains('is-active'), { window: dom.window });

  const beforeRaw = dom.window.localStorage.getItem('investment-calculator-v2c');
  const originalId = JSON.parse(beforeRaw).scenarios[0].id;
  assert.ok(originalId, 'the original scenario must already have an id');

  click(root.querySelector('#v2-duplicate'));

  const afterRaw = dom.window.localStorage.getItem('investment-calculator-v2c');
  const after = JSON.parse(afterRaw);
  assert.equal(after.scenarios.length, 2);
  assert.notEqual(after.scenarios[1].id, originalId, 'the duplicated scenario must not share the source scenario\'s id');
  assert.equal(after.scenarios[0].id, originalId, 'the source scenario\'s own id must be unchanged by duplicating it');
});

// ---------------------------------------------------------------------------
// A3/A4: identity shape and the runScenario() entry point
// ---------------------------------------------------------------------------

test('runScenario() returns everything runPlan() would, unchanged, plus an attached identity', () => {
  const p = samplePlan();
  const viaRunPlan = engine.runPlan(JSON.parse(JSON.stringify(p)));
  const viaRunScenario = engine.runScenario(JSON.parse(JSON.stringify(p)));

  // Every pre-existing field must be untouched (deterministic scenario, so
  // this mode isn't Monte Carlo -- an exact match is meaningful here).
  for (const key of Object.keys(viaRunPlan)) {
    assert.deepEqual(viaRunScenario[key], viaRunPlan[key], `runScenario() changed field "${key}" relative to runPlan()`);
  }
  assert.ok(viaRunScenario.identity, 'runScenario() must attach an identity object');
  assert.equal(viaRunPlan.identity, undefined, 'runPlan() itself must stay identity-free (only runScenario() attaches one)');
});

test('simulation identity: field shape and types', () => {
  const p = samplePlan({ assumptions: { method: 'monteCarlo', runs: 50, seed: 777 } });
  const result = engine.runScenario(p);
  const id = result.identity;

  assert.equal(id.scenarioId, 'test-scenario-fixed-id');
  assert.equal(typeof id.runId, 'string');
  assert.equal(id.scenarioSchemaVersion, engine.SCENARIO_SCHEMA_VERSION);
  assert.equal(id.resultSchemaVersion, engine.RESULT_SCHEMA_VERSION);
  assert.equal(id.engineVersion, engine.ENGINE_VERSION);
  assert.equal(id.dataPackageVersion, RULES.meta.packageId);
  assert.equal(typeof id.dataPackageHash, 'string');
  assert.equal(id.simulationMode, 'monteCarlo');
  assert.equal(id.historicalPeriod, null, 'non-historical mode must not carry a historicalPeriod');
  assert.equal(id.pathCount, 50);
  assert.equal(id.randomSeed, 777);
  assert.equal(typeof id.inputHash, 'string');
  assert.equal(typeof id.featureFlags, 'object');
  assert.equal(typeof id.featureFlags.rmdOn, 'boolean');
});

test('simulation identity: historical mode carries a historicalPeriod, and simple/historical path count is always 1', () => {
  const p = samplePlan({ assumptions: { method: 'historical', historyStart: 1966, rollingHistory: true } });
  const id = engine.runScenario(p).identity;
  assert.deepEqual(id.historicalPeriod, { start: 1966, rolling: true });
  assert.equal(id.pathCount, 1);
});

test('simulation identity: runId differs across two runs of the identical scenario; inputHash does not', () => {
  const p1 = samplePlan();
  const p2 = samplePlan();
  const id1 = engine.runScenario(p1).identity;
  const id2 = engine.runScenario(p2).identity;
  assert.notEqual(id1.runId, id2.runId, 'runId must be unique per invocation, even for the identical scenario');
  assert.equal(id1.inputHash, id2.inputHash, 'inputHash must be identical for identical input');
  assert.equal(id1.dataPackageHash, id2.dataPackageHash, 'dataPackageHash must be identical when the embedded data package has not changed');
});

test('simulation identity: inputHash changes when the scenario changes', () => {
  const base = samplePlan();
  const changed = samplePlan({ retirement: { spending: base.retirement.spending + 1 } });
  const idBase = engine.runScenario(base).identity;
  const idChanged = engine.runScenario(changed).identity;
  assert.notEqual(idBase.inputHash, idChanged.inputHash);
});

test('stableStringify: key insertion order does not affect the resulting hash', () => {
  const a = { z: 1, a: 2, nested: { y: 1, x: 2 } };
  const b = { a: 2, z: 1, nested: { x: 2, y: 1 } };
  assert.equal(engine.stableStringify(a), engine.stableStringify(b));
  assert.equal(engine.hashValue(a), engine.hashValue(b));
});

test('generateScenarioId: produces distinct, non-empty ids', () => {
  const ids = new Set();
  for (let i = 0; i < 50; i++) ids.add(engine.generateScenarioId());
  assert.equal(ids.size, 50, 'expected 50 distinct ids from 50 calls');
  for (const id of ids) assert.ok(id && id.length > 0);
});
