'use strict';

/*
 * Q2 (A), decided by the owner on 2026-09-16 (S5 task 6.10), its acceptance case left untested until R10: inconsistent contract-
 * version claims. The first external audit (section 8) asked for tests of "inconsistent version claims", and the repair
 * round's review added: "Explicit conflicting metadata must fail; a current producer cannot evade v3 by claiming v2."
 *
 * Measured on arrival at 52833d6: a capture recording resultContractVersion 2 was taken at its word whatever its provenance,
 * and SHAPE ignored row keys the claimed version does not define, so rows carrying the five version-3 measures passed as a
 * version-2 capture. Repaired in R10b1 (provisional, the run's call under rule 7 (A) within the owner's answer 1 (A) of the fourth
 * set): a version older than the producer's is legacy-only, accepted when the capture is a known legacy capture of that
 * version; and SHAPE reports every key the capture's version does not define.
 *
 * The captures are the stored S5 control (a genuine legacy capture) and copies of it whose metadata or rows are altered, so
 * each case's expectation is the claim's consistency, not a figure.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MEASURES = ['federalAgi', 'ssProvisionalIncome', 'seniorDeductionMagi', 'niitMagi', 'irmaaMagi'];
const contract = () => require('../tools/result-contract.js');
const invariant = () => require('../tools/corpus-invariant.js');
const stored = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'baseline-20260914-s5-control.json'), 'utf8'));
const shapeOf = (decoded, meta) => invariant().checkShape(decoded, invariant().readSpec(), new Map(), meta);
const decodedOf = (capture) => invariant().decodeEntries(capture).decoded;
const withMeasures = (decoded) => { decoded.forEach((e) => { if (e.result && Array.isArray(e.result.rows)) e.result.rows.forEach((r) => { MEASURES.forEach((k) => { r[k] = r.magi; }); }); }); return decoded; };
/* RE-FIXTURED at the R19 round: a capture claimed at the producer's version must carry every row field that version
   requires, and version 5 adds the tax ledger on per-path rows (taxSettled = taxes, nothing trued up). Monte Carlo rows
   do not carry it. */
const withProducerFields = (decoded) => { withMeasures(decoded); decoded.forEach((e) => { if (e.result && e.result.mode !== 'monteCarlo' && Array.isArray(e.result.rows)) e.result.rows.forEach((r) => { Object.assign(r, { taxSettled: r.taxes, taxTrueUpPaid: 0, taxOutstanding: 0 }); }); }); return decoded; };

test('Q2 (A): a capture that claims version 2 without being a known legacy capture has no version, and SHAPE refuses it', () => {
  const c = stored();
  const forged = Object.assign({}, c.meta, { hash: '0'.repeat(64), resultContractVersion: 2 });
  assert.equal(contract().captureContractVersion(forged), null, 'a legacy version claimed outside the legacy captures');
  const shape = shapeOf(decodedOf(c), forged);
  assert.equal(shape.problems.length, 1);
  assert.match(shape.problems[0], /cannot be judged/);
});

test('Q2 (A): rows carrying fields their claimed version does not define fail SHAPE, naming the key', () => {
  const c = stored();
  const claimsTwo = Object.assign({}, c.meta, { resultContractVersion: 2 });
  const shape = shapeOf(withMeasures(decodedOf(c)), claimsTwo);
  assert.ok(shape.problems.length > 0, 'the version-3 measures on a version-2 capture are reported');
  assert.ok(shape.problems.some((p) => /S-EXACT-KEYS at rows\[\d+\]\.federalAgi/.test(p) && /not defined/.test(p)), shape.problems.slice(0, 3).join('\n'));
});

/* RE-FIXTURED at the R12 round (R11-02): these two controls claim the PRODUCER'S version, which was 3 when they were
   written. It is 4 now, and a claim of 3 is legacy-only -- it must match a known version-3 capture -- so the producer's
   version is read from the contract rather than written as a number. */
const PRODUCER = () => contract().CONTRACT.contractVersion;
test('control, Q2 (A): a legacy capture that claims the producer\'s version fails SHAPE for the missing measures', () => {
  const c = stored();
  const shape = shapeOf(decodedOf(c), Object.assign({}, c.meta, { resultContractVersion: PRODUCER() }));
  assert.ok(shape.problems.some((p) => /S-EXACT-KEYS at rows\[0\]\.federalAgi -- required row key is missing/.test(p)), shape.problems.slice(0, 2).join('\n'));
});

test('control, Q2 (A): the legacy capture, with no claim or its own version claimed, passes SHAPE under version 2', () => {
  const c = stored();
  assert.deepEqual(shapeOf(decodedOf(c), c.meta).problems, []);
  assert.equal(contract().captureContractVersion(Object.assign({}, c.meta, { resultContractVersion: 2 })), 2);
  assert.deepEqual(shapeOf(decodedOf(c), Object.assign({}, c.meta, { resultContractVersion: 2 })).problems, []);
});

test('control, Q2 (A): rows with the five measures claimed at the producer\'s version pass SHAPE', () => {
  const c = stored();
  assert.deepEqual(shapeOf(withProducerFields(decodedOf(c)), Object.assign({}, c.meta, { resultContractVersion: PRODUCER() })).problems, []);
});

test('R12 round (R11-02): an unknown capture claiming version 3, now legacy-only, cannot be judged', () => {
  const c = stored();
  const shape = shapeOf(withMeasures(decodedOf(c)), Object.assign({}, c.meta, { resultContractVersion: 3 }));
  assert.equal(shape.problems.length, 1);
  assert.match(shape.problems[0], /cannot be judged/);
});
