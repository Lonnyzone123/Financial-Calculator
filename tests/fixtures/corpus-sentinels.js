'use strict';

/*
 * Hand-authored sentinel results for the corpus invariant -- S4 task 3.7.
 *
 * NOT ENGINE OUTPUT, and deliberately not realistic plans. Each is a small
 * result-shaped value whose every expectation is written here by hand, so the
 * invariant's verdict on a capture of it never depends on the capture tool,
 * the engine or the generator. Between them they carry each distinction the
 * mutation matrix needs to see survive capture, persistence and reading back:
 *
 *   - a nested $50,000 at an exact scenario/path
 *   - NaN, Infinity, -Infinity, -0, and an own property whose value is undefined
 *   - a zero, a false, an empty list and a null that must stay PRESENT --
 *     a valid value and a missing field are different answers
 *   - an ordered time series, which must never compare equal once reordered
 *
 * The real corpus carries none of the special values (measured at 5803067:
 * zero tags in a full capture), so without these the encoding paths that
 * matter most would never be exercised by the invariant at all.
 *
 * sentinelResults() returns FRESH objects on every call, so a test that
 * mutates one cannot leak into another.
 */

function sentinelResults() {
  return {
    'sentinel:nested-amount': {
      status: 'ok',
      mode: 'simple',
      rows: [
        { age: 60, total: 100000, otherAssets: [{ id: 'home', value: 0 }] },
        { age: 61, total: 150000, otherAssets: [{ id: 'home', value: 50000 }] },
      ],
    },
    'sentinel:special-numbers': {
      status: 'ok',
      mode: 'simple',
      successRate: NaN,
      upside: Infinity,
      downside: -Infinity,
      signFlip: -0,
      notSet: undefined,
      rows: [{ age: 60, total: 1 }],
    },
    'sentinel:falsy-but-present': {
      status: 'ok',
      mode: 'simple',
      shortfall: 0,
      failed: false,
      issues: [],
      firstShortfallAge: null,
      rows: [{ age: 60, total: 1 }],
    },
    'sentinel:time-series': {
      status: 'ok',
      mode: 'historical',
      rows: [
        { age: 60, total: 1000 },
        { age: 61, total: 2000 },
        { age: 62, total: 3000 },
        { age: 63, total: 4000 },
        { age: 64, total: 5000 },
      ],
    },
  };
}

/* The reviewed "corpus" for a sentinel capture: exactly these four names. */
const SENTINEL_SPEC = {
  formatVersion: 1,
  scenarios: Object.keys(sentinelResults()).map((name) => ({
    name,
    source: 'sentinel',
    inputsNote: 'a hand-authored result, not a plan',
  })),
};

/* Written by hand. Nothing here is read from a capture. */
const SENTINEL_EXPECTATIONS = {
  scenarios: [
    {
      name: 'sentinel:nested-amount',
      expect: [
        { path: 'rows[1].otherAssets[0].value', equals: 50000 },
        { path: 'rows[0].otherAssets[0].value', equals: 0 },
      ],
    },
    {
      name: 'sentinel:special-numbers',
      expect: [
        { path: 'successRate', equals: NaN },
        { path: 'upside', equals: Infinity },
        { path: 'downside', equals: -Infinity },
        { path: 'signFlip', equals: -0 },
        { path: 'notSet', equals: undefined },
      ],
    },
    {
      name: 'sentinel:falsy-but-present',
      expect: [
        { path: 'shortfall', equals: 0 },
        { path: 'failed', equals: false },
        { path: 'issues', equals: [] },
        { path: 'firstShortfallAge', equals: null },
      ],
    },
    {
      name: 'sentinel:time-series',
      expect: [
        { path: 'rows', equals: [
          { age: 60, total: 1000 },
          { age: 61, total: 2000 },
          { age: 62, total: 3000 },
          { age: 63, total: 4000 },
          { age: 64, total: 5000 },
        ] },
      ],
    },
  ],
};

module.exports = { sentinelResults, SENTINEL_SPEC, SENTINEL_EXPECTATIONS };
