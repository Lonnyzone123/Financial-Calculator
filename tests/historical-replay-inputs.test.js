'use strict';

/*
 * Question 10 (A), decided by the owner on 2026-09-16, its acceptance case left untested until R10: changed scenario inputs. The
 * first external audit (section 8, item 5) asked to test "changed inputs", and the repair round's review repeated it. The
 * replay proves it ran the control's own inputs by fingerprinting each plan the historical libraries build against the
 * reviewed corpus spec; nothing exercised that check. Here the spec's reviewed fingerprint for one golden and one seeded
 * scenario is altered, and separately removed: the replay must stop as a provenance mismatch naming each scenario, with no
 * raw results handed to ROUND-TRIP.
 *
 * Added in R10 on the owner's answer 1 (A) of the fourth set. Qualified only on the capture's runtime (Windows, Node 24.17.0), as
 * every replay test.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { capturingEngineAbsent } = require('./lib/historical-source.js');
const tool = () => require('../tools/historical-replay.js');
const stored = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'baseline-20260914-s5-control.json'), 'utf8'));
const spec = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'corpus-spec.json'), 'utf8'));

test('question 10 (A): a replay whose plan inputs differ from the reviewed fingerprints is a provenance mismatch naming each scenario, and hands ROUND-TRIP nothing', () => {
  if (capturingEngineAbsent()) return; // the capturing engine is in the private archive (tests/lib/historical-source.js)
  const altered = spec();
  const golden = altered.scenarios.find((s) => s.source === 'golden');
  const seeded = altered.scenarios.find((s) => s.source === 'seed');
  golden.inputFingerprint = '0'.repeat(64);
  seeded.inputFingerprint = 'f'.repeat(64);
  const r = tool().replay(stored(), { spec: altered });
  assert.equal(r.status, 'PROVENANCE_MISMATCH', r.problems.join(' | '));
  assert.ok(r.problems.some((p) => p.startsWith(golden.name + ': ')), 'names ' + golden.name + ': ' + r.problems.join(' | '));
  assert.ok(r.problems.some((p) => p.startsWith(seeded.name + ': ')), 'names ' + seeded.name);
  assert.equal(r.raw, null, 'no raw results');
});

test('question 10 (A): a spec scenario with no reviewed fingerprint is a provenance mismatch, never replayed on trust', () => {
  if (capturingEngineAbsent()) return; // the capturing engine is in the private archive (tests/lib/historical-source.js)
  const altered = spec();
  const golden = altered.scenarios.find((s) => s.source === 'golden');
  delete golden.inputFingerprint;
  const r = tool().replay(stored(), { spec: altered });
  assert.equal(r.status, 'PROVENANCE_MISMATCH', r.problems.join(' | '));
  assert.ok(r.problems.some((p) => p.startsWith(golden.name + ': ') && /no reviewed input fingerprint/.test(p)), r.problems.join(' | '));
  assert.equal(r.raw, null);
});
