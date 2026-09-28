'use strict';

/*
 * S4 task 7 -- the differential harness, proved while the answer is trivially
 * known.
 *
 * Old versus old must be empty, and that alone proves nothing: two sides that
 * load the same module, alias the same object or discard the same field agree
 * by construction (7.7). So every end-to-end case here runs each side from its
 * OWN separately staged tree, in its OWN process. Every detection is asserted
 * by scenario AND field, never as a bare "something differed", and never
 * through a crash that happens to fail. The comparator's closed set of outcomes
 * is exercised in both directions on small snapshots, where each expected
 * difference can be written down exactly.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const dh = require('../tools/differential-harness.js');

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'differential-harness-'));
process.on('exit', () => {
  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch (e) { /* best effort: a temp directory */ }
});

/* Staged trees, each captured once by its own tool in its own process. */
const trees = {};
function stagedTree(name, mutate) {
  if (trees[name]) return trees[name];
  const dir = path.join(SCRATCH, name);
  dh.stage(dir, ROOT);
  if (mutate) mutate(dir);
  trees[name] = { dir, capture: dh.captureTree(name, dir, { composition: 'control', outDir: SCRATCH }) };
  return trees[name];
}
function editOnce(dir, rel, from, to) {
  const p = path.join(dir, rel);
  const s = fs.readFileSync(p, 'utf8');
  assert.equal(s.split(from).length - 1, 1, 'CONTROL: the mutation target occurs exactly once in ' + rel);
  fs.writeFileSync(p, s.replace(from, () => to));
}
const RULES_BLOCK = /(<script type="application\/json" id="v2b-rules-2026">)([\s\S]*?)(<\/script>)/;

const reference = () => stagedTree('reference');
const secondReference = () => stagedTree('second-reference');
/* A candidate-only calculation change: one hundredth of a percent more fee. */
const engineMutant = () => stagedTree('engine-mutant', (dir) => editOnce(dir, 'src/engine.js', 'ret-=p.assumptions.fee/100;', 'ret-=p.assumptions.fee/100+1e-4;'));
/* A candidate-only embedded-rules change: the single standard deduction, $1,000 higher. */
const rulesMutant = () => stagedTree('rules-mutant', (dir) => {
  const p = path.join(dir, 'src', 'app-shell.html');
  const shell = fs.readFileSync(p, 'utf8');
  const rules = JSON.parse(shell.match(RULES_BLOCK)[2]);
  const before = rules.federal.standardDeduction.single;
  rules.federal.standardDeduction.single = before + 1000;
  fs.writeFileSync(p, shell.replace(RULES_BLOCK, (all, open, body, close) => open + '\n' + JSON.stringify(rules, null, 2) + '\n' + close));
  assert.equal(JSON.parse(fs.readFileSync(p, 'utf8').match(RULES_BLOCK)[2]).federal.standardDeduction.single, before + 1000, 'CONTROL: the rule changed');
});
const compareTrees = (a, b) => dh.compareCaptures(a.capture.file, b.capture.file, { composition: 'control', referenceTree: a.dir, candidateTree: b.dir });
const pairs = (result) => result.differences.map((d) => d.scenario + ' ' + d.path).sort();

// ---------------------------------------------------------------------------
// The comparator: the closed set of outcomes, in both directions
// ---------------------------------------------------------------------------

const snap = (entries) => ({ meta: { formatVersion: 3, complete: true, corpusInputHash: 'same' }, entries: entries.map(([name, result]) => ({ name, result })) });
const result = () => ({ status: 'ok', calculationError: false, failed: false, successRate: 100, rows: [{ age: 60, total: 1000, taxes: 0, shortfall: 0 }, { age: 61, total: 900, taxes: 10, shortfall: 0 }] });
const edited = (edit) => { const r = result(); edit(r); return r; };
const diff = (a, b) => dh.compareSnapshots(snap([['s', a]]), snap([['s', b]])).differences.map((d) => ({ kind: d.kind, path: d.path, reference: d.reference, candidate: d.candidate }));

test('7.7 comparator: identical results are empty -- the unmodified control', () => {
  assert.deepEqual(diff(result(), result()), []);
});

test('7.7 comparator: an omitted field and an extra field are each named, and swap when the direction does', () => {
  const omitted = edited((r) => { delete r.rows[0].taxes; });
  assert.deepEqual(diff(result(), omitted), [{ kind: 'MISSING_FIELD', path: 'rows[0].taxes', reference: 0, candidate: undefined }]);
  assert.deepEqual(diff(omitted, result()), [{ kind: 'EXTRA_FIELD', path: 'rows[0].taxes', reference: undefined, candidate: 0 }]);
  const extra = edited((r) => { r.rows[1].newField = 5; });
  assert.deepEqual(diff(result(), extra), [{ kind: 'EXTRA_FIELD', path: 'rows[1].newField', reference: undefined, candidate: 5 }]);
});

test('7.7 comparator: shortened rows are a LENGTH difference in both directions', () => {
  const short = edited((r) => { r.rows.pop(); });
  assert.deepEqual(diff(result(), short), [{ kind: 'LENGTH', path: 'rows', reference: 2, candidate: 1 }]);
  assert.deepEqual(diff(short, result()), [{ kind: 'LENGTH', path: 'rows', reference: 1, candidate: 2 }]);
});

test('7.7 comparator: a financial zero changed to missing, to null, or to negative zero is never the same value', () => {
  assert.deepEqual(diff(result(), edited((r) => { delete r.rows[1].shortfall; })), [{ kind: 'MISSING_FIELD', path: 'rows[1].shortfall', reference: 0, candidate: undefined }]);
  assert.deepEqual(diff(result(), edited((r) => { r.rows[1].shortfall = null; })), [{ kind: 'TYPE', path: 'rows[1].shortfall', reference: 'number', candidate: 'null' }]);
  assert.deepEqual(diff(result(), edited((r) => { r.rows[1].shortfall = -0; })), [{ kind: 'VALUE', path: 'rows[1].shortfall', reference: 0, candidate: -0 }]);
});

test('7.7 comparator: a failure changed to success is a decision flip, reported on its own', () => {
  const failing = edited((r) => { r.failed = true; r.status = 'calculation_error'; });
  const d = dh.compareSnapshots(snap([['s', failing]]), snap([['s', result()]])).differences;
  const report = dh.reportOf(d);
  assert.deepEqual(report.decisionFlips.map((x) => x.path).sort(), ['failed', 'status']);
  assert.deepEqual(report.statuses.map((x) => x.path).sort(), ['failed', 'status']);
  assert.equal(report.byScenario.s.count, 2);
});

test('7.7 comparator: scenarios missing, extra or reordered are named at corpus level', () => {
  const a = snap([['x', result()], ['y', result()]]);
  assert.deepEqual(dh.compareSnapshots(a, snap([['x', result()]])).differences.map((d) => d.kind + ' ' + d.scenario), ['MISSING_SCENARIO y']);
  assert.deepEqual(dh.compareSnapshots(snap([['x', result()]]), a).differences.map((d) => d.kind + ' ' + d.scenario), ['EXTRA_SCENARIO y']);
  assert.deepEqual(dh.compareSnapshots(a, snap([['y', result()], ['x', result()]])).differences.map((d) => d.kind), ['ORDER']);
});

test('7.7 comparator: a value outside the closed set is UNKNOWN, never silently compared', () => {
  const d = diff(result(), edited((r) => { r.rows[0].total = 1000n; }));
  assert.deepEqual(d.map((x) => x.kind + ' ' + x.path), ['UNKNOWN rows[0].total']);
  assert.ok(dh.KINDS.includes('UNKNOWN'));
  assert.equal(dh.VERDICT_EXIT.UNKNOWN, 2, 'an unknown outcome fails the run');
});

// ---------------------------------------------------------------------------
// End to end: separately resolved trees, separate processes
// ---------------------------------------------------------------------------

test('7.2: old versus old over two separately staged trees is EMPTY, with both implementations recorded and coverage as numerator and denominator', (t) => {
  const a = reference();
  const b = secondReference();
  const r = compareTrees(a, b);
  t.diagnostic(dh.format(r));
  assert.equal(r.verdict, 'EMPTY', dh.format(r));
  assert.deepEqual([r.invariants.reference, r.invariants.candidate], [true, true], 'both operands pass the independent invariant');
  assert.notEqual(r.implementations.reference.tree, r.implementations.candidate.tree, 'two different directories ran');
  assert.equal(r.implementations.sameSource, true, 'holding the same source');
  const entries = a.capture.snapshot.entries.length;
  assert.ok(entries > 30, 'CONTROL: the whole corpus, not a stub');
  assert.deepEqual(r.coverage.scenarios, { compared: entries, of: entries });
  assert.equal(r.coverage.leaves.compared, r.coverage.leaves.of, 'every leaf of the reference was compared');
  assert.ok(r.coverage.leaves.of > 10000);
  assert.equal(Object.values(r.coverage.modes).reduce((s, m) => s + m.of, 0), entries);
  assert.deepEqual(Object.keys(r.coverage.modes).sort(), ['historical', 'monteCarlo', 'simple']);
  assert.equal(r.coverage.routes.compared, 1);
  assert.equal(r.coverage.routes.of, 3);
});

test('7.2 / 7.7: a candidate-only engine change is detected by scenario and field, in both directions, and the unmodified control stays EMPTY', () => {
  const a = reference();
  const c = engineMutant();
  const forward = compareTrees(a, c);
  assert.equal(forward.verdict, 'DIFFERENT');
  assert.equal(forward.implementations.sameSource, false, 'the source hashes record that a different engine ran');
  assert.deepEqual(Object.keys(forward.report.byKind), ['VALUE'], 'field-level value differences, not a crash or a shape change: ' + JSON.stringify(forward.report.byKind));
  assert.ok(forward.report.byField['rows[].total'], 'the portfolio total moved: ' + Object.keys(forward.report.byField).slice(0, 8).join(', '));
  assert.ok(forward.report.byScenario['golden:baseline'], 'in the baseline golden scenario');
  const backward = compareTrees(c, a);
  assert.deepEqual(pairs(backward), pairs(forward), 'the same scenarios and fields in the other direction');
  const f0 = forward.differences[0];
  const b0 = backward.differences.find((d) => d.scenario === f0.scenario && d.path === f0.path);
  assert.deepEqual([b0.reference, b0.candidate], [f0.candidate, f0.reference], 'with reference and candidate swapped');
  assert.equal(compareTrees(a, secondReference()).verdict, 'EMPTY', 'the unmodified control, re-run after the mutation');
});

test('7.7: a candidate-only change to the embedded rules is detected in the tax fields', () => {
  const r = compareTrees(reference(), rulesMutant());
  assert.equal(r.verdict, 'DIFFERENT');
  assert.ok(Object.keys(r.report.byField).some((f) => /taxes/i.test(f)), 'a tax field moved: ' + Object.keys(r.report.byField).slice(0, 8).join(', '));
  assert.deepEqual(Object.keys(r.report.byKind), ['VALUE']);
  assert.equal(compareTrees(reference(), secondReference()).verdict, 'EMPTY', 'the unmodified control, re-run');
});

test('7.7 / S4 task 3: identical damage in both operands is REFUSED by the invariant -- never reported EMPTY', () => {
  const damaged = JSON.parse(fs.readFileSync(reference().capture.file, 'utf8'));
  delete damaged.entries[0].result.rows;
  const one = path.join(SCRATCH, 'damaged-one.json');
  const two = path.join(SCRATCH, 'damaged-two.json');
  fs.writeFileSync(one, JSON.stringify(damaged));
  fs.writeFileSync(two, JSON.stringify(damaged));
  assert.deepEqual(dh.compareSnapshots(damaged, damaged).differences, [], 'CONTROL: the damage is identical, so a bare diff would be empty');
  const r = dh.compareCaptures(one, two, { composition: 'control' });
  assert.equal(r.verdict, 'REFUSED');
  assert.deepEqual([r.invariants.reference, r.invariants.candidate], [false, false]);
});

test('7.7: different corpus inputs, an incomplete capture, and the same directory on both sides are refused, not compared', () => {
  const a = snap([['s', result()]]);
  const b = snap([['s', result()]]);
  b.meta.corpusInputHash = 'other';
  assert.ok(dh.refusalsFor(a, b).some((m) => /different corpus inputs/.test(m)));
  const incomplete = snap([['s', result()]]);
  incomplete.meta.complete = false;
  assert.ok(dh.refusalsFor(a, incomplete).some((m) => /candidate capture does not declare itself complete/.test(m)));
  const same = dh.run({ reference: ROOT, candidate: ROOT });
  assert.equal(same.verdict, 'REFUSED');
  assert.match(same.refusals[0], /same directory/);
});
