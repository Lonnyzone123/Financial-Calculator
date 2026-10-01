/* S5AA R43 (the owner 2026-09-30: repair all 34 of Claude's R42F findings) -- MONTE CARLO SEEDS, THE RESULT CONTRACT, HISTORY.
 *
 * SA42F-31, MEASURED at c67c713: path i was seeded rng(seed + 2i) (market) and rng(seed + 2i + 1) (care), so seed s + 2 replayed
 * seed s's paths 1..N-1 and added one: two "different" seeds shared all paths but one (seed 44's paths 0-998 were seed 42's 1-999).
 * Each path's two seeds are now a 32-bit mix of (seed, path, stream), so neighbouring seeds share no path.
 * SA42F-33: an unknown-method refusal carried the rejected text as `mode`, which the repository's own contract checker reports, and
 * RESULT_CONTRACT 7b said S5AA added no calculation error code although seven had been added, three named in no document.
 * SA42F-34: a historical start before the data (1900, 1927) or between data years (1966.5) was silently replaced (1900 replayed
 * 1928); only a start after the data was refused. MODEL_ASSUMPTIONS 26: "A historical start must be a data year".
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
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const { checkResult } = require(path.join(ROOT, 'tools', 'result-contract.js'));
const L = require(path.join(ROOT, 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

// The scheme, written out independently: murmur3's 32-bit finalizer of the seed, plus the golden-ratio step times (2 x path +
// stream + 1), finalized again.
const fmix32 = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
const pathSeed = (seed, i, stream) => fmix32((fmix32(seed >>> 0) + Math.imul(2 * i + stream + 1, 0x9e3779b9)) >>> 0);

function mc(seed, runs) {
  const p = L.basePlan({ age: 60, endAge: 90, spending: 60000, returnRate: 6, inflation: 2.5,
    accounts: [L.account('brok', 'taxable', 600000, { basisPct: 70 }), L.account('ira', 'traditionalIRA', 500000)] });
  Object.assign(p.assumptions, { method: 'monteCarlo', runs, seed, volatility: 15 });
  p.advanced.assetsOn = false;
  Object.assign(p.advanced, { ltcOn: true, ltcCost: 80000, ltcProbability: 40, ltcYears: 2, ltcInsurance: 0, healthInflation: 4 });
  return p;
}
const funded = (seed, runs) => Math.round(engine.runPlan(mc(seed, runs)).successRate * runs / 100);

// Public route only (runPlan). The direct one-path checks, which call simulatePlan and rng, are in tests/rng-seeding.test.js.
test('R43 (SA42F-31): seed 44 no longer replays seed 42 shifted by one path, through runPlan', () => {
  // Under seed + 2i, seed 44's paths 0..N-2 were seed 42's paths 1..N-1, so funded(42, N) - funded(42, 1) == funded(44, N - 1)
  // for every N. Measured at c67c713 with N = 200: 124 - 0 == 124. After the repair: 126 - 1 != 120.
  const N = 200;
  assert.notEqual(funded(42, N) - funded(42, 1), funded(44, N - 1));
});

test('R43 (SA42F-31): no path seed is shared across neighbouring seeds or streams (the scheme, written out)', () => {
  const seeds = new Set();
  for (const s of [42, 43, 44]) for (let i = 0; i < 50; i++) for (const k of [0, 1]) seeds.add(pathSeed(s, i, k));
  assert.equal(seeds.size, 3 * 50 * 2);
});

test('R43 (SA42F-33): an unknown method is refused with mode null, and the result passes the contract checker', () => {
  for (const m of ['montecarlo', 'Monte Carlo']) {
    const p = JSON.parse(JSON.stringify(defaultPlan)); p.setupComplete = true; p.assumptions.method = m;
    const r = engine.runPlan(p);
    assert.equal(r.calculationErrorCode, 'SCENARIO_UNKNOWN_METHOD', m);
    assert.equal(r.mode, null, m);
    assert.deepEqual(checkResult(r, { plan: p }).violations, [], m);
  }
});

test('R43 (SA42F-33): RESULT_CONTRACT names every calculation error code S5AA added', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'RESULT_CONTRACT.md'), 'utf8');
  for (const code of ['SCENARIO_UNKNOWN_METHOD', 'SCENARIO_INVALID_RUN_COUNT', 'SCENARIO_MISSING_SCENARIO_SECTION', 'SCENARIO_NOBODY_ALIVE_AT_START',
    'SCENARIO_UNRECOGNIZED_INCOME_OWNER', 'SCENARIO_MISSING_INCOME_OWNER', 'SCENARIO_END_AGE_BEFORE_START', 'SCENARIO_NONNUMBER_PLAN_VALUE',
    'SCENARIO_PLAN_VALUE_OUT_OF_RANGE', 'SCENARIO_UNKNOWN_PLAN_VALUE', 'SCENARIO_HISTORY_START_AFTER_DATA', 'SCENARIO_HISTORY_START_NOT_A_DATA_YEAR',
    'MONTE_CARLO_INVARIANT_FAILURE']) assert.ok(doc.includes(code), code);
  assert.ok(!/no calculation error code was added/.test(doc), 'the stale sentence is gone');
});

function hist(year) {
  const p = L.basePlan({ age: 60, endAge: 63, spending: 0, accounts: [L.account('cash', 'taxable', 100000, { basisPct: 100 })] });
  p.assumptions.method = 'historical'; p.assumptions.historyStart = year; p.advanced.assetsOn = false;
  return p;
}
test('R43 (SA42F-34): a historical start before the data or between data years is refused by both layers', () => {
  for (const y of [1900, 1927, 1966.5]) {
    const p = hist(y);
    const errs = validateScenario(JSON.parse(JSON.stringify(p))).issues.filter((i) => i.severity === 'ERROR').map((i) => i.code + '@' + i.path);
    assert.ok(errs.includes('OUT_OF_RANGE@assumptions.historyStart'), y + ': ' + errs.join(', '));
    assert.equal(engine.runPlan(p).calculationErrorCode, 'SCENARIO_HISTORY_START_NOT_A_DATA_YEAR', String(y));
  }
});
test('R43 (SA42F-34) controls: a data year runs, and a start after the data keeps its own refusal', () => {
  for (const y of [1928, 1967, 2025]) assert.equal(engine.runPlan(hist(y)).status, 'ok', String(y));
  assert.equal(engine.runPlan(hist(2026)).calculationErrorCode, 'SCENARIO_HISTORY_START_AFTER_DATA');
});
