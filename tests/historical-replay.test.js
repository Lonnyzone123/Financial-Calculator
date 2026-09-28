'use strict';

/*
 * Question 10 (A), decided by the owner on 2026-09-16: control test 4.7's ROUND-TRIP is held to the engine that captured the
 * stored control, and today's engine to a written prediction, as two separate checks (tools/historical-replay.js,
 * tools/differential-harness.js matchPrediction(), tools/control-candidate-prediction.json).
 *
 * The acceptance cases of the 2026-09-16 handover review: an unchanged control replays and passes; a stored result
 * altered after capture fails; an input that is not the capturing engine's (engine, rules, a bundled module, or a
 * capture naming another engine) is a provenance mismatch and nothing runs; an unavailable engine is BLOCKED and an
 * unqualified runtime UNQUALIFIED, never a pass and never today's engine in its place; a source archive replays from a
 * verified reference tree with results identical to the git-object replay; a candidate difference is accepted only as
 * declared, value by value, and a passing replay approves no candidate.
 *
 * The tools are required inside each test, so each case reports on its own.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const { capturingEngineAbsent } = require('./lib/historical-source.js');
const CONTROL = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'control-corpus.json'), 'utf8'));
const CONTROL_FILE = path.join(ROOT, CONTROL.controlCapture.file);
const stored = () => JSON.parse(fs.readFileSync(CONTROL_FILE, 'utf8'));
const tool = () => require('../tools/historical-replay.js');
const harness = () => require('../tools/differential-harness.js');
const invariant = () => require('../tools/corpus-invariant.js');

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-replay-test-'));
test.after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));
let counter = 0;
const scratchDir = (label) => path.join(SCRATCH, label + '-' + (++counter));

let gitReplay = null;
const replayOnce = () => (gitReplay || (gitReplay = tool().replay(stored())));
let referenceTree = null;
function verifiedTree() {
  if (referenceTree) return referenceTree;
  const dir = scratchDir('reference');
  const m = tool().materialize(stored(), dir);
  assert.equal(m.ok, true, 'a reference tree could not be materialized: ' + (m.problems || []).join('; '));
  referenceTree = dir;
  return dir;
}
function copyTree(from, to) {
  fs.cpSync(from, to, { recursive: true });
  return to;
}
const gitAvailable = () => spawnSync('git', ['-C', ROOT, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).status === 0;

test('control: the control capture records the commit, the sha256 of every input and the Node version a replay needs', () => {
  const meta = stored().meta;
  assert.match(meta.gitCommit, /^[0-9a-f]{40}$/);
  assert.equal(meta.gitCommit.slice(0, CONTROL.controlCapture.commit.length), CONTROL.controlCapture.commit);
  for (const f of ['build.js', 'src/app-shell.html', 'src/engine.js', 'tests/lib/golden-scenario-defs.js', 'tests/lib/scenario-generator.js']) {
    assert.match(meta.inputGraph.files[f], /^[0-9a-f]{64}$/, f);
  }
  assert.equal(typeof meta.inputGraph.runtime.node, 'string');
  assert.equal(meta.boundary.qualified, true);
});

test('question 10 (A): the stored control replays from its capturing engine\'s verified inputs, and ROUND-TRIP passes against that engine', () => {
  if (capturingEngineAbsent()) return; // the capturing engine is in the private archive (tests/lib/historical-source.js)
  const r = replayOnce();
  assert.equal(r.status, 'REPLAYED', r.problems.join(' | '));
  const meta = stored().meta;
  assert.deepEqual(r.verified, Object.keys(meta.inputGraph.files).sort(), 'every declared input is verified, not only the engine');
  const spec = invariant().readSpec();
  assert.deepEqual(r.replayed.sort(), spec.scenarios.filter((s) => s.source === 'golden' || s.source === 'seed').map((s) => s.name).sort());
  assert.equal(r.skipped.length, spec.scenarios.filter((s) => s.source === 'targeted').length, 'the targeted scenarios are named as not replayed');
  assert.ok(r.loaded.length > 0 && r.loaded.every((f) => r.verified.includes(f) || /historical-replay\.js$/.test(f)), 'the child loaded only verified inputs: ' + r.loaded.join(', '));
  assert.ok(r.loaded.includes('src/engine.js') && r.loaded.includes('tests/lib/scenario-generator.js'), 'the historical engine and generator ran');
  const verdict = invariant().run(stored(), { raw: r.raw });
  assert.equal(verdict.ok, true, invariant().report(verdict, 'the control against its capturing engine'));
});

test('question 10 (A): a stored result altered after capture fails ROUND-TRIP against the capturing engine', () => {
  if (capturingEngineAbsent()) return; // the capturing engine is in the private archive (tests/lib/historical-source.js)
  const r = replayOnce();
  assert.equal(r.status, 'REPLAYED', r.problems.join(' | '));
  const tampered = stored();
  const entry = tampered.entries.find((e) => e.name === 'golden:baseline');
  assert.equal(typeof entry.result.rows[1].total, 'number', 'premise: the altered leaf is a plain number');
  entry.result.rows[1].total += 0.01;
  const verdict = invariant().run(tampered, { raw: r.raw });
  const roundTrip = verdict.checks.find((c) => c.id === 'ROUND-TRIP');
  assert.equal(verdict.ok, false);
  assert.ok(roundTrip.problems.some((p) => p.includes('golden:baseline') && p.includes('rows[1].total')), roundTrip.problems.join('\n'));
});

test('question 10 (A): an input that is not the capturing engine\'s -- the engine, the rules or a bundled module -- is a provenance mismatch, and nothing runs', () => {
  if (capturingEngineAbsent()) return; // the capturing engine is in the private archive (tests/lib/historical-source.js)
  for (const file of ['src/engine.js', 'src/app-shell.html', 'src/debt-arm.js']) {
    const tree = copyTree(verifiedTree(), scratchDir('altered'));
    fs.appendFileSync(path.join(tree, file), '\n');
    const r = tool().replay(stored(), { referenceTree: tree });
    assert.equal(r.status, 'PROVENANCE_MISMATCH', file + ': ' + r.problems.join(' | '));
    assert.ok(r.problems.some((p) => p.includes(file)), file + ' is named');
    assert.equal(r.raw, null, file + ': nothing ran');
    assert.equal(r.runtime, null, file + ': no child process ran');
  }
});

test('question 10 (A): a capture that names a different engine is a provenance mismatch, never replayed', () => {
  if (capturingEngineAbsent()) return; // the capturing engine is in the private archive (tests/lib/historical-source.js)
  const current = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'src', 'engine.js'))).digest('hex');
  const claimsToday = stored();
  assert.notEqual(claimsToday.meta.inputGraph.files['src/engine.js'], current, 'premise: today\'s engine is not the capturing one');
  claimsToday.meta.inputGraph.files['src/engine.js'] = current;
  const r = tool().replay(claimsToday, { referenceTree: verifiedTree() });
  assert.equal(r.status, 'PROVENANCE_MISMATCH', r.problems.join(' | '));
  assert.ok(r.problems.some((p) => p.includes('src/engine.js')));

  const otherCommit = stored();
  if (gitAvailable()) {
    otherCommit.meta.gitCommit = spawnSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    const other = tool().replay(otherCommit);
    assert.equal(other.status, 'PROVENANCE_MISMATCH', 'HEAD\'s inputs are not the capture\'s: ' + other.problems.join(' | '));
  } else {
    otherCommit.meta.gitCommit = 'f'.repeat(40);
    assert.equal(tool().replay(otherCommit).status, 'BLOCKED', 'without git objects a different commit cannot be read at all');
  }
});

test('question 10 (A): with the capturing engine unavailable the replay is BLOCKED -- never passed, never today\'s engine in its place', () => {
  const missing = stored();
  missing.meta.gitCommit = '0'.repeat(40);
  const r = tool().replay(missing);
  assert.equal(r.status, 'BLOCKED', r.problems.join(' | '));
  assert.equal(r.raw, null);
  assert.ok(r.problems.some((p) => p.includes('not available') && p.includes('0'.repeat(40))), r.problems.join(' | '));

  const archive = scratchDir('archive-without-tree');
  fs.mkdirSync(archive, { recursive: true });
  const noSource = tool().replay(stored(), { git: false, repo: archive });
  assert.equal(noSource.status, 'BLOCKED', 'a source archive with no reference tree: ' + noSource.problems.join(' | '));
  assert.equal(noSource.raw, null);

  const named = tool().replay(stored(), { referenceTree: path.join(archive, 'no-such-tree') });
  assert.equal(named.status, 'BLOCKED', 'a named reference tree that does not exist');
});

test('question 10 (A): a runtime other than the capture\'s qualified one is UNQUALIFIED, and nothing runs', () => {
  const recorded = stored().meta.inputGraph.runtime.node;
  for (const runtime of [{ node: 'v24.19.0', platform: 'win32' }, { node: recorded, platform: 'darwin' }]) {
    const r = tool().replay(stored(), { runtime });
    assert.equal(r.status, 'UNQUALIFIED', JSON.stringify(runtime) + ': ' + r.problems.join(' | '));
    assert.equal(r.raw, null);
    assert.equal(r.source, null, 'no source was even read');
  }
});

test('question 10 (A): a source archive without git objects replays from a verified reference-trees/<commit> directory, with results identical to the git-object replay', () => {
  if (capturingEngineAbsent()) return; // the capturing engine is in the private archive (tests/lib/historical-source.js)
  const r = replayOnce();
  assert.equal(r.status, 'REPLAYED', r.problems.join(' | '));
  const archive = scratchDir('archive');
  copyTree(verifiedTree(), path.join(archive, 'reference-trees', stored().meta.gitCommit));
  const fromTree = tool().replay(stored(), { git: false, repo: archive });
  assert.equal(fromTree.status, 'REPLAYED', fromTree.problems.join(' | '));
  assert.match(fromTree.source, /^reference tree /);
  assert.deepStrictEqual(fromTree.raw, r.raw, 'two replays, from two sources, give identical results');
});

function candidateOf(change) {
  const c = stored();
  change(c);
  return c;
}
const baselineTotal = (snap) => snap.entries.find((e) => e.name === 'golden:baseline').result.rows[1];

test('question 10 (A): a candidate difference declared exactly, path and values, is accepted; any other movement is not', () => {
  const { compareSnapshots, matchPrediction } = harness();
  const before = baselineTotal(stored()).total;
  const moved = candidateOf((c) => { baselineTotal(c).total = before - 52.5; });
  const { differences } = compareSnapshots(stored(), moved);
  assert.equal(differences.length, 1, 'premise: one leaf moved');
  const declared = { kind: 'VALUE', scenario: 'golden:baseline', path: 'rows[1].total', reference: before, candidate: before - 52.5 };

  assert.equal(matchPrediction(differences, { formatVersion: 1, differences: [declared] }).ok, true, 'declared exactly: accepted');
  assert.equal(matchPrediction([], { formatVersion: 1, differences: [] }).ok, true, 'nothing declared, nothing moved: accepted');

  const wrongValue = matchPrediction(differences, { formatVersion: 1, differences: [Object.assign({}, declared, { candidate: before - 50 })] });
  assert.equal(wrongValue.ok, false, 'the right path with another value is not the declared change');
  assert.equal(wrongValue.unpredicted.length, 1);

  const twoMoved = candidateOf((c) => { baselineTotal(c).total = before - 52.5; baselineTotal(c).taxes += 1; });
  const extra = matchPrediction(compareSnapshots(stored(), twoMoved).differences, { formatVersion: 1, differences: [declared] });
  assert.equal(extra.ok, false, 'an undeclared second movement fails');
  assert.deepEqual(extra.unpredicted.map((d) => d.path), ['rows[1].taxes']);

  const notFound = matchPrediction([], { formatVersion: 1, differences: [declared] });
  assert.equal(notFound.ok, false, 'a declared change that did not happen fails');
  assert.equal(notFound.unmatched.length, 1);

  const unknown = matchPrediction([], { formatVersion: 1, differences: [{ kind: 'UNKNOWN', scenario: 'golden:baseline', path: 'rows' }] });
  assert.equal(unknown.ok, false, 'an UNKNOWN outcome is never approvable');
  assert.equal(matchPrediction(differences, { differences: [declared] }).ok, false, 'a prediction without its format is refused');
});

test('question 10 (A): a passing historical replay approves no candidate, and the harness judges a comparison against a written prediction', () => {
  if (capturingEngineAbsent()) return; // the capturing engine is in the private archive (tests/lib/historical-source.js)
  const r = replayOnce();
  assert.equal(r.status, 'REPLAYED', r.problems.join(' | '));
  assert.equal(invariant().run(stored(), { raw: r.raw }).ok, true, 'premise: historical integrity holds');
  const { compareSnapshots, matchPrediction, judgePrediction, predictionExit } = harness();
  const before = baselineTotal(stored()).total;
  const moved = candidateOf((c) => { baselineTotal(c).total = before + 1; });
  const differences = compareSnapshots(stored(), moved).differences;
  assert.equal(matchPrediction(differences, { formatVersion: 1, differences: [] }).ok, false, 'an undeclared candidate movement fails however the replay went');

  const declared = { kind: 'VALUE', scenario: 'golden:baseline', path: 'rows[1].total', reference: before, candidate: before + 1 };
  const asPredicted = { verdict: 'DIFFERENT', differences };
  asPredicted.prediction = judgePrediction(asPredicted, { formatVersion: 1, differences: [declared] }, 'prediction.json');
  assert.equal(asPredicted.prediction.ok, true);
  assert.equal(predictionExit(asPredicted), 0);
  const notPredicted = { verdict: 'DIFFERENT', differences };
  notPredicted.prediction = judgePrediction(notPredicted, { formatVersion: 1, differences: [] }, 'prediction.json');
  assert.equal(predictionExit(notPredicted), 1);
  const refused = { verdict: 'REFUSED', differences: [] };
  refused.prediction = judgePrediction(refused, { formatVersion: 1, differences: [] }, 'prediction.json');
  assert.equal(refused.prediction.ok, false, 'a refused comparison is never as predicted');
  assert.equal(predictionExit(refused), 2);
});
