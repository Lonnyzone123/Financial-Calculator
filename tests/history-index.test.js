'use strict';

// Track B, L2 -- unit tests for historyIndex(), the wrap-safe index-into-
// HIST_RETURNS lookup backing every historical-mode/rolling-history
// calculation. Found uncovered by the same worker-function-list audit that
// turned up rothPhaseoutFactor/accountPlannedContribution/quantile.
// HIST_RETURNS/HIST_INFLATION/HIST_COLA are embedded directly in
// src/engine.js (not injected via a RULES-style global), so they are read
// straight off the required module here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');
const HIST_RETURNS = engine.HIST_RETURNS;
const N = HIST_RETURNS.length;
const FIRST_YEAR = HIST_RETURNS[0][0];
const LAST_YEAR = HIST_RETURNS[N - 1][0];

function planWithHistoryStart(historyStart) {
  return { assumptions: { historyStart } };
}

test('historyIndex: a historyStart matching the first embedded year resolves to index 0', () => {
  assert.equal(engine.historyIndex(planWithHistoryStart(FIRST_YEAR), 0), 0);
});

test('historyIndex: a historyStart before the first embedded year still resolves to index 0 (findIndex\'s ">=" matches the very first element)', () => {
  assert.equal(engine.historyIndex(planWithHistoryStart(FIRST_YEAR - 50), 0), 0);
});

test('historyIndex: a historyStart matching a middle year resolves to that year\'s exact position', () => {
  const midYear = FIRST_YEAR + 22;
  const expectedIndex = HIST_RETURNS.findIndex((x) => x[0] === midYear);
  assert.ok(expectedIndex > 0, 'test assumption: the chosen year exists and is not index 0');
  assert.equal(engine.historyIndex(planWithHistoryStart(midYear), 0), expectedIndex);
});

test('historyIndex: a historyStart after every embedded year (not found by findIndex, -1) clamps to index 0, not a negative index', () => {
  assert.equal(engine.historyIndex(planWithHistoryStart(LAST_YEAR + 50), 0), 0);
});

test('historyIndex: a negative offset from index 0 wraps around to the last index, not a negative one', () => {
  assert.equal(engine.historyIndex(planWithHistoryStart(FIRST_YEAR), -1), N - 1);
});

test('historyIndex: a positive offset past the last index wraps back around to 0', () => {
  const lastIndexPlan = planWithHistoryStart(LAST_YEAR);
  assert.equal(engine.historyIndex(lastIndexPlan, 0), N - 1, 'test setup: historyStart at the last year resolves to the last index');
  assert.equal(engine.historyIndex(lastIndexPlan, 1), 0, 'one past the last index must wrap to 0');
});

test('historyIndex: offsets larger than the full array length wrap correctly (multiple full cycles)', () => {
  assert.equal(engine.historyIndex(planWithHistoryStart(FIRST_YEAR), N), 0, 'exactly one full cycle forward returns to the same index');
  assert.equal(engine.historyIndex(planWithHistoryStart(FIRST_YEAR), N + 5), 5);
  assert.equal(engine.historyIndex(planWithHistoryStart(FIRST_YEAR), -N), 0, 'exactly one full cycle backward returns to the same index');
  assert.equal(engine.historyIndex(planWithHistoryStart(FIRST_YEAR), -(N + 5)), N - 5);
});
