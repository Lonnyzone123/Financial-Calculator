'use strict';

/*
 * Question 10 (A), the archive-only path (the 2026-09-16 handover review, section 2, item 7): a source package has no git
 * objects, so control test 4.7's historical replay needs the capturing commit's inputs from somewhere verifiable. The S5
 * control's are committed at reference-trees/<full commit>/, each file verified against the sha256 the capture recorded
 * when it was taken. These tests run WITHOUT git: they pass in a clone and in an extracted package alike.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { capturingEngineAbsent } = require('./lib/historical-source.js');
const stored = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'baseline-20260914-s5-control.json'), 'utf8'));

function filesUnder(dir) {
  const out = [];
  const walk = (d, rel) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(path.join(d, e.name), r); else out.push(r);
  });
  if (fs.existsSync(dir)) walk(dir, '');
  return out.sort();
}

test('control: the S5 control capture names its commit and records its inputs', () => {
  const meta = stored().meta;
  assert.match(meta.gitCommit, /^[0-9a-f]{40}$/);
  assert.ok(Object.keys(meta.inputGraph.files).length > 0);
});

test('question 10 (A): the committed reference tree holds exactly the control capture\'s declared inputs, and nothing hides it from a package', () => {
  if (capturingEngineAbsent()) return; // the capturing engine is in the private archive (tests/lib/historical-source.js)
  const meta = stored().meta;
  assert.deepEqual(filesUnder(path.join(ROOT, 'reference-trees', meta.gitCommit)), Object.keys(meta.inputGraph.files).sort());
  const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
  assert.equal(ignore.some((l) => l && !l.startsWith('#') && /^\/?reference-trees\/?/.test(l)), false, '.gitignore must not ignore reference-trees/');
});

test('question 10 (A): without git objects, the control replays from the committed reference tree and passes ROUND-TRIP against it', () => {
  if (capturingEngineAbsent()) return; // the capturing engine is in the private archive (tests/lib/historical-source.js)
  const { replay } = require('../tools/historical-replay.js');
  const invariant = require('../tools/corpus-invariant.js');
  const snapshot = stored();
  const r = replay(snapshot, { git: false });
  assert.equal(r.status, 'REPLAYED', r.problems.join(' | '));
  assert.match(r.source, /^reference tree .*reference-trees[\\/]+[0-9a-f]{40}$/);
  assert.equal(r.verified.length, Object.keys(snapshot.meta.inputGraph.files).length, 'every declared input verified');
  const verdict = invariant.run(snapshot, { raw: r.raw });
  assert.equal(verdict.ok, true, invariant.report(verdict, 'the control against its committed reference tree'));
});
