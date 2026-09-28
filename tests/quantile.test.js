'use strict';

// Track B, L2/L5 -- unit tests for quantile(), the linear-interpolation
// percentile function backing every percentile figure the app ever shows
// (Monte Carlo success bands, median/p10/p90 rows in every annual
// projection). Found via the same worker-function-list coverage audit that
// turned up rothPhaseoutFactor and accountPlannedContribution: the
// roadmap's own D-1 section (PLATFORM_DEVELOPMENT_ROADMAP.md §11c) records
// that "56 direct quantile() probes covering unsorted input, duplicates,
// negatives, and empty arrays" were run to verify the D-1 optimization --
// but that verification was never committed as a persisted test file, so
// this function has had zero regression protection since. This file
// re-establishes that coverage as a permanent, committed test.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

test('quantile: q=0 returns the minimum, q=1 returns the maximum, of an unsorted array', () => {
  const a = [5, 1, 9, 3, 7];
  assert.equal(engine.quantile(a, 0), 1);
  assert.equal(engine.quantile(a, 1), 9);
});

test('quantile: the median of an odd-length array is the middle element after sorting', () => {
  assert.equal(engine.quantile([5, 1, 3], 0.5), 3);
});

test('quantile: the median of an even-length array linearly interpolates between the two middle elements', () => {
  // sorted: [1,2,3,4] -> p = (4-1)*0.5 = 1.5 -> a[1] + (a[2]-a[1])*0.5 = 2 + 1*0.5 = 2.5
  assert.equal(engine.quantile([4, 1, 3, 2], 0.5), 2.5);
});

test('quantile: duplicate values are treated as ordinary sorted entries, not collapsed', () => {
  assert.equal(engine.quantile([5, 5, 5, 5], 0.5), 5);
  assert.equal(engine.quantile([1, 1, 9, 9], 0.5), 5); // (1+9)/2 at the midpoint
});

test('quantile: negative values sort and interpolate correctly', () => {
  assert.equal(engine.quantile([-10, -5, 0, 5, 10], 0.5), 0);
  assert.equal(engine.quantile([-10, -5, 0, 5, 10], 0), -10);
});

test('quantile: a single-element array returns that element for any q', () => {
  assert.equal(engine.quantile([42], 0), 42);
  assert.equal(engine.quantile([42], 0.5), 42);
  assert.equal(engine.quantile([42], 1), 42);
});

test('quantile: an empty array returns NaN rather than throwing (no valid index exists)', () => {
  const result = engine.quantile([], 0.5);
  assert.ok(Number.isNaN(result));
});

test('quantile: the default (no third argument) sorts unsorted input before interpolating', () => {
  const unsorted = [9, 1, 5, 3, 7];
  assert.equal(engine.quantile(unsorted, 0.5), 5);
  assert.deepEqual(unsorted, [9, 1, 5, 3, 7], 'the input array itself must not be mutated (quantile sorts a copy via slice())');
});

test('quantile: sorted=true trusts the caller and skips re-sorting -- passing already-descending data produces a wrong-but-explainable result, documenting the contract rather than defending against it', () => {
  const descending = [9, 7, 5, 3, 1]; // NOT ascending
  // With sorted=true, quantile treats this as already sorted ascending and
  // reads positions accordingly: median position lands on the middle
  // element (value 5) by coincidence for this symmetric array, but q=0
  // returns the FIRST element (9), not the true minimum (1) -- proving the
  // flag is trusted, not verified.
  assert.equal(engine.quantile(descending, 0, true), 9, 'with sorted=true, q=0 reads array[0] literally, not the true minimum');
  assert.equal(engine.quantile(descending, 1, true), 1, 'and q=1 reads the last element literally, not the true maximum');
});

test('quantile: sorted=true on genuinely pre-sorted ascending data matches the auto-sorting default exactly', () => {
  const data = [3, 7, 1, 9, 5];
  const preSorted = data.slice().sort((x, y) => x - y);
  for (const q of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    assert.equal(engine.quantile(preSorted, q, true), engine.quantile(data, q), `q=${q} must agree whether or not the input arrived pre-sorted`);
  }
});

test('quantile: quartiles land on hand-computed values for a clean 5-element array', () => {
  const a = [10, 20, 30, 40, 50]; // already sorted, positions 0-4
  assert.equal(engine.quantile(a, 0.25), 20); // p=(4)*0.25=1 -> a[1]
  assert.equal(engine.quantile(a, 0.75), 40); // p=3 -> a[3]
});
