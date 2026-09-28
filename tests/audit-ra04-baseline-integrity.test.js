'use strict';

// RA-04 (re-audit, 2026-09-11) -- P2, and the most uncomfortable finding of
// the round: the instrument the other three repairs are measured with cannot
// make the distinctions it claims to make.
//
// TWO DEFECTS, ONE ROOT ATTITUDE.
//
// (1) NON-FINITE COLLAPSE. canonical() correctly tags NaN/Infinity/-Infinity
//     as {__nonFinite: "..."} so they cannot be confused with null. But
//     stripExcluded() clones with JSON.parse(JSON.stringify(result)) FIRST,
//     and that round-trip has already turned every one of them into null by
//     the time canonical() runs. The tagging executes on values that can no
//     longer be non-finite. All four inputs produce one hash.
//
//     The existing test (tests/capture-baseline.test.js, "non-finite values
//     are distinguishable") asserted hashOf({v: NaN}) !== hashOf({v: null}) --
//     calling the hashing helper DIRECTLY, bypassing the capture path that
//     contains the defect. It passed for the whole repair round while the
//     property it named was false end to end.
//
// (2) STALE-HASH TRUST. diffSnapshots() skips content comparison when two
//     entries' STORED hashes match, and the CLI returns IDENTICAL straight
//     off matching stored corpus hashes. A stored hash is therefore treated
//     as proof of its own contents. Edit a saved capture's row from 100 to
//     100.01, leave the hash fields alone, and the harness reports IDENTICAL.
//     The existing one-cent test recomputes and rewrites the hashes itself
//     (tests/capture-baseline.test.js:71-72), so it never exercises this.
//
// WHY IT MATTERS BEYOND THIS FILE. This harness is what the fixture protocol
// leans on to answer "did this repair move ONLY the numbers it was supposed
// to move?". A tool that cannot distinguish a NaN from a null, and that
// believes a snapshot's own account of itself, cannot answer that question.
// RA-04 is repaired FIRST for that reason.
//
// These tests exercise the real capture path -- captureEntry(), the same
// function capture() itself calls -- and go through an actual JSON
// serialize/parse, because the defect lives in the serialization boundary
// and not in the hashing helper.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  capture, captureEntry, diffSnapshots, differences, verifyIntegrity, hashOf, canonical, stripExcluded,
} = require('../tools/capture-baseline.js');

/** A capture as it actually reaches disk and comes back: entry built by the
 *  tool's own path, then serialized and parsed exactly as the CLI does. */
function roundTrip(result) {
  const entry = captureEntry('probe', result);
  return JSON.parse(JSON.stringify({ entries: [entry] })).entries[0];
}

const nonFiniteCases = [
  ['null', null],
  ['NaN', NaN],
  ['Infinity', Infinity],
  ['-Infinity', -Infinity],
];

// ---------------------------------------------------------------------------
// 1. Non-finite values must survive the capture path, not just canonical()
// ---------------------------------------------------------------------------

test('RA-04: null, NaN, Infinity and -Infinity are distinguishable end to end', () => {
  const seen = new Map();
  nonFiniteCases.forEach(([label, value]) => {
    const entry = roundTrip({ rows: [{ total: value }] });
    assert.ok(entry.hash, label + ': entry has a hash after serialization');
    if (seen.has(entry.hash)) {
      assert.fail(
        'capture collapsed two distinct values to one hash: ' +
        seen.get(entry.hash) + ' and ' + label + ' both hash to ' + entry.hash +
        '. A NaN in engine output must never be indistinguishable from a null.'
      );
    }
    seen.set(entry.hash, label);
  });
  assert.equal(seen.size, 4, 'four distinct inputs must produce four distinct hashes');
});

test('RA-04: a non-finite value is still identifiable after being read back', () => {
  nonFiniteCases.slice(1).forEach(([label, value]) => {
    const entry = roundTrip({ rows: [{ total: value }] });
    assert.deepEqual(
      entry.result.rows[0].total, { __nonFinite: label },
      label + ' must read back as a tagged non-finite, not as null'
    );
  });
  const nullEntry = roundTrip({ rows: [{ total: null }] });
  assert.equal(nullEntry.result.rows[0].total, null, 'a genuine null stays a null');
});

test('RA-04: canonical() was never the broken part -- stripExcluded() was', () => {
  // Pins the diagnosis so a future change cannot "fix" this by weakening
  // canonical(), and documents why the old direct-hashOf test passed.
  assert.deepEqual(canonical({ v: NaN }), { v: { __nonFinite: 'NaN' } });
  assert.notEqual(hashOf({ v: NaN }), hashOf({ v: null }));
  assert.ok(
    Number.isNaN(stripExcluded({ rows: [{ total: NaN }] }).rows[0].total),
    'stripExcluded must hand canonical() a value that is still NaN'
  );
});

test('RA-04: full finite precision survives capture', () => {
  const value = 1234567.891234567;
  const entry = roundTrip({ rows: [{ total: value }] });
  assert.equal(entry.result.rows[0].total, value, 'no rounding may be introduced by capture');
});

// ---------------------------------------------------------------------------
// 1b. Negative zero -- the RA-04 family, found while converting the S3
//     prewrites from characterization to first-failing.
//
// canonical() tagged non-finite numbers but left -0 alone, and
// JSON.stringify(-0) is "0", so 0 and -0 captured to the same hash. Worse,
// differences() already contained `if (!Object.is(a, b))` -- put there to
// catch exactly this -- and an earlier `if (a === b) return out;` made it
// UNREACHABLE, because 0 === -0 is true. A check that cannot run is worse
// than no check: it reads as coverage.
//
// (NaN was never affected: NaN === NaN is false, so it always fell through
// to the Object.is line.)
// ---------------------------------------------------------------------------

test('RA-04: 0 and -0 are distinguishable through the capture path', () => {
  const zero = roundTrip({ rows: [{ total: 0 }] });
  const negZero = roundTrip({ rows: [{ total: -0 }] });
  assert.notEqual(zero.hash, negZero.hash,
    'a row that flipped sign must not capture to the same hash as one that did not');
  assert.equal(zero.result.rows[0].total, 0, 'a genuine 0 stays a plain 0');
  assert.deepEqual(negZero.result.rows[0].total, { __negativeZero: true },
    '-0 must survive JSON serialization as a tagged value, the way non-finite numbers do');
});

test('RA-04: differences() reaches its own Object.is check', () => {
  assert.deepEqual(
    differences({ total: 0 }, { total: -0 }, ''),
    [{ path: 'total', before: 0, after: -0 }],
    'the `a === b` fast path must not preempt the Object.is comparison below it'
  );
});

test('RA-04: the Object.is fast path still short-circuits everything it should', () => {
  // Changing the guard from === to Object.is must not make the walker report
  // spurious differences, and must keep NaN comparing equal to itself.
  assert.deepEqual(differences({ a: 1, b: 'x', c: null }, { a: 1, b: 'x', c: null }, ''), []);
  assert.deepEqual(differences({ v: NaN }, { v: NaN }, ''), [],
    'NaN equals itself for capture purposes and must not be reported as a change');
  assert.deepEqual(differences({ v: 0 }, { v: 0 }, ''), []);
});

// ---------------------------------------------------------------------------
// 1c. A capture must be byte-reproducible at the same source state
//
// meta.capturedAt was a wall-clock stamp, so two captures of identical source
// differed as FILES while `verify` reported DETERMINISTIC -- that command
// compares corpus hashes, which exclude meta entirely. The property the
// harness advertises could therefore be false without the harness noticing.
// ---------------------------------------------------------------------------

test('RA-04: two captures at the same source state are byte-identical', () => {
  const first = capture();
  const second = capture();
  assert.equal(JSON.stringify(first), JSON.stringify(second),
    'a capture must contain nothing that varies run to run -- not even in meta, which the ' +
    'corpus hash does not cover and therefore cannot police');
});

test('RA-04: provenance is kept, but as something deterministic', () => {
  const snap = capture();
  assert.equal(snap.meta.capturedAt, undefined, 'no wall-clock stamp');
  assert.ok(snap.meta.sourceHashes && typeof snap.meta.sourceHashes === 'object',
    'a capture should still say what produced it');
  ['src/engine.js', 'src/app-shell.html', 'src/scenario-validator.js'].forEach((f) => {
    assert.match(String(snap.meta.sourceHashes[f]), /^[0-9a-f]{64}$/,
      f + ' should be identified by content hash -- which answers "which engine produced this?", ' +
      'the question a timestamp only gestures at');
  });
});

// ---------------------------------------------------------------------------
// 2. A snapshot's stored hashes are not proof of its own contents
// ---------------------------------------------------------------------------

/** A minimal well-formed snapshot built through the tool's own path. */
function snapshotOf(rows) {
  const entries = [captureEntry('scenario:probe', { rows })];
  const snap = { meta: { entryCount: entries.length }, entries };
  snap.meta.hash = hashOf(entries.map((e) => [e.name, e.hash]));
  return JSON.parse(JSON.stringify(snap));
}

test('RA-04: a one-cent edit with untouched hash fields is still found', () => {
  const before = snapshotOf([{ total: 100 }]);
  const after = snapshotOf([{ total: 100 }]);
  // Edit the stored content the way a corrupted or hand-tampered file would
  // be edited -- WITHOUT recomputing any hash. The previous one-cent test
  // recomputed them itself, which is why this hole survived.
  after.entries[0].result.rows[0].total = 100.01;

  const report = diffSnapshots(before, after);
  assert.notDeepEqual(report, [], 'a changed value must never diff as identical');
  const diffs = report[0].diffs.map((d) => d.path + ':' + d.before + '->' + d.after);
  assert.deepEqual(diffs, ['rows.0.total:100->100.01']);
});

test('RA-04: integrity check names an entry whose stored hash disagrees with its contents', () => {
  const snap = snapshotOf([{ total: 100 }]);
  assert.deepEqual(verifyIntegrity(snap), [], 'an untampered snapshot verifies clean');

  snap.entries[0].result.rows[0].total = 100.01;
  const problems = verifyIntegrity(snap);
  assert.equal(problems.length, 1, 'the tampered entry must be reported');
  assert.equal(problems[0].name, 'scenario:probe');
  assert.match(problems[0].reason, /hash/i);
});

test('RA-04: a corpus-level hash that no longer matches its entries is reported', () => {
  const snap = snapshotOf([{ total: 100 }]);
  snap.entries[0].hash = hashOf({ rows: [{ total: 100.01 }] });
  const problems = verifyIntegrity(snap);
  assert.ok(
    problems.some((p) => /corpus/i.test(p.name) || /corpus/i.test(p.reason)),
    'rewriting an entry hash without the corpus hash must also be caught'
  );
});
