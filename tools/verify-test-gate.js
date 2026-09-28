'use strict';

/*
 * R4-F2 -- the release/CI test gate.
 *
 * WHY IT EXISTS. The round-4 external requalification recorded this as an open
 * follow-up (ROADMAP_EXTERNAL_REVIEW.md section 4.5): the eight DOM consumer
 * tests report as SKIPPED when `jsdom` is unavailable, and "skips are not
 * passes." `npm test` exits 0 in that situation, so a sandbox without jsdom
 * can produce a green run that has never executed the UI contracts at all.
 * The auditor's requirement was a gate that must FAIL rather than silently
 * accept that as qualification. This item blocks R2-T08 in spirit.
 *
 * A second, related hole it closes: `npm test` names its test files in a
 * hand-maintained list inside package.json. A newly added test file that
 * nobody remembers to register runs nowhere, and the suite stays green while
 * silently not running it. This gate DISCOVERS test files from the filesystem
 * and fails if the hand-maintained list has drifted from what is on disk, in
 * either direction.
 *
 * IT IS `npm test`. Since 62ce005 package.json has "test": "node
 * tools/verify-test-gate.js", and the hand-maintained file list lives in
 * "test:list". (This header said "Deliberately NOT wired into package.json"
 * for three days after that stopped being true -- S4 task 2b.2d.)
 *
 * IT NAMES WHAT IT QUALIFIES, AND FAILS CLOSED (S4 task 2b.2g, S4-PA-07).
 * Until 2026-09-12 the gate read only the TAP summary. It could say "19 todo"
 * and never WHICH nineteen -- so a real test quietly becoming todo while an
 * authorized one was promoted left the count unchanged, and nothing noticed.
 * It now takes each test's identity from the runner's own events
 * (tools/gate-reporter.mjs) and compares the todo set, BY NAME, with a
 * committed registry, tools/test-exception-registry.json. The registry is
 * edited by hand; the gate never learns its allowed set from the run it is
 * policing. And a report the gate cannot fully read is a gate error, never
 * zero failures: a missing counter, zero tests, a non-zero runner exit behind
 * a clean-looking summary, a malformed event stream, or events that disagree
 * with the summary all fail.
 *
 * EVERY REPORT RECONCILED (S4-IR-01, external instrument audit 2026-09-13).
 * "Events that disagree with the summary" had meant three counts: tests, todo
 * and skipped. The stream was parsed but never validated. So a fail event beside
 * a green TAP summary passed, a final summary saying nine tests failed passed, a
 * result with no name or file passed under an identity the gate made up, and a
 * JSON `null` line threw. Now every record is validated before any field is
 * read; a result must close a test its file started; there is exactly one final
 * summary and it is the last event; each result is counted in the one bucket
 * Node itself uses (skipped, todo, cancelled, failed, passed); and that tally
 * must equal the TAP counters AND the runner's own final summary, whose success
 * flag must agree with its counts. The witnesses corrupt a REAL reporter stream.
 *
 * Usage:
 *   node tools/verify-test-gate.js            # full gate: discover, check, run
 *   node tools/verify-test-gate.js --no-run   # discovery, registry and jsdom checks only
 *   node tools/verify-test-gate.js --quiet
 *
 * Exit code 0 only if every check passes. Anything else is a gate failure.
 *
 * OBSERVED FAILING, not merely written. tests/verify-test-gate.test.js builds
 * throwaway fixture roots and watches each failure mode fail; evaluateRun() is
 * exported so the modes a fixture cannot provoke (a runner that exits non-zero
 * behind a success summary, an unparseable counter) are witnessed too. The
 * export takes the run's raw output and returns verdicts; it has no option
 * that skips a check, so it is a seam for tests and not a way around the gate.
 *
 * The four cases from the original version still stand:
 *   A. jsdom absent                   -> FAIL, exit 1, suite not run
 *   B. jsdom present, one test skips  -> FAIL, exit 1 ("1 skipped test(s)")
 *   C. an unregistered test file      -> FAIL, exit 1, names the file
 *   D. a declared file that does not  -> PASS, but the file is RUN and the
 *      match *.test.js                  convention gap is reported
 *
 * Case B is the whole point: in that same fixture, `node --test` itself
 * reported "pass 1, fail 0, skipped 1" and exited 0. A green suite and a
 * qualified suite are not the same thing.
 *
 * Case D exists because the first version of this gate had the bug it was
 * written to prevent. It filtered the DECLARED list by the same *.test.js
 * convention that filesystem discovery uses, so both checks shared one blind
 * spot -- tests/regression-suite.js, 13 tests that `npm test` runs. The two
 * counts agreed with each other perfectly (89 files, 89 files) while the gate
 * qualified 801 tests against npm test's 814. Two checks with a shared blind
 * spot agree and prove nothing.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const TESTS_DIR = path.join(ROOT, 'tests');
const REGISTRY_REL = 'tools/test-exception-registry.json';
const REPORTER = path.join(__dirname, 'gate-reporter.mjs');
const COUNTERS = ['tests', 'suites', 'pass', 'fail', 'skipped', 'todo', 'cancelled'];
const KINDS = ['revival-contract', 'carried-residual'];

// ---------------------------------------------------------------------------
// The exception registry
// ---------------------------------------------------------------------------

/** Reads and validates the registry. Never throws: problems come back as errors. */
function loadRegistry(root) {
  const errors = [];
  const file = path.join(root, REGISTRY_REL);
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { entries: [], errors: [REGISTRY_REL + ' is missing or not valid JSON (' + e.message + ')'] };
  }
  if (!doc || doc.formatVersion !== 1) errors.push(REGISTRY_REL + ': formatVersion must be 1');
  const entries = doc && Array.isArray(doc.entries) ? doc.entries : null;
  if (!entries) return { entries: [], errors: errors.concat([REGISTRY_REL + ': entries must be an array']) };
  const seen = new Set();
  entries.forEach(function (e, i) {
    const where = REGISTRY_REL + ' entry ' + i;
    const str = function (k) { return e && typeof e[k] === 'string' && e[k].trim().length > 0; };
    if (!str('file') || !e.file.startsWith('tests/')) errors.push(where + ': file must name a path under tests/');
    if (!str('name')) errors.push(where + ': name is required');
    if (!e || KINDS.indexOf(e.kind) === -1) errors.push(where + ': kind must be one of ' + KINDS.join(', '));
    ['findingId', 'owner', 'lifecycle', 'releaseCondition'].forEach(function (k) {
      if (!str(k)) errors.push(where + ': ' + k + ' is required');
    });
    if (e && e.kind === 'revival-contract' && !str('module')) errors.push(where + ': a revival contract must name its module');
    const id = identity(e && e.file, e && e.name);
    if (seen.has(id)) errors.push(where + ': duplicate entry for ' + id);
    seen.add(id);
  });
  return { entries: entries, errors: errors };
}

function identity(file, chain) {
  return file + ' :: ' + chain;
}

// ---------------------------------------------------------------------------
// Reading the event stream (S4-IR-01) -- each shape below was observed on
// Node v24.17.0, not assumed
// ---------------------------------------------------------------------------

const EVENT_TYPES = ['test:start', 'test:pass', 'test:fail', 'test:summary'];
/* The runner's final summary names its buckets differently from TAP. */
const SUMMARY_COUNTS = ['tests', 'passed', 'failed', 'cancelled', 'skipped', 'todo', 'topLevel', 'suites'];
const TAP_NAME = { tests: 'tests', passed: 'pass', failed: 'fail', cancelled: 'cancelled', skipped: 'skipped', todo: 'todo', suites: 'suites' };
/* A result ended by its own timeout, or by a parent that ended first, is
   counted as cancelled rather than failed. */
const CANCELLED_FAILURE_TYPES = ['cancelledByParent', 'testTimeoutFailure'];

function nonEmpty(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function listed(items) {
  return items.slice(0, 5).join('; ') + (items.length > 5 ? ' (and ' + (items.length - 5) + ' more)' : '');
}

/** Why an event record cannot be read, or null. Checks shape only; never throws. */
function eventProblem(e) {
  if (e === null || typeof e !== 'object' || Array.isArray(e)) {
    return 'not an event record (' + (e === null ? 'null' : Array.isArray(e) ? 'an array' : typeof e) + ')';
  }
  if (EVENT_TYPES.indexOf(e.type) === -1) return 'unknown event type ' + JSON.stringify(e.type);
  if (e.type === 'test:summary') {
    if (e.file !== undefined && !nonEmpty(e.file)) return 'a summary whose file is not a non-empty string';
    if (!e.counts || typeof e.counts !== 'object' || Array.isArray(e.counts)) return 'a summary with no counts record';
    const bad = SUMMARY_COUNTS.filter(function (k) { return !(Number.isInteger(e.counts[k]) && e.counts[k] >= 0); });
    if (bad.length) return 'a summary whose ' + bad.join(', ') + ' count(s) are not non-negative integers';
    if (typeof e.success !== 'boolean') return 'a summary whose success flag is not a boolean';
    return null;
  }
  if (!nonEmpty(e.name)) return e.type + ' without a test name';
  const what = e.type + ' "' + e.name + '"';
  if (!nonEmpty(e.file) || !path.isAbsolute(e.file)) return what + ' without an absolute file';
  if (!(Number.isInteger(e.nesting) && e.nesting >= 0)) return what + ' with nesting ' + JSON.stringify(e.nesting) + ', not a non-negative integer';
  if (e.type === 'test:start') return null;
  if (e.detailsType !== 'test' && e.detailsType !== 'suite') return what + ' whose details type is neither test nor suite';
  if (['todo', 'skip'].some(function (k) { return e[k] !== undefined && typeof e[k] !== 'string' && typeof e[k] !== 'boolean'; })) {
    return what + ' whose todo or skip marker is neither a string nor a boolean';
  }
  if (e.failureType !== undefined && (e.type !== 'test:fail' || !nonEmpty(e.failureType))) return what + ' with a failure type it cannot have';
  return null;
}

/* The one bucket the runner counts a result in, in its own precedence: a skip
   is skipped even when it is also todo, a todo is todo whether it passed or
   failed, then cancelled, then failed. */
function outcomeOf(e) {
  if (e.skip !== undefined && e.skip !== false) return 'skipped';
  if (e.todo !== undefined && e.todo !== false) return 'todo';
  if (e.type === 'test:pass') return 'passed';
  return CANCELLED_FAILURE_TYPES.indexOf(e.failureType) !== -1 ? 'cancelled' : 'failed';
}

function tallyOf(tests, suites) {
  const t = {
    tests: tests.length, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0, suites: suites.length,
    topLevel: tests.concat(suites).filter(function (x) { return x.topLevel; }).length,
  };
  tests.forEach(function (x) { t[x.outcome] += 1; });
  return t;
}

/* A run succeeds when no test failed or was cancelled and no suite failed. */
function succeeded(c, suites) {
  return c.failed === 0 && c.cancelled === 0 && !suites.some(function (s) { return s.failed; });
}

// ---------------------------------------------------------------------------
// Evaluating a run -- pure: raw output in, verdicts out
// ---------------------------------------------------------------------------

/**
 * @param run { status, signal, spawnError, tapOutput, eventsText, root }
 * @param registry the result of loadRegistry()
 * @returns { checks: [{label, ok, detail}], notes: [string], counts }
 */
function evaluateRun(run, registry) {
  const checks = [];
  const notes = [];
  const check = function (label, ok, detail) { checks.push({ label: label, ok: !!ok, detail: detail || null }); return ok; };

  // 1. The TAP summary, every counter present.
  const output = run.tapOutput || '';
  const counts = {};
  const missing = [];
  COUNTERS.forEach(function (key) {
    const m = output.match(new RegExp('^# ' + key + ' (\\d+)$', 'm'));
    counts[key] = m ? parseInt(m[1], 10) : null;
    if (!m) missing.push(key);
  });
  const summaryOk = check('the run produced a complete TAP summary', missing.length === 0,
    missing.length ? 'could not read ' + missing.map(function (k) { return '"# ' + k + '"'; }).join(', ') +
      ' from the runner output; a report the gate cannot read is not zero of anything' : null);

  // 2. The runner itself.
  const status = run.status;
  const reportedFailures = summaryOk ? counts.fail : null;
  check('the runner exited cleanly, or reported the failure it exited for',
    !run.spawnError && !run.signal && (status === 0 || (reportedFailures !== null && reportedFailures > 0)),
    run.spawnError ? 'the runner could not be started: ' + run.spawnError
      : run.signal ? 'the runner was killed by ' + run.signal
      : status !== 0 ? 'the runner exited ' + status + ' but reported ' + (reportedFailures === null ? 'no readable' : reportedFailures) +
        ' failing test(s) -- a crash or an unreported failure behind a success-looking summary' : null);

  if (summaryOk) {
    check('the run executed at least one test', counts.tests > 0,
      counts.tests === 0 ? 'zero tests ran -- an empty run qualifies nothing' : null);
    check('every test passed', counts.fail === 0, counts.fail ? counts.fail + ' failing test(s)' : null);
    check('no test was cancelled', counts.cancelled === 0, counts.cancelled ? counts.cancelled + ' cancelled' : null);
  }

  // 3. The event stream. Every line must be a well-formed event record BEFORE
  //    any field of it is read (S4-IR-01): JSON.parse is not validation -- a
  //    `null` line parses, and reading its type threw -- and a result with no
  //    name or file became an identity made of an empty name and the root.
  const events = [];
  const malformed = [];
  String(run.eventsText || '').split('\n').forEach(function (line, i) {
    if (!line.trim()) return;
    let e;
    try { e = JSON.parse(line); } catch (err) { malformed.push('line ' + (i + 1) + ': unparseable'); return; }
    const problem = eventProblem(e);
    if (problem) malformed.push('line ' + (i + 1) + ': ' + problem);
    else events.push(e);
  });
  const relative = function (file) { return path.relative(run.root, file).split(path.sep).join('/'); };
  const finals = events.filter(function (e) { return e.type === 'test:summary' && e.file === undefined; });

  // A result must close the test its file most recently started at that depth:
  // the runner reports starts and results in definition order, a parent's start
  // before its children and its result after them.
  const stacks = new Map();
  const unordered = [];
  const results = [];
  events.forEach(function (e) {
    if (e.type === 'test:summary') return;
    const file = relative(e.file);
    const st = stacks.get(file) || [];
    stacks.set(file, st);
    if (e.type === 'test:start') {
      if (e.nesting > st.length) unordered.push(file + ': "' + e.name + '" starts at depth ' + e.nesting + ' under ' + st.length + ' open parent(s)');
      st.length = Math.min(st.length, e.nesting);
      st.push(e.name);
    } else if (st.length <= e.nesting || st[e.nesting] !== e.name) {
      unordered.push(file + ': a result for "' + e.name + '" at depth ' + e.nesting + ' that no start event opened');
    } else {
      results.push({ event: e, file: file, chain: st.slice(0, e.nesting).concat([e.name]).join(' > ') });
      st.length = e.nesting + 1;
    }
  });

  const lastIsFinal = finals.length === 1 && events[events.length - 1] === finals[0];
  const eventsOk = check('the per-test event stream is complete and well-formed',
    malformed.length === 0 && lastIsFinal && unordered.length === 0,
    malformed.length ? 'MALFORMED EVENT(S) -- a record the gate cannot read is not a pass: ' + listed(malformed)
      : finals.length === 0 ? 'no final summary event -- the stream was cut short or the reporter did not run'
      : finals.length > 1 ? finals.length + ' final summary events -- one run has one, and two in one stream cannot both be qualifying it'
      : !lastIsFinal ? 'the final summary is not the last event -- the runner writes it after every result, so what follows it was never summarized'
      : unordered.length ? 'EVENTS OUT OF ORDER: ' + listed(unordered) : null);

  const tests = [];
  const suites = [];
  if (eventsOk) {
    results.forEach(function (r) {
      const e = r.event;
      const id = identity(r.file, r.chain);
      if (e.detailsType === 'suite') {
        suites.push({ id: id, file: r.file, failed: e.type === 'test:fail', topLevel: e.nesting === 0 });
        return;
      }
      tests.push({
        id: id,
        file: r.file,
        passed: e.type === 'test:pass',
        outcome: outcomeOf(e),
        topLevel: e.nesting === 0,
        // Node's stand-in for a file that registered no test of its own: a
        // single result NAMED AFTER THE FILE. It counts as a passing test.
        fileLevel: e.nesting === 0 && path.resolve(run.root, e.name) === path.resolve(e.file),
      });
    });
    /* S5AA R20: NAME what failed. The checks below count failures; the counts alone left main's CI run 35953247734
       (fe86475) saying "1 failing test(s)" and nothing else, because the event stream that knew the name is a temporary
       file and the diagnostic re-run passed. A note decides nothing -- the verdict is still the checks'. */
    ['failed', 'cancelled'].forEach(function (outcome) {
      const named = tests.filter(function (t) { return t.outcome === outcome; }).map(function (t) { return t.id; });
      if (named.length) notes.push(named.length + ' ' + (outcome === 'failed' ? 'failing' : 'cancelled') + ' test(s): ' + named.join(' | '));
    });
  }

  if (eventsOk && summaryOk) {
    /* Three reports of one run -- the TAP counters, the runner's final summary
       and the named results -- must agree on every outcome, not only on how many
       tests there were. */
    const tally = tallyOf(tests, suites);
    const disagree = Object.keys(TAP_NAME).filter(function (k) { return tally[k] !== counts[TAP_NAME[k]]; });
    check('the named tests agree with the summary counts', disagree.length === 0,
      disagree.length ? disagree.map(function (k) { return TAP_NAME[k] + ': events ' + tally[k] + ', summary ' + counts[TAP_NAME[k]]; }).join('; ') +
        ' -- two reports of one run that disagree cannot both be qualifying it' : null);

    const final = finals[0];
    const finalDisagree = SUMMARY_COUNTS.filter(function (k) { return tally[k] !== final.counts[k]; });
    check('the named tests agree with the runner\'s own final summary', finalDisagree.length === 0,
      finalDisagree.length ? finalDisagree.map(function (k) { return k + ': events ' + tally[k] + ', final summary ' + final.counts[k]; }).join('; ') +
        ' -- two reports of one run that disagree cannot both be qualifying it' : null);

    const finalSucceeded = succeeded(final.counts, suites);
    check('the final summary\'s success flag agrees with its counts', final.success === finalSucceeded,
      final.success !== finalSucceeded ? 'success is ' + final.success + ' beside ' + final.counts.failed + ' failed, ' + final.counts.cancelled +
        ' cancelled and ' + suites.filter(function (s) { return s.failed; }).length + ' failed suite(s)' : null);

    /* Per-file summaries are optional -- a file that fails to load gets none --
       but there is at most one per file, and each agrees with its own file. */
    const perFile = new Map();
    const perFileProblems = [];
    events.forEach(function (e) {
      if (e.type !== 'test:summary' || e.file === undefined) return;
      const f = relative(e.file);
      if (perFile.has(f)) perFileProblems.push(f + ': more than one summary');
      perFile.set(f, e);
    });
    perFile.forEach(function (e, f) {
      const own = function (x) { return x.file === f; };
      const fileTally = tallyOf(tests.filter(own), suites.filter(own));
      const d = SUMMARY_COUNTS.filter(function (k) { return fileTally[k] !== e.counts[k]; });
      if (d.length) perFileProblems.push(f + ': ' + d.map(function (k) { return k + ' events ' + fileTally[k] + ', summary ' + e.counts[k]; }).join(', '));
      else if (e.success !== succeeded(e.counts, suites.filter(own))) perFileProblems.push(f + ': success ' + e.success + ' contradicts its counts');
    });
    check('every per-file summary agrees with its file\'s named tests', perFileProblems.length === 0,
      perFileProblems.length ? listed(perFileProblems) : null);

    const failedSuites = suites.filter(function (s) { return s.failed; }).map(function (s) { return s.id; });
    check('no suite failed', failedSuites.length === 0,
      failedSuites.length ? 'FAILED SUITE(S) -- a throwing hook or suite body fails the suite, and its tests may be counted as cancelled rather than failed: ' +
        listed(failedSuites) : null);

    const seen = new Map();
    tests.forEach(function (t) { seen.set(t.id, (seen.get(t.id) || 0) + 1); });
    const dups = [];
    seen.forEach(function (n, id) { if (n > 1) dups.push(id + ' (x' + n + ')'); });
    check('no two tests share an identity', dups.length === 0,
      dups.length ? 'DUPLICATE IDENTITIES -- a registry cannot name either one: ' + dups.join('; ') : null);

    /*
     * A file that defines no test is not "zero tests" to Node: it is reported
     * as ONE PASSING TEST named after the file. So a test file whose tests
     * stopped registering -- refactored into a function nobody calls, say --
     * counts as coverage while exercising nothing, and no count can see it.
     * Found while writing the zero-tests witness, which that exact behaviour
     * made pass.
     */
    /* D14: a file that throws while LOADING is also reported as one result named
       after the file -- a failing one. It used to be called an empty file, which
       named the wrong cause. Both still fail this check. */
    const byFile = new Map();
    tests.forEach(function (t) {
      const s = byFile.get(t.file) || { own: 0, loadFailed: false };
      if (!t.fileLevel) s.own++;
      else if (!t.passed) s.loadFailed = true;
      byFile.set(t.file, s);
    });
    const empty = [];
    const unloaded = [];
    byFile.forEach(function (s, f) { if (s.own === 0) (s.loadFailed ? unloaded : empty).push(f); });
    check('every test file ran at least one test of its own', empty.length === 0 && unloaded.length === 0,
      [empty.length ? 'EMPTY TEST FILE -- Node reports a file that defines no test as one passing test named ' +
        'after the file, so it counts as coverage while exercising nothing: ' + empty.join(', ') : null,
      unloaded.length ? 'FAILED BEFORE RUNNING A TEST -- the file threw while loading, which Node reports as one ' +
        'failing test named after the file: ' + unloaded.join(', ') : null].filter(Boolean).join('; ') || null);

    const skipped = tests.filter(function (t) { return t.outcome === 'skipped'; });
    check('no test was SKIPPED -- a skip is not a pass', skipped.length === 0 && counts.skipped === 0,
      counts.skipped ? counts.skipped + ' skipped test(s). This is exactly what R4-F2 exists to catch: a ' +
        'green run that never executed the contracts it claims to cover.' +
        (skipped.length ? ' SKIPPED: ' + skipped.map(function (t) { return t.id; }).join('; ') : '') : null);
  }

  // 4. The todo set, by name, against the committed registry.
  check('the exception registry is well-formed', registry.errors.length === 0,
    registry.errors.length ? registry.errors.join('; ') : null);

  if (eventsOk && registry.errors.length === 0) {
    const authorized = new Map();
    registry.entries.forEach(function (e) { authorized.set(identity(e.file, e.name), e); });
    const todos = tests.filter(function (t) { return t.outcome === 'todo'; });
    const observed = new Set(todos.map(function (t) { return t.id; }));

    const unauthorized = todos.filter(function (t) { return !authorized.has(t.id); }).map(function (t) { return t.id; });
    check('every todo test is authorized by name in ' + REGISTRY_REL, unauthorized.length === 0,
      unauthorized.length ? 'UNAUTHORIZED TODO (not in the registry): ' + unauthorized.join('; ') : null);

    const absent = [];
    authorized.forEach(function (e, id) { if (!observed.has(id)) absent.push(id); });
    check('every registry entry ran, and ran as todo', absent.length === 0,
      absent.length ? 'REGISTERED BUT NOT RUN AS TODO (removed, renamed, promoted without updating the ' +
        'registry, or named only in a comment): ' + absent.join('; ') : null);

    const nowPassing = todos.filter(function (t) { return t.passed && authorized.has(t.id); }).map(function (t) { return t.id; });
    check('no authorized todo has started passing', nowPassing.length === 0,
      nowPassing.length ? 'NOW PASSING -- promote it (remove its todo marker) and remove its registry entry in ' +
        'the same commit: ' + nowPassing.join('; ') : null);

    if (todos.length) {
      const byKind = {};
      todos.forEach(function (t) {
        const e = authorized.get(t.id);
        const k = e ? e.kind : 'UNAUTHORIZED';
        (byKind[k] = byKind[k] || []).push(t.id.replace(/^.* :: /, ''));
      });
      const listing = Object.keys(byKind).map(function (k) { return k + ' ' + byKind[k].length + ' [' + byKind[k].join(' | ') + ']'; }).join('; ');
      /* D11: this said "each named in the registry -- reported, not failed on"
         unconditionally, beside the check that had just failed an unauthorized
         todo. It now says only what is true of this run. */
      const unauthorizedCount = todos.filter(function (t) { return !authorized.has(t.id); }).length;
      if (unauthorizedCount === 0 && nowPassing.length === 0) {
        notes.push(todos.length + ' test(s) marked todo, each named in the registry -- reported, not failed on: ' + listing);
      } else {
        notes.push(todos.length + ' test(s) marked todo: ' + (todos.length - unauthorizedCount) + ' named in the registry' +
          (nowPassing.length ? ' (' + nowPassing.length + ' of them NOW PASSING, failed above)' : '') +
          (unauthorizedCount ? ' and ' + unauthorizedCount + ' UNAUTHORIZED, failed above' : '') + ': ' + listing);
      }
    }
  }

  return { checks: checks, notes: notes, counts: counts };
}

// ---------------------------------------------------------------------------
// Discovery -- what is on disk, and what package.json claims it runs
// ---------------------------------------------------------------------------

function discoverTestFiles(dir, acc) {
  const out = acc || [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // tests/lib holds shared helpers, tests/fixtures holds data; neither
      // contains runnable test files, but recursion is cheap and correct.
      discoverTestFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      out.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  return out;
}

function expandEntry(entry) {
  if (!entry.includes('*')) return [entry];
  const dir = path.join(ROOT, path.dirname(entry));
  if (!fs.existsSync(dir)) return [];
  const pattern = new RegExp('^' + path.basename(entry).split('*').map(escapeRegExp).join('.*') + '$');
  return fs.readdirSync(dir)
    .filter(function (name) { return pattern.test(name); })
    .map(function (name) { return path.dirname(entry) + '/' + name; });
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function declaredTestFiles() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  /*
   * READ THE SCRIPT THAT NAMES THE FILES, not the one called "test".
   *
   * This used to read `scripts.test` directly, which was correct only while
   * this gate was NOT wired in. Wiring it into `npm test` replaced that script
   * with a call to this file -- so the declared list became empty and the gate
   * reported every one of 123 files as unregistered. The instrument consumed
   * its own input, and it did so while passing every internal check: the run
   * completed, the terminator printed, and the answer was nonsense.
   *
   * `test:list` holds the hand-maintained list and `test` may now be either
   * that list or this gate. Preferring `test:list` when present keeps the gate
   * working in both arrangements, and keeps the pre-wiring figure reproducible
   * by name for anyone comparing against an earlier dispatch. (Since S4 task
   * 2b.2d, tests/verify-test-gate.test.js exercises this branch; before that
   * the repair had no test at all.)
   */
  const scripts = pkg.scripts || {};
  const script = scripts['test:list'] || scripts.test || '';
  /*
   * Any .js path under tests/, NOT only files matching *.test.js. Filtering
   * the declared list by the same convention that filesystem discovery uses
   * would give the two checks a shared blind spot: they would agree with each
   * other perfectly while both omitting the same file. tests/regression-suite.js
   * is exactly that file -- 13 tests that `npm test` runs and discovery
   * cannot see.
   */
  const entries = script.split(/\s+/).filter(function (t) { return /^tests\/.*\.js$/.test(t); });
  const expanded = [];
  const missing = [];
  for (const entry of entries) {
    const hits = expandEntry(entry);
    if (!hits.length) missing.push(entry);
    for (const h of hits) if (!expanded.includes(h)) expanded.push(h);
  }
  return { script, entries, expanded, missing };
}

/* Deliberately unregistered test files, by path prefix, each with its reason.
 *
 * The registration check below exists to catch a test file that runs NOWHERE
 * BY ACCIDENT -- written, forgotten, silently not exercising its subject. A
 * file unregistered ON PURPOSE is a different thing, and before this list the
 * gate could not tell them apart: the only way to make it pass was to register
 * the file, which would put deliberately-red tests into `npm test`.
 *
 * These files are excluded from the run as well as from the registration
 * check. A release gate qualifies what SHIPS; a first-failing prewrite is red
 * by design and describes work not yet done, so counting its failures here
 * would make the gate permanently red and train everyone to ignore it.
 *
 * Two properties keep this from becoming a way to hide tests. The exemptions
 * are PRINTED on every run, never silent -- an exemption nobody sees is
 * indistinguishable from a test nobody runs. And each is a narrow path prefix
 * with a written reason, not a pattern that could swallow a directory tree. */
const DELIBERATELY_UNREGISTERED = [
  /* Empty since 2026-09-12 (S4 task 2b.2f). This held tests/s3-prewrite/,
     "red on purpose until S3 lands". S3 landed and 29 of those 30 tests went
     green -- while exempt, so they ran nowhere, and two of them were the ONLY
     guard for a repaired defect (-0 in the baseline harness). Those two were
     promoted into tests/capture-baseline.test.js; the other 28 were archived to
     archive/s3-prewrites/ with a reason each. An exemption is a claim with an
     expiry: add one back only with the condition that ends it. */
];
function isExempt(f) {
  return DELIBERATELY_UNREGISTERED.some(function (e) { return f.startsWith(e.prefix); });
}

// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const NO_RUN = args.includes('--no-run');
  const QUIET = args.includes('--quiet');
  for (const a of args) {
    if (a !== '--no-run' && a !== '--quiet') {
      process.stderr.write('verify-test-gate: unrecognized argument ' + a + '\n');
      process.exit(2);
    }
  }

  const failures = [];
  const notes = [];
  const say = function (line) { if (!QUIET) process.stdout.write(line + '\n'); };
  const check = function (label, ok, detail) {
    say((ok ? '  PASS  ' : '  FAIL  ') + label);
    if (!ok) failures.push(detail || label);
    else if (detail) say('        ' + detail);
    return ok;
  };

  say('\n' + '='.repeat(74));
  say('RELEASE TEST GATE (R4-F2)');
  say('='.repeat(74) + '\n');

  const discovered = discoverTestFiles(TESTS_DIR).sort();
  const declared = declaredTestFiles();
  const declaredSet = new Set(declared.expanded);
  const discoveredSet = new Set(discovered);

  /*
   * What actually gets run is the UNION. Discovery is the primary source -- that
   * is the whole point of the gate -- but a declared file that discovery cannot
   * see (because it does not follow the *.test.js convention) must still run,
   * or the gate would qualify a smaller suite than `npm test` does while
   * reporting success.
   */
  const runnable = discovered.filter(function (f) { return !isExempt(f); });
  for (const f of declared.expanded) if (!discoveredSet.has(f) && fs.existsSync(path.join(ROOT, f))) runnable.push(f);

  const nonConventional = declared.expanded.filter(function (f) {
    return !f.endsWith('.test.js') && fs.existsSync(path.join(ROOT, f));
  });

  say('discovered on disk  : ' + discovered.length + ' files matching *.test.js');
  say('declared in npm test: ' + declared.expanded.length + ' files');
  say('will run            : ' + runnable.length + ' files (the union)\n');

  const notDeclared = discovered.filter(function (f) { return !declaredSet.has(f); });
  const exempt = notDeclared.filter(isExempt);
  const unregistered = notDeclared.filter(function (f) { return !isExempt(f); });

  if (exempt.length) {
    say('deliberately unregistered: ' + exempt.length + ' file(s)');
    DELIBERATELY_UNREGISTERED.forEach(function (e) {
      const hits = exempt.filter(function (f) { return f.startsWith(e.prefix); });
      if (hits.length) say('  ' + e.prefix + ' (' + hits.length + ') -- ' + e.reason);
    });
    say('');
  }

  check(
    'every test file on disk is registered in package.json (or deliberately exempt)',
    unregistered.length === 0,
    unregistered.length ? 'UNREGISTERED (these run nowhere): ' + unregistered.join(', ') : null
  );

  // Existence on disk, NOT membership in the discovered set: a declared file
  // that simply does not follow the *.test.js convention exists and runs, and is
  // reported as a note below rather than as a missing file.
  const orphaned = declared.expanded.filter(function (f) { return !fs.existsSync(path.join(ROOT, f)); });
  check(
    'every test file named in package.json exists on disk',
    orphaned.length === 0,
    orphaned.length ? 'NAMED BUT MISSING: ' + orphaned.join(', ') : null
  );

  check(
    'no glob or path in the test script resolves to nothing',
    declared.missing.length === 0,
    declared.missing.length ? 'RESOLVES TO NOTHING: ' + declared.missing.join(', ') : null
  );

  if (nonConventional.length) {
    // Reported, not failed on: these files DO run (they are in the union above),
    // but only because package.json names them. They are the residual dependency
    // on the hand-maintained list that this gate otherwise removes -- renaming
    // them to *.test.js would make them discoverable and close it.
    notes.push(
      nonConventional.length + ' declared file(s) do not match *.test.js and so cannot be discovered from ' +
      'disk: ' + nonConventional.join(', ') + '. They are run because package.json names them. Renaming ' +
      'them to *.test.js would remove the last dependency on that hand-maintained list.'
    );
  }

  // The registry is checked even when the suite is not run: a malformed
  // registry is a broken instrument whether or not it gets used today.
  const registry = loadRegistry(ROOT);
  check('the exception registry is well-formed', registry.errors.length === 0,
    registry.errors.length ? registry.errors.join('; ') : 'tools/test-exception-registry.json: ' +
      registry.entries.length + ' authorized todo(s)');

  // -------------------------------------------------------------------------
  // jsdom must be present -- skipped DOM tests are not qualification
  // -------------------------------------------------------------------------

  let jsdomVersion = null;
  let jsdomPresent = true;
  try {
    jsdomVersion = require(path.join(ROOT, 'node_modules', 'jsdom', 'package.json')).version;
  } catch (e) {
    try {
      require.resolve('jsdom');
      jsdomVersion = 'resolved (version unknown)';
    } catch (e2) {
      jsdomPresent = false;
    }
  }
  check(
    'jsdom is installed, so the DOM consumer tests actually execute',
    jsdomPresent,
    jsdomPresent
      ? 'jsdom ' + jsdomVersion
      : 'jsdom is NOT installed. The DOM consumer tests would report as SKIPPED, and skips are ' +
        'not passes (ROADMAP_EXTERNAL_REVIEW.md ground rule 3 explains why that is expected in an ' +
        'auditor sandbox; it is NOT acceptable as release qualification). Run `npm install`.'
  );

  // -------------------------------------------------------------------------
  // Run the discovered suite, name every test, and refuse what it cannot read
  // -------------------------------------------------------------------------

  if (NO_RUN) {
    say('\n  --no-run: skipping suite execution (discovery, registry and jsdom checks only)');
  } else if (!jsdomPresent) {
    say('\n  suite not run: jsdom is missing, so the run could not qualify anything anyway');
  } else if (runnable.length === 0) {
    check('there is at least one test file to run', false,
      'no test files to run -- and `node --test` given no file arguments searches the working directory by ' +
      'its own default patterns, so an empty list would run a set nobody chose');
  } else if (!fs.existsSync(REPORTER)) {
    check('the gate reporter is present', false,
      'tools/gate-reporter.mjs is missing -- without it the gate cannot name a single test, and a gate ' +
      'that can only count is the one S4 task 2b.2g replaced');
  } else {
    say('\n  running ' + runnable.length + ' test files...');
    /*
     * NODE_TEST_CONTEXT must be stripped from the child's environment. Node sets
     * it in every process spawned from inside `node --test`, and a nested runner
     * that inherits it switches from TAP to the internal child-process reporter
     * protocol -- so the summary parsed below would not be there. Reachable
     * whenever this gate is invoked from within a test context (this tool's own
     * tests do exactly that, which is how it was found). It fails safe rather
     * than silently passing, but a false failure is still a failure.
     */
    const childEnv = Object.assign({}, process.env);
    delete childEnv.NODE_TEST_CONTEXT;
    const eventsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-events-'));
    const eventsPath = path.join(eventsDir, 'events.jsonl');
    let run;
    try {
      const result = spawnSync(
        process.execPath,
        ['--test',
          '--test-reporter=tap', '--test-reporter-destination=stdout',
          '--test-reporter=' + pathToFileURL(REPORTER).href, '--test-reporter-destination=' + eventsPath,
        ].concat(runnable),
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: childEnv }
      );
      run = {
        status: result.status,
        signal: result.signal,
        spawnError: result.error ? result.error.message : null,
        tapOutput: (result.stdout || '') + (result.stderr || ''),
        eventsText: fs.existsSync(eventsPath) ? fs.readFileSync(eventsPath, 'utf8') : '',
        root: ROOT,
      };
    } finally {
      fs.rmSync(eventsDir, { recursive: true, force: true });
    }

    const verdict = evaluateRun(run, registry);
    const c = verdict.counts;
    if (c.tests !== null) {
      say('        tests ' + c.tests + ', pass ' + c.pass + ', fail ' + c.fail +
          ', skipped ' + c.skipped + ', todo ' + c.todo + ', cancelled ' + c.cancelled);
    }
    // The registry check already ran above; do not print it twice.
    verdict.checks.filter(function (x) { return x.label !== 'the exception registry is well-formed'; })
      .forEach(function (x) { check(x.label, x.ok, x.detail); });
    verdict.notes.forEach(function (n) { notes.push(n); });
  }

  say('\n' + '='.repeat(74));
  for (const n of notes) say('NOTE: ' + n);
  if (failures.length) {
    say('GATE FAILED -- ' + failures.length + ' check(s) did not pass:');
    for (const f of failures) say('  - ' + f);
    say('='.repeat(74) + '\n');
    process.exit(1);
  }
  say('GATE PASSED' + (NO_RUN ? ' (discovery, registry and jsdom only -- suite not run)' : ''));
  say('='.repeat(74) + '\n');
  process.exit(0);
}

if (require.main === module) main();

module.exports = { evaluateRun, loadRegistry, identity, REGISTRY_REL };
