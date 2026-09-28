'use strict';

// Tests for tools/verify-test-gate.js (R4-F2).
//
// A gate that has only ever been seen to PASS is not a gate. Each fixture test
// below builds a throwaway root in the OS temp directory, copies the tool and
// its reporter into it (the tool derives its root from __dirname/.., so a copy
// in <fixture>/tools operates on <fixture>), writes an exception registry, and
// asserts the gate refuses what it must refuse.
//
// Nothing here touches this repository, and the gate is never run in full mode
// against the real tests/ directory from inside the test suite -- that would
// recurse.
//
// S4 task 2b.2g added the named-todo witnesses: the gate now compares the todo
// set BY NAME with a committed registry, and fails closed on a report it cannot
// fully read. The modes a fixture cannot provoke -- a runner that exits
// non-zero behind a clean summary, a counter missing from the output -- are
// witnessed through evaluateRun(), the pure function the CLI itself calls.

const test = require('node:test');
const { describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const TOOL = path.join(__dirname, '..', 'tools', 'verify-test-gate.js');
const REPORTER = path.join(__dirname, '..', 'tools', 'gate-reporter.mjs');
const { evaluateRun } = require(TOOL);

let fixtureCount = 0;

/** A registry entry that satisfies every required field. */
function entry(file, name, extra) {
  return Object.assign({
    file: 'tests/' + file, name: name, kind: 'carried-residual', findingId: 'FX-01',
    owner: 'fixture owner', lifecycle: 'leaves todo when repaired', releaseCondition: 'the repair lands',
  }, extra || {});
}

/**
 * Builds a fixture root containing a package.json, a tests/ directory, a copy
 * of the gate and its reporter, and an exception registry. `opts.jsdom` writes
 * a stub jsdom package (the gate reads its version; it never requires jsdom
 * itself). `opts.registry` is the entries array (default empty); null writes no
 * registry at all.
 */
function makeFixture(opts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-fixture-' + process.pid + '-' + (fixtureCount++) + '-'));
  fs.mkdirSync(path.join(root, 'tools'));
  fs.mkdirSync(path.join(root, 'tests'));
  fs.copyFileSync(TOOL, path.join(root, 'tools', 'verify-test-gate.js'));
  if (opts.reporter !== false) fs.copyFileSync(REPORTER, path.join(root, 'tools', 'gate-reporter.mjs'));
  const scripts = opts.scripts || { test: 'node --test ' + (opts.declared || []).join(' ') };
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'gate-fixture', scripts: scripts }, null, 2));
  if (opts.registry !== null) {
    fs.writeFileSync(path.join(root, 'tools', 'test-exception-registry.json'),
      JSON.stringify({ formatVersion: 1, entries: opts.registry || [] }, null, 2));
  }
  for (const [name, body] of Object.entries(opts.files || {})) {
    fs.writeFileSync(path.join(root, 'tests', name), body);
  }
  if (opts.jsdom) {
    fs.mkdirSync(path.join(root, 'node_modules', 'jsdom'), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules', 'jsdom', 'package.json'), '{"name":"jsdom","version":"0.0.0-stub"}');
  }
  return root;
}

function runGate(root, extraArgs) {
  return spawnSync(process.execPath, [path.join(root, 'tools', 'verify-test-gate.js')].concat(extraArgs || []), {
    encoding: 'utf8', cwd: root, maxBuffer: 16 * 1024 * 1024,
  });
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

/** The environment for a BARE runner spawned from inside this test file:
 *  without NODE_TEST_CONTEXT, which would switch it to Node's internal
 *  reporter protocol and leave stdout empty -- the trap the gate's own header
 *  documents. Two premise checks below read that stdout, and both came back ''
 *  until this existed. */
function bareEnv() {
  const env = Object.assign({}, process.env);
  delete env.NODE_TEST_CONTEXT;
  return env;
}

/** The raw output of a REAL run of `files` under `root`, captured with the
 *  arguments main() passes: TAP to stdout and tools/gate-reporter.mjs to a
 *  file. S4-IR-01's witnesses corrupt this rather than a hand-written stream,
 *  whose final summary had been a shape the runner never emits. */
function captureRun(root, files) {
  const eventsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-capture-'));
  const eventsPath = path.join(eventsDir, 'events.jsonl');
  try {
    const r = spawnSync(process.execPath, [
      '--test', '--test-reporter=tap', '--test-reporter-destination=stdout',
      '--test-reporter=' + pathToFileURL(REPORTER).href, '--test-reporter-destination=' + eventsPath,
    ].concat(files), { cwd: root, encoding: 'utf8', env: bareEnv(), maxBuffer: 16 * 1024 * 1024 });
    return {
      status: r.status, signal: r.signal, spawnError: r.error ? r.error.message : null, root: root,
      tapOutput: (r.stdout || '') + (r.stderr || ''),
      eventsText: fs.existsSync(eventsPath) ? fs.readFileSync(eventsPath, 'utf8') : '',
    };
  } finally {
    fs.rmSync(eventsDir, { recursive: true, force: true });
  }
}

const PASSING_TEST = 'require("node:test")("passes", () => {});\n';
const SKIPPING_TEST =
  'const test = require("node:test");\n' +
  'test("runs", () => {});\n' +
  'test("would need jsdom", { skip: "jsdom not installed" }, () => {});\n';

// ---------------------------------------------------------------------------

test('verify-test-gate: passes a fixture where everything is in order', () => {
  const root = makeFixture({ jsdom: true, declared: ['tests/a.test.js'], files: { 'a.test.js': PASSING_TEST } });
  try {
    const r = runGate(root);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /GATE PASSED/);
  } finally { cleanup(root); }
});

test('verify-test-gate: FAILS when a test is skipped -- the case plain `node --test` exits 0 on', () => {
  const root = makeFixture({ jsdom: true, declared: ['tests/a.test.js'], files: { 'a.test.js': SKIPPING_TEST } });
  try {
    // First establish the premise: the bare runner is perfectly happy.
    const bare = spawnSync(process.execPath, ['--test', 'tests/a.test.js'], { cwd: root, encoding: 'utf8' });
    assert.equal(bare.status, 0, 'premise failed: node --test should exit 0 despite the skip');

    // The gate must not be.
    const r = runGate(root);
    assert.equal(r.status, 1, 'gate accepted a skipped test as qualification');
    assert.match(r.stdout, /FAIL  no test was SKIPPED/);
    assert.match(r.stdout, /1 skipped test\(s\)/);
    assert.match(r.stdout, /SKIPPED: tests\/a\.test\.js :: would need jsdom/, 'the skip must be NAMED, not only counted');
    assert.match(r.stdout, /GATE FAILED/);
  } finally { cleanup(root); }
});

test('verify-test-gate: FAILS when jsdom is absent, and does not run the suite at all', () => {
  const root = makeFixture({ jsdom: false, declared: ['tests/a.test.js'], files: { 'a.test.js': PASSING_TEST } });
  try {
    const r = runGate(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /jsdom is NOT installed/);
    assert.match(r.stdout, /suite not run/);
  } finally { cleanup(root); }
});

test('verify-test-gate: FAILS when a test file on disk is not registered in package.json', () => {
  const root = makeFixture({
    jsdom: true,
    declared: ['tests/a.test.js'],
    files: { 'a.test.js': PASSING_TEST, 'orphan.test.js': PASSING_TEST },
  });
  try {
    const r = runGate(root, ['--no-run']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /UNREGISTERED/);
    assert.match(r.stdout, /tests\/orphan\.test\.js/);
  } finally { cleanup(root); }
});

test('verify-test-gate: FAILS when package.json names a test file that does not exist', () => {
  const root = makeFixture({
    jsdom: true,
    declared: ['tests/a.test.js', 'tests/deleted.test.js'],
    files: { 'a.test.js': PASSING_TEST },
  });
  try {
    const r = runGate(root, ['--no-run']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /RESOLVES TO NOTHING|NAMED BUT MISSING/);
  } finally { cleanup(root); }
});

test('verify-test-gate: FAILS when a test genuinely fails, and reports the count', () => {
  const root = makeFixture({
    jsdom: true,
    declared: ['tests/a.test.js'],
    files: { 'a.test.js': 'require("node:test")("fails", () => { throw new Error("boom"); });\n' },
  });
  try {
    const r = runGate(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /1 failing test\(s\)/);
  } finally { cleanup(root); }
});

test('verify-test-gate: expands a glob in the test script rather than treating it as a literal path', () => {
  const root = makeFixture({
    jsdom: true,
    declared: ['tests/*.test.js'],
    files: { 'a.test.js': PASSING_TEST, 'b.test.js': PASSING_TEST },
  });
  try {
    const r = runGate(root, ['--no-run']);
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /declared in npm test: 2 files/);
  } finally { cleanup(root); }
});

test('verify-test-gate: runs a declared file that does not follow the *.test.js convention, and says so', () => {
  // tests/regression-suite.js in the real repository is exactly this shape: 13
  // tests that `npm test` runs and that filesystem discovery cannot see. A gate
  // that filtered the declared list by the same convention it discovers with
  // would have the same blind spot in both checks, agree with itself, and
  // qualify a smaller suite than npm test does.
  const root = makeFixture({
    jsdom: true,
    declared: ['tests/a.test.js', 'tests/legacy-suite.js'],
    files: { 'a.test.js': PASSING_TEST, 'legacy-suite.js': PASSING_TEST },
  });
  try {
    const r = runGate(root);
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /discovered on disk\s*: 1 files matching/);
    assert.match(r.stdout, /will run\s*: 2 files \(the union\)/);
    assert.match(r.stdout, /tests 2, pass 2/, 'the non-conventional file must actually have been run');
    assert.match(r.stdout, /do not match \*\.test\.js/);
    assert.match(r.stdout, /legacy-suite\.js/);
    // Reported, not failed on -- the file does run.
    assert.doesNotMatch(r.stdout, /NAMED BUT MISSING/);
  } finally { cleanup(root); }
});

test('verify-test-gate: reports an AUTHORIZED todo by name without failing on it', () => {
  // Ground rule 11 turns a recorded finding into a todo-marked test. A gate
  // that failed on todo would make recording a finding indistinguishable from
  // breaking the build -- so an authorized todo passes, and is named.
  const root = makeFixture({
    jsdom: true,
    declared: ['tests/a.test.js'],
    registry: [entry('a.test.js', 'known finding')],
    files: { 'a.test.js': 'const t = require("node:test");\nt("ok", () => {});\nt("known finding", { todo: "recorded, not repaired" }, () => { throw new Error("still broken"); });\n' },
  });
  try {
    const r = runGate(root);
    assert.equal(r.status, 0, 'an authorized todo must not fail the gate: ' + r.stdout);
    assert.match(r.stdout, /marked todo, each named in the registry -- reported, not failed on/);
    assert.match(r.stdout, /known finding/, 'the note must name the todo, not only count it');
  } finally { cleanup(root); }
});

test('verify-test-gate: rejects an unrecognized argument', () => {
  const root = makeFixture({ jsdom: true, declared: ['tests/a.test.js'], files: { 'a.test.js': PASSING_TEST } });
  try {
    const r = runGate(root, ['--allow-skips']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unrecognized argument/);
  } finally { cleanup(root); }
});

// ---------------------------------------------------------------------------
// S4 task 2b.2g -- the todo set by name, and failing closed
// ---------------------------------------------------------------------------

const TODO_FAILING = (name) => 'test(' + JSON.stringify(name) + ', { todo: "recorded" }, () => { throw new Error("still broken"); });\n';
const HEADER = 'const test = require("node:test");\nconst { describe } = require("node:test");\n';

test('verify-test-gate: FAILS on an UNAUTHORIZED todo -- a real test quietly marked todo', () => {
  const root = makeFixture({
    jsdom: true, declared: ['tests/a.test.js'], registry: [],
    files: { 'a.test.js': HEADER + 'test("ok", () => {});\n' + TODO_FAILING('quietly disabled') },
  });
  try {
    const r = runGate(root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /UNAUTHORIZED TODO \(not in the registry\): tests\/a\.test\.js :: quietly disabled/);
    // Assert the CHECK failed, not only that its text appeared: a passing check still prints its detail.
    assert.match(r.stdout, /FAIL  every todo test is authorized by name/);
    // D11: the note used to say every todo was "named in the registry" beside this very failure.
    assert.doesNotMatch(r.stdout, /each named in the registry/);
    assert.match(r.stdout, /NOTE: 1 test\(s\) marked todo: 0 named in the registry and 1 UNAUTHORIZED, failed above/);
  } finally { cleanup(root); }
});

test('verify-test-gate: FAILS when a registry entry did not run as todo -- including an ID named only in a comment', () => {
  // The a656e86 registry proxy counted an ID as "tagged" if it appeared anywhere
  // in a file's text. Here the name exists only in a comment, and that must not
  // satisfy the registry.
  const root = makeFixture({
    jsdom: true, declared: ['tests/a.test.js'],
    registry: [entry('a.test.js', 'finding A must hold')],
    files: { 'a.test.js': HEADER + '// finding A must hold -- see the registry\ntest("ok", () => {});\n' },
  });
  try {
    const r = runGate(root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /REGISTERED BUT NOT RUN AS TODO.*tests\/a\.test\.js :: finding A must hold/);
    assert.match(r.stdout, /FAIL  every registry entry ran, and ran as todo/);
  } finally { cleanup(root); }
});

test('verify-test-gate: FAILS on a swap that keeps the todo COUNT unchanged -- the case a count-only gate cannot see', () => {
  const root = makeFixture({
    jsdom: true, declared: ['tests/a.test.js'],
    registry: [entry('a.test.js', 'finding A')],
    files: { 'a.test.js': HEADER + 'test("finding A", () => {});\n' + TODO_FAILING('finding B') },
  });
  try {
    const r = runGate(root);
    // Premise: the number did not move. One authorized, one todo.
    assert.match(r.stdout, /todo 1, cancelled 0/, 'premise: the todo count must equal the registry size');
    assert.equal(r.status, 1, 'a count-preserving swap passed the gate: ' + r.stdout);
    assert.match(r.stdout, /UNAUTHORIZED TODO.*finding B/);
    assert.match(r.stdout, /REGISTERED BUT NOT RUN AS TODO.*finding A/);
    // Both checks must FAIL independently -- either one alone would already make the
    // gate exit 1, which is exactly how a disabled check hid behind the other.
    assert.match(r.stdout, /FAIL  every todo test is authorized by name/);
    assert.match(r.stdout, /FAIL  every registry entry ran, and ran as todo/);
  } finally { cleanup(root); }
});

test('verify-test-gate: FAILS when an authorized todo starts PASSING -- a repaired residual must be promoted', () => {
  const root = makeFixture({
    jsdom: true, declared: ['tests/a.test.js'],
    registry: [entry('a.test.js', 'repaired now')],
    files: { 'a.test.js': HEADER + 'test("repaired now", { todo: "recorded" }, () => {});\n' },
  });
  try {
    const r = runGate(root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /NOW PASSING.*tests\/a\.test\.js :: repaired now/);
    assert.match(r.stdout, /FAIL  no authorized todo has started passing/);
  } finally { cleanup(root); }
});

test('verify-test-gate: FAILS when two tests share an identity', () => {
  const root = makeFixture({
    jsdom: true, declared: ['tests/a.test.js'],
    files: { 'a.test.js': HEADER + 'test("same", () => {});\ntest("same", () => {});\n' },
  });
  try {
    const r = runGate(root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /DUPLICATE IDENTITIES.*tests\/a\.test\.js :: same \(x2\)/);
    assert.match(r.stdout, /FAIL  no two tests share an identity/);
  } finally { cleanup(root); }
});

test('verify-test-gate: the same name in two different suites is NOT a duplicate (control)', () => {
  const root = makeFixture({
    jsdom: true, declared: ['tests/a.test.js'],
    files: { 'a.test.js': HEADER + 'describe("one", () => { test("works", () => {}); });\ndescribe("two", () => { test("works", () => {}); });\n' },
  });
  try {
    const r = runGate(root);
    assert.equal(r.status, 0, 'suite-qualified identities must not collide: ' + r.stdout);
  } finally { cleanup(root); }
});

test('verify-test-gate: FAILS on a test file that runs no test of its own -- Node counts the empty file as one PASSING test', () => {
  const root = makeFixture({
    jsdom: true, declared: ['tests/a.test.js', 'tests/empty.test.js'],
    files: { 'a.test.js': PASSING_TEST, 'empty.test.js': '// its tests were refactored away\n' },
  });
  try {
    // Premise: the bare runner reports the empty file as a pass, so no count can see it.
    const bare = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/empty.test.js'], { cwd: root, encoding: 'utf8', env: bareEnv() });
    assert.match(bare.stdout, /^# pass 1$/m, 'premise: node --test reports the empty file as one passing test');

    const r = runGate(root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /EMPTY TEST FILE.*tests\/empty\.test\.js/);
    assert.match(r.stdout, /FAIL  every test file ran at least one test of its own/);
    assert.doesNotMatch(r.stdout, /EMPTY TEST FILE.*tests\/a\.test\.js/, 'a file with a real test must not be flagged');
  } finally { cleanup(root); }
});

test('verify-test-gate: a test file that throws while loading is reported as FAILED BEFORE RUNNING A TEST, not as an empty file (D14)', () => {
  // Found while witnessing S4-IR-01 on real streams: Node reports a load failure
  // as one FAILING result named after the file, and the empty-file check -- which
  // looks only at the name -- called it "EMPTY TEST FILE". The gate still failed;
  // the report named the wrong cause.
  const root = makeFixture({
    jsdom: true, declared: ['tests/a.test.js', 'tests/broken.test.js'],
    files: { 'a.test.js': PASSING_TEST, 'broken.test.js': 'require("node:test")("never runs", () => {});\nthrow new Error("module failed to load");\n' },
  });
  try {
    const r = runGate(root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /FAIL  every test passed/, 'premise: the load failure is counted as a failing test');
    assert.match(r.stdout, /FAILED BEFORE RUNNING A TEST.*tests\/broken\.test\.js/);
    assert.doesNotMatch(r.stdout, /EMPTY TEST FILE/);
  } finally { cleanup(root); }
});

test('verify-test-gate: FAILS when there is no test file to run, instead of letting node --test choose its own', () => {
  const root = makeFixture({ jsdom: true, declared: [], files: {} });
  try {
    // A decoy outside tests/ that node --test's default patterns would pick up.
    fs.writeFileSync(path.join(root, 'decoy.test.js'), PASSING_TEST);
    const bare = spawnSync(process.execPath, ['--test', '--test-reporter=tap'], { cwd: root, encoding: 'utf8', env: bareEnv() });
    assert.match(bare.stdout, /^# tests 1$/m, 'premise: with no file arguments node --test runs whatever its defaults find');

    const r = runGate(root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /no test files to run/);
    assert.match(r.stdout, /FAIL  there is at least one test file to run/);
    assert.doesNotMatch(r.stdout, /tests 1, pass 1/, 'the gate must not have run the decoy');
  } finally { cleanup(root); }
});

test('verify-test-gate: FAILS when a registry entry is malformed, even with --no-run', () => {
  const bad = entry('a.test.js', 'x');
  delete bad.owner;
  const root = makeFixture({
    jsdom: true, declared: ['tests/a.test.js'], registry: [bad],
    files: { 'a.test.js': PASSING_TEST },
  });
  try {
    const r = runGate(root, ['--no-run']);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /entry 0: owner is required/);
    assert.match(r.stdout, /FAIL  the exception registry is well-formed/);
  } finally { cleanup(root); }
});

test('verify-test-gate: FAILS when the registry is missing', () => {
  const root = makeFixture({
    jsdom: true, declared: ['tests/a.test.js'], registry: null,
    files: { 'a.test.js': PASSING_TEST },
  });
  try {
    const r = runGate(root, ['--no-run']);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /test-exception-registry\.json is missing or not valid JSON/);
    assert.match(r.stdout, /FAIL  the exception registry is well-formed/);
  } finally { cleanup(root); }
});

test('verify-test-gate: a skip still FAILS beside an authorized todo, and is reported as the skip', () => {
  const root = makeFixture({
    jsdom: true, declared: ['tests/a.test.js'],
    registry: [entry('a.test.js', 'known')],
    files: { 'a.test.js': HEADER + TODO_FAILING('known') + 'test("needs jsdom", { skip: "no jsdom" }, () => {});\n' },
  });
  try {
    const r = runGate(root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /SKIPPED: tests\/a\.test\.js :: needs jsdom/);
    assert.match(r.stdout, /FAIL  no test was SKIPPED/);
    assert.doesNotMatch(r.stdout, /UNAUTHORIZED TODO/, 'the authorized todo must not be confused with the skip');
  } finally { cleanup(root); }
});

test('verify-test-gate: reads test:list when "test" is the gate itself (the 62ce005 repair, which had no test)', () => {
  const root = makeFixture({
    jsdom: true,
    scripts: { test: 'node tools/verify-test-gate.js', 'test:list': 'node --test tests/a.test.js' },
    files: { 'a.test.js': PASSING_TEST },
  });
  try {
    const r = runGate(root, ['--no-run']);
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /declared in npm test: 1 files/);
    assert.doesNotMatch(r.stdout, /UNREGISTERED/);
  } finally { cleanup(root); }
});

test('verify-test-gate: FAILS when its reporter is missing -- it must not fall back to counting', () => {
  const root = makeFixture({
    jsdom: true, declared: ['tests/a.test.js'], reporter: false,
    files: { 'a.test.js': PASSING_TEST },
  });
  try {
    const r = runGate(root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /FAIL  the gate reporter is present/);
  } finally { cleanup(root); }
});

// ---------------------------------------------------------------------------
// evaluateRun() -- the failure modes a fixture cannot provoke
// ---------------------------------------------------------------------------

describe('evaluateRun', () => {
  const ROOTX = path.join(os.tmpdir(), 'gate-eval-fixture');
  const FILE = path.join(ROOTX, 'tests', 'a.test.js');
  const NO_REGISTRY = { entries: [], errors: [] };
  const tap = (over) => {
    const c = Object.assign({ tests: 1, suites: 0, pass: 1, fail: 0, skipped: 0, todo: 0, cancelled: 0 }, over || {});
    return Object.keys(c).filter((k) => c[k] !== undefined).map((k) => '# ' + k + ' ' + c[k]).join('\n') + '\n';
  };
  const events = (lines) => lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n';
  // The runner's real final-summary schema. Until S4-IR-01 this fixture's summary
  // was { tests: 1 }, a shape Node never emits, and the evaluator never noticed.
  const OK_EVENTS = [
    { type: 'test:start', name: 'passes', nesting: 0, file: FILE },
    { type: 'test:pass', name: 'passes', nesting: 0, file: FILE, detailsType: 'test' },
    { type: 'test:summary', counts: { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0, topLevel: 1, suites: 0 }, success: true },
  ];
  const verdict = (run) => evaluateRun(Object.assign({ status: 0, signal: null, spawnError: null, root: ROOTX,
    tapOutput: tap(), eventsText: events(OK_EVENTS) }, run), NO_REGISTRY);
  const failing = (v) => v.checks.filter((c) => !c.ok);

  test('control: a clean run produces no failing check', () => {
    assert.deepEqual(failing(verdict({})), []);
  });

  test('a run reporting ZERO tests is a failure', () => {
    const f = failing(verdict({ tapOutput: tap({ tests: 0, pass: 0 }), eventsText: events([OK_EVENTS[2]]) }));
    assert.ok(f.some((c) => /executed at least one test/.test(c.label)), JSON.stringify(f));
  });

  test('a NON-ZERO runner exit behind a clean-looking summary is a failure', () => {
    const f = failing(verdict({ status: 3 }));
    assert.equal(f.length, 1, JSON.stringify(f));
    assert.match(f[0].label, /runner exited cleanly/);
    assert.match(f[0].detail, /exited 3 but reported 0 failing test/);
  });

  test('a counter MISSING from the summary is a gate error, not zero', () => {
    const f = failing(verdict({ tapOutput: tap({ todo: undefined }) }));
    assert.ok(f.some((c) => /complete TAP summary/.test(c.label) && /"# todo"/.test(c.detail)), JSON.stringify(f));
  });

  test('a MALFORMED event line is a gate error', () => {
    const f = failing(verdict({ eventsText: events(OK_EVENTS.slice(0, 2).concat(['{not json', OK_EVENTS[2]])) }));
    assert.ok(f.some((c) => /event stream is complete and well-formed/.test(c.label) && /unparseable/.test(c.detail)), JSON.stringify(f));
  });

  test('an event stream cut short (no final summary) is a gate error', () => {
    const f = failing(verdict({ eventsText: events(OK_EVENTS.slice(0, 2)) }));
    assert.ok(f.some((c) => /no final summary event/.test(c.detail || '')), JSON.stringify(f));
  });

  test('events that DISAGREE with the summary counts are a failure', () => {
    const f = failing(verdict({ tapOutput: tap({ tests: 2, pass: 2 }) }));
    assert.ok(f.some((c) => /agree with the summary counts/.test(c.label) && /tests: events 1, summary 2/.test(c.detail)), JSON.stringify(f));
  });
});

// ---------------------------------------------------------------------------
// S4-IR-01 (external instrument audit, 2026-09-13): every report reconciled,
// witnessed on REAL reporter streams
// ---------------------------------------------------------------------------

describe('S4-IR-01: evaluateRun() on real reporter streams', () => {
  /* The audit showed the evaluator accepting a fail event beside a green TAP
     summary, a final summary reporting nine failures, and a result with no name
     or file, and throwing on a JSON null line. Each witness below captures a
     REAL run once and corrupts exactly one thing in it. Every witness was
     observed failing against the evaluator before the repair; CONTROL passed. */
  const GREEN_FILE = [
    'const test = require("node:test");',
    'const { describe, it } = require("node:test");',
    'test("passes", () => {});',
    'test("known finding", { todo: "recorded" }, () => { throw new Error("still broken"); });',
    'describe("a suite", () => { it("child passes", () => {}); });',
    'test("parent", async (t) => { await t.test("awaited child", () => {}); });',
    '',
  ].join('\n');
  const MIXED_FILE = [
    'const test = require("node:test");',
    'test("passes", () => {});',
    'test("ordinary failure", () => { throw new Error("boom"); });',
    'test("repaired now", { todo: "recorded" }, () => {});',
    'test("quietly disabled", { todo: "nobody authorized this" }, () => { throw new Error("x"); });',
    'test("parent times out", { timeout: 50 }, async (t) => { await t.test("cancelled child", () => new Promise((r) => setTimeout(r, 300))); });',
    '',
  ].join('\n');
  const GREEN_REGISTRY = { entries: [entry('green.test.js', 'known finding')], errors: [] };
  const MIXED_REGISTRY = { entries: [entry('mixed.test.js', 'repaired now')], errors: [] };
  const WELL_FORMED = 'the per-test event stream is complete and well-formed';
  let greenRoot;
  let mixedRoot;
  let GREEN;
  let MIXED;

  before(() => {
    greenRoot = makeFixture({ declared: [], files: { 'green.test.js': GREEN_FILE } });
    mixedRoot = makeFixture({ declared: [], files: { 'mixed.test.js': MIXED_FILE } });
    GREEN = captureRun(greenRoot, ['tests/green.test.js']);
    MIXED = captureRun(mixedRoot, ['tests/mixed.test.js']);
  });
  after(() => { cleanup(greenRoot); cleanup(mixedRoot); });

  const lines = (run) => run.eventsText.split('\n').filter((l) => l.trim());
  const edited = (run, edit) => { const ls = lines(run); edit(ls); return Object.assign({}, run, { eventsText: ls.join('\n') + '\n' }); };
  const reEvent = (ls, pick, edit) => {
    const i = ls.findIndex((l) => pick(JSON.parse(l)));
    assert.ok(i >= 0, 'premise: the event to corrupt exists');
    const e = JSON.parse(ls[i]);
    edit(e);
    ls[i] = JSON.stringify(e);
  };
  const judged = (run, registry) => {
    let v;
    assert.doesNotThrow(() => { v = evaluateRun(run, registry); }, 'evaluateRun threw instead of returning a verdict');
    return v;
  };
  const failedLabels = (v) => v.checks.filter((c) => !c.ok).map((c) => c.label);
  const streamCheck = (run) => judged(run, GREEN_REGISTRY).checks.find((c) => c.label === WELL_FORMED);

  test('CONTROL: a real green run -- a pass, an authorized failing todo, a suite and a nested test -- has no failing check', () => {
    assert.equal(GREEN.status, 0, 'premise: the runner itself passed: ' + GREEN.tapOutput);
    const final = JSON.parse(lines(GREEN).pop());
    assert.ok(final.type === 'test:summary' && final.file === undefined && final.success === true, 'premise: the final summary is the last event');
    assert.deepEqual(Object.keys(final.counts).sort(), ['cancelled', 'failed', 'passed', 'skipped', 'suites', 'tests', 'todo', 'topLevel'], 'premise: the runner\'s own summary schema');
    const v = judged(GREEN, GREEN_REGISTRY);
    assert.deepEqual(v.checks.filter((c) => !c.ok), []);
    assert.match(v.notes.join('\n'), /1 test\(s\) marked todo, each named in the registry -- reported, not failed on/);
  });

  test('a FAIL event beside a green TAP summary is a disagreement, not a pass', () => {
    const run = edited(GREEN, (ls) => reEvent(ls, (e) => e.type === 'test:pass' && e.name === 'passes', (e) => { e.type = 'test:fail'; }));
    const f = failedLabels(judged(run, GREEN_REGISTRY));
    assert.ok(f.includes('the named tests agree with the summary counts'), JSON.stringify(f));
    assert.ok(f.includes('the named tests agree with the runner\'s own final summary'), JSON.stringify(f));
  });

  test('a final summary reporting failures the other reports do not is a disagreement', () => {
    const run = edited(GREEN, (ls) => reEvent(ls, (e) => e.type === 'test:summary' && e.file === undefined, (e) => {
      e.counts.tests += 9; e.counts.failed += 9; e.success = false;
    }));
    const c = judged(run, GREEN_REGISTRY).checks.find((x) => x.label === 'the named tests agree with the runner\'s own final summary');
    assert.ok(c && !c.ok && /failed: events 0, final summary 9/.test(c.detail), JSON.stringify(c));
  });

  test('a final summary whose success flag contradicts its own counts is refused, and nothing else is', () => {
    const run = edited(GREEN, (ls) => reEvent(ls, (e) => e.type === 'test:summary' && e.file === undefined, (e) => { e.success = false; }));
    assert.deepEqual(failedLabels(judged(run, GREEN_REGISTRY)), ['the final summary\'s success flag agrees with its counts']);
  });

  test('a result with no name, or no file, is malformed -- the gate does not make up an identity', () => {
    for (const [key, reason] of [['name', /without a test name/], ['file', /without an absolute file/]]) {
      const run = edited(GREEN, (ls) => reEvent(ls, (e) => e.type === 'test:pass', (e) => { delete e[key]; }));
      const c = streamCheck(run);
      assert.ok(c && !c.ok && reason.test(c.detail), key + ': ' + JSON.stringify(c));
    }
  });

  test('a JSON null, number, string or array line is malformed, never a thrown TypeError', () => {
    for (const bad of ['null', '7', '"test:pass"', '[]']) {
      const c = streamCheck(edited(GREEN, (ls) => { ls.splice(1, 0, bad); }));
      assert.ok(c && !c.ok && /line 2: not an event record/.test(c.detail), bad + ': ' + JSON.stringify(c));
    }
  });

  test('invalid nesting -- negative, fractional, or deeper than any open parent -- is refused', () => {
    for (const [nesting, reason] of [[-1, /nesting -1, not a non-negative integer/], [0.5, /nesting 0\.5, not a non-negative integer/], [3, /starts at depth 3 under 0 open parent/]]) {
      const c = streamCheck(edited(GREEN, (ls) => reEvent(ls, (e) => e.type === 'test:start', (e) => { e.nesting = nesting; })));
      assert.ok(c && !c.ok && reason.test(c.detail), nesting + ': ' + JSON.stringify(c));
    }
  });

  test('a second final summary, or a final summary that is not the last event, is refused', () => {
    const twice = streamCheck(edited(GREEN, (ls) => { ls.push(ls[ls.length - 1]); }));
    assert.ok(twice && !twice.ok && /2 final summary events/.test(twice.detail), JSON.stringify(twice));
    const early = streamCheck(edited(GREEN, (ls) => { ls.unshift(ls.pop()); }));
    assert.ok(early && !early.ok && /not the last event/.test(early.detail), JSON.stringify(early));
  });

  test('a result that no start event opened is refused', () => {
    const c = streamCheck(edited(GREEN, (ls) => { ls.splice(ls.findIndex((l) => JSON.parse(l).type === 'test:start'), 1); }));
    assert.ok(c && !c.ok && /no start event opened/.test(c.detail), JSON.stringify(c));
  });

  test('a failing run NAMES its failed and cancelled tests in a note, so a CI failure the diagnostic re-run cannot reproduce is still named', () => {
    /* S5AA R20: main's run 35953247734 at fe86475 failed "1 failing test(s)" and said no more; the event stream that
       knew the name was a temporary file, and the re-run that names failures passed everything. */
    const v = judged(MIXED, MIXED_REGISTRY);
    const note = v.notes.join('\n');
    assert.match(note, /1 failing test\(s\): [^\n]*mixed\.test\.js :: ordinary failure/, note);
    assert.match(note, /cancelled test\(s\): [^\n]*parent times out/, note);
    assert.doesNotMatch(note.split('\n').filter((l) => /failing test\(s\):/.test(l)).join('\n'), /passes|quietly disabled|repaired now/,
      'a pass or a todo is not named as failing');
    assert.doesNotMatch(judged(GREEN, GREEN_REGISTRY).notes.join('\n'), /failing test\(s\):|cancelled test\(s\):/, 'a green run names nothing');
  });

  test('a real run with an ordinary failure, a cancelled child, a now-passing todo and an unauthorized todo fails for exactly those reasons, and its reports still reconcile', () => {
    assert.notEqual(MIXED.status, 0, 'premise: the runner failed');
    const final = JSON.parse(lines(MIXED).pop());
    assert.deepEqual([final.counts.failed, final.counts.cancelled, final.counts.todo], [1, 2, 2], 'premise: ' + JSON.stringify(final.counts));
    const v = judged(MIXED, MIXED_REGISTRY);
    assert.deepEqual(failedLabels(v).sort(), [
      'every test passed',
      'every todo test is authorized by name in tools/test-exception-registry.json',
      'no authorized todo has started passing',
      'no test was cancelled',
    ]);
    // D11: the note must not say every todo is authorized while one is not.
    const note = v.notes.join('\n');
    assert.doesNotMatch(note, /each named in the registry/);
    assert.match(note, /2 test\(s\) marked todo: 1 named in the registry \(1 of them NOW PASSING, failed above\) and 1 UNAUTHORIZED, failed above/);
  });
});
