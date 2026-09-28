'use strict';

/*
 * S4 task 4.7 (S4-PA-03) -- an immutable control corpus, so corpus growth
 * cannot hide an output change.
 *
 * Tasks 1, 4 and 5 all change what the corpus contains, while ground rule 9
 * forbids output movement and S3-01 refuses a comparison across different
 * inputs. This file witnesses the mechanism that lets both hold:
 *
 *   - a capture records EACH scenario's plan hash (meta.inputHashes), so a
 *     refused comparison can say which scenarios differ and how;
 *   - compareInputs() tells an EXPANSION (scenarios added, shared ones
 *     unchanged) from an INCOMPATIBILITY (a name now meaning a different plan);
 *   - neither verdict lifts diffSnapshots()'s refusal: a regression comparison
 *     is valid only once both engines have run the same inputs.
 *
 * Every acceptance item of 4.7 is a test here, each with its control. Where a
 * witness needs a SECOND ENGINE, it wraps engine.runPlan in-process for the
 * candidate capture and restores it; where it needs a changed generator, it
 * wraps generateScenario the same way. Both are restored in finally.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const { capturingEngineAbsent } = require('./lib/historical-source.js');
const CLI = path.join(ROOT, 'tools', 'capture-baseline.js');
const baseline = require('../tools/capture-baseline.js');

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'control-corpus-'));
test.after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));
let counter = 0;
const write = (snap, label) => {
  const f = path.join(SCRATCH, (label || 'snap') + '-' + (++counter) + '.json');
  fs.writeFileSync(f, JSON.stringify(snap, null, 2));
  return f;
};
const clone = (v) => JSON.parse(JSON.stringify(v));

/* The control capture, taken once. */
let control = null;
const controlCapture = () => (control || (control = baseline.capture()));

function withGenerator(change, fn) {
  const generator = require('./lib/scenario-generator.js');
  const original = generator.generateScenario;
  generator.generateScenario = (d, seed) => { const p = original(d, seed); change(p, seed); return p; };
  try { return fn(); } finally { generator.generateScenario = original; }
}

function withEngine(change, fn) {
  const engine = require('../src/engine.js');
  const original = engine.runPlan;
  engine.runPlan = (p) => { const r = original(p); change(r, p); return r; };
  try { return fn(); } finally { engine.runPlan = original; }
}

test('4.7: a capture records every scenario\'s plan hash, one per entry, agreeing with the corpus', () => {
  const snap = controlCapture();
  const hashes = snap.meta.inputHashes;
  assert.deepEqual(Object.keys(hashes).sort(), snap.entries.map((e) => e.name).sort());
  const byName = new Map(baseline.corpus().map(({ name, plan }) => [name, baseline.hashOf(plan)]));
  for (const [name, hash] of Object.entries(hashes)) {
    assert.match(hash, /^[0-9a-f]{64}$/, name);
    assert.equal(hash, byName.get(name), name + ': the recorded hash must be the hash of that scenario\'s plan');
  }
  // Control: the whole-corpus hash is unchanged by the new field.
  assert.equal(snap.meta.corpusInputHash, baseline.corpusInputHash(baseline.corpus()));
});

test('4.7: two captures of an unchanged corpus compare as SAME, and diff as the ordinary empty pass', () => {
  const a = controlCapture();
  const b = baseline.capture();
  const verdict = baseline.compareInputs(a, b);
  assert.equal(verdict.kind, 'same');
  assert.equal(verdict.same.length, a.entries.length);
  assert.deepEqual(baseline.diffSnapshots(a, b), []);
});

test('4.7: an ordinary financial output change FAILS on the control corpus', () => {
  const reference = controlCapture();
  const candidate = withEngine((r, p) => { if (p.id === 'generated-4' && r.rows && r.rows[1]) r.rows[1].taxes += 1; }, () => baseline.capture());
  assert.equal(baseline.compareInputs(reference, candidate).kind, 'same', 'premise: the same inputs');
  const diff = baseline.diffSnapshots(reference, candidate);
  assert.equal(diff.length, 1, 'exactly the perturbed scenario must be reported');
  assert.equal(diff[0].scenario, 'seed:4');
  assert.deepEqual(diff[0].diffs.map((d) => d.path), ['rows.1.taxes']);
});

test('4.7: a newly added scenario shows as a corpus EXPANSION -- and the regression diff is still refused', () => {
  const reference = controlCapture();
  /* A capture cannot yet be taken over an expanded corpus -- nothing has been
     added -- so the candidate is the real capture plus one entry, with the
     metadata a real expanded capture would carry: its own input hash and a
     different corpus-input hash. */
  const candidate = clone(reference);
  const extra = clone(candidate.entries[0]);
  extra.name = 'targeted:s4-expansion-probe';
  candidate.entries.push(extra);
  candidate.meta.inputHashes[extra.name] = baseline.hashOf({ probe: 'a plan no reference scenario has' });
  candidate.meta.corpusInputHash = baseline.hashOf({ expanded: true });
  candidate.meta.entryCount = candidate.entries.length;
  candidate.meta.hash = baseline.hashOf(candidate.entries.map((e) => [e.name, e.hash]));

  const verdict = baseline.compareInputs(reference, candidate);
  assert.equal(verdict.kind, 'expansion', verdict.label);
  assert.deepEqual(verdict.added, ['targeted:s4-expansion-probe']);
  assert.deepEqual(verdict.changed, []);
  assert.throws(() => baseline.diffSnapshots(reference, candidate), /DIFFERENT corpus inputs/,
    'an expansion explains the refusal; it does not lift it');

  // The other directions are named for what they are.
  assert.equal(baseline.compareInputs(candidate, reference).kind, 'reduction');
  const recomposed = clone(candidate);
  const dropped = recomposed.entries.shift();
  delete recomposed.meta.inputHashes[dropped.name];
  assert.equal(baseline.compareInputs(reference, recomposed).kind, 'recomposed');
});

test('4.7: a changed generator input is an INCOMPATIBILITY naming the scenario -- by the API and the CLI', () => {
  const reference = controlCapture();
  const candidate = withGenerator((p, seed) => { if (seed === 7) p.profile.endAge -= 1; }, () => baseline.capture());
  const verdict = baseline.compareInputs(reference, candidate);
  assert.equal(verdict.kind, 'incompatible', verdict.label);
  assert.deepEqual(verdict.changed, ['seed:7']);
  assert.deepEqual(verdict.added, []);
  assert.throws(() => baseline.diffSnapshots(reference, candidate), /DIFFERENT corpus inputs/);

  const r = spawnSync(process.execPath, [CLI, 'compare-inputs', write(reference, 'reference'), write(candidate, 'candidate')], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^INPUTS INCOMPATIBLE/m);
  assert.match(r.stdout, /^  changed seed:7$/m);
  assert.match(r.stdout, /never lifts one/);

  const same = spawnSync(process.execPath, [CLI, 'compare-inputs', write(reference, 'reference'), write(reference, 'again')], { encoding: 'utf8' });
  assert.equal(same.status, 0, 'control: identical inputs exit 0');
  assert.match(same.stdout, /^INPUTS SAME/m);
});

test('4.7: a reference/candidate comparison is valid only after BOTH engines ran the same new inputs', () => {
  const change = (p, seed) => { if (seed === 7) p.profile.endAge -= 1; };
  const control = controlCapture();
  const reference = withGenerator(change, () => baseline.capture());
  const candidate = withGenerator(change, () => withEngine((r, p) => {
    if (p.id === 'generated-7' && r.rows && r.rows[2]) r.rows[2].taxes += 1;
  }, () => baseline.capture()));

  assert.equal(baseline.compareInputs(reference, candidate).kind, 'same', 'both engines ran the same new inputs');
  const diff = baseline.diffSnapshots(reference, candidate);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].scenario, 'seed:7');
  assert.deepEqual(diff[0].diffs.map((d) => d.path), ['rows.2.taxes'], 'the valid comparison shows the engine change and nothing else');
  assert.throws(() => baseline.diffSnapshots(control, candidate), /DIFFERENT corpus inputs/,
    'the candidate on NEW inputs is never compared with the control on OLD ones');
});

test('4.7: a formatting or metadata change is never accepted as cover for a changed financial value', () => {
  const reference = controlCapture();

  // Formatting and metadata alone: re-indented, a note rewritten -- no difference, integrity clean.
  const reformatted = JSON.parse(fs.readFileSync(write(reference, 'r'), 'utf8'));
  reformatted.meta.note = 'rewritten';
  const compact = path.join(SCRATCH, 'compact-' + (++counter) + '.json');
  fs.writeFileSync(compact, JSON.stringify(reformatted));
  const reread = JSON.parse(fs.readFileSync(compact, 'utf8'));
  assert.deepEqual(baseline.verifyIntegrity(reread), []);
  assert.deepEqual(baseline.diffSnapshots(reference, reread), [], 'control: formatting and a note are not a difference');

  // The same cosmetic changes WITH a moved value, hashes rewritten to agree: still reported.
  const covered = clone(reread);
  const entry = covered.entries.find((e) => e.name === 'golden:baseline');
  entry.result.rows[2].total += 0.01;
  entry.hash = baseline.hashForFormat(entry.result, 3);
  covered.meta.hash = baseline.hashOf(covered.entries.map((e) => [e.name, e.hash]));
  covered.meta.note = 'nothing to see here';
  assert.deepEqual(baseline.verifyIntegrity(covered), [], 'premise: the file describes itself');
  const diff = baseline.diffSnapshots(reference, covered);
  assert.equal(diff.length, 1);
  assert.deepEqual(diff[0].diffs.map((d) => d.path), ['rows.2.total']);
});

test('4.7: a capture without per-scenario input hashes is UNKNOWN, never same -- and a malformed record is not trusted', () => {
  const fresh = controlCapture();
  const stored = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'baseline-20260911-after-CR2-closure.json'), 'utf8'));
  const old = baseline.compareInputs(stored, fresh);
  assert.equal(old.kind, 'unknown');
  assert.match(old.label, /reference records no per-scenario input hashes/);

  const cases = [
    ['not a map', (s) => { s.meta.inputHashes = ['x']; }, /not a name-to-hash map/],
    ['a malformed hash', (s) => { s.meta.inputHashes['golden:baseline'] = 'abc'; }, /malformed input hash/],
    ['an entry without a hash', (s) => { delete s.meta.inputHashes['seed:3']; }, /1 entry without one/],
    ['a hash naming no entry', (s) => { s.meta.inputHashes['seed:99'] = 'a'.repeat(64); }, /1 naming no entry/],
  ];
  for (const [label, mutate, pattern] of cases) {
    const s = clone(fresh);
    mutate(s);
    const verdict = baseline.compareInputs(fresh, s);
    assert.equal(verdict.kind, 'unknown', label);
    assert.match(verdict.label, pattern, label);
  }
});

// ---------------------------------------------------------------------------
// The control corpus itself -- recorded, reproducible, and immutable
// ---------------------------------------------------------------------------

const CONTROL = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'control-corpus.json'), 'utf8'));
const controlFile = () => path.join(ROOT, CONTROL.controlCapture.file);

test('4.7: the control record agrees with every piece of evidence it cites', () => {
  for (const e of CONTROL.evidence.filter((x) => /^tools\//.test(x.source))) {
    const stored = JSON.parse(fs.readFileSync(path.join(ROOT, e.source), 'utf8'));
    assert.equal(stored.meta.corpusInputHash, CONTROL.corpusInputHash, e.source + ': corpus-input hash');
    assert.equal(stored.meta.hash, CONTROL.outputHash, e.source + ': output hash');
    assert.equal(String(stored.meta.gitCommit).slice(0, e.commit.length), e.commit, e.source + ': commit');
  }
  const snap = JSON.parse(fs.readFileSync(controlFile(), 'utf8'));
  assert.deepEqual(baseline.verifyIntegrity(snap), []);
  assert.equal(baseline.completenessOf(snap).kind, 'complete');
  assert.equal(snap.meta.corpusInputHash, CONTROL.corpusInputHash);
  assert.equal(snap.meta.hash, CONTROL.outputHash);
  assert.equal(snap.entries.length, CONTROL.entryCount);
  assert.deepEqual(snap.meta.composition, CONTROL.composition);
  assert.equal(String(snap.meta.gitCommit).slice(0, CONTROL.controlCapture.commit.length), CONTROL.controlCapture.commit);
  assert.equal(Object.keys(snap.meta.inputHashes).length, CONTROL.entryCount, 'the control capture carries per-scenario input identity');
});

test('4.7: the control capture is immutable -- its bytes are pinned by the record', () => {
  const sha = require('node:crypto').createHash('sha256').update(fs.readFileSync(controlFile())).digest('hex');
  assert.equal(sha, CONTROL.controlCapture.sha256,
    CONTROL.controlCapture.file + ' changed. Old captures remain: take a NEW capture beside it, never rewrite this one.');
});

test('4.7: the live corpus still reproduces the control inputs, scenario by scenario', () => {
  assert.equal(baseline.corpusInputHash(baseline.corpus()), CONTROL.corpusInputHash,
    'the corpus no longer reproduces the control inputs. Additions belong under NEW names; a changed ' +
    'generator or fixture is a versioned change with its own record, never an edit to the control corpus.');
  const snap = JSON.parse(fs.readFileSync(controlFile(), 'utf8'));
  const verdict = baseline.compareInputs(snap, controlCapture());
  assert.equal(verdict.kind, 'same', verdict.label);
});

/* Question 10 (A), decided by the owner on 2026-09-16. This test ran the invariant with its default raw results, which
   re-ran TODAY's engine on the stored control: one check answering two questions, so every approved output change
   failed here as damage would. The stored control is now held to the engine that captured it (historical
   integrity), and today's engine to tools/control-candidate-prediction.json (candidate movement), in separate tests.
   A replay that is BLOCKED or UNQUALIFIED fails: it is never counted as passed. */
test('4.7: the control capture passes the independent corpus invariant, its ROUND-TRIP replayed by the engine that captured it', () => {
  if (capturingEngineAbsent()) return; // the capturing engine is in the private archive (tests/lib/historical-source.js)
  const invariant = require('../tools/corpus-invariant.js');
  const { replay } = require('../tools/historical-replay.js');
  const snapshot = invariant.readSnapshot(controlFile());
  const replayed = replay(snapshot);
  assert.equal(replayed.status, 'REPLAYED', 'historical integrity was not established, and is not counted as passed: ' + replayed.problems.join(' | '));
  assert.equal(replayed.commit.slice(0, CONTROL.controlCapture.commit.length), CONTROL.controlCapture.commit);
  const result = invariant.run(snapshot, { raw: replayed.raw });
  assert.equal(result.ok, true, invariant.report(result, CONTROL.controlCapture.file + ' against its capturing engine'));
});

test('4.7: today\'s engine moves the control only as tools/control-candidate-prediction.json declares, difference by difference', () => {
  const harness = require('../tools/differential-harness.js');
  const stored = JSON.parse(fs.readFileSync(controlFile(), 'utf8'));
  const live = JSON.parse(fs.readFileSync(write(controlCapture(), 'live-control'), 'utf8'));
  assert.deepEqual(harness.refusalsFor(stored, live), [], 'today\'s capture must have run the control inputs');
  const prediction = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'control-candidate-prediction.json'), 'utf8'));
  const match = harness.matchPrediction(harness.compareSnapshots(stored, live).differences, prediction);
  assert.equal(match.ok, true, JSON.stringify({ problems: match.problems, undeclared: match.unpredicted.slice(0, 5), notFound: match.unmatched.slice(0, 5), found: match.found }, null, 1));
});

test('4.7: today\'s capture of the control corpus passes the independent corpus invariant on its own', () => {
  const invariant = require('../tools/corpus-invariant.js');
  const result = invariant.run(invariant.readSnapshot(write(controlCapture(), 'live-control')));
  assert.equal(result.ok, true, invariant.report(result, 'today\'s capture of the control corpus'));
});
