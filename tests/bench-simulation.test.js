'use strict';

// Regression guard for tools/bench-simulation.js.
//
// The harness is a measurement tool, not a source of financial truth, so what
// is worth pinning is narrow and specific: that it REFUSES to produce heap
// figures without --expose-gc (a bytes-per-path number derived from unswept
// garbage is worse than none), that its JSON output carries the
// JavaScriptCore caveat rather than bare numbers someone could lift into an
// iOS tier table, and that the figures it emits are structurally sane.
//
// Deliberately tiny path counts: this runs inside `npm test`, and the real
// baseline is captured by running the tool directly (see
// tools/bench-baseline-20260910.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TOOL = path.join(__dirname, '..', 'tools', 'bench-simulation.js');

function runTool(args, useGc) {
  const argv = (useGc === false ? [] : ['--expose-gc']).concat([TOOL], args);
  return spawnSync(process.execPath, argv, { encoding: 'utf8' });
}

test('bench-simulation: refuses to run without --expose-gc rather than reporting garbage as retained heap', () => {
  const r = runTool(['--paths', '10', '--reps', '1'], false);
  assert.equal(r.status, 1, 'must exit non-zero');
  assert.match(r.stderr, /--expose-gc/);
  assert.match(r.stderr, /garbage/i);
  assert.doesNotMatch(String(r.stdout), /bytes\/path/, 'must not print figures it just refused to stand behind');
});

test('bench-simulation: rejects an unrecognized argument instead of silently ignoring it', () => {
  const r = runTool(['--paths', '10', '--reps', '1', '--tier-threshold', '150']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unrecognized argument/);
});

test('bench-simulation: rejects a non-existent scenario and names the ones it has', () => {
  const r = runTool(['--paths', '10', '--reps', '1', '--scenario', 'not-a-scenario']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown scenario/);
  assert.match(r.stderr, /baseline/);
});

test('bench-simulation: prints the JavaScriptCore caveat in its own output, not just in the docs', () => {
  const r = runTool(['--paths', '20', '--reps', '1']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /JavaScriptCore on an iPhone 15 Pro/);
  assert.match(r.stdout, /DOES NOT TRANSFER TO iOS/);
  // It reports; it does not judge.
  assert.match(r.stdout, /No threshold is asserted here/);
});

test('bench-simulation: emits structurally sane figures, and carries the caveat into its JSON too', () => {
  const out = path.join(os.tmpdir(), 'bench-selftest-' + process.pid + '.json');
  try {
    const r = runTool(['--paths', '20,40', '--reps', '1', '--json', out]);
    assert.equal(r.status, 0, r.stderr);
    const payload = JSON.parse(fs.readFileSync(out, 'utf8'));

    // A number lifted out of this file without its caveat is the failure mode
    // the caveat exists to prevent, so the JSON carries it as well.
    assert.match(payload.caveat, /DOES NOT TRANSFER TO iOS/);
    assert.equal(payload.results.length, 2);

    const [small, large] = payload.results;
    assert.equal(small.pathCount, 20);
    assert.equal(large.pathCount, 40);
    for (const r2 of payload.results) {
      assert.ok(r2.rowsPerPath > 0, 'a path with no rows measures nothing');
      assert.ok(r2.simMs > 0 && Number.isFinite(r2.simMs));
      assert.ok(r2.aggregateMs >= 0 && Number.isFinite(r2.aggregateMs));
      assert.ok(r2.bytesPerPath > 0 && Number.isFinite(r2.bytesPerPath));
      assert.ok(r2.microsecondsPerPath > 0 && Number.isFinite(r2.microsecondsPerPath));
    }
    // Retained heap must grow with path count -- if it did not, the harness
    // would be measuring something other than the run array it holds.
    assert.ok(large.retainedBytes > small.retainedBytes,
      'retained heap did not grow with path count: ' + small.retainedBytes + ' -> ' + large.retainedBytes);
    // The deoptimization column is normalized against the smallest count, so
    // the smallest is 1.0 by construction.
    assert.equal(small.perPathCostVsSmallest, 1);
  } finally {
    if (fs.existsSync(out)) fs.unlinkSync(out);
  }
});
