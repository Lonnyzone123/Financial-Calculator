'use strict';

/*
 * S4 task 3.6a -- every stored baseline is listed, with a status that matches
 * what the capture tool actually does with it.
 *
 * Eight stored baselines are format 1 and cannot be re-verified against a
 * current capture: diffSnapshots() refuses the cross-format diff, on purpose
 * (Q28). The task's answer is to MARK them historical and say so, not to widen
 * the format gate. tools/baseline-registry.json says so; this file keeps the
 * saying true.
 *
 * The registry is hand-written, so it is checked three ways it does not
 * control: against the directory (no stored baseline unlisted, no listing
 * without a file), against each file's own contents (format and entry count),
 * and against BEHAVIOUR -- each status is defined by what the tool does with
 * such a file, and each file is put through exactly that.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const baseline = require('../tools/capture-baseline.js');
const REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'baseline-registry.json'), 'utf8'));

const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const CURRENT = 'tools/baseline-20260911-after-CR2-closure.json';

test('3.6a: every stored baseline in tools/ is listed exactly once, and every listing names a real file', () => {
  const onDisk = fs.readdirSync(path.join(ROOT, 'tools'))
    .filter((n) => /^baseline-.*\.json$/.test(n) && n !== 'baseline-registry.json')
    .map((n) => 'tools/' + n)
    .sort();
  const listed = REGISTRY.baselines.map((b) => b.file);
  const duplicates = listed.filter((f, i) => listed.indexOf(f) !== i);
  assert.deepEqual(duplicates, [], 'listed twice');
  assert.deepEqual(onDisk.filter((f) => !listed.includes(f)), [], 'stored baselines with no registry entry');
  assert.deepEqual(listed.filter((f) => !onDisk.includes(f)), [], 'registry entries with no file');
});

test('3.6a: each entry states its file\'s real format and entry count, and a status the registry defines', () => {
  const wrong = [];
  for (const b of REGISTRY.baselines) {
    const snap = read(b.file);
    const encoding = baseline.encodingOf(snap);
    if (encoding.kind !== 'supported' || encoding.version !== b.format) wrong.push(`${b.file}: format ${b.format} listed, the file is ${JSON.stringify(encoding)}`);
    if (snap.entries.length !== b.entries) wrong.push(`${b.file}: ${b.entries} entries listed, the file holds ${snap.entries.length}`);
    if (!Object.prototype.hasOwnProperty.call(REGISTRY.statuses, b.status)) wrong.push(`${b.file}: status "${b.status}" is not defined`);
  }
  assert.deepEqual(wrong, []);
});

test('3.6a: every stored baseline still verifies clean -- re-verified, not assumed', () => {
  const problems = REGISTRY.baselines
    .map((b) => [b.file, baseline.verifyIntegrity(read(b.file))])
    .filter(([, p]) => p.length)
    .map(([f, p]) => `${f}: ${p.map((x) => x.kind + ' ' + x.name).join(', ')}`);
  assert.deepEqual(problems, []);
});

test('3.6a: each status holds by behaviour -- what the tool does with the file is what the status says', () => {
  const current = read(CURRENT);
  assert.equal(REGISTRY.baselines.find((b) => b.file === CURRENT).status, 'baseline', 'the control file must itself be a baseline');
  const wrong = [];
  for (const b of REGISTRY.baselines) {
    const snap = read(b.file);
    const completeness = baseline.completenessOf(snap).kind;
    const attempt = (fn) => { try { return { value: fn() }; } catch (e) { return { error: String(e.message) }; } };
    if (b.status === 'historical' || b.status === 'superseded-format') {
      const r = attempt(() => baseline.diffSnapshots(snap, current));
      if (!r.error || !/refusing to diff format \d against format 3/.test(r.error)) wrong.push(`${b.file}: status ${b.status} says a current capture refuses it, but the diff ${r.error ? 'threw ' + r.error.split('\n')[0] : 'ran'}`);
      if (b.status === 'historical' && b.format !== 1) wrong.push(`${b.file}: historical is format 1 by definition`);
      if (b.status === 'superseded-format' && b.format !== 2) wrong.push(`${b.file}: superseded-format is format 2 by definition`);
    } else if (b.status === 'current-format-completeness-unknown') {
      if (completeness !== 'unknown') wrong.push(`${b.file}: completeness is ${completeness}, not unknown`);
      const r = attempt(() => baseline.diffSnapshots(snap, snap));
      if (!r.error || !/completeness is UNKNOWN/.test(r.error)) wrong.push(`${b.file}: an empty diff against it must be refused as unverified`);
    } else if (b.status === 'baseline') {
      if (completeness !== 'complete') wrong.push(`${b.file}: completeness is ${completeness}, not complete`);
      if (!snap.meta || typeof snap.meta.corpusInputHash !== 'string' || typeof snap.meta.gitCommit !== 'string') wrong.push(`${b.file}: a baseline records its corpus-input hash and commit`);
      const r = attempt(() => baseline.diffSnapshots(snap, snap));
      if (r.error || r.value.length !== 0) wrong.push(`${b.file}: diffing a baseline with itself must be the ordinary empty pass`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('3.6a: the historical files really are the eight format-1 captures the checklist names', () => {
  const historical = REGISTRY.baselines.filter((b) => b.status === 'historical');
  assert.equal(historical.length, 8, 'S4 task 3.6a counts eight format-1 baselines');
  for (const b of historical) {
    const meta = read(b.file).meta || {};
    assert.equal(Object.prototype.hasOwnProperty.call(meta, 'formatVersion'), false, `${b.file}: format 1 is the format that declares no version`);
  }
});
